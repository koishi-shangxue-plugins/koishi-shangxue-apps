import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Context } from 'koishi'
import type { Config } from '../types'
import { logInfo } from '../logger'

// 读取 HTML 模板（编译后 __dirname 指向 lib/routes/，模板在 templates/ 目录）
const htmlTemplate = readFileSync(resolve(__dirname, '../../templates/freeluna-page.html'), 'utf-8')

/**
 * 注册基础页面路由 GET /freeluna/
 * 返回静态 HTML 页面，展示 API 接入信息和当前可用模型
 */
export function registerPageRoute(ctx: Context, config: Config) {
  const base = config.basePath

  ctx.server.get(base, async (koaCtx) => {
    const protocol = koaCtx.protocol
    const host = koaCtx.host

    const apiBaseUrl = `${protocol}://${host}${base}`
    const chatUrl = `${protocol}://${host}${base}/openai-compatible/v1/chat/completions`
    const modelsUrl = `${protocol}://${host}${base}/v1/models`

    logInfo('[freeluna] 页面请求，apiBaseUrl:', apiBaseUrl)

    // 替换模板中的占位符
    const html = htmlTemplate
      .replace(/\{\{apiBaseUrl\}\}/g, apiBaseUrl)
      .replace(/\{\{chatUrl\}\}/g, chatUrl)
      .replace(/\{\{modelsUrl\}\}/g, modelsUrl)

    koaCtx.type = 'html'
    koaCtx.body = html
  })
}
