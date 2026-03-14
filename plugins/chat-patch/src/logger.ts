import { Logger } from 'koishi'

import { Config } from './config'

export interface PluginLogger {
  logInfo(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export function createPluginLogger(logger: Logger, config: Pick<Config, 'loggerinfo'>): PluginLogger {
  return {
    logInfo(...args: unknown[]) {
      if (config.loggerinfo) {
        Reflect.apply(logger.info, logger, args)
      }
    },
    info(...args: unknown[]) {
      Reflect.apply(logger.info, logger, args)
    },
    warn(...args: unknown[]) {
      Reflect.apply(logger.warn, logger, args)
    },
    error(...args: unknown[]) {
      Reflect.apply(logger.error, logger, args)
    }
  }
}
