import type { Context } from 'koishi'
import type { Config, ChatCompletionRequest, ChatOptions } from '../types'
import { loadProviderIndex, findProvider } from '../remoteConfig'
import { logInfo, logDebug, loggerError } from '../logger'
import { createStreamResponse, buildChatResponse } from '../stream'

/**
 * 设置通用 CORS 头
 */
function setCorsHeaders(koaCtx: { set: (key: string, value: string) => void }) {
  koaCtx.set('Access-Control-Allow-Origin', '*')
  koaCtx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
  koaCtx.set('Access-Control-Allow-Credentials', 'true')
  koaCtx.set('Access-Control-Max-Age', '86400')
  koaCtx.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type')
  koaCtx.set('Access-Control-Allow-Private-Network', 'true')
}

/**
 * 注册对话路由
 *
 * POST /freeluna/openai-compatible/v1/chat/completions
 * 接收 OpenAI 兼容格式的请求，验证 API Key 后动态加载对应提供商的 JS 模块处理请求
 * 支持流式（SSE）和非流式两种响应模式
 */
export function registerChatRoute(ctx: Context, config: Config) {
  const base = config.basePath
  const chatPath = `${base}/openai-compatible/v1/chat/completions`

  // OPTIONS 预检
  ctx.server.options(chatPath, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })

  // GET 方法不允许
  ctx.server.get(chatPath, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 405
    koaCtx.body = { error: { message: 'Method Not Allowed', type: 'invalid_request_error' } }
  })

  // POST 处理对话请求
  ctx.server.post(chatPath, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    const startTime = Date.now()

    try {
      // ── API Key 验证 ──────────────────────────────────────────────────────────
      const authHeader = koaCtx.headers.authorization
      const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

      if (!providedToken) {
        loggerError('[freeluna] 请求未携带 Authorization 头')
        koaCtx.status = 401
        koaCtx.body = {
          error: {
            message: `无效的令牌 (request id: ${Date.now()})`,
            type: 'invalid_api_key',
          },
        }
        return
      }

      const validKey = config.apiKeys?.find(k => k.token === providedToken)
      if (!validKey) {
        loggerError('[freeluna] Token 验证失败，提供的 Token:', providedToken)
        koaCtx.status = 401
        koaCtx.body = {
          error: {
            message: `无效的令牌 (request id: ${Date.now()})`,
            type: 'invalid_api_key',
          },
        }
        return
      }

      // ── 解析请求体 ────────────────────────────────────────────────────────────
      const body = (koaCtx.request as unknown as { body: unknown }).body as ChatCompletionRequest

      logDebug('[freeluna] 收到对话请求，model:', body?.model, 'stream:', body?.stream, 'messages:', body?.messages?.length)

      if (!body || !body.messages || !Array.isArray(body.messages)) {
        koaCtx.status = 400
        koaCtx.body = {
          error: { message: 'Invalid request format: messages is required', type: 'invalid_request_error' },
        }
        return
      }

      // ── 加载提供商 ────────────────────────────────────────────────────────────
      const index = await loadProviderIndex(config)
      if (!index || index.providers.length === 0) {
        loggerError('[freeluna] 注册表为空或加载失败')
        koaCtx.status = 503
        koaCtx.body = {
          error: { message: '暂无可用的免费 API 提供商，请稍后重试', type: 'service_unavailable' },
        }
        return
      }

      // 根据请求的 model 名称查找提供商，找不到则使用第一个
      const requestedModel = body.model || index.providers[0].name
      let provider = await findProvider(requestedModel, config)

      if (!provider) {
        logInfo(`[freeluna] 模型 "${requestedModel}" 未找到，使用默认提供商:`, index.providers[0].name)
        provider = await findProvider(index.providers[0].name, config)
      }

      if (!provider) {
        loggerError('[freeluna] 无法加载任何提供商模块')
        koaCtx.status = 503
        koaCtx.body = {
          error: { message: '提供商模块加载失败，请稍后重试', type: 'service_unavailable' },
        }
        return
      }

      logInfo(`[freeluna] 使用提供商: ${provider.entry.name}`)

      // ── 调用提供商 chat() ─────────────────────────────────────────────────────
      const options: ChatOptions = {
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stream: body.stream,
      }

      const replyText = await provider.module.chat(body.messages, options)
      const elapsed = Date.now() - startTime

      logInfo(`[freeluna] 提供商响应成功，耗时: ${elapsed}ms，回复长度: ${replyText.length}`)
      logDebug('[freeluna] 回复内容:', replyText.substring(0, 200))

      // ── 返回响应 ──────────────────────────────────────────────────────────────
      const isStream = body.stream === true

      if (isStream) {
        // 流式响应（SSE 格式）
        koaCtx.status = 200
        koaCtx.set('Content-Type', 'text/event-stream')
        koaCtx.set('Cache-Control', 'no-cache')
        koaCtx.set('Connection', 'keep-alive')
        koaCtx.body = createStreamResponse(replyText, provider.entry.name)
      } else {
        // 非流式响应（标准 JSON）
        koaCtx.status = 200
        koaCtx.body = buildChatResponse(replyText, provider.entry.name)
      }
    } catch (err) {
      const elapsed = Date.now() - startTime
      loggerError(`[freeluna] 处理对话请求出错 (耗时: ${elapsed}ms):`, err instanceof Error ? err.message : err)

      koaCtx.status = 500
      koaCtx.body = {
        error: {
          message: '内部服务器错误，请稍后重试',
          type: 'server_error',
          details: err instanceof Error ? err.message : String(err),
        },
      }
    }
  })
}
