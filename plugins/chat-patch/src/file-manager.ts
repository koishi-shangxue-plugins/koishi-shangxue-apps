import { ChatData, MessageInfo } from './types'
import { Context, Logger } from 'koishi'
import { Config } from './config'
import { Utils } from './utils'

import path from 'node:path'
import fs from 'node:fs'

export class FileManager {
  private chatHistoryDir: string // 聊天记录根目录
  private metadataFilePath: string // 元数据文件路径（存储bots、channels、pinned等信息）
  private logger: Logger
  private utils: Utils

  private memoryCache: ChatData | null = null

  private pendingMessages: Map<string, MessageInfo[]> = new Map() // 按channelKey分组的待写入消息

  private writeTimers: Map<string, (() => void)> = new Map() // 每个频道独立的写入定时器

  private readonly WRITE_DEBOUNCE_MS = 1000

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    const baseDir = path.resolve(ctx.baseDir, 'data', 'chat-patch')
    this.chatHistoryDir = path.join(baseDir, 'chat-history')
    this.metadataFilePath = path.join(baseDir, 'metadata.json')
    this.logger = ctx.logger('chat-patch')
    this.utils = new Utils(config)

    // 清理旧版本的单文件存储
    this.cleanupOldDataFiles(baseDir)

    this.memoryCache = this.readChatDataFromFile()
  }

  // 清理旧版本的JSON文件
  private cleanupOldDataFiles(baseDir: string) {
    const oldFiles = ['chat-data.json', 'data.json', 'messages.json']
    for (const fileName of oldFiles) {
      const filePath = path.join(baseDir, fileName)
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath)
          this.logger.info(`已删除旧版本数据文件: ${fileName}`)
        } catch (error) {
          this.logger.warn(`删除旧版本数据文件失败: ${fileName}`, error)
        }
      }
    }
  }

  // 确保目录存在
  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  // 获取频道消息文件路径
  private getChannelFilePath(selfId: string, channelId: string): string {
    const botDir = path.join(this.chatHistoryDir, selfId)
    this.ensureDir(botDir)
    return path.join(botDir, `${channelId}.json`)
  }

  // 读取单个频道的消息（公共方法）
  readChannelMessages(selfId: string, channelId: string): MessageInfo[] {
    const filePath = this.getChannelFilePath(selfId, channelId)
    if (!fs.existsSync(filePath)) {
      return []
    }

    try {
      const jsonData = fs.readFileSync(filePath, 'utf8')
      const messages = JSON.parse(jsonData)
      return Array.isArray(messages) ? messages : []
    } catch (error) {
      this.logger.error(`读取频道消息失败 [${selfId}:${channelId}]:`, error)
      return []
    }
  }

  // 写入单个频道的消息
  private writeChannelMessages(selfId: string, channelId: string, messages: MessageInfo[]) {
    const filePath = this.getChannelFilePath(selfId, channelId)
    try {
      const jsonData = JSON.stringify(messages, null, 2)
      fs.writeFileSync(filePath, jsonData, 'utf8')
    } catch (error) {
      this.logger.error(`写入频道消息失败 [${selfId}:${channelId}]:`, error)
    }
  }

  // 读取元数据（bots、channels、pinned等）
  private readMetadata(): Omit<ChatData, 'messages'> {
    if (!fs.existsSync(this.metadataFilePath)) {
      return {
        bots: {},
        channels: {},
        pinnedBots: [],
        pinnedChannels: []
      }
    }

    try {
      const jsonData = fs.readFileSync(this.metadataFilePath, 'utf8')
      const data = JSON.parse(jsonData)
      return {
        bots: data.bots || {},
        channels: data.channels || {},
        pinnedBots: data.pinnedBots || [],
        pinnedChannels: data.pinnedChannels || [],
        lastSaveTime: data.lastSaveTime
      }
    } catch (error) {
      this.logger.error('读取元数据失败:', error)
      return {
        bots: {},
        channels: {},
        pinnedBots: [],
        pinnedChannels: []
      }
    }
  }

  // 只读取元数据，不加载消息（公共方法）
  readMetadataOnly(): Omit<ChatData, 'messages'> {
    return this.readMetadata()
  }

  // 写入元数据
  private writeMetadata(metadata: Omit<ChatData, 'messages'>) {
    try {
      this.ensureDir(path.dirname(this.metadataFilePath))
      const dataToWrite = {
        ...metadata,
        lastSaveTime: Date.now()
      }
      const jsonData = JSON.stringify(dataToWrite, null, 2)
      fs.writeFileSync(this.metadataFilePath, jsonData, 'utf8')
    } catch (error) {
      this.logger.error('写入元数据失败:', error)
    }
  }

  // 扫描所有频道消息文件并加载到内存
  private loadAllChannelMessages(): Record<string, MessageInfo[]> {
    const messages: Record<string, MessageInfo[]> = {}

    if (!fs.existsSync(this.chatHistoryDir)) {
      return messages
    }

    try {
      const botDirs = fs.readdirSync(this.chatHistoryDir)
      for (const botId of botDirs) {
        const botDir = path.join(this.chatHistoryDir, botId)
        const stat = fs.statSync(botDir)
        if (!stat.isDirectory()) continue

        const channelFiles = fs.readdirSync(botDir)
        for (const fileName of channelFiles) {
          if (!fileName.endsWith('.json')) continue

          const channelId = fileName.replace('.json', '')
          const channelKey = `${botId}:${channelId}`
          messages[channelKey] = this.readChannelMessages(botId, channelId)
        }
      }
    } catch (error) {
      this.logger.error('加载频道消息失败:', error)
    }

    return messages
  }

  readChatDataFromFile(): ChatData {
    // 如果已有缓存，直接返回
    if (this.memoryCache) {
      return this.memoryCache
    }

    // 异步加载数据
    process.nextTick(() => {
      try {
        const metadata = this.readMetadata()
        const messages = this.loadAllChannelMessages()
        this.memoryCache = {
          ...metadata,
          messages
        }
      } catch (error) {
        this.logger.error('读取聊天数据失败:', error)
      }
    })

    // 先返回空数据
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
        // 写入元数据
        const { messages, ...metadata } = data
        this.writeMetadata(metadata)

        // 写入各个频道的消息
        for (const [channelKey, channelMessages] of Object.entries(messages)) {
          const [selfId, channelId] = channelKey.split(':')
          if (selfId && channelId) {
            this.writeChannelMessages(selfId, channelId, channelMessages)
          }
        }
      } catch (error) {
        this.logger.error('写入聊天数据失败:', error)
      }
    })
  }

  // 为特定频道安排写入
  private scheduleWrite(channelKey: string) {
    // 取消之前的定时器
    const existingTimer = this.writeTimers.get(channelKey)
    if (existingTimer) {
      existingTimer()
    }

    // 创建新的定时器
    const timer = this.ctx.setTimeout(() => {
      process.nextTick(() => {
        this.flushPendingMessages(channelKey)
      })
      this.writeTimers.delete(channelKey)
    }, this.WRITE_DEBOUNCE_MS)

    this.writeTimers.set(channelKey, timer)
  }

  // 刷新特定频道的待写入消息
  private flushPendingMessages(channelKey: string) {
    const messagesToWrite = this.pendingMessages.get(channelKey)
    if (!messagesToWrite || messagesToWrite.length === 0) return

    this.pendingMessages.delete(channelKey)

    const data = this.memoryCache || this.readChatDataFromFile()
    const [selfId, channelId] = channelKey.split(':')

    if (!selfId || !channelId) return

    if (!data.messages[channelKey]) {
      data.messages[channelKey] = []
    }

    for (const messageInfo of messagesToWrite) {
      const existingMessage = data.messages[channelKey].find(m => m.id === messageInfo.id)
      if (existingMessage) {
        continue
      }

      if (!messageInfo.timestamp) {
        messageInfo.timestamp = Date.now()
      }

      const cleanedMessageInfo = this.utils.cleanBase64Content(messageInfo) as MessageInfo
      data.messages[channelKey].push(cleanedMessageInfo)
    }

    // 限制消息数量
    if (data.messages[channelKey].length > this.config.maxMessagesPerChannel) {
      data.messages[channelKey].sort((a, b) => a.timestamp - b.timestamp)
      data.messages[channelKey] = data.messages[channelKey].slice(-this.config.maxMessagesPerChannel)
    }

    // 只写入这个频道的消息文件
    this.writeChannelMessages(selfId, channelId, data.messages[channelKey])
    this.memoryCache = data

    this.logInfo(`批量写入 ${messagesToWrite.length} 条消息到频道 ${channelKey}`)
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
    const channelKey = `${messageInfo.selfId}:${messageInfo.channelId}`

    // 添加到待写入队列
    if (!this.pendingMessages.has(channelKey)) {
      this.pendingMessages.set(channelKey, [])
    }
    this.pendingMessages.get(channelKey)!.push(messageInfo)

    // 更新内存缓存
    const data = this.memoryCache || this.readChatDataFromFile()

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

    // 安排写入
    this.scheduleWrite(channelKey)
  }

  dispose() {
    // 取消所有定时器
    for (const [channelKey, timer] of this.writeTimers.entries()) {
      timer()
      this.flushPendingMessages(channelKey)
    }
    this.writeTimers.clear()
  }

  private logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      (this.logger.info as (...args: any[]) => void)(...args)
    }
  }
}
