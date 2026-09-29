import { Context } from "koishi"
import type { AppLogger } from "./logger"
import type { ResolvedApiMode } from "./mode"
import { downloadFileWithTimeout, fetchWithTimeout } from "./http"

export const API_URL_HTML_ERROR = "api_url_html_error"

export interface ImageFile {
  data: ArrayBuffer
  mime: string
  filename: string
}

export interface ImageApiOptions {
  apiUrl: string
  apiKey: string
  apiMode: ResolvedApiMode
  apiParams: Record<string, string>
  imagesNumber: number
  agnesMode: boolean
  timeoutMs: number
  log: AppLogger
}

interface ApiImageItem {
  b64_json?: string
  image?: string
  url?: string
  content_type?: string
  mime_type?: string
}

interface ApiSuccessResponse {
  data?: (ApiImageItem | string)[]
}

interface ApiErrorResponse {
  error?: {
    message?: string
    type?: string
    code?: string
  }
}

// 统一构建请求参数；图生图使用 multipart，其他模式序列化为 JSON
export async function callImageApi(ctx: Context, files: ImageFile[], prompt: string, options: ImageApiOptions): Promise<string[] | string | null> {
  const mode = options.apiMode
  const resolvedUrl = resolveApiUrl(options.apiUrl, mode)
  const requestBody = buildRequestParams(files, prompt, options.apiParams, options.agnesMode, options.imagesNumber)
  const useMultipart = mode === "edits" && !options.agnesMode

  logRequest(options, mode, resolvedUrl, requestBody)
  const body = useMultipart
    ? buildMultipartBody(requestBody, files)
    : JSON.stringify(requestBody)

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
    }
    if (!useMultipart) headers["Content-Type"] = "application/json"

    const response = await fetchWithTimeout(ctx, resolvedUrl, {
      method: "POST",
      headers,
      body,
    }, options.timeoutMs)

    if (options.log.enabled) {
      const responseContentType = response.headers.get("content-type") || ""
      if (responseContentType.includes("application/json")) {
        try {
          options.log.info("API响应:", sanitizeApiResponse(await response.clone().json()))
        } catch {}
      }
    }

    if (!response.ok) {
      throw new Error(await parseErrorMessage(response))
    }

    return await parseImageResponse(ctx, response, options.log, options.timeoutMs)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    options.log.error(`API request failed: ${errorMsg}`, error)
    if (errorMsg !== "openai_error") throw new Error(errorMsg)
    return null
  }
}

// 兼容完整接口地址和 /v1/、/v1、根地址等基础地址，默认补全到 images/edits
function resolveApiUrl(apiUrl: string, mode: "edits" | "generations"): string {
  try {
    const url = new URL(apiUrl)
    const segment = mode === "generations" ? "generations" : "edits"
    // 用户可能误填完整 generations/edits 地址，这里统一只保留基础地址
    const path = url.pathname
      .replace(/\/+$/, "")
      .replace(/\/images\/(edits|generations)$/i, "")
    const parts = path.split("/")
    const last = parts[parts.length - 1] || ""
    let nextPath = path

    if (last === "edits" || last === "generations") {
      parts[parts.length - 1] = segment
      nextPath = parts.join("/")
    } else if (path.endsWith("/v1/images") || path.endsWith("/images")) {
      nextPath = `${path}/${segment}`
    } else if (/(^|\/)v\d+$/.test(path) || path === "") {
      nextPath = path ? `${path}/images/${segment}` : `/v1/images/${segment}`
    }

    url.pathname = nextPath
    return url.toString()
  } catch {
    return apiUrl
  }
}

// 统一构建参数字段；agnesMode 下按 agnes 文档把 image/response_format 放入 extra_body
function buildRequestParams(files: ImageFile[], prompt: string, apiParams: Record<string, string>, agnesMode: boolean, imagesNumber: number): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const extraBody: Record<string, unknown> = {}

  for (const key in apiParams) {
    const value = apiParams[key]
    // type 是旧配置遗留参数，generations 协议不需要
    if (key === "type") continue
    if (value === "{{inputimage}}") {
      if (files.length > 0) {
        if (agnesMode) {
          extraBody.image = files.map(file => toDataUri(file))
        } else {
          // 图片编辑 JSON 协议使用 image 字符串数组；兼容旧配置中的 images 字段
          body[key === "images" ? "image" : key] = files.map(file => toDataUri(file))
        }
      }
      continue
    }
    if (value === "{{images_number}}") {
      // 图片数量占位符：由 -n 选项指定，默认 1
      body[key] = imagesNumber
      continue
    }
    if (key === "response_format") {
      if (agnesMode) {
        extraBody.response_format = value
      } else {
        body[key] = value
      }
      continue
    }
    if (value === "{{prompt}}") {
      body[key] = prompt
      continue
    }
    body[key] = normalizeJsonValue(value)
  }

  if (agnesMode) {
    if (files.length > 0 && !extraBody.image) {
      extraBody.image = files.map(file => toDataUri(file))
    }
    extraBody.response_format = extraBody.response_format || "b64_json"
    body.extra_body = extraBody
  }

  return body
}

// OpenAI 标准图片编辑接口要求 multipart/form-data，boundary 由 fetch 自动生成
function buildMultipartBody(body: Record<string, unknown>, files: ImageFile[]): FormData {
  const form = new FormData()

  for (const [key, value] of Object.entries(body)) {
    if (key === "image") {
      for (const file of files) {
        form.append(key, new Blob([file.data], { type: file.mime }), file.filename || "image")
      }
      continue
    }
    appendMultipartValue(form, key, value)
  }

  return form
}

function appendMultipartValue(form: FormData, key: string, value: unknown): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) appendMultipartValue(form, key, item)
    return
  }
  form.append(key, String(value))
}

// JSON 数字/布尔参数尽量转成对应类型，避免字符串被部分服务端拒绝
function normalizeJsonValue(value: string): string | number | boolean {
  if (value === "true") return true
  if (value === "false") return false
  if (/^-?\d+$/.test(value)) return Number(value)
  return value
}

function logRequest(options: ImageApiOptions, mode: string, url: string, body: Record<string, unknown>) {
  if (!options.log.enabled) return

  options.log.info("API请求参数:", {
    url,
    mode,
    ...sanitizeRequestBody(body),
  })
}

// 日志脱敏：请求体里的 data URL 只保留 mime 和字节数
function sanitizeRequestBody(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    result[key] = sanitizeRequestBodyValue(item)
  }
  return result
}

function sanitizeRequestBodyValue(value: unknown): unknown {
  if (typeof value === "string") return abbreviateDataUri(value)
  if (Array.isArray(value)) return value.map(item => sanitizeRequestBodyValue(item))
  if (value && typeof value === "object") return sanitizeRequestBody(value as Record<string, unknown>)
  return value
}

function abbreviateDataUri(value: string): string {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(value)
  if (!match) return value
  const size = Buffer.from(match[2], "base64").byteLength
  return `${match[1]}:${size}B`
}

// 日志脱敏：响应里的 base64 内容只保留占位符，避免刷屏
function sanitizeApiResponse(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return abbreviateDataUri(value)
    return value.length > 200 ? `[string ${value.length} chars]` : value
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizeApiResponse(item))
  }
  if (!value || typeof value !== "object") return value

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if ((key === "b64_json" || key === "image") && typeof item === "string") {
      result[key] = item ? `[base64 ${item.length} chars]` : item
      continue
    }
    if (key === "url" && typeof item === "string") {
      result[key] = abbreviateDataUri(item)
      continue
    }
    result[key] = sanitizeApiResponse(item)
  }
  return result
}

// agnes 的 extra_body 文档使用带 MIME 前缀的 data URI
function toDataUri(file: ImageFile): string {
  return `data:${file.mime};base64,${Buffer.from(file.data).toString("base64")}`
}

async function parseImageResponse(ctx: Context, response: Response, log: AppLogger, timeoutMs: number): Promise<string[] | string | null> {
  const contentType = response.headers.get("content-type") || ""

  if (contentType.includes("text/html")) {
    throw new Error(API_URL_HTML_ERROR)
  }

  if (contentType.includes("application/json")) {
    const result = await response.json() as ApiSuccessResponse
    if (Array.isArray(result.data)) {
      const images: string[] = []
      for (const rawItem of result.data) {
        if (!rawItem) continue
        if (typeof rawItem === "string") {
          if (/^https?:\/\//i.test(rawItem) || rawItem.startsWith("data:")) {
            images.push(await toUrlDataUrl(ctx, rawItem, log, timeoutMs))
          } else {
            images.push(toDataUrl(rawItem, "image/png"))
          }
          continue
        }
        const item = rawItem
        if (item.b64_json) {
          const mime = item.content_type || item.mime_type || "image/png"
          images.push(toDataUrl(item.b64_json, mime))
          continue
        }
        if (item.image) {
          const mime = item.content_type || item.mime_type || "image/png"
          images.push(toDataUrl(item.image, mime))
          continue
        }
        if (item.url) images.push(await toUrlDataUrl(ctx, item.url, log, timeoutMs))
      }

      if (images.length > 0) {
        log.info(`API success response (JSON): returned ${images.length} images`)
        return images.length === 1 ? images[0] : images
      }
    }
  } else if (contentType.startsWith("image/")) {
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    log.info(`API success response (Image Buffer): data:${contentType};base64,[${base64.length} chars]`)
    return `data:${contentType};base64,${base64}`
  }

  throw new Error("Unknown API response format")
}

function toDataUrl(source: string, mime: string): string {
  if (source.startsWith("data:")) return source
  return `data:${mime};base64,${source}`
}

// 若服务端返回公网 URL，下载后转成 data URL，插件只发送 Base64 图片
async function toUrlDataUrl(ctx: Context, source: string, log: AppLogger, timeoutMs: number): Promise<string> {
  if (source.startsWith("data:")) return source
  if (!/^https?:\/\//i.test(source)) return source

  log.info("转换HTTP URL为Data URL")
  const file = await downloadFileWithTimeout(ctx, source, timeoutMs)
  const mime = file.mime
  return `data:${mime};base64,${Buffer.from(file.data).toString("base64")}`
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return `HTTP error! status: ${response.status}`

  if (/^\s*(<!doctype html|<html)/i.test(text)) {
    return API_URL_HTML_ERROR
  }

  try {
    const data = JSON.parse(text) as ApiErrorResponse
    const message = data.error?.message || data.error?.type || data.error?.code
    if (message) return message
  } catch {}

  return text
}
