import type { Context } from 'koishi'
import type { Config, ChatCompletionRequest } from '../types'
import { NextChatBot } from '../bot'
import { logInfo, logDebug, loggerError } from '../logger'

/**
 * 注册聊天完成路由
 */
export function registerChatRoute(ctx: Context, config: Config) {
  const apiPath = config.path || '/nextchat/v1/chat/completions'

  // 注册路由
  ctx.server.get(apiPath, async (koaCtx) => {
    koaCtx.status = 405
    koaCtx.body = { error: { message: 'Method Not Allowed', type: 'invalid_request_error' } }
  })

  ctx.server.all(apiPath, async (koaCtx, next) => {
    // 完整的 CORS 头配置，允许从任何源访问
    koaCtx.set('Access-Control-Allow-Origin', '*')
    koaCtx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
    koaCtx.set('Access-Control-Allow-Credentials', 'true')
    koaCtx.set('Access-Control-Max-Age', '86400') // 预检请求缓存 24 小时
    koaCtx.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type')
    koaCtx.set('Access-Control-Allow-Private-Network', 'true')

    if (koaCtx.method === 'OPTIONS') {
      koaCtx.status = 204 // No Content，更符合 OPTIONS 规范
      koaCtx.body = ''
      return
    }

    if (koaCtx.method !== 'POST') {
      koaCtx.status = 405
      koaCtx.body = { error: { message: 'Method Not Allowed', type: 'invalid_request_error' } }
      return
    }

    await next()
  })

  ctx.server.post(apiPath, async (koaCtx) => {
    const startTime = Date.now()

    try {
      // 记录请求信息
      logDebug(`[${config.selfId}] 请求头:`, JSON.stringify(koaCtx.headers, null, 2))
      // 验证 token
      const authHeader = koaCtx.headers.authorization;
      const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (!providedToken) {
        loggerError(`[${config.selfId}] 未提供 Token`);
        koaCtx.status = 401;
        koaCtx.body = {
          error: {
            code: "",
            message: `无效的令牌 (request id: ${new Date().toISOString().replace(/[-:.]/g, '')})`,
            type: "new_api_error"
          }
        };
        return;
      }

      const validKey = config.APIkey?.find(key => key.token === providedToken);

      if (!validKey) {
        loggerError(`[${config.selfId}] Token 验证失败，提供的 Token: ${providedToken}`);
        koaCtx.status = 401;
        koaCtx.body = {
          error: {
            code: "",
            message: `无效的令牌 (request id: ${new Date().toISOString().replace(/[-:.]/g, '')})`,
            type: "new_api_error"
          }
        };
        return;
      }

      const body = (koaCtx.request as any).body as ChatCompletionRequest
      logDebug(`[${config.selfId}] 请求体:`, JSON.stringify(body, null, 2))

      // 验证请求格式
      if (!body || !body.messages || !Array.isArray(body.messages)) {
        loggerError(`[${config.selfId}] 请求格式无效，body:`, body)
        koaCtx.status = 400
        koaCtx.body = { error: { message: 'Invalid request format', type: 'invalid_request_error' } }
        return
      }

      // 验证模型是否存在
      const requestedModel = body.model || 'koishi';
      const modelConfig = config.models?.find(m => m.modelname === requestedModel);

      if (!modelConfig) {
        loggerError(`[${config.selfId}] 模型不存在: ${requestedModel}`);
        koaCtx.status = 503;
        koaCtx.body = {
          error: {
            code: "model_not_found",
            message: `模型 ${requestedModel} 无可用渠道（distributor） (request id: ${new Date().toISOString().replace(/[-:.]/g, '')})`,
            type: "new_api_error"
          }
        };
        return;
      }

      // 获取 Bot 实例
      const bot = ctx.bots.find(b => b.platform === 'nextchat' && b.selfId === config.selfId)
      if (!bot) {
        loggerError(`[${config.selfId}] 未找到 NextChat Bot 实例`)
        loggerError(`[${config.selfId}] 当前可用的Bot实例:`, ctx.bots.map(b => ({ platform: b.platform, selfId: b.selfId })))
        loggerError(`[${config.selfId}] 查找条件: platform=nextchat, selfId=${config.selfId}`)
        koaCtx.status = 500
        koaCtx.body = { error: { message: 'Bot not found', type: 'server_error' } }
        return
      }
      // 处理对话请求
      const userId = providedToken;
      const username = providedToken;

      const nextChatBot = bot as unknown as NextChatBot
      const response = await nextChatBot.handleChatCompletion(body, validKey.auth, userId, username, modelConfig.element)
      if (response.__isStream) {
        // 流式响应
        koaCtx.set('Content-Type', 'text/event-stream')
        koaCtx.set('Cache-Control', 'no-cache')
        koaCtx.set('Connection', 'keep-alive')

        const streamData = nextChatBot.createStreamResponse(response.content, response.model)
        koaCtx.status = 200
        koaCtx.body = streamData
      } else {
        // 普通响应
        logDebug(`[${config.selfId}] 响应:`, JSON.stringify(response, null, 2))
        koaCtx.status = 200
        koaCtx.body = response
      }
    } catch (error) {
      const processingTime = Date.now() - startTime
      loggerError(`[${config.selfId}] 处理请求时出错 (耗时: ${processingTime}ms):`, error)
      loggerError(`[${config.selfId}] 错误堆栈:`, error.stack)

      koaCtx.status = 500
      koaCtx.body = {
        error: {
          message: 'Internal server error',
          type: 'server_error',
          details: error.message
        }
      }
    }
  })
}