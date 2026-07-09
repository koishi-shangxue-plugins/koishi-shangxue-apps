import { Context, Logger } from 'koishi'
import { Config } from './config'
import { HackChatBot } from './bot'

export const name = 'adapter-hackchat'
export const reusable = true
export const filter = false
export const inject = {
  required: ['logger'],
}

export const usage = `
---

### adapter-hackchat

适配 https://hack.chat 纯文本聊天平台的 Koishi 机器人适配器。

---
`

export * from './config'
export * from './types'

export interface HackChatLogger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  child: (suffix: string) => HackChatLogger
}

export function createHackChatLogger(ctx: Context, config: Config, scope = 'adapter-hackchat'): HackChatLogger {
  const prefix = `[${scope}]`
  const logger = ctx.logger
  const createChild = (childScope: string): HackChatLogger => createHackChatLogger(ctx, config, `${scope}:${childScope}`)

  return {
    debug(...args: unknown[]) {
      if (config.loggerinfo) {
        logger.info(prefix, ...args)
      }
    },
    info(...args: unknown[]) {
      if (config.loggerinfo) {
        logger.info(prefix, ...args)
      }
    },
    warn(...args: unknown[]) {
      logger.warn(prefix, ...args)
    },
    error(...args: unknown[]) {
      logger.error(prefix, ...args)
    },
    child: createChild,
  }
}

export function apply(ctx: Context, config: Config) {
  const logger = createHackChatLogger(ctx, config)
  new HackChatBot(ctx, config, logger)
}
