import { h } from 'koishi'
import type { Session } from 'koishi'
import type { Config } from './config'

const FORWARD_PLATFORMS = new Set([
  'onebot',
  'red',
  'napcat',
  'yunhu',
  'telegram',
  'discord',
])

// 按平台能力选择合并转发或逐条发送
export async function sendParsedMessages(
  session: Session,
  messages: h[][],
  config: Config,
  isDisposed: () => boolean,
): Promise<boolean> {
  if (isDisposed()) return false

  if (config.isfigure && FORWARD_PLATFORMS.has(session.platform)) {
    const figure = h('figure')
    const attrs = {
      userId: session.userId,
      nickname: session.author?.nickname || session.username,
    }
    for (const message of messages) {
      figure.children.push(h('message', attrs, message))
    }
    await session.send(figure)
    return true
  }

  for (const message of messages) {
    if (isDisposed()) return false
    await session.send(message)
  }
  return true
}
