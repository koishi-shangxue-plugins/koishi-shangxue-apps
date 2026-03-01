import type { Context } from 'koishi'
import type { Config, ChatCompletionRequest, ChatOptions } from '../types'
import { loadProviderIndex, findProvider } from '../remoteConfig'
import { logInfo, logDebug, loggerError } from '../logger'
import { createStreamResponse, buildChatResponse } from '../stream'

function setCorsHeaders(koaCtx: { set: (key: string, value: string) => void }) {
  koaCtx.set('Access-Control-Allow-Origin', '*')
  koaCtx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin')
  koaCtx.set('Access-Control-Allow-Credentials', 'true')
  koaCtx.set('Access-Control-Max-Age', '86400')
  koaCtx.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type')
  koaCtx.set('Access-Control-Allow-Private-Network', 'true')
}

export function registerChatRoute(ctx: Context, config: Config) {
  const base = config.basePath
  const chatPath = `${base}/openai-compatible/v1/chat/completions`
  ctx.server.options(chatPath, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 204
    koaCtx.body = ''
  })
  ctx.server.get(chatPath, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    koaCtx.status = 405
    koaCtx.body = { error: { message: 'Method Not Allowed', type: 'invalid_request_error' } }
  })
  ctx.server.post(chatPath, async (koaCtx) => {
    setCorsHeaders(koaCtx)
    const startTime = Date.now()

    try {

      const authHeader = koaCtx.headers.authorization
      const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

      if (!providedToken) {
        loggerError('请求未携带 Authorization 头')
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
        loggerError('Token 验证失败，提供的 Token:', providedToken)
        koaCtx.status = 401
        koaCtx.body = {
          error: {
            message: `无效的令牌 (request id: ${Date.now()})`,
            type: 'invalid_api_key',
          },
        }
        return
      }
      const body = (koaCtx.request as unknown as { body: unknown }).body as ChatCompletionRequest

      logDebug('收到对话请求，model:', body?.model, 'stream:', body?.stream, 'messages:', body?.messages?.length)

      if (!body || !body.messages || !Array.isArray(body.messages)) {
        koaCtx.status = 400
        koaCtx.body = {
          error: { message: 'Invalid request format: messages is required', type: 'invalid_request_error' },
        }
        return
      }
      const index = await loadProviderIndex(config)
      if (!index || index.providers.length === 0) {
        loggerError('注册表为空或加载失败')
        koaCtx.status = 503
        koaCtx.body = {
          error: { message: '暂无可用的免费 API 提供商，请稍后重试', type: 'service_unavailable' },
        }
        return
      }
      const rawModel = body.model || `freeluna-${index.providers[0].name}`
      const providerName = rawModel.startsWith('freeluna-')
        ? rawModel.slice('freeluna-'.length)
        : rawModel
      let provider = await findProvider(providerName, config)

      if (!provider) {
        logInfo(`模型 "${rawModel}" 未找到，使用默认提供商:`, index.providers[0].name)
        provider = await findProvider(index.providers[0].name, config)
      }

      if (!provider) {
        loggerError('无法加载任何提供商模块')
        koaCtx.status = 503
        koaCtx.body = {
          error: { message: '提供商模块加载失败，请稍后重试', type: 'service_unavailable' },
        }
        return
      }

      logInfo(`使用提供商: ${provider.entry.name}`)
      const options: ChatOptions = {
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stream: body.stream,
      }

      const replyText = await provider.module.chat(body.messages, options)
      const elapsed = Date.now() - startTime

      logInfo(`提供商响应成功，耗时: ${elapsed}ms，回复长度: ${replyText.length}`)
      logDebug('回复内容:', replyText.substring(0, 200))
      const isStream = body.stream === true

      if (isStream) {

        koaCtx.status = 200
        koaCtx.set('Content-Type', 'text/event-stream')
        koaCtx.set('Cache-Control', 'no-cache')
        koaCtx.set('Connection', 'keep-alive')
        koaCtx.body = createStreamResponse(replyText, provider.entry.name)
      } else {

        koaCtx.status = 200
        koaCtx.body = buildChatResponse(replyText, provider.entry.name)
      }
    } catch (err) {
      const elapsed = Date.now() - startTime
      loggerError(`处理对话请求出错 (耗时: ${elapsed}ms):`, err instanceof Error ? err.message : err)

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
