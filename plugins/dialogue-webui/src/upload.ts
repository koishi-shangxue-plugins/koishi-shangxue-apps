import type { IncomingMessage } from 'node:http'

import { randomBytes } from 'node:crypto'

import { mkdir, writeFile } from 'node:fs/promises'

import { join, resolve } from 'node:path'

import { pathToFileURL } from 'node:url'

import type { Context } from 'koishi'

import type { Config } from '.'

interface RouteLogger {

  debug: (message: string) => void

  warn: (message: string) => void

}

interface KoaLikeContext {

  req: IncomingMessage

  request: {

    headers: Record<string, string | string[] | undefined>

  }

  status: number

  body: unknown

}

function isKoaLikeContext(value: unknown): value is KoaLikeContext {

  if (!value || typeof value !== 'object') return false

  const v = value as Record<string, unknown>

  return typeof v.req === 'object' && typeof v.request === 'object'

}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {

  const raw = headers[name.toLowerCase()]

  if (Array.isArray(raw)) return raw[0]

  return raw

}

function sanitizeSubdir(input: string): string {

  const trimmed = input.trim()

  if (!trimmed) return 'default'

  return trimmed

    .replace(/[\\/]+/g, '-')

    .replace(/\.+/g, '.')

    .replace(/\s+/g, '_')

    .slice(0, 64)

}

function inferImageExtension(contentType?: string, originalName?: string): string {

  const ct = (contentType || '').toLowerCase()

  if (ct.includes('image/png')) return 'png'

  if (ct.includes('image/jpeg')) return 'jpg'

  if (ct.includes('image/jpg')) return 'jpg'

  if (ct.includes('image/gif')) return 'gif'

  if (ct.includes('image/webp')) return 'webp'

  if (ct.includes('image/bmp')) return 'bmp'

  const name = (originalName || '').toLowerCase()

  const ext = name.match(/\.([a-z0-9]{1,10})$/)?.[1]

  if (ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {

    return ext === 'jpeg' ? 'jpg' : ext

  }

  return 'png'

}

async function readRequestBuffer(req: IncomingMessage, maxBytes: number): Promise<Buffer> {

  const chunks: Buffer[] = []

  let total = 0

  for await (const chunk of req) {

    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)

    total += buf.length

    if (total > maxBytes) {

      throw new Error(`文件过大（>${maxBytes} bytes）`)

    }

    chunks.push(buf)

  }

  return Buffer.concat(chunks)

}

export function registerImageUploadRoute(ctx: Context, config: Config, logger: RouteLogger): () => void {

  const server = ctx.server as unknown as {

    post: (path: string, handler: (koaCtx: unknown) => Promise<void> | void) => unknown

  }

  const maybeDispose = server.post('/dialogue-webui/upload-image', async (koaCtx: unknown) => {

    if (!isKoaLikeContext(koaCtx)) return

    const headers = koaCtx.request.headers

    const idHeader = getHeader(headers, 'x-dialogue-id')

    const dialogueId = Number(idHeader)

    if (!Number.isFinite(dialogueId) || dialogueId <= 0) {

      koaCtx.status = 400

      koaCtx.body = { success: false, message: '无效的问答 id（请先保存创建问答）。' }

      return

    }

    const contentType = getHeader(headers, 'content-type')

    if (contentType && !contentType.toLowerCase().startsWith('image/')) {

      koaCtx.status = 415

      koaCtx.body = { success: false, message: '仅支持上传图片类型。' }

      return

    }

    const originalName = getHeader(headers, 'x-filename')

    try {

      const buffer = await readRequestBuffer(koaCtx.req, 10 * 1024 * 1024)

      const ext = inferImageExtension(contentType, originalName)

      const subdir = sanitizeSubdir(config.imagePasteSubdir)

      const baseDir = resolve(ctx.baseDir, 'data', 'dialogue-webui', '对话', subdir, String(dialogueId))

      await mkdir(baseDir, { recursive: true })

      const rand = randomBytes(6).toString('hex')

      const filename = `${Date.now()}-${rand}.${ext}`

      const filePath = join(baseDir, filename)

      await writeFile(filePath, buffer)

      const url = pathToFileURL(filePath).toString()

      logger.debug(`[upload] 保存图片: id=${dialogueId} -> ${filePath}`)

      koaCtx.status = 200

      koaCtx.body = { success: true, url }

    } catch (err) {

      const message = err instanceof Error ? err.message : String(err)

      logger.warn(`[upload] 保存失败: ${message}`)

      koaCtx.status = 500

      koaCtx.body = { success: false, message }

    }

  })

  if (typeof maybeDispose === 'function') {

    return maybeDispose as () => void

  }

  return () => {}

}
