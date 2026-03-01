import { Context, Logger } from 'koishi'
import type { Config } from './types'

const devLogger = new Logger('DEV:freeluna')

export let loggerError: (message: unknown, ...args: unknown[]) => void
export let loggerInfo: (message: unknown, ...args: unknown[]) => void
export let logInfo: (message: unknown, ...args: unknown[]) => void
export let logDebug: (message: unknown, ...args: unknown[]) => void

export function initLogger(ctx: Context, config: Config) {

  loggerInfo = (message: unknown, ...args: unknown[]) => {
    ctx.logger.info(message, ...args)
  }
  loggerError = (message: unknown, ...args: unknown[]) => {
    ctx.logger.error(message, ...args)
  }
  logInfo = (message: unknown, ...args: unknown[]) => {
    if (config.loggerInfo) {
      devLogger.info(message, ...args)
    }
  }
  logDebug = (message: unknown, ...args: unknown[]) => {
    if (config.loggerDebug) {
      devLogger.info(message, ...args)
    }
  }
}
