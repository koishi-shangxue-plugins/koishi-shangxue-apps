import { Context } from 'koishi'
import {} from '@koishijs/plugin-server'
import { createReadStream, createWriteStream, existsSync, promises as fs, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import send from 'koa-send'
import type Router from '@koa/router'
import type { DefaultContext, DefaultState, ParameterizedContext } from 'koa'
import FileType from 'file-type'

import { Config } from './config'
import { ContactCacheService } from './cache'
import { ChatDatabase } from './database'
import { MediaManager } from './media'
import { PluginLogger } from './logger'
import { ContactCacheItem, MessageRecord, SelfMessagePayload, SelfMessageRecord } from './types'
import { registerWebErrorFilter } from './web-error-filter'

interface ViteConsoleServer {
  config?: {
    server?: {
      preTransformRequests?: boolean
    }
  }
  transformIndexHtml(url: string, html: string, originalUrl?: string): Promise<string>
}

interface ViteConsoleLike {
  vite?: ViteConsoleServer
}

export function registerWeb(
  ctx: Context,
  config: Config,
  database: ChatDatabase,
  contactCache: ContactCacheService,
  media: MediaManager,
  logger: PluginLogger,
) {
  registerWebErrorFilter(ctx)
  const webRoot = path.resolve(__dirname, '..', 'client', 'web', 'dist')
  const webSource = path.resolve(__dirname, '..', 'client', 'web', 'src')
  const webPublic = path.resolve(__dirname, '..', 'client', 'web', 'public')
  const webIndex = path.resolve(__dirname, '..', 'client', 'web', 'index.html')
  const uploadDir = path.resolve(ctx.baseDir, 'data', 'chat-patch', 'upload-media')
  const mediaDir = path.resolve(ctx.baseDir, 'data', 'chat-patch', 'media')

  type WebContext = Router.RouterContext<DefaultState, DefaultContext>
  const cacheType = (type: string) => type === 'user' ? 'friend' : type

  const getVite = (): ViteConsoleServer | undefined => {
    return (ctx.console as unknown as ViteConsoleLike).vite
  }

  const viteFsUrl = (target: string): string => {
    return `/vite/@fs/${path.resolve(target).split(path.sep).join('/')}`
  }

  const transformWebIndex = async (vite: ViteConsoleServer, requestPath: string) => {
    // 源码由 iframe 按需加载，避免 Koishi Vite 启动时提前转换整个 web 应用
    if (vite.config?.server) vite.config.server.preTransformRequests = false
    const mainFsUrl = `/@fs/${path.resolve(webSource, 'main.ts').split(path.sep).join('/')}`
    const html = (await fs.readFile(webIndex, 'utf8')).replace(
      'src="/src/main.ts"',
      `src="${mainFsUrl}"`,
    )
    let transformed = await vite.transformIndexHtml('/chat-patch/web/index.html', html, requestPath)
    transformed = transformed
      .replace(/\/vite\/bcui/g, viteFsUrl(path.join(webPublic, 'bcui')))
      .replace(/\/vite\/css/g, viteFsUrl(path.join(webPublic, 'css')))
    return transformed
  }

  const servePublicFile = async (koa: WebContext, prefix: string) => {
    const relative = (koa.params?.[0] ?? '').replace(/^\/+/, '')
    const fullPath = path.resolve(webPublic, prefix, relative)
    if (!fullPath.startsWith(webPublic + path.sep)) {
      koa.status = 403
      koa.body = ''
      return
    }
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      await send(koa, path.relative(webPublic, fullPath), { root: webPublic })
      return
    }
    koa.status = 404
    koa.body = ''
  }

  // web 应用里仍有 /img 这类运行时绝对路径，生产/开发模式都要由 Koishi 服务托管
  const registerPublic = (pattern: string, prefix: string) => {
    ctx.server.get(pattern, async (koa: WebContext) => {
      await servePublicFile(koa, prefix)
    })
  }

  registerPublic('/img(.*)', 'img')

  const toExtension = (value: string): string => {
    const ext = value.startsWith('.') ? value : `.${value}`
    return ext.toLowerCase()
  }

  const normalizeGroupId = (value: string): string => {
    return String(value)
  }

  const historyChannelCandidates = (channelId: string): string[] => {
    return channelId ? [channelId] : []
  }

  const messageSortTime = (item: MessageRecord): number => {
    const timestampMs = Number(item.timestampMs ?? 0)
    if (timestampMs > 0) return timestampMs > 1e12 ? timestampMs : timestampMs * 1000
    const timestamp = Number(item.timestamp ?? 0)
    if (timestamp > 0) return timestamp * 1000
    return Number(item.receivedAt ?? 0)
  }

  const selfMessageSortTime = (item: SelfMessageRecord): number => {
    const timestampMs = Number(item.timestampMs ?? item.sentAt ?? 0)
    if (timestampMs > 0) return timestampMs > 1e12 ? timestampMs : timestampMs * 1000
    const timestamp = Number(item.timestamp ?? 0)
    if (timestamp > 0) return timestamp * 1000
    return item.sentAt
  }

  const mimeToExt: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/aac': '.aac',
    'audio/flac': '.flac',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
    'video/x-flv': '.flv',
    'video/3gpp': '.3gp',
    'video/ogg': '.ogv',
    'video/mp2t': '.ts',
  }
  const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

  ctx.server.post(`${config.basePath}/api/upload-media`, async (koa) => {
    const requestBody = (koa.request as unknown as { body?: unknown }).body
    const body = (requestBody ?? {}) as Record<string, unknown>
    let source = String(body.dataUrl ?? body.data ?? '')
    let name = String(body.name ?? '')
    let mime = ''
    let buffer: Buffer | null = null
    let tempPath = ''
    const rawHash = createHash('md5')
    const cleanupTemp = async () => {
      if (tempPath) await fs.unlink(tempPath).catch(() => undefined)
    }
    if (source) {
      if (source.startsWith('base64://')) source = source.slice(9)
      const comma = source.indexOf('base64,')
      const base64 = comma >= 0 ? source.slice(comma + 7) : source
      const normalizedBase64 = base64.replace(/-/g, '+').replace(/_/g, '/')
      try {
        buffer = Buffer.from(normalizedBase64, 'base64')
      } catch {
        koa.status = 400
        koa.body = { error: 'invalid media data' }
        return
      }
      mime = source.startsWith('data:')
        ? source.slice(5, source.indexOf(';')).toLowerCase()
        : ''
    } else {
      tempPath = path.join(uploadDir, `.upload-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
      const write = createWriteStream(tempPath)
      try {
        for await (const chunk of koa.req as AsyncIterable<Buffer | string>) {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          rawHash.update(part)
          if (!write.write(part)) {
            await new Promise<void>((resolve) => write.once('drain', resolve))
          }
        }
        await new Promise<void>((resolve, reject) => {
          write.once('error', reject)
          write.end(() => resolve())
        })
      } catch (error) {
        write.destroy()
        await cleanupTemp()
        throw error
      }
      name = String(koa.query.name ?? koa.get('x-file-name') ?? '')
      try {
        name = decodeURIComponent(name)
      } catch {
        // 保持原始名称即可
      }
      mime = String(koa.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    }
    const fileSize = buffer ? buffer.length : existsSync(tempPath) ? statSync(tempPath).size : 0
    if (!fileSize) {
      await cleanupTemp()
      koa.status = 400
      koa.body = { error: 'missing media data' }
      return
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      await cleanupTemp()
      koa.status = 413
      koa.body = { error: 'media file too large' }
      return
    }

    await fs.mkdir(uploadDir, { recursive: true })
    let detected: { ext?: string } | undefined
    try {
      const result = buffer
        ? await FileType.fromBuffer(buffer)
        : await FileType.fromStream(createReadStream(tempPath))
      detected = result ?? undefined
    } catch {
      // 部分音频/文件无法识别时继续用 MIME 或文件名兜底
      detected = undefined
    }
    const mimeExt = mimeToExt[mime] || ''
    const nameExt = path.extname(name).toLowerCase()
    const ext = detected?.ext
      ? toExtension(detected.ext)
      : mimeExt || nameExt || '.bin'
    const digest = buffer ? createHash('md5').update(buffer).digest('hex') : rawHash.digest('hex')
    const filename = `${digest}${ext}`
    const filePath = path.join(uploadDir, filename)
    try {
      if (!existsSync(filePath)) {
        if (buffer) {
          await fs.writeFile(filePath, buffer)
        } else {
          await fs.rename(tempPath, filePath)
          tempPath = ''
        }
      }
    } catch (error) {
      await cleanupTemp()
      throw error
    }
    await cleanupTemp()
    koa.body = {
      path: pathToFileURL(filePath).href,
      localPath: filePath,
    }
  })

  const sendLocalFile = async (koa: WebContext, filePath: string) => {
    const size = statSync(filePath).size
    const fileName = path.basename(filePath)
    koa.set('Accept-Ranges', 'bytes')
    if (fileName.toLowerCase().endsWith('.webm')) {
      koa.type = 'audio/webm'
    } else {
      koa.type = fileName
    }
    const range = koa.headers.range
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(range))
      if (!match) {
        koa.status = 416
        koa.set('Content-Range', `bytes */${size}`)
        koa.body = ''
        return
      }
      let start = 0
      let end = size - 1
      if (match[1] === '' && match[2]) {
        start = Math.max(0, size - Number(match[2]))
      } else if (match[1]) {
        start = Number(match[1])
        end = match[2] ? Number(match[2]) : end
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size) {
        koa.status = 416
        koa.set('Content-Range', `bytes */${size}`)
        koa.body = ''
        return
      }
      if (end >= size) end = size - 1
      if (end < start) end = start
      koa.status = 206
      koa.set('Content-Range', `bytes ${start}-${end}/${size}`)
      koa.set('Content-Length', String(end - start + 1))
      koa.body = createReadStream(filePath, { start, end })
      return
    }
    koa.set('Content-Length', String(size))
    koa.body = createReadStream(filePath)
  }

  ctx.server.get(`${config.basePath}/api/media`, async (koa) => {
    const fileName = path.basename(String(koa.query.file ?? koa.query.name ?? ''))
    if (!fileName || fileName === '.' || fileName === '..') {
      koa.status = 400
      koa.body = { error: 'missing media file' }
      return
    }
    for (const root of [uploadDir, mediaDir]) {
      const filePath = path.resolve(root, fileName)
      if (filePath !== root && filePath.startsWith(`${root}${path.sep}`)
        && existsSync(filePath) && statSync(filePath).isFile()) {
        await sendLocalFile(koa, filePath)
        return
      }
    }
    koa.status = 404
    koa.body = { error: 'media file not found' }
  })

  ctx.server.get(`${config.basePath}/api/cache/all`, async (koa) => {
    const entries = await database.getAllContacts()
    const botMap = new Map<string, {
      platform: string
      selfId: string
      groups: ContactCacheItem[]
      friends: ContactCacheItem[]
    }>()
    for (const entry of entries) {
      const key = JSON.stringify([entry.platform, entry.selfId])
      const bot = botMap.get(key) ?? {
        platform: entry.platform,
        selfId: entry.selfId,
        groups: [],
        friends: [],
      }
      if (entry.type === 'group') bot.groups = entry.contacts
      if (entry.type === 'friend') bot.friends = entry.contacts
      botMap.set(key, bot)
    }
    koa.body = { bots: [...botMap.values()] }
  })

  ctx.server.get(`${config.basePath}/api/history`, async (koa) => {
    const platform = String(koa.query.platform ?? '')
    const selfId = String(koa.query.selfId ?? '')
    const channelId = String(koa.query.channelId ?? '')
    if (!platform || !selfId || !channelId) {
      koa.status = 400
      koa.body = { error: 'missing history params' }
      return
    }
    const defaultLimit = Math.min(config.maxMessagesPerChannel, 100)
    const parsedLimit = Number(koa.query.limit ?? defaultLimit)
    const limit = Math.min(
      Math.max(1, Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : defaultLimit),
      config.maxMessagesPerChannel,
    )
    const beforeTime = Number(koa.query.beforeTime ?? 0)
    const queryMessages = async (cid: string) => {
      return Number.isFinite(beforeTime) && beforeTime > 0
        ? database.listMessagesBefore(platform, selfId, cid, beforeTime, limit)
        : database.listMessages(platform, selfId, cid, limit)
    }
    let messages: Awaited<ReturnType<typeof queryMessages>> = []
    for (const candidate of historyChannelCandidates(channelId)) {
      messages = await queryMessages(candidate)
      if (messages.length) break
    }
    let selfMessages: SelfMessageRecord[] = []
    const querySelfMessages = async (cid: string): Promise<SelfMessageRecord[]> => {
      return Number.isFinite(beforeTime) && beforeTime > 0
        ? database.listSelfMessagesBefore(platform, selfId, cid, beforeTime, limit)
        : database.listSelfMessages(platform, selfId, cid, limit)
    }
    for (const candidate of historyChannelCandidates(channelId)) {
      selfMessages = await querySelfMessages(candidate)
      if (selfMessages.length) break
    }
    // 统一按本地收到时间排序，避免平台时间不准导致顺序颠倒
    messages.sort((a, b) => {
      const timeA = messageSortTime(a)
      const timeB = messageSortTime(b)
      return timeA - timeB
    })
    selfMessages.sort((a, b) => selfMessageSortTime(a) - selfMessageSortTime(b))
    // 合并两条记录流后只返回 limit 条，保证前端分页/结束判断不会因自消息被放大
    const combined: Array<{
      kind: 'message' | 'self'
      time: number
      record: MessageRecord | SelfMessageRecord
    }> = []
    for (const item of messages) {
      combined.push({
        kind: 'message',
        time: messageSortTime(item),
        record: item,
      })
    }
    for (const item of selfMessages) {
      combined.push({ kind: 'self', time: selfMessageSortTime(item), record: item })
    }
    combined.sort((a, b) => a.time - b.time)
    const capped = combined.slice(-limit)
    koa.body = {
      messages: capped
        .filter((item) => item.kind === 'message')
        .map((item) => item.record as MessageRecord),
      selfMessages: capped
        .filter((item) => item.kind === 'self')
        .map((item) => item.record as SelfMessageRecord),
    }
  })

  ctx.server.get(`${config.basePath}/api/self-messages`, async (koa) => {
    const platform = String(koa.query.platform ?? '')
    const selfId = String(koa.query.selfId ?? '')
    const channelId = String(koa.query.channelId ?? '')
    if (!platform || !selfId || !channelId) {
      koa.status = 400
      koa.body = { error: 'missing self-message params' }
      return
    }
    const parsedLimit = Number(koa.query.limit ?? config.historyPageSize)
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : config.historyPageSize
    const beforeTime = Number(koa.query.beforeTime ?? 0)
    let messages: SelfMessageRecord[] = []
    for (const candidate of historyChannelCandidates(channelId)) {
      messages = Number.isFinite(beforeTime) && beforeTime > 0
        ? await database.listSelfMessagesBefore(platform, selfId, candidate, beforeTime, limit)
        : await database.listSelfMessages(platform, selfId, candidate, limit)
      if (messages.length) break
    }
    messages.sort((a, b) => selfMessageSortTime(a) - selfMessageSortTime(b))
    koa.body = { messages }
  })

  ctx.server.post(`${config.basePath}/api/self-messages`, async (koa) => {
    const requestBody = (koa.request as unknown as { body?: unknown }).body
    const body = (requestBody ?? {}) as Record<string, unknown>
    const payload: SelfMessagePayload = {
      id: typeof body.id === 'string' ? body.id : undefined,
      platform: String(body.platform ?? ''),
      selfId: String(body.selfId ?? ''),
      channelId: String(body.channelId ?? ''),
      guildId: typeof body.guildId === 'string' ? body.guildId : undefined,
      channelType: body.channelType === 'user' ? 'user' : 'group',
      messageId: typeof body.messageId === 'string' || typeof body.messageId === 'number'
        ? String(body.messageId)
        : undefined,
      content: typeof body.content === 'string' ? body.content : undefined,
      elements: Array.isArray(body.elements) ? body.elements as unknown[] : undefined,
      message: Array.isArray(body.message) ? body.message as unknown[] : undefined,
      forwardId: typeof body.forwardId === 'string' ? body.forwardId : undefined,
      forwardContent: Array.isArray(body.forwardContent) ? body.forwardContent as unknown[] : undefined,
      sentAt: typeof body.sentAt === 'number' && Number.isFinite(body.sentAt)
        ? body.sentAt
        : Date.now(),
      timestamp: typeof body.timestamp === 'number' && Number.isFinite(body.timestamp)
        ? body.timestamp
        : undefined,
      timestampMs: typeof body.timestampMs === 'number' && Number.isFinite(body.timestampMs)
        ? body.timestampMs
        : undefined,
      sequence: typeof body.sequence === 'number' && Number.isFinite(body.sequence)
        ? body.sequence
        : 0,
      source: body.source === 'plugin' ? 'plugin' : 'webui',
      kind: typeof body.kind === 'string' ? body.kind : 'text',
      revoked: body.revoked === true,
      revokedAt: typeof body.revokedAt === 'number' && Number.isFinite(body.revokedAt)
        ? body.revokedAt
        : undefined,
    }
    if (!payload.platform || !payload.selfId || !payload.channelId) {
      koa.status = 400
      koa.body = { error: 'missing self-message params' }
      return
    }
    const sentAt = payload.sentAt ?? Date.now()
    const record: SelfMessageRecord = {
      id: payload.id || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      platform: payload.platform,
      selfId: payload.selfId,
      channelId: payload.channelId,
      guildId: payload.guildId,
      channelType: payload.channelType,
      messageId: payload.messageId,
      content: payload.content,
      elements: payload.elements,
      message: payload.message,
      forwardId: payload.forwardId,
      forwardContent: payload.forwardContent,
      sentAt,
      timestamp: payload.timestamp ?? Math.floor(sentAt / 1000),
      timestampMs: payload.timestampMs ?? sentAt,
      sequence: payload.sequence ?? 0,
      source: payload.source ?? 'webui',
      kind: payload.kind ?? 'text',
      revoked: payload.revoked,
      revokedAt: payload.revokedAt,
    }
    await database.upsertSelfMessage(record)
    koa.body = { ok: true, message: record }
  })

  ctx.server.get(`${config.basePath}/api/forward`, async (koa) => {
    const platform = String(koa.query.platform ?? '')
    const selfId = String(koa.query.selfId ?? '')
    const channelId = String(koa.query.channelId ?? '')
    const id = String(koa.query.id ?? '')
    if (!platform || !selfId || !id) {
      koa.status = 400
      koa.body = { error: 'missing forward params' }
      return
    }
    if (channelId) {
      const cached = await database.findSelfForwardContent(platform, selfId, channelId, id)
      if (cached) {
        koa.body = cached
        return
      }
    }
    if (platform !== 'onebot') {
      koa.status = 501
      koa.body = { error: 'forward api not supported' }
      return
    }
    const bot = ctx.bots.find((item) => {
      return item.platform === platform && item.selfId === selfId
    })
    if (!bot) {
      koa.status = 404
      koa.body = { error: 'bot not found' }
      return
    }
    const internal = (bot as unknown as {
      internal?: { getForwardMsg?: (messageId: string) => Promise<unknown> }
    }).internal
    if (!internal?.getForwardMsg) {
      koa.status = 501
      koa.body = { error: 'forward api not supported' }
      return
    }
    try {
      koa.body = await internal.getForwardMsg(id)
    } catch (error) {
      koa.status = 502
      koa.body = { error: 'forward api failed' }
    }
  })

  ctx.server.post(`${config.basePath}/api/send-forward`, async (koa) => {
    const requestBody = (koa.request as unknown as { body?: unknown }).body
    const body = (requestBody ?? {}) as Record<string, unknown>
    const platform = String(body.platform ?? '')
    const selfId = String(body.selfId ?? '')
    const type = String(body.type ?? '')
    const id = String(body.id ?? '')
    if (!platform || !selfId || !type || !id) {
      koa.status = 400
      koa.body = { error: 'missing send-forward params' }
      return
    }
    if (platform !== 'onebot') {
      koa.status = 501
      koa.body = { error: 'forward api not supported' }
      return
    }
    const bot = ctx.bots.find((item) => {
      return item.platform === platform && item.selfId === selfId
    })
    if (!bot) {
      koa.status = 404
      koa.body = { error: 'bot not found' }
      return
    }
    const internal = (bot as unknown as {
      internal?: {
        sendGroupForwardMsg?: (groupId: string, messages: unknown[]) => Promise<unknown>
        sendPrivateForwardMsg?: (userId: string, messages: unknown[]) => Promise<unknown>
      }
    }).internal
    if (type === 'group' && !internal?.sendGroupForwardMsg) {
      koa.status = 501
      koa.body = { error: 'forward api not supported' }
      return
    }
    if (type !== 'group' && !internal?.sendPrivateForwardMsg) {
      koa.status = 501
      koa.body = { error: 'forward api not supported' }
      return
    }
    const messages = Array.isArray(body.messages) ? body.messages as unknown[] : []
    const nodes = messages.map((raw) => {
      const item = typeof raw === 'object' && raw !== null
        ? raw as Record<string, unknown>
        : {}
      const nodeData = typeof item.data === 'object' && item.data !== null
        ? item.data as Record<string, unknown>
        : item
      const content = Array.isArray(item.content)
        ? item.content as unknown[]
        : Array.isArray(nodeData.content)
          ? nodeData.content as unknown[]
          : []
      const userId = String(item.user_id ?? nodeData.user_id ?? nodeData.uin ?? '')
      const nickname = String(item.nickname ?? nodeData.nickname ?? nodeData.name ?? '')
      return {
        type: 'node',
        data: {
          user_id: userId,
          nickname,
          // koishi 的 OneBot adapter 发送自定义转发节点时使用 uin/name
          uin: userId,
          name: nickname,
          time: String(item.time ?? nodeData.time ?? Math.floor(Date.now() / 1000)),
          content: content.map((segmentRaw) => {
            const segment = typeof segmentRaw === 'object' && segmentRaw !== null
              ? segmentRaw as Record<string, unknown>
              : {}
            const copy = { ...segment }
            const segmentType = String(copy.type ?? 'text')
            delete copy.type
            return { type: segmentType, data: copy }
          }),
        },
      }
    })
    try {
      // 必须从 internal 上直接调用，避免方法被取出后丢失 this
      koa.body = type === 'group'
        ? await internal?.sendGroupForwardMsg?.(id, nodes)
        : await internal?.sendPrivateForwardMsg?.(id, nodes)
    } catch (error) {
      koa.status = 502
      koa.body = { error: 'send forward failed' }
    }
  })

  ctx.server.get(`${config.basePath}/api/cache`, async (koa) => {
    const platform = String(koa.query.platform ?? '')
    let selfId = String(koa.query.selfId ?? '')
    if (!selfId) {
      selfId = ctx.bots.find((bot) => bot.platform === platform)?.selfId ?? ''
    }
    const type = String(koa.query.type ?? '')
    if (!platform || !selfId || !type) {
      koa.status = 400
      koa.body = { error: 'missing cache params' }
      return
    }

    // 单条身份缓存：前端收消息时优先走这里，命中后不再请求 Satori API
    const id = String(koa.query.userId ?? koa.query.groupId ?? koa.query.id ?? '')
    if (id) {
      if (type === 'user' || type === 'friend') {
        const channelId = String(koa.query.channelId ?? '')
        const contact = await contactCache.getUser(
          platform,
          selfId,
          id,
          String(koa.query.guildId ?? ''),
          channelId,
          String(koa.query.name ?? ''),
          String(koa.query.avatar ?? ''),
        )
        koa.body = contact ?? null
        return
      }
      if (type === 'group') {
        const guildId = String(koa.query.guildId ?? '')
        const channelId = String(koa.query.channelId ?? '')
        const channelType = koa.query.channelType
        const contact = await contactCache.getGroup(
          platform,
          selfId,
          id,
          guildId,
          channelId,
          String(koa.query.name ?? ''),
          String(koa.query.avatar ?? ''),
          channelType,
        )
        koa.body = contact ?? null
        return
      }
      if (type === 'member') {
        const groupId = String(koa.query.groupId ?? koa.query.id ?? '')
        if (!groupId) {
          koa.status = 400
          koa.body = { error: 'missing groupId' }
          return
        }
        const memberId = String(koa.query.userId ?? '')
        if (memberId) {
          koa.body = await database.getGroupMember(platform, selfId, groupId, memberId) ?? null
          return
        }
        koa.body = {
          members: await database.getGroupMembers(platform, selfId, groupId),
        }
        return
      }
      koa.status = 400
      koa.body = { error: 'unsupported cache type' }
      return
    }

    koa.body = {
      contacts: await database.getContacts(platform, selfId, cacheType(type)),
    }
  })

  ctx.server.post(`${config.basePath}/api/cache`, async (koa) => {
    const requestBody = (koa.request as unknown as { body?: unknown }).body
    const body = (requestBody ?? {}) as Record<string, unknown>
    const platform = String(body.platform ?? '')
    let selfId = String(body.selfId ?? '')
    if (!selfId) {
      selfId = ctx.bots.find((bot) => bot.platform === platform)?.selfId ?? ''
    }
    const type = String(body.type ?? '')
    if (!platform || !selfId || !type) {
      koa.status = 400
      koa.body = { error: 'missing cache params' }
      return
    }
    const normalizedType = cacheType(type)
    if (type === 'member' && body.groupId) {
      const groupId = String(body.groupId)
      const contacts = Array.isArray(body.contacts) ? body.contacts as ContactCacheItem[] : []
      if (body.append === true) {
        for (const contact of contacts) {
          await database.appendGroupMember(platform, selfId, groupId, contact)
        }
      } else {
        await database.setGroupMembers(platform, selfId, groupId, contacts)
      }
      koa.body = {
        members: await database.getGroupMembers(platform, selfId, groupId),
      }
      return
    }
    if (Array.isArray(body.contacts)) {
      const contacts = body.contacts as ContactCacheItem[]
      if (body.append === true) {
        for (const contact of contacts) {
          await database.appendContact(platform, selfId, normalizedType, contact)
        }
      } else {
        await database.setContacts(platform, selfId, normalizedType, contacts)
      }
    }
    koa.body = {
      contacts: await database.getContacts(platform, selfId, normalizedType),
    }
  })

  ctx.server.post(`${config.basePath}/api/clear-all`, async (koa) => {
    try {
      await database.clearAll()
      await media.clearAll()
      koa.body = { ok: true }
    } catch (error) {
      logger.warn('清空全部缓存失败:', error)
      koa.status = 500
      koa.body = { ok: false, error: String(error) }
    }
  })

  const serveFile = async (koa: WebContext, fileName: string) => {
    const fullPath = path.join(webRoot, fileName)
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      const rootContext = koa as unknown as ParameterizedContext<DefaultState, DefaultContext>
      await send(rootContext, path.relative(webRoot, fullPath), { root: webRoot })
      return
    }
    koa.status = 200
    koa.body = ''
    await send(
      koa as unknown as ParameterizedContext<DefaultState, DefaultContext>,
      'index.html',
      { root: webRoot },
    )
  }

  const serveDevWeb = async (koa: WebContext): Promise<boolean> => {
    const vite = getVite()
    if (!vite) return false
    koa.status = 200
    koa.type = 'html'
    koa.body = await transformWebIndex(vite, koa.path)
    return true
  }

  ctx.server.get(`${config.basePath}/web(/.*)?`, async (koa) => {
    if (await serveDevWeb(koa)) return
    if (!existsSync(webRoot)) {
      koa.status = 404
      koa.body = ''
      return
    }
    const fileName = koa.params?.[0]?.replace(/^\/+/, '') || 'index.html'
    await serveFile(koa, fileName)
  })

  if (!existsSync(webRoot) && process.env.NODE_ENV !== 'development') {
    logger.warn('未找到 client/web/dist，发布前请先执行 client/web 目录下的 npm run build')
  }
}
