import { Context, Logger } from 'koishi'
import type { Config } from './types'

// 内部调试日志实例（带前缀标识）
const devLogger = new Logger('DEV:freeluna')

// 导出的日志函数（由 initLogger 初始化）
export let loggerError: (message: unknown, ...args: unknown[]) => void
export let loggerInfo: (message: unknown, ...args: unknown[]) => void
export let logInfo: (message: unknown, ...args: unknown[]) => void
export let logDebug: (message: unknown, ...args: unknown[]) => void

/**
 * 初始化日志函数，需在插件 ready 后调用
 * @param ctx Koishi Context
 * @param config 插件配置
 */
export function initLogger(ctx: Context, config: Config) {
  // 普通信息日志（始终输出）
  loggerInfo = (message: unknown, ...args: unknown[]) => {
    ctx.logger.info(message, ...args)
  }

  // 错误日志（始终输出）
  loggerError = (message: unknown, ...args: unknown[]) => {
    ctx.logger.error(message, ...args)
  }

  // 详细信息日志（需开启 loggerInfo）
  logInfo = (message: unknown, ...args: unknown[]) => {
    if (config.loggerInfo) {
      devLogger.info(message, ...args)
    }
  }

  // 调试日志（需开启 loggerDebug）
  logDebug = (message: unknown, ...args: unknown[]) => {
    if (config.loggerDebug) {
      devLogger.info(message, ...args)
    }
  }
}
