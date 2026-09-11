import { Context } from 'koishi'
import {} from '@koishijs/plugin-server'

type KoaErrorListener = (error: Error) => void

// 仅过滤客户端断开和超大历史响应导致的已知错误。
function isIgnoredWebError(error: Error): boolean {
  if (error.name === 'RangeError' && error.message === 'Invalid string length') return true
  return (error as NodeJS.ErrnoException).code === 'ECONNRESET'
}

export function registerWebErrorFilter(ctx: Context) {
  const app = ctx.server._koa
  const defaultHandler = app.onerror
  const hasDefaultHandler = app.listeners('error').includes(defaultHandler)
  if (hasDefaultHandler) app.off('error', defaultHandler)

  const errorHandler: KoaErrorListener = (error) => {
    if (isIgnoredWebError(error)) return
    if (hasDefaultHandler) defaultHandler.call(app, error)
  }
  app.on('error', errorHandler)

  ctx.on('dispose', () => {
    app.off('error', errorHandler)
    if (hasDefaultHandler && !app.listeners('error').includes(defaultHandler)) {
      app.on('error', defaultHandler)
    }
  })
}
