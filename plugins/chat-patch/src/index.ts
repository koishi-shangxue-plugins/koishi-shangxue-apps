
import { Console } from '@koishijs/console'
import { Context, h } from 'koishi'
import path from 'node:path'

import { MessageHandler } from './message-handler'
import { FileManager } from './file-manager'
import { ApiHandlers } from './api-handlers'
import { Config } from './config'
import { createPluginLogger } from './logger'
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
  const pluginLogger = createPluginLogger(ctx.logger('chat-patch'), config)

  const fileManager = new FileManager(ctx, config, pluginLogger)
  await fileManager.initialize()

  const messageHandler = new MessageHandler(ctx, config, fileManager, pluginLogger)
  const apiHandlers = new ApiHandlers(ctx, config, fileManager, messageHandler, pluginLogger)
  const utils = new Utils(config, ctx)

  const metadata = await fileManager.readMetadataOnly()

  pluginLogger.logInfo('插件加载完成，元数据统计:', {
    机器人数量: Object.keys(metadata.bots).length,
    频道数量: Object.keys(metadata.channels).reduce((total, botId) =>
      total + Object.keys(metadata.channels[botId] || {}).length, 0),
    置顶机器人数量: metadata.pinnedBots.length,
    置顶频道数量: metadata.pinnedChannels.length
  })

  ctx.on('message', (session) => {
    if (utils.isPlatformBlocked(session.platform || 'unknown')) return

    messageHandler.recordUserMessage(session, Date.now())
  })

  ctx.on('before-send', (session) => {
    if (utils.isPlatformBlocked(session.platform || 'unknown')) return

    messageHandler.recordBotMessage(session, Date.now())
  })

  let cleanupDelayTimer: (() => void) | undefined
  let cleanupInterval: (() => void) | undefined

  ctx.on('ready', async () => {
    pluginLogger.logInfo('插件启动完成，开始监听消息')

    // 延后清理，避免和 Koishi 刚 ready 时的资源竞争。
    cleanupDelayTimer = ctx.setTimeout(() => {
      void fileManager.cleanupExcessMessagesInStorage()
    }, 15000)

    cleanupInterval = ctx.setInterval(() => {
      void fileManager.cleanupExcessMessagesInStorage()
    }, 300000)
  })

  apiHandlers.registerApiHandlers()

  ctx.console.addEntry({
    dev: path.resolve(__dirname, '../client/index.ts'),
    prod: path.resolve(__dirname, '../dist'),
  })

  ctx.on('dispose', () => {
    cleanupDelayTimer?.()
    cleanupInterval?.()
    messageHandler.dispose()
    void fileManager.dispose()
    pluginLogger.logInfo('插件已卸载，所有待处理的消息已写入')
  })
}
