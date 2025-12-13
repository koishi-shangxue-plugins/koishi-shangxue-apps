import type { Context } from 'koishi'
import type { Config } from '../types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 读取 HTML 模板
const htmlTemplate = readFileSync(resolve(__dirname, './../templates/nextchat-page.html'), 'utf-8')

/**
 * 从配置的 NextChat_host 中提取基础 URL
 */
function getNextChatBaseUrl(nextChatHost: string): string {
  try {
    const url = new URL(nextChatHost)
    return `${url.protocol}//${url.host}`
  } catch {
    // 如果解析失败，返回默认值
    return 'https://chat.bailili.top'
  }
}

/**
 * 注册页面路由
 */
export function registerPageRoute(ctx: Context, config: Config) {
  const apiPath = config.path || '/nextchat/v1/chat/completions'

  // 注册 /nextchat 页面，显示跳转链接
  ctx.server.get('/nextchat', async (koaCtx) => {
    const protocol = koaCtx.protocol
    const host = koaCtx.host
    const nextchatBaseUrl = getNextChatBaseUrl(config.NextChat_host || 'https://chat.bailili.top/#/')

    const suitableKey = config.APIkey
      ?.filter(k => k.auth >= 1)
      .sort((a, b) => a.auth - b.auth)[0];

    const settings = {
      key: suitableKey?.token || 'sk-default',
      url: `${protocol}://${host}/nextchat`,
    }
    const settingsQuery = encodeURIComponent(JSON.stringify(settings))
    const targetUrl = `${nextchatBaseUrl}/#/?settings=${settingsQuery}`

    // 使用模板替换变量
    const html = htmlTemplate
      .replace('{{targetUrl}}', targetUrl)
      .replace('{{apiUrl}}', `${protocol}://${host}${apiPath}`)
      .replace('{{apiKey}}', suitableKey?.token || 'sk-default')

    koaCtx.type = 'html'
    koaCtx.body = html
  })
}