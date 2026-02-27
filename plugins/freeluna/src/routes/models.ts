import type { Context } from 'koishi'
import type { Config } from '../types'
import { loadProviderIndex } from '../remoteConfig'
import { logInfo, logDebug } from '../logger'

/**
 * 设置通用 CORS 头（完整版，兼容浏览器跨域和私有网络访问）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setCorsHeaders(koaCtx: any) {
  koaCtx.set('Access-Control-Allow-Origin', '*')
  koaCtx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
  koaCtx.set('Access-Control-Allow-Credentials', 'true')
  koaCtx.set('Access-Control-Max-Age', '86400')
  koaCtx.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type')
  koaCtx.set('Access-Control-Allow-Private-Network', 'true')
}

/**
 * 注册模型列表及账单相关路由
 *
 * GET  /freeluna/v1/models                      - 返回当前可用模型列表
 * GET  /freeluna/dashboard/billing/usage        - 返回账单使用情况（固定值）
 * GET  /freeluna/dashboard/billing/subscription - 返回订阅信息（固定值）
 */
export function registerModelRoutes(ctx: Context, config: Config) {
  const base = config.basePath

  // ── /v1/models ──────────────────────────────────────────────────────────────

  ctx.server.options(`${base}/v1/models`, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  ctx.server.get(`${base}/v1/models`, async (koaCtx) => {
    setCorsHeaders(koaCtx)

    // 始终记录请求来源（方便排查 ChatLuna 等客户端的调用问题）
    logInfo('[freeluna] /v1/models 请求来源:', koaCtx.ip, '| UA:', koaCtx.headers['user-agent'] ?? '-')
    // 详细请求头（需开启 loggerDebug）
    logDebug('[freeluna] /v1/models 请求头:', JSON.stringify(koaCtx.headers, null, 2))

    // 从注册表加载提供商列表，转换为 OpenAI 模型格式
    const index = await loadProviderIndex(config)
    const providers = index?.providers ?? []

    logInfo('[freeluna] /v1/models 提供商数量:', providers.length)

    // 严格遵循 OpenAI /v1/models 格式，只保留标准字段
    const modelList = providers.map(p => ({
      id: p.name,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'freeluna',
    }))

    const responseBody = {
      object: 'list',
      data: modelList,
    }

    logDebug('[freeluna] /v1/models 响应:', JSON.stringify(responseBody, null, 2))
    koaCtx.body = responseBody
  })

  // ── /dashboard/billing/usage ─────────────────────────────────────────────────

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

  // ── /dashboard/billing/subscription ─────────────────────────────────────────

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
