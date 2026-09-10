import { Context, Logger } from 'koishi'
import { BilibiliApi } from './bilibili-api'
import { applyPointCommand } from './commands'
import { Config } from './config'
import { PluginLogger } from './logger'
import { registerLinkMiddleware } from './middleware'
import { VideoParseService } from './parser-service'
import { VideoRateLimiter } from './rate-limiter'

export const name = 'bilibili-videolink-analysis'

export const inject = {
  optional: ['puppeteer'],
}

export function apply(ctx: Context, config: Config) {
  const logger = new PluginLogger(new Logger('bilibili-videolink-analysis'), config.loggerinfo)
  const api = new BilibiliApi(ctx, config.userAgent, logger)
  const rateLimiter = new VideoRateLimiter(ctx, config)
  const service = new VideoParseService(ctx, config, api, logger, rateLimiter)

  ctx.on('dispose', () => {
    service.dispose()
  })

  if (config.enablebilianalysis) {
    registerLinkMiddleware(ctx, config, service, logger)
  }
  applyPointCommand(ctx, config, service)
}

export { Config }
