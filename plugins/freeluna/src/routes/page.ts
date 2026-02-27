import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Context } from 'koishi'
import type { Config } from '../types'
import { logInfo } from '../logger'

const htmlTemplate = readFileSync(resolve(__dirname, '../../templates/freeluna-page.html'), 'utf-8')

export function registerPageRoute(ctx: Context, config: Config) {
  const base = config.basePath

  ctx.server.get(base, async (koaCtx) => {
    const protocol = koaCtx.protocol
    const host = koaCtx.host

    const apiBaseUrl = `${protocol}://${host}${base}`
    const chatUrl = `${protocol}://${host}${base}/openai-compatible/v1/chat/completions`
    const modelsUrl = `${protocol}://${host}${base}/v1/models`

    logInfo('页面请求，apiBaseUrl:', apiBaseUrl)


    const html = htmlTemplate
      .replace(/\{\{apiBaseUrl\}\}/g, apiBaseUrl)
      .replace(/\{\{chatUrl\}\}/g, chatUrl)
      .replace(/\{\{modelsUrl\}\}/g, modelsUrl)

    koaCtx.type = 'html'
    koaCtx.body = html
  })
}
