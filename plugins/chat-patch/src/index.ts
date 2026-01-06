
import { Console } from '@koishijs/console'
import { Context, h } from 'koishi'
import path from 'node:path'

import { MessageHandler } from './message-handler'
import { FileManager } from './file-manager'
import { ApiHandlers } from './api-handlers'
import { Config } from './config'
import { Utils } from './utils'

export const name = 'chat-patch'
export const reusable = false
export const filter = true
export const inject = {
  required: ['console']
}

declare module 'koishi' {
  interface Context {
    console: Console
  }
}

export const usage = `

---

开启后，即可在koishi控制台操作机器人收发消息啦

暂时只支持接受图文消息 / 发送文字消息

---
`

export { Config } from './config'

export async function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('chat-patch')

  const mediaDir = path.join(ctx.baseDir, 'data', 'chat-patch', 'persist-media', 'media')
  if (require('node:fs').existsSync(mediaDir)) {
    try {
      const files = require('node:fs').readdirSync(mediaDir)
      let deletedCount = 0
      for (const file of files) {
        const filePath = path.join(mediaDir, file)
        try {
          require('node:fs').unlinkSync(filePath)
          deletedCount++
        } catch (e) {
          logger.warn('删除媒体文件失败:', filePath, e)
        }
      }
      if (deletedCount > 0) {
        logger.info(`启动时清理了 ${deletedCount} 个旧版本的媒体缓存文件`)
      }
    } catch (e) {
      logger.warn('清理媒体文件夹失败:', e)
    }
  }

  const fileManager = new FileManager(ctx, config)
  const messageHandler = new MessageHandler(ctx, config, fileManager)
  const apiHandlers = new ApiHandlers(ctx, config, fileManager, messageHandler)
  const utils = new Utils(config, ctx)

  const initialData = fileManager.readChatDataFromFile()
  const cleanedData = fileManager.cleanExcessMessages(initialData)

  const originalCount = Object.values(initialData.messages).reduce((total, msgs) => total + msgs.length, 0)
  const cleanedCount = Object.values(cleanedData.messages).reduce((total, msgs) => total + msgs.length, 0)

  if (originalCount !== cleanedCount) {
    fileManager.writeChatDataToFile(cleanedData)
  }

  function logInfo(...args: any[]) {
    if (config.loggerinfo) {
      (logger.info as (...args: any[]) => void)(...args)
    }
  }

  logInfo('插件加载完成，数据统计:', {
    机器人数量: Object.keys(cleanedData.bots).length,
    频道数量: Object.keys(cleanedData.channels).reduce((total, botId) =>
      total + Object.keys(cleanedData.channels[botId] || {}).length, 0),
    消息频道数: Object.keys(cleanedData.messages).length,
    总消息数: Object.values(cleanedData.messages).reduce((total, msgs) => total + msgs.length, 0)
  })

  ctx.on('message', (session) => {
    if (utils.isPlatformBlocked(session.platform || 'unknown')) return

    const timestamp = Date.now()

    ctx.console.broadcast('chat-message-event', {
      type: 'message',
      selfId: session.selfId,
      platform: session.platform || 'unknown',
      channelId: session.channelId,
      messageId: session.event?.message?.id || `msg-${timestamp}`,
      content: session.content || '',
      userId: session.userId || 'unknown',
      username: session.username || session.userId || 'unknown',
      avatar: session.event?.user?.avatar,
      timestamp: timestamp,
      isDirect: session.isDirect,
      bot: {
        avatar: session.bot.user?.avatar,
        name: session.bot.user?.name,
      }
    })

    messageHandler.recordUserMessage(session, timestamp)
  })

  ctx.on('before-send', (session) => {
    if (utils.isPlatformBlocked(session.platform || 'unknown')) return

    const timestamp = Date.now()

    ctx.console.broadcast('chat-bot-message-event', {
      type: 'bot-message',
      selfId: session.selfId,
      platform: session.platform || 'unknown',
      channelId: session.channelId,
      messageId: `bot-msg-${timestamp}`,
      content: session.content || '',
      userId: session.selfId,
      username: session.bot.user?.name || `Bot-${session.selfId}`,
      avatar: session.bot.user?.avatar,
      timestamp: timestamp,
      sending: true,
      bot: {
        avatar: session.bot.user?.avatar,
        name: session.bot.user?.name,
      }
    })

    messageHandler.recordBotMessage(session, timestamp)
  })

  ctx.on('ready', async () => {
    logInfo('插件启动完成，开始监听消息')

    ctx.setInterval(() => {
      const data = fileManager.readChatDataFromFile()
      const cleanedData = fileManager.cleanExcessMessages(data)

      const originalCount = Object.values(data.messages).reduce((total, msgs) => total + msgs.length, 0)
      const cleanedCount = Object.values(cleanedData.messages).reduce((total, msgs) => total + msgs.length, 0)

      if (originalCount !== cleanedCount) {
        fileManager.writeChatDataToFile(cleanedData)
        logInfo('定期清理完成，清理了', originalCount - cleanedCount, '条超量消息')
      }
    }, 300000)
  })

  apiHandlers.registerApiHandlers()

  ctx.console.addEntry({
    dev: path.resolve(__dirname, '../client/index.ts'),
    prod: path.resolve(__dirname, '../dist'),
  })

  ctx.on('dispose', () => {

    fileManager.dispose()
    logInfo('插件已卸载，所有待处理的消息已写入')
  })
}
