import { Context, Logger } from 'koishi'
import { registerCommands } from './commands'
import { Config } from './config'
import { ElectricityBillRuntime } from './runtime'
import type { Config as PluginConfig, RuntimeLogger } from './types'

export const name = 'electricity-bill-check'
export const reusable = true
export const filter = false

export const inject = {
  optional: [],
  required: []
}

export { Config }

function createRuntimeLogger(config: PluginConfig): RuntimeLogger {
  const baseLogger = new Logger(name)

  return {
    // 调试日志统一在这里开关。
    debug(message) {
      if (config.loggerinfo) {
        baseLogger.info(`[debug] ${message}`)
      }
    },
    info(message) {
      baseLogger.info(message)
    },
    warn(message) {
      baseLogger.warn(message)
    },
    error(message, error) {
      if (error === undefined) {
        baseLogger.error(message)
        return
      }

      baseLogger.error(message, error)
    },
  }
}

export function apply(ctx: Context, config: PluginConfig) {
  const logger = createRuntimeLogger(config)
  const runtime = new ElectricityBillRuntime(ctx, config, logger)

  registerCommands(ctx, runtime)

  ctx.on('ready', () => {
    logger.info('电费查询插件已启动')
    runtime.start()
  })

  ctx.on('dispose', () => {
    runtime.stop()
    logger.info('电费查询插件已停止')
  })
}
