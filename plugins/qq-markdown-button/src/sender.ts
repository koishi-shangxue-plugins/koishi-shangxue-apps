import { Session } from 'koishi'
import { PluginLogger } from './logger'
import { buildMenuMessage } from './template'
import { SendSequenceOptions } from './types'

interface SendableMessage {
  event_id?: string
  msg_id?: string
  msg_seq?: number
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSendableMessage(message: unknown): message is SendableMessage {
  return isRecord(message)
}

function withMessageSequence(message: unknown, sequence: number): unknown {
  if (!isSendableMessage(message)) {
    return message
  }

  // 主动发送多条消息时，递增 msg_seq 避免 QQ 去重。
  return {
    ...message,
    msg_seq: sequence,
  }
}

function getErrorCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined
  }

  const response = error.response
  if (!isRecord(response)) {
    return undefined
  }

  const data = response.data
  if (!isRecord(data)) {
    return undefined
  }

  if (typeof data.err_code === 'number') {
    return data.err_code
  }

  if (typeof data.code === 'number') {
    return data.code
  }

  return undefined
}

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
  let nextSequence = 1

  for (const [index, template] of config.send_sequence.entries()) {
    try {
      const message = buildMenuMessage(baseDir, template, session, config, interactionId, args)
      logger.debug(`第 ${index + 1} 步生成的消息内容：`, message)

      let preparedMessage = withMessageSequence(message, nextSequence)

      try {
        await sendMenuMessage(session, preparedMessage)
      } catch (error) {
        if (getErrorCode(error) !== 40054005) {
          throw error
        }

        nextSequence += 1
        preparedMessage = withMessageSequence(message, nextSequence)
        logger.debug(`第 ${index + 1} 步遇到去重，使用新的 msg_seq 重试：${nextSequence}`)
        await sendMenuMessage(session, preparedMessage)
      }

      nextSequence += 1
    } catch (error) {
      logger.error(`发送第 ${index + 1} 步 ${template} 模板时出错`, error)
    }
  }
}
