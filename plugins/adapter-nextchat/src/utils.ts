import { h } from 'koishi'
import { NextChatBot } from './bot'
import { logInfo, loggerError } from './index'

/**
 * 转换媒体 URL，将非 HTTP/HTTPS 的 URL 通过 assets 服务转存
 * @param bot Bot 实例
 * @param elementString 元素字符串（如 h.image(url).toString()）
 * @returns 转换后的 URL，失败返回空字符串
 */
export async function transformUrl(bot: NextChatBot, elementString: string): Promise<string> {
  try {
    if (!bot.ctx.assets) {
      loggerError(`[${bot.selfId}] assets 服务不可用，请安装 @koishijs/plugin-assets 插件`)
      return ''
    }

    logInfo(`[${bot.selfId}] 开始转存媒体，元素字符串长度: ${elementString.length}`)
    const startTime = Date.now()

    // 调用 assets.transform，传入元素字符串
    const transformPromise = bot.ctx.assets.transform(elementString)
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('转存超时')), 30000)
    })

    const transformed = await Promise.race([transformPromise, timeoutPromise])
    const duration = Date.now() - startTime

    // 从转换后的字符串中提取 URL
    const urlMatch = transformed.match(/src="([^"]+)"/) || transformed.match(/url="([^"]+)"/)
    const url = urlMatch ? urlMatch[1] : transformed

    logInfo(`[${bot.selfId}] 媒体转存成功，耗时: ${duration}ms, URL: ${url.substring(0, 100)}`)
    return url
  } catch (error) {
    loggerError(`[${bot.selfId}] 媒体转存失败:`, error.message)
    if (error.stack) {
      loggerError(`[${bot.selfId}] 错误堆栈:`, error.stack)
    }
    return ''
  }
}