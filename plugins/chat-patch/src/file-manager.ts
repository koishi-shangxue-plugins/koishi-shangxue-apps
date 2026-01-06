import { ChatData, MessageInfo } from './types'
import { Context, Logger } from 'koishi'
import { Config } from './config'
import { Utils } from './utils'

import path from 'node:path'
import fs from 'node:fs'

export class FileManager {
  private dataFilePath: string
  private fileOperationLock = Promise.resolve()
  private logger: Logger
  private utils: Utils

  private memoryCache: ChatData | null = null

  private pendingMessages: MessageInfo[] = []

  private writeTimer: (() => void) | null = null

  private readonly WRITE_DEBOUNCE_MS = 1000

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.dataFilePath = path.resolve(ctx.baseDir, 'data', 'chat-patch', 'chat-data.json')
    this.logger = ctx.logger('chat-patch')
    this.utils = new Utils(config)

    this.memoryCache = this.readChatDataFromFile()
  }

  private ensureDataDir() {
    const dir = path.dirname(this.dataFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  readChatDataFromFile(): ChatData {

    if (this.memoryCache) {
      return this.memoryCache
    }

    process.nextTick(() => {
      try {
        if (fs.existsSync(this.dataFilePath)) {
          const jsonData = fs.readFileSync(this.dataFilePath, 'utf8')
          const data = JSON.parse(jsonData)
          this.memoryCache = {
            bots: data.bots || {},
            channels: data.channels || {},
            messages: data.messages || {},
            pinnedBots: data.pinnedBots || [],
            pinnedChannels: data.pinnedChannels || [],
            lastSaveTime: data.lastSaveTime
          }
        }
      } catch (error) {
        this.logger.error('读取聊天数据失败:', error)
      }
    })

    this.memoryCache = {
      bots: {},
      channels: {},
      messages: {},
      pinnedBots: [],
      pinnedChannels: []
    }
    return this.memoryCache
  }

  writeChatDataToFile(data: ChatData) {

    data.lastSaveTime = Date.now()
    this.memoryCache = data

    process.nextTick(() => {
      try {
        this.ensureDataDir()
        const jsonData = JSON.stringify(data, null, 2)
        fs.writeFileSync(this.dataFilePath, jsonData, 'utf8')
      } catch (error) {
        this.logger.error('写入聊天数据失败:', error)
      }
    })
  }

  private scheduleWrite() {

    if (this.writeTimer) {
      this.writeTimer()
      this.writeTimer = null
    }

    this.writeTimer = this.ctx.setTimeout(() => {

      process.nextTick(() => {
        this.flushPendingMessages()
      })
      this.writeTimer = null
    }, this.WRITE_DEBOUNCE_MS)
  }

  private flushPendingMessages() {
    if (this.pendingMessages.length === 0) return

    const messagesToWrite = [...this.pendingMessages]
    this.pendingMessages = []

    const data = this.memoryCache || this.readChatDataFromFile()

    for (const messageInfo of messagesToWrite) {
      const channelKey = `${messageInfo.selfId}:${messageInfo.channelId}`

      if (!data.messages[channelKey]) {
        data.messages[channelKey] = []
      }

      const existingMessage = data.messages[channelKey].find(m => m.id === messageInfo.id)
      if (existingMessage) {
        continue
      }

      if (!messageInfo.timestamp) {
        messageInfo.timestamp = Date.now()
      }

      const cleanedMessageInfo = this.utils.cleanBase64Content(messageInfo) as MessageInfo
      data.messages[channelKey].push(cleanedMessageInfo)

      if (data.messages[channelKey].length > this.config.maxMessagesPerChannel) {
        data.messages[channelKey].sort((a, b) => a.timestamp - b.timestamp)
        data.messages[channelKey] = data.messages[channelKey].slice(-this.config.maxMessagesPerChannel)
      }
    }

    this.writeChatDataToFile(data)
    this.logInfo(`批量写入 ${messagesToWrite.length} 条消息`)
  }

  cleanExcessMessages(data: ChatData): ChatData {
    let cleanedCount = 0
    const cleanedMessages: Record<string, MessageInfo[]> = {}

    for (const [channelKey, messages] of Object.entries(data.messages)) {
      if (messages.length > this.config.maxMessagesPerChannel) {
        const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp)
        const keptMessages = sortedMessages.slice(-this.config.maxMessagesPerChannel)
        cleanedCount += messages.length - keptMessages.length
        cleanedMessages[channelKey] = keptMessages
        this.logInfo(`频道 ${channelKey} 清理了 ${messages.length - keptMessages.length} 条旧消息，保留最新 ${keptMessages.length} 条`)
      } else {
        cleanedMessages[channelKey] = messages
      }
    }

    if (cleanedCount > 0) {
      this.logInfo('总共清理超量消息:', cleanedCount, '条')
    }

    return {
      ...data,
      messages: cleanedMessages
    }
  }

  async addMessageToFile(messageInfo: MessageInfo) {

    this.pendingMessages.push(messageInfo)

    const data = this.memoryCache || this.readChatDataFromFile()
    const channelKey = `${messageInfo.selfId}:${messageInfo.channelId}`

    if (!data.messages[channelKey]) {
      data.messages[channelKey] = []
    }

    const existingMessage = data.messages[channelKey].find(m => m.id === messageInfo.id)
    if (!existingMessage) {
      if (!messageInfo.timestamp) {
        messageInfo.timestamp = Date.now()
      }
      const cleanedMessageInfo = this.utils.cleanBase64Content(messageInfo) as MessageInfo
      data.messages[channelKey].push(cleanedMessageInfo)

      if (data.messages[channelKey].length > this.config.maxMessagesPerChannel) {
        data.messages[channelKey].sort((a, b) => a.timestamp - b.timestamp)
        data.messages[channelKey] = data.messages[channelKey].slice(-this.config.maxMessagesPerChannel)
      }

      this.memoryCache = data
    }

    this.scheduleWrite()
  }

  dispose() {
    if (this.writeTimer) {
      this.writeTimer()
      this.writeTimer = null
    }

    this.flushPendingMessages()
  }

  private logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      (this.logger.info as (...args: any[]) => void)(...args)
    }
  }
}
