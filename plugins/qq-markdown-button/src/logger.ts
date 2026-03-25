import { Context } from 'koishi'

export interface PluginLogger {
  debug(message: unknown, detail?: unknown): void
  error(message: string, error?: unknown): void
}

export function createLogger(ctx: Context, enabled: boolean): PluginLogger {
  return {
    debug(message, detail) {
      if (!enabled) return
      if (detail === undefined) {
        ctx.logger.info(message)
        return
      }
      ctx.logger.info(message, detail)
    },
    error(message, error) {
      if (error === undefined) {
        ctx.logger.error(message)
        return
      }
      ctx.logger.error(message, error)
    },
  }
}
