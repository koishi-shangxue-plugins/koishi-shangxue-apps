import { h } from "koishi"
import type { Context, Session } from "koishi"
import { getAgnesVideoConfig, type AgnesVideoModel } from "./agnes"
import type { ImageFile } from "./api"
import type { Config } from "./config"
import { getUserCurrency, updateUserCurrency } from "./currency"
import { downloadFileWithTimeout, fetchWithTimeout } from "./http"
import type { AppLogger } from "./logger"
import { prepareImageForApi } from "./media"

export const AGENT_VIDEO_COMMAND = "Agent视频生成"
export const VIDEO_SECONDS_V2 = [3, 5, 10, 18] as const
export const VIDEO_SECONDS_FLASH = [5, 10, 12] as const

const MAX_FLASH_REFERENCE_IMAGES = 5
// 状态接口存在查询限流，轮询保持低频，并在 429/rate limit 时继续退避
const VIDEO_POLL_INTERVAL_MS = 10_000
const VIDEO_RATE_LIMIT_BASE_DELAY_MS = 20_000
const VIDEO_MAX_RATE_LIMIT_DELAY_MS = 60_000
const ASSETS_TRANSFORM_TIMEOUT_MS = 30_000

interface AssetsLike {
  transform(content: string): Promise<string>
}

interface VideoTaskResponse {
  id?: string
  task_id?: string
  video_id?: string
  url?: string
  status?: string
  progress?: number
  metadata?: {
    url?: string
  } | null
  error?: {
    message?: string
    code?: string
    type?: string
  } | null
  detail?: string
  message?: string
}

class VideoCommandError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "VideoCommandError"
  }
}

class VideoRequestError extends Error {
  readonly status?: number
  readonly retryAfterMs?: number

  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message)
    this.name = "VideoRequestError"
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export async function generateVideo(
  ctx: Context,
  session: Session,
  images: string[],
  prompt: string,
  config: Config,
  log: AppLogger,
  videoSeconds?: string | number,
): Promise<boolean> {
  const quote = h.quote(session.messageId)
  let processingMessageId: string | undefined

  try {
    if (!config.disableWaitingTips) {
      const [messageId] = await session.send([
        quote,
        h.text(text(session, "processing")),
      ])
      processingMessageId = messageId
    }

    const agnes = getAgnesVideoConfig(
      config.agnesAPIkey,
      config.agnesRegion,
      config.agnesVideoModel,
    )
    const resolvedImages = await prepareVideoImages(ctx, images, config, log)
    const seconds = resolveVideoSeconds(videoSeconds, config.agnesVideoModel)
    const requestBody = buildVideoRequestBody(
      config.agnesVideoModel,
      prompt,
      resolvedImages,
      seconds,
    )

    if (log.enabled) {
      log.info("提交视频生成任务:", {
        model: config.agnesVideoModel,
        imageCount: resolvedImages.length,
        seconds,
        prompt: prompt.substring(0, 200),
      })
    }

    const created = await requestJson(ctx, `${agnes.apiUrl}/videos`, {
      method: "POST",
      headers: authHeaders(agnes.apiKey),
      body: JSON.stringify(requestBody),
    }, config.apiTimeout * 1000)

    const videoId = created.video_id || created.id || created.task_id
    if (!videoId) throw new VideoCommandError("videoTaskIdMissing")

    const result = await pollVideoTask(
      ctx,
      videoId,
      agnes.model,
      agnes,
      config,
      log,
      Boolean(created.video_id),
    )
    if (result.status === "failed") {
      throw new Error(taskErrorMessage(result))
    }

    const videoUrl = result.url || result.metadata?.url
    if (!videoUrl) throw new VideoCommandError("videoNoUrl")

    await deleteProcessingMessage(session, processingMessageId, log)
    processingMessageId = undefined

    if (config.monetaryCommands && ctx.monetary) {
      await deductCurrency(ctx, session, config, log)
    }

    await sendVideoResult(session, videoUrl, log)
    return true
  } catch (error) {
    await deleteProcessingMessage(session, processingMessageId, log)

    if (error instanceof VideoCommandError) {
      await sendVideoText(session, quote, error.code)
    } else if (error instanceof Error && error.name === "AbortError") {
      await sendVideoText(session, quote, "apiTimeout")
    } else {
      const errorText = error instanceof Error ? error.message : String(error)
      log.error("生成视频时发生错误:", error)
      await session.send([
        quote,
        h.text(text(session, "error", [errorText])),
      ])
    }
    return false
  }
}

async function prepareVideoImages(
  ctx: Context,
  sources: string[],
  config: Config,
  log: AppLogger,
): Promise<string[]> {
  if (config.agnesVideoModel === "agnes-video-2.5-flash"
    && sources.length > MAX_FLASH_REFERENCE_IMAGES) {
    throw new VideoCommandError("videoTooManyImages")
  }

  const result: string[] = []
  for (const source of sources) {
    const resolved = await resolveImageForVideo(ctx, source, config, log)
    if (!resolved) throw new VideoCommandError("invalidimage")
    result.push(resolved)
  }
  return result
}

async function resolveImageForVideo(
  ctx: Context,
  source: string,
  config: Config,
  log: AppLogger,
): Promise<string | null> {
  try {
    const file = await downloadFileWithTimeout(ctx, source, config.apiTimeout * 1000)
    const prepared = await prepareImageForApi(ctx, file, config, log)
    const dataUri = toDataUri(prepared)
    const assets = getAssets(ctx)

    if (assets) {
      try {
        const transformed = await withAssetsTimeout(ctx, assets.transform(h.image(dataUri).toString()))
        const uploaded = extractHttpUrl(transformed)
        if (uploaded) return uploaded
      } catch (error) {
        log.warn("参考图片转存失败，回退到直接图片数据:", error)
      }
    }

    if (/^https?:\/\//i.test(source)) return source
    return dataUri
  } catch (error) {
    log.error(`下载或处理参考图片失败: ${source}`, error)
    return null
  }
}

function buildVideoRequestBody(
  model: AgnesVideoModel,
  prompt: string,
  images: string[],
  seconds: number,
): Record<string, unknown> {
  if (model === "agnes-video-2.5-flash") {
    const body: Record<string, unknown> = {
      model,
      prompt,
      seconds: String(seconds),
      mode: "text",
      size: "720P",
      aspect_ratio: "16:9",
      n: 1,
    }

    if (images.length === 1) {
      body.mode = "keyframe"
      body.first_frame = images[0]
    } else if (images.length === 2) {
      body.mode = "keyframe"
      body.first_frame = images[0]
      body.last_frame = images[1]
    } else if (images.length > 2) {
      body.mode = "reference"
      body.prompt = buildReferencePrompt(prompt, images.length)
      body.images = images
    }

    return body
  }

  const body: Record<string, unknown> = {
    model,
    prompt,
    num_frames: secondsToFrameCount(seconds),
    frame_rate: 24,
    width: 1152,
    height: 768,
  }

  if (images.length === 1) {
    body.image = images[0]
  } else if (images.length > 1) {
    body.extra_body = {
      image: images,
      mode: "keyframes",
    }
  }

  return body
}

export function resolveVideoSeconds(
  value: string | number | undefined,
  model: AgnesVideoModel,
): number {
  const parsed = Number(value)
  const requested = Number.isFinite(parsed) ? parsed : 5
  const presets = model === "agnes-video-v2.0"
    ? [...VIDEO_SECONDS_V2]
    : [...VIDEO_SECONDS_FLASH]

  let result = presets[0]
  for (const preset of presets) {
    if (Math.abs(requested - preset) < Math.abs(requested - result)) {
      result = preset
    }
  }
  return result
}

function secondsToFrameCount(seconds: number): number {
  const frameCounts: Record<number, number> = {
    3: 81,
    5: 121,
    10: 241,
    18: 441,
  }
  return frameCounts[seconds] ?? 121
}

function buildReferencePrompt(prompt: string, count: number): string {
  if (/<\s*Picture\s*\d/i.test(prompt)) return prompt
  const references = Array.from({ length: count }, (_, index) => `<Picture ${index + 1}>`).join("、")
  return `请以 ${references} 作为参考素材，保持主体、角色和风格一致：${prompt}`
}

async function pollVideoTask(
  ctx: Context,
  videoId: string,
  model: AgnesVideoModel,
  agnes: { apiKey: string; queryUrl: string; apiUrl: string },
  config: Config,
  log: AppLogger,
  useVideoIdQuery: boolean,
): Promise<VideoTaskResponse> {
  let nextDelayMs = VIDEO_POLL_INTERVAL_MS
  let rateLimitBackoffMs = 0
  let lastLogKey = ""

  while (true) {
    try {
      const query = buildPollUrl(agnes, videoId, model, useVideoIdQuery)
      const data = await requestJson(ctx, query, {
        method: "GET",
        headers: authHeaders(agnes.apiKey),
      }, config.apiTimeout * 1000)
      const status = (data.status || "").toLowerCase()

      if (status === "failed") return data
      if (isVideoResultReady(data)) return data
      const logKey = `${status}|${data.progress ?? ""}`
      if (log.enabled && logKey !== lastLogKey) {
        lastLogKey = logKey
        log.info(`视频生成进度: ${status || "unknown"}${data.progress !== undefined ? ` ${data.progress}%` : ""}`)
      }
      nextDelayMs = VIDEO_POLL_INTERVAL_MS
      rateLimitBackoffMs = 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/(^|\D)404(\D|$)/.test(message) || /not found/i.test(message)) throw error

      const isRateLimited = error instanceof VideoRequestError
        ? error.status === 429 || isRateLimitError(message)
        : isRateLimitError(message)

      if (isRateLimited) {
        const retryAfterMs = error instanceof VideoRequestError && error.retryAfterMs !== undefined
          ? error.retryAfterMs
          : 0
        rateLimitBackoffMs = Math.min(
          Math.max(
            rateLimitBackoffMs === 0
              ? VIDEO_RATE_LIMIT_BASE_DELAY_MS
              : rateLimitBackoffMs * 2,
            retryAfterMs,
          ),
          VIDEO_MAX_RATE_LIMIT_DELAY_MS,
        )
        nextDelayMs = rateLimitBackoffMs
        log.warn("查询视频任务触发限流，已延长轮询间隔:", message)
      } else {
        nextDelayMs = Math.min(
          Math.max(nextDelayMs + VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_INTERVAL_MS),
          VIDEO_MAX_RATE_LIMIT_DELAY_MS,
        )
        log.warn("查询视频任务失败，稍后重试:", message)
      }
    }

    await delay(ctx, nextDelayMs)
  }
}

function isVideoResultReady(data: VideoTaskResponse): boolean {
  const progress = data.progress
  return (data.status || "").toLowerCase() === "completed"
    && Boolean(data.url || data.metadata?.url)
    && (progress === undefined || progress === null || progress >= 100)
}

function isRateLimitError(message: string): boolean {
  return /(^|\D)429(\D|$)/.test(message)
    || /rate\s*limit/i.test(message)
    || /too\s*many\s*requests/i.test(message)
}

function buildPollUrl(
  agnes: { apiUrl: string; queryUrl: string },
  videoId: string,
  model: AgnesVideoModel,
  useVideoIdQuery: boolean,
): string {
  if (!useVideoIdQuery) {
    return `${agnes.apiUrl}/videos/${encodeURIComponent(videoId)}`
  }

  const query = new URL(agnes.queryUrl)
  query.searchParams.set("video_id", videoId)
  query.searchParams.set("model_name", model)
  return query.toString()
}

async function requestJson(
  ctx: Context,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<VideoTaskResponse> {
  const response = await fetchWithTimeout(ctx, url, init, timeoutMs)
  if (!response.ok) {
    throw new VideoRequestError(
      await parseErrorMessage(response),
      response.status,
      parseRetryAfter(response.headers.get("retry-after")),
    )
  }
  return await response.json() as VideoTaskResponse
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const date = Date.parse(value)
  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now())
  }

  return undefined
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return `HTTP error! status: ${response.status}`

  try {
    const data = JSON.parse(text) as VideoTaskResponse & Record<string, unknown>
    const message = (data as { error?: { message?: string } }).error?.message
      || data.message
      || data.detail
      || (data.error?.code)
    if (message) return String(message)
  } catch {}

  return text.length > 500 ? `${text.slice(0, 500)}...` : text
}

function taskErrorMessage(data: VideoTaskResponse): string {
  return data.error?.message
    || data.error?.code
    || data.message
    || data.detail
    || "视频生成失败"
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }
}

function toDataUri(file: ImageFile): string {
  return `data:${file.mime};base64,${Buffer.from(file.data).toString("base64")}`
}

function getAssets(ctx: Context): AssetsLike | undefined {
  const assets = (ctx as unknown as { assets?: AssetsLike }).assets
  return assets && typeof assets.transform === "function" ? assets : undefined
}

function extractHttpUrl(content: string): string | null {
  for (const element of h.parse(content) as any[]) {
    const value = findUrlInElement(element)
    if (value && /^https?:\/\//i.test(value)) return value
  }
  return null
}

async function withAssetsTimeout<T>(
  ctx: Context,
  promise: Promise<T>,
): Promise<T> {
  let timer: (() => void) | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = ctx.setTimeout(() => reject(new Error("图片转存超时")), ASSETS_TRANSFORM_TIMEOUT_MS)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    timer?.()
  }
}

function findUrlInElement(element: any): string | null {
  if (element?.type === "text") {
    const content = element.attrs?.content
    return typeof content === "string" && content.trim() ? content.trim() : null
  }

  if (element?.type === "img" || element?.type === "image") {
    const source = element.attrs?.src || element.attrs?.url
    if (typeof source === "string" && source.trim()) return source.trim()
  }

  for (const child of element?.children || []) {
    const nested = findUrlInElement(child)
    if (nested) return nested
  }
  return null
}

async function deductCurrency(
  ctx: Context,
  session: Session,
  config: Config,
  log: AppLogger,
): Promise<void> {
  try {
    const userId = session.userId ?? ""
    await updateUserCurrency(ctx, userId, config.monetaryCost, config.currency, log)
    const balance = await getUserCurrency(ctx, userId, config.currency, log)
    await session.send(h.text(text(session, "currencyDeducted", [
      Math.abs(config.monetaryCost),
      config.currency,
      balance,
    ])))
  } catch (error) {
    log.error(`扣除用户 ${session.userId ?? ""} 货币时出错:`, error)
    await session.send(h.text("货币扣除失败，但视频已生成。"))
  }
}

async function sendVideoResult(session: Session, url: string, log: AppLogger): Promise<void> {
  try {
    await session.send(h.video(url))
  } catch (error) {
    log.warn("发送视频消息失败，改为发送链接:", error)
    await session.send(url)
  }
}

async function sendVideoText(
  session: Session,
  quote: h,
  key: string,
): Promise<void> {
  await session.send([quote, h.text(text(session, key))])
}

function text(session: Session, key: string, args: unknown[] = []): string {
  return session.text(`commands.${AGENT_VIDEO_COMMAND}.messages.${key}`, args)
}

async function deleteProcessingMessage(
  session: Session,
  messageId: string | undefined,
  log: AppLogger,
): Promise<void> {
  if (!messageId) return
  try {
    await session.bot.deleteMessage(session.channelId, messageId)
  } catch (error) {
    log.warn("删除视频处理中提示消息失败:", error)
  }
}

function delay(ctx: Context, ms: number): Promise<void> {
  return new Promise(resolve => {
    ctx.setTimeout(resolve, ms)
  })
}
