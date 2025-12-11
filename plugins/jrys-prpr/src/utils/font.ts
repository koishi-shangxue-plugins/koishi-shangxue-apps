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
 * 初始化字体加载
 * 如果有 glyph 服务，则使用 glyph 管理字体；否则使用本地字体
 */
export async function initializeFont(ctx: Context, config: Config) {
  if (ctx.glyph) {
    const fontName = config.HTML_setting.font || defaultFontName
    const fontFileUrl = pathToFileURL(localFontPath).href
    const fontExists = await ctx.glyph.checkFont(fontName, fontFileUrl)

    if (fontExists) {
      ctx.logger.info(`字体已通过 glyph 服务加载: ${fontName}`)
    } else {
      ctx.logger.warn(`字体加载到 glyph 服务失败: ${fontName}`)
    }
  } else {
    ctx.logger.info('未检测到 glyph 服务，将使用本地字体文件')
  }
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