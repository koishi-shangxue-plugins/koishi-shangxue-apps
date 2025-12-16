import { Logger } from 'koishi'
import { Config } from './index'

export let logger: Logger
export let config: Config

// 初始化日志记录器
export function initializeLogger(newLogger: Logger, newConfig: Config) {
  logger = newLogger
  config = newConfig
}

// 输出调试信息
export function logInfo(...args: any[]) {
  if (config?.loggerinfo) {
    (logger?.info as (...args: any[]) => void)?.(...args)
  }
}