import type { Context } from 'koishi'

/** 统一日志入口，模块只接收该对象，不直接获取 ctx.logger。 */
export function createPluginLogger(ctx: Context, enableDebugLogging: boolean): LogInfo {
  const logger = ctx.logger('curriculum-table')
  let debugEnabled = enableDebugLogging
  return {
    info: (message, ...rest) => {
      if (debugEnabled) logger.info(message, ...rest)
    },
    debug: (message, ...rest) => {
      if (debugEnabled) logger.debug(message, ...rest)
    },
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger),
    setDebug: (enabled) => {
      debugEnabled = enabled
    },
  }
}

export interface LogInfo {
  info: (message: string, ...rest: unknown[]) => void
  debug: (message: string, ...rest: unknown[]) => void
  warn: (message: string, ...rest: unknown[]) => void
  error: (message: string, ...rest: unknown[]) => void
  setDebug: (enabled: boolean) => void
}
