import type { Context } from 'koishi'
import type { Config } from '../types'

/**
 * 设置 CORS 头
 */
function setCorsHeaders(koaCtx: any) {
  koaCtx.set('Access-Control-Allow-Origin', '*')
  koaCtx.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
  koaCtx.set('Access-Control-Max-Age', '86400')
}

/**
 * 注册模型相关路由
 */
export function registerModelRoutes(ctx: Context, config: Config) {
  // 处理模型列表请求的 OPTIONS 预检
  ctx.server.options('/nextchat/v1/models', async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  // 处理模型列表请求
  ctx.server.get('/nextchat/v1/models', async (koaCtx) => {
    setCorsHeaders(koaCtx)

    // 从配置中获取模型列表
    const modelList = config.models?.map(model => ({
      id: model.modelname,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'koishi',
    })) || [{
      id: 'koishi',
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'koishi',
    }];

    koaCtx.body = {
      object: 'list',
      data: modelList,
    };
  });

  // 处理账单使用情况请求的 OPTIONS 预检
  ctx.server.options('/nextchat/dashboard/billing/usage', async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  // 处理账单使用情况请求
  ctx.server.get('/nextchat/dashboard/billing/usage', async (koaCtx) => {
    setCorsHeaders(koaCtx)

    koaCtx.body = {
      object: 'list',
      total_usage: 11451.4
    };
  });

  // 处理订阅信息请求的 OPTIONS 预检
  ctx.server.options('/nextchat/dashboard/billing/subscription', async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  // 处理订阅信息请求
  ctx.server.get('/nextchat/dashboard/billing/subscription', async (koaCtx) => {
    setCorsHeaders(koaCtx)

    koaCtx.body = {
      object: 'billing_subscription',
      has_payment_method: true,
      soft_limit_usd: 1919810,
      hard_limit_usd: 1919810,
      system_hard_limit_usd: 1919810,
      access_until: 0 // 0 表示永久访问
    };
  });
}