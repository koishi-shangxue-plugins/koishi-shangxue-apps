
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

  // 启动时清空 media 文件夹（为旧版本做清理工作）
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

  // 初始化各个模块
  const fileManager = new FileManager(ctx, config)
  const messageHandler = new MessageHandler(ctx, config, fileManager)
  const apiHandlers = new ApiHandlers(ctx, config, fileManager, messageHandler)
  const utils = new Utils(config, ctx)

  // 初始化数据
  const initialData = fileManager.readChatDataFromFile()
  const cleanedData = fileManager.cleanExcessMessages(initialData)

  // 如果清理了数据，立即写回文件
  const originalCount = Object.values(initialData.messages).reduce((total, msgs) => total + msgs.length, 0)
  const cleanedCount = Object.values(cleanedData.messages).reduce((total, msgs) => total + msgs.length, 0)

  if (originalCount !== cleanedCount) {
    fileManager.writeChatDataToFile(cleanedData)
  }

  // 日志调试函数
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

  // 监听用户消息
  ctx.on('message', async (session) => {
    // 检查平台是否被屏蔽
    if (utils.isPlatformBlocked(session.platform || 'unknown')) {
      logInfo(`忽略来自被屏蔽平台的消息: ${session.platform}`)
      return
    }
    // logInfo(session)
    // 广播消息事件给前端处理
    await messageHandler.broadcastMessageEvent(session)
  })

  // 监听机器人发送的消息
  ctx.on('before-send', async (session) => {
    // 检查平台是否被屏蔽
    if (utils.isPlatformBlocked(session.platform || 'unknown')) {
      logInfo(`忽略来自被屏蔽平台的机器人消息: ${session.platform}`)
      return
    }
    // 广播机器人消息事件给前端处理
    await messageHandler.broadcastBotMessageEvent(session)
  })

  // 插件启动时设置定期清理过期消息
  ctx.on('ready', async () => {
    logInfo('插件启动完成，开始监听消息')

    // 定期清理超量消息
    setInterval(() => {
      const data = fileManager.readChatDataFromFile()
      const cleanedData = fileManager.cleanExcessMessages(data)

      // 如果有消息被清理，写回文件
      const originalCount = Object.values(data.messages).reduce((total, msgs) => total + msgs.length, 0)
      const cleanedCount = Object.values(cleanedData.messages).reduce((total, msgs) => total + msgs.length, 0)

      if (originalCount !== cleanedCount) {
        fileManager.writeChatDataToFile(cleanedData)
        logInfo('定期清理完成，清理了', originalCount - cleanedCount, '条超量消息')
      }
    }, 300000) // 每5分钟清理一次
  })

  // 注册所有 API 处理器
  apiHandlers.registerApiHandlers()

  // 注册控制台页面
  ctx.console.addEntry({
    dev: path.resolve(__dirname, '../client/index.ts'),
    prod: path.resolve(__dirname, '../dist'),
  })
}
