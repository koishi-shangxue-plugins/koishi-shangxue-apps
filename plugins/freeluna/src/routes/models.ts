import type { Context } from 'koishi'
import type { Config } from '../types'
import { loadProviderIndex } from '../remoteConfig'
import { logInfo, logDebug } from '../logger'

/**
 * 设置通用 CORS 头
 */
function setCorsHeaders(koaCtx: { set: (key: string, value: string) => void }) {
  koaCtx.set('Access-Control-Allow-Origin', '*')
  koaCtx.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
  koaCtx.set('Access-Control-Max-Age', '86400')
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

    // 从注册表加载提供商列表，转换为 OpenAI 模型格式
    const index = await loadProviderIndex(config)
    const providers = index?.providers ?? []

    logInfo('[freeluna] /v1/models 请求，提供商数量:', providers.length)
    logDebug('[freeluna] 提供商列表:', providers.map(p => p.name))

    const modelList = providers.map(p => ({
      id: p.name,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'freeluna',
      description: p.description,
      supported_endpoint_types: ['openai'],
    }))

    koaCtx.body = {
      object: 'list',
      data: modelList,
      // 附带版本信息，供前端页面展示
      version: index?.version,
      updatedAt: index?.updatedAt,
    }
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
