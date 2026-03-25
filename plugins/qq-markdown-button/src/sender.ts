import { Session } from 'koishi'
import { PluginLogger } from './logger'
import { buildMenuMessage } from './template'
import { SendSequenceOptions } from './types'

async function sendMenuMessage(session: Session, message: unknown): Promise<void> {
  const guildId = session.event.guild?.id
  const userId = session.event.user?.id

  if (guildId) {
    if (session.qq) {
      await session.qq.sendMessage(session.channelId, message)
      return
    }

    if (session.qqguild) {
      await session.qqguild.sendMessage(session.channelId, message)
      return
    }
  }

  if (userId && session.qq) {
    await session.qq.sendPrivateMessage(userId, message)
    return
  }

  throw new Error('当前会话没有可用的发送目标。')
}

export async function sendMenuSequence(
  options: SendSequenceOptions,
  logger: PluginLogger,
): Promise<void> {
  const { baseDir, session, config, args, interactionId } = options

  for (const [index, step] of config.send_sequence.entries()) {
    try {
      const message = buildMenuMessage(baseDir, step.type, session, config, interactionId, args)
      logger.debug(`第 ${index + 1} 步生成的消息内容：`, message)
      await sendMenuMessage(session, message)
    } catch (error) {
      logger.error(`发送第 ${index + 1} 步 ${step.type} 模板时出错`, error)
    }
  }
}
