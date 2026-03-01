import type { Context } from 'koishi'
import type { Config } from '../types'
import { loadProviderIndex } from '../remoteConfig'
import { logInfo, logDebug } from '../logger'

function setCorsHeaders(koaCtx: any) {
  koaCtx.set('Access-Control-Allow-Origin', '*')
  koaCtx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
  koaCtx.set('Access-Control-Allow-Credentials', 'true')
  koaCtx.set('Access-Control-Max-Age', '86400')
  koaCtx.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type')
  koaCtx.set('Access-Control-Allow-Private-Network', 'true')
}

export function registerModelRoutes(ctx: Context, config: Config) {
  const base = config.basePath
  async function handleModels(koaCtx: any) {
    setCorsHeaders(koaCtx)
    logInfo('/models 请求来源:', koaCtx.ip, '路径:', koaCtx.path, '| UA:', koaCtx.headers['user-agent'] ?? '-')
    logDebug('/models 请求头:', JSON.stringify(koaCtx.headers, null, 2))

    const index = await loadProviderIndex(ctx, config)
    const providers = index?.providers ?? []

    logInfo('/models 提供商数量:', providers.length)

    const modelList = providers.map(p => ({
      id: `freeluna-${p.name}`,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'freeluna',
    }))

    const responseBody = {
      object: 'list',
      data: modelList,
    }

    logDebug('/models 响应:', JSON.stringify(responseBody, null, 2))
    koaCtx.body = responseBody
  }

  ctx.server.options(`${base}/openai-compatible/v1/models`, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  ctx.server.get(`${base}/openai-compatible/v1/models`, handleModels)

  ctx.server.options(`${base}/dashboard/billing/usage`, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  ctx.server.get(`${base}/dashboard/billing/usage`, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.body = {
      object: 'list',
      total_usage: 0,
    }
  })

  ctx.server.options(`${base}/dashboard/billing/subscription`, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  ctx.server.get(`${base}/dashboard/billing/subscription`, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.body = {
      object: 'billing_subscription',
      has_payment_method: true,
      soft_limit_usd: 1919810,
      hard_limit_usd: 1919810,
      system_hard_limit_usd: 1919810,
      access_until: 0,
    }
  })
}
