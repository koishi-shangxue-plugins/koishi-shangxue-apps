import type { Context, Session } from 'koishi'
import { h } from 'koishi'
import type { Config } from './config'
import type { PluginLogger } from './logger'
import { collectJsonCardText, parseBilibiliContent } from './link-parser'
import type { VideoParseService } from './parser-service'

function isJsonCard(session: Session): boolean {
  if (session.elements.some((element) => element.type === 'json')) return true
  const content = session.stripped.content.trimStart()
  return content.startsWith('<json') || content.startsWith('<xml')
}

export function registerLinkMiddleware(
  ctx: Context,
  config: Config,
  service: VideoParseService,
  logger: PluginLogger,
) {
  ctx.middleware(async (session, next) => {
    const isCard = isJsonCard(session)
    if (isCard && !config.videoParseMode.includes('card')) return next()
    if (!isCard && !config.videoParseMode.includes('link')) return next()

    const content = session.stripped.content
    const elements = session.elements.length > 0
      ? session.elements
      : h.parse(content)
    const cardText = collectJsonCardText(elements)
    // 独立 BV / AV 号始终允许解析
    const targets = parseBilibiliContent(`${content}\n${cardText}`, true)
    if (targets.length === 0) return next()

    const limited = targets.slice(0, config.parseLimit)
    // 按消息来源决定使用链接模板还是卡片模板
    const reason = await service.enqueue(session, content, limited, isCard ? 'card' : 'link')
    if (reason) {
      logger.debug(`频率限制：${reason}`)
    }
    return next()
  }, config.middleware)
}
