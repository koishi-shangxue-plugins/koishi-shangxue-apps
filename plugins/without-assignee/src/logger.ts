import { Context } from 'koishi'

import type { Config } from './index'

export type DebugLogger = (message: unknown, ...args: unknown[]) => void

export function createDebugLogger(ctx: Context, config: Config): DebugLogger {
  const logger = ctx.logger('without-assignee')

  return (message, ...args) => {
    if (!config.loggerinfo) return
    logger.info(message, ...args)
  }
}
