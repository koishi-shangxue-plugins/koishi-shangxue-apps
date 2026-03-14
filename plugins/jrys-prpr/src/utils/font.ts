import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from 'koishi'
import type { Config } from '../types'

// 默认字体配置
export const defaultFontName = '千图马克手写体lite'
export const localFontPath = path.join(__dirname, './../data/千图马克手写体lite.ttf')

// 本地字体 Base64 缓存
let cachedFontBase64: string | null = null

/**
 * 初始化字体加载：始终以内置字体名注册内置字体到 glyph，
 * 避免将内置字体文件错误注册到用户配置的自定义字体名下。
 */
export async function initializeFont(ctx: Context) {
  if (ctx.glyph) {
    // 只注册内置字体本身，不使用用户配置的 font 名称
    const fontFileUrl = pathToFileURL(localFontPath).href
    const fontExists = await ctx.glyph.checkFont(defaultFontName, fontFileUrl)

    if (fontExists) {
      ctx.logger.info(`内置字体已通过 glyph 服务加载: ${defaultFontName}`)
    } else {
      ctx.logger.warn(`内置字体加载到 glyph 服务失败: ${defaultFontName}`)
    }
  } else {
    ctx.logger.info('未检测到 glyph 服务，将使用本地字体文件')
  }
}

export function getFontFormatFromDataUrl(dataUrl: string): string {
  const mimeMatch = dataUrl.match(/^data:([^;,]+)/)
  if (!mimeMatch) return 'truetype'
  const mime = mimeMatch[1].toLowerCase()
  if (mime.includes('woff2')) return 'woff2'
  if (mime.includes('woff')) return 'woff'
  if (mime.includes('otf') || mime.includes('opentype')) return 'opentype'
  if (mime.includes('collection') || mime.includes('ttc')) return 'collection'
  return 'truetype' // 默认 TTF
}

/**
 * 获取字体 Data URL
 * 优先使用 glyph 服务，否则使用本地字体
 */
export async function getFontDataUrl(
  ctx: Context,
  config: Config,
  logInfo: (...args: any[]) => void
): Promise<{ fontDataUrl: string; selectedFont: string }> {
  let fontDataUrl: string | null = null
  let selectedFont = defaultFontName

  if (ctx.glyph) {
    // 使用 glyph 服务获取字体
    selectedFont = config.HTML_setting.font || defaultFontName
    fontDataUrl = ctx.glyph.getFontDataUrl(selectedFont)
    if (!fontDataUrl) {
      ctx.logger.warn(`未在 glyph 服务中找到字体: ${selectedFont}，将使用本地字体`)
    } else {
      logInfo(`使用 glyph 字体: ${selectedFont}`)
    }
  }

  // 如果 glyph 服务不可用或未找到字体，使用本地字体
  if (!fontDataUrl) {
    if (!cachedFontBase64) {
      cachedFontBase64 = await getFontBase64(localFontPath)
    }
    fontDataUrl = `data:font/ttf;base64,${cachedFontBase64}`
    logInfo(`使用本地字体: ${defaultFontName}`)
  }

  return { fontDataUrl, selectedFont }
}

/**
 * 读取 TTF 字体文件并转换为 Base64 编码
 */
export async function getFontBase64(fontPath: fs.PathOrFileDescriptor): Promise<string> {
  const fontBuffer = fs.readFileSync(fontPath)
  return fontBuffer.toString('base64')
}
