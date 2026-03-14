import { BotInfo, ChannelInfo, ChatData, MessageInfo } from './types'
import { Context } from 'koishi'
import { Config } from './config'
import { Utils } from './utils'
import { PluginLogger } from './logger'

import path from 'node:path'
import { promises as fs } from 'node:fs'

export class FileManager {
  private chatHistoryDir: string // 聊天记录根目录
  private metadataFilePath: string // 元数据文件路径（存储bots、channels、pinned等信息）
  private utils: Utils

  private memoryCache: ChatData = this.createEmptyChatData()

  private pendingMessages: Map<string, MessageInfo[]> = new Map() // 按channelKey分组的待写入消息

  private writeTimers: Map<string, (() => void)> = new Map() // 每个频道独立的写入定时器

  private metadataLoadPromise: Promise<void> | null = null

  private channelLoadPromises: Map<string, Promise<MessageInfo[]>> = new Map()

  private writeQueue: Promise<void> = Promise.resolve()

  private disposed = false

  private readonly WRITE_DEBOUNCE_MS = 1000

  constructor(
    private ctx: Context,
    private config: Config,
    private logger: PluginLogger
  ) {
    const baseDir = path.resolve(ctx.baseDir, 'data', 'chat-patch')
    this.chatHistoryDir = path.join(baseDir, 'chat-history')
    this.metadataFilePath = path.join(baseDir, 'metadata.json')
    this.utils = new Utils(config, ctx)

    // 异步清理旧版本的单文件存储，避免阻塞启动。
    this.ctx.setTimeout(() => {
      void this.cleanupOldDataFiles(baseDir)
    }, 0)
  }

  async initialize() {
    await this.ensureMetadataLoaded()
  }

  readChatDataFromFile(): ChatData {
    return this.memoryCache
  }

  getCachedChannelInfo(selfId: string, channelId: string): ChannelInfo | undefined {
    return this.memoryCache.channels[selfId]?.[channelId]
  }

  async readMetadataOnly(): Promise<Omit<ChatData, 'messages'>> {
    await this.ensureMetadataLoaded()
    const { messages, ...metadata } = this.memoryCache
    return { ...metadata }
  }

  async upsertBotInfo(botInfo: BotInfo) {
    await this.ensureMetadataLoaded()
    const current = this.memoryCache.bots[botInfo.selfId]
    if (current && this.isSameBotInfo(current, botInfo)) {
      return
    }

    this.memoryCache.bots[botInfo.selfId] = botInfo
    this.scheduleMetadataWrite()
  }

  async upsertChannelInfo(selfId: string, channelId: string, channelInfo: ChannelInfo) {
    await this.ensureMetadataLoaded()

    if (!this.memoryCache.channels[selfId]) {
      this.memoryCache.channels[selfId] = {}
    }

    const current = this.memoryCache.channels[selfId][channelId]
    if (current && this.isSameChannelInfo(current, channelInfo)) {
      return
    }

    this.memoryCache.channels[selfId][channelId] = channelInfo
    this.scheduleMetadataWrite()
  }

  async setPinnedBots(pinnedBots: string[]) {
    await this.ensureMetadataLoaded()
    this.memoryCache.pinnedBots = [...pinnedBots]
    this.scheduleMetadataWrite()
  }

  async setPinnedChannels(pinnedChannels: string[]) {
    await this.ensureMetadataLoaded()
    this.memoryCache.pinnedChannels = [...pinnedChannels]
    this.scheduleMetadataWrite()
  }

  // 清理旧版本的JSON文件
  private async cleanupOldDataFiles(baseDir: string) {
    const oldFiles = ['chat-data.json', 'data.json', 'messages.json']
    for (const fileName of oldFiles) {
      const filePath = path.join(baseDir, fileName)
      try {
        await fs.unlink(filePath)
        this.logger.logInfo(`已删除旧版本数据文件: ${fileName}`)
      } catch (error) {
        if (!this.isFileMissingError(error)) {
          this.logger.warn(`删除旧版本数据文件失败: ${fileName}`, error)
        }
      }
    }
  }

  // 确保目录存在
  private async ensureDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true })
  }

  // 获取频道消息文件路径
  private getChannelFilePath(selfId: string, channelId: string): string {
    return path.join(this.chatHistoryDir, selfId, `${channelId}.json`)
  }

  // 读取单个频道的消息（公共方法）
  async readChannelMessages(selfId: string, channelId: string): Promise<MessageInfo[]> {
    await this.ensureMetadataLoaded()

    const channelKey = `${selfId}:${channelId}`
    const cached = this.memoryCache.messages[channelKey]
    if (cached) {
      return cached
    }

    const existingPromise = this.channelLoadPromises.get(channelKey)
    if (existingPromise) {
      return existingPromise
    }

    const loadPromise = this.loadChannelMessages(selfId, channelId)
    this.channelLoadPromises.set(channelKey, loadPromise)

    try {
      return await loadPromise
    } finally {
      this.channelLoadPromises.delete(channelKey)
    }
  }

  // 写入单个频道的消息
  private async writeChannelMessages(selfId: string, channelId: string, messages: MessageInfo[]) {
    const filePath = this.getChannelFilePath(selfId, channelId)
    try {
      const jsonData = JSON.stringify(messages, null, 2)
      await this.ensureDir(path.dirname(filePath))
      await fs.writeFile(filePath, jsonData, 'utf8')
    } catch (error) {
      this.logger.error(`写入频道消息失败 [${selfId}:${channelId}]:`, error)
    }
  }

  // 读取元数据（bots、channels、pinned等）
  private async readMetadata(): Promise<Omit<ChatData, 'messages'>> {
    try {
      const jsonData = await fs.readFile(this.metadataFilePath, 'utf8')
      const data = JSON.parse(jsonData)
      return {
        bots: data.bots || {},
        channels: data.channels || {},
        pinnedBots: data.pinnedBots || [],
        pinnedChannels: data.pinnedChannels || [],
        lastSaveTime: data.lastSaveTime
      }
    } catch (error) {
      if (this.isFileMissingError(error)) {
        return {
          bots: {},
          channels: {},
          pinnedBots: [],
          pinnedChannels: []
        }
      }

      this.logger.error('读取元数据失败:', error)
      return {
        bots: {},
        channels: {},
        pinnedBots: [],
        pinnedChannels: []
      }
    }
  }

  // 写入元数据
  private async writeMetadata(metadata: Omit<ChatData, 'messages'>) {
    try {
      await this.ensureDir(path.dirname(this.metadataFilePath))
      const dataToWrite = {
        ...metadata,
        lastSaveTime: Date.now()
      }
      const jsonData = JSON.stringify(dataToWrite, null, 2)
      await fs.writeFile(this.metadataFilePath, jsonData, 'utf8')
    } catch (error) {
      this.logger.error('写入元数据失败:', error)
    }
  }

  // 扫描所有频道消息文件并加载到内存
  private async loadAllChannelMessages(): Promise<Record<string, MessageInfo[]>> {
    const messages: Record<string, MessageInfo[]> = {}

    try {
      const botDirs = await fs.readdir(this.chatHistoryDir, { withFileTypes: true })
      for (const botEntry of botDirs) {
        if (!botEntry.isDirectory()) continue

        const botId = botEntry.name
        const botDir = path.join(this.chatHistoryDir, botId)
        const channelFiles = await fs.readdir(botDir, { withFileTypes: true })

        for (const channelEntry of channelFiles) {
          if (!channelEntry.isFile() || !channelEntry.name.endsWith('.json')) continue

          const channelId = channelEntry.name.slice(0, -5)
          const channelKey = `${botId}:${channelId}`
          messages[channelKey] = await this.loadChannelMessages(botId, channelId)
        }
      }
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error('加载频道消息失败:', error)
      }
    }

    return messages
  }

  async loadAllChatData(): Promise<ChatData> {
    await this.ensureMetadataLoaded()
    this.memoryCache.messages = await this.loadAllChannelMessages()
    return this.memoryCache
  }

  writeChatDataToFile(data: ChatData) {
    data.lastSaveTime = Date.now()
    this.memoryCache = data
    this.enqueueWrite(async () => {
      await this.persistFullSnapshot()
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
      this.writeTimers.delete(channelKey)
      void this.flushPendingMessages(channelKey)
    }, this.WRITE_DEBOUNCE_MS)

    this.writeTimers.set(channelKey, timer)
  }

  // 刷新特定频道的待写入消息
  private async flushPendingMessages(channelKey: string) {
    const messagesToWrite = this.pendingMessages.get(channelKey)
    if (!messagesToWrite || messagesToWrite.length === 0) return

    this.pendingMessages.delete(channelKey)

    const data = this.memoryCache
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

      const cleanedMessageInfo = await this.utils.cleanBase64ContentAsync(messageInfo, false)
      data.messages[channelKey].push(cleanedMessageInfo)
    }

    // 限制消息数量
    if (data.messages[channelKey].length > this.config.maxMessagesPerChannel) {
      data.messages[channelKey].sort((a, b) => a.timestamp - b.timestamp)
      data.messages[channelKey] = data.messages[channelKey].slice(-this.config.maxMessagesPerChannel)
    }

    this.memoryCache = data

    // 串行写入，避免多个频道同时打满磁盘。
    this.enqueueWrite(async () => {
      await this.writeChannelMessages(selfId, channelId, data.messages[channelKey])
      this.logger.logInfo(`批量写入 ${messagesToWrite.length} 条消息到频道 ${channelKey}`)
    })
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
        this.logger.logInfo(`频道 ${channelKey} 清理了 ${messages.length - keptMessages.length} 条旧消息，保留最新 ${keptMessages.length} 条`)
      } else {
        cleanedMessages[channelKey] = messages
      }
    }

    if (cleanedCount > 0) {
      this.logger.logInfo('总共清理超量消息:', cleanedCount, '条')
    }

    return {
      ...data,
      messages: cleanedMessages
    }
  }

  async addMessageToFile(messageInfo: MessageInfo) {
    await this.ensureMetadataLoaded()
    const channelKey = `${messageInfo.selfId}:${messageInfo.channelId}`

    // 添加到待写入队列
    if (!this.pendingMessages.has(channelKey)) {
      this.pendingMessages.set(channelKey, [])
    }
    this.pendingMessages.get(channelKey)!.push(messageInfo)

    // 更新内存缓存
    const data = this.memoryCache

    if (!data.messages[channelKey]) {
      data.messages[channelKey] = await this.readChannelMessages(messageInfo.selfId, messageInfo.channelId)
    }

    const existingMessage = data.messages[channelKey].find(m => m.id === messageInfo.id)
    if (!existingMessage) {
      if (!messageInfo.timestamp) {
        messageInfo.timestamp = Date.now()
      }
      const cleanedMessageInfo = await this.utils.cleanBase64ContentAsync(messageInfo, false)
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

  async cleanupExcessMessagesInStorage() {
    let cleanedCount = 0

    await this.scanStoredChannelFiles(async (channelKey, filePath) => {
      const messages = await this.readChannelMessagesFromFile(filePath)
      if (messages.length <= this.config.maxMessagesPerChannel) {
        return
      }

      const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp)
      const keptMessages = sortedMessages.slice(-this.config.maxMessagesPerChannel)
      cleanedCount += messages.length - keptMessages.length

      const [selfId, channelId] = channelKey.split(':')
      if (!selfId || !channelId) {
        return
      }

      await this.writeChannelMessages(selfId, channelId, keptMessages)
      this.memoryCache.messages[channelKey] = keptMessages
      this.logger.logInfo(`频道 ${channelKey} 清理了 ${messages.length - keptMessages.length} 条旧消息，保留最新 ${keptMessages.length} 条`)
    })

    if (cleanedCount > 0) {
      this.logger.logInfo('定期清理完成，清理了', cleanedCount, '条超量消息')
    }
  }

  async getAllChannelMessageCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}

    await this.scanStoredChannelFiles(async (channelKey, filePath) => {
      counts[channelKey] = await this.countMessagesFromFile(filePath)
    })

    return counts
  }

  async readRawDataSnapshot(): Promise<ChatData> {
    const metadata = await this.readMetadataOnly()
    const messages: Record<string, MessageInfo[]> = {}

    await this.scanStoredChannelFiles(async (channelKey, filePath) => {
      messages[channelKey] = await this.readChannelMessagesFromFile(filePath)
    })

    return {
      ...metadata,
      messages
    }
  }

  async markLatestBotMessageAsSent(selfId: string, channelId: string, realId: string): Promise<MessageInfo | undefined> {
    const messages = await this.readChannelMessages(selfId, channelId)
    const matched = [...messages].reverse().find((message) => message.type === 'bot' && message.sending)

    if (!matched) {
      return undefined
    }

    matched.realId = realId
    matched.sending = false
    this.enqueueWrite(async () => {
      await this.writeChannelMessages(selfId, channelId, messages)
    })

    return matched
  }

  async dispose() {
    this.disposed = true

    // 取消所有定时器
    for (const [channelKey, timer] of this.writeTimers.entries()) {
      timer()
      await this.flushPendingMessages(channelKey)
    }
    this.writeTimers.clear()

    await this.writeQueue
    await this.utils.dispose()
  }

  private createEmptyChatData(): ChatData {
    return {
      bots: {},
      channels: {},
      messages: {},
      pinnedBots: [],
      pinnedChannels: []
    }
  }

  private async ensureMetadataLoaded() {
    if (!this.metadataLoadPromise) {
      this.metadataLoadPromise = this.loadMetadataIntoCache()
    }

    await this.metadataLoadPromise
  }

  private async loadMetadataIntoCache() {
    const metadata = await this.readMetadata()
    this.memoryCache = {
      ...metadata,
      messages: this.memoryCache.messages
    }
  }

  private async loadChannelMessages(selfId: string, channelId: string): Promise<MessageInfo[]> {
    const filePath = this.getChannelFilePath(selfId, channelId)

    try {
      const jsonData = await fs.readFile(filePath, 'utf8')
      const messages = JSON.parse(jsonData)
      const normalizedMessages = Array.isArray(messages) ? messages : []
      this.memoryCache.messages[`${selfId}:${channelId}`] = normalizedMessages
      return normalizedMessages
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error(`读取频道消息失败 [${selfId}:${channelId}]:`, error)
      }

      const emptyMessages: MessageInfo[] = []
      this.memoryCache.messages[`${selfId}:${channelId}`] = emptyMessages
      return emptyMessages
    }
  }

  private scheduleMetadataWrite() {
    this.enqueueWrite(async () => {
      const { messages, ...metadata } = this.memoryCache
      await this.writeMetadata(metadata)
    })
  }

  private enqueueWrite(task: () => Promise<void>) {
    if (this.disposed) {
      return
    }

    this.writeQueue = this.writeQueue
      .then(task)
      .catch((error) => {
        this.logger.error('写入任务失败:', error)
      })
  }

  private async persistFullSnapshot() {
    const snapshot = this.memoryCache
    const { messages, ...metadata } = snapshot
    await this.writeMetadata(metadata)

    const expectedKeys = new Set(Object.keys(messages))
    const existingFiles = await this.listStoredChannelFiles()

    for (const [channelKey, channelMessages] of Object.entries(messages)) {
      const [selfId, channelId] = channelKey.split(':')
      if (!selfId || !channelId) continue
      await this.writeChannelMessages(selfId, channelId, channelMessages)
    }

    for (const fileInfo of existingFiles) {
      if (expectedKeys.has(fileInfo.channelKey)) {
        continue
      }

      try {
        await fs.unlink(fileInfo.filePath)
      } catch (error) {
        if (!this.isFileMissingError(error)) {
          this.logger.warn(`删除频道消息文件失败 [${fileInfo.channelKey}]:`, error)
        }
      }
    }
  }

  private async listStoredChannelFiles(): Promise<Array<{ channelKey: string, filePath: string }>> {
    const result: Array<{ channelKey: string, filePath: string }> = []

    await this.scanStoredChannelFiles(async (channelKey, filePath) => {
      result.push({ channelKey, filePath })
    })

    return result
  }

  private async scanStoredChannelFiles(visitor: (channelKey: string, filePath: string) => Promise<void>) {
    try {
      const botDirs = await fs.readdir(this.chatHistoryDir, { withFileTypes: true })
      for (const botEntry of botDirs) {
        if (!botEntry.isDirectory()) continue

        const botDir = path.join(this.chatHistoryDir, botEntry.name)
        const channelFiles = await fs.readdir(botDir, { withFileTypes: true })

        for (const channelEntry of channelFiles) {
          if (!channelEntry.isFile() || !channelEntry.name.endsWith('.json')) continue

          const channelId = channelEntry.name.slice(0, -5)
          await visitor(`${botEntry.name}:${channelId}`, path.join(botDir, channelEntry.name))
        }
      }
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error('扫描频道文件失败:', error)
      }
    }
  }

  private async readChannelMessagesFromFile(filePath: string): Promise<MessageInfo[]> {
    try {
      const jsonData = await fs.readFile(filePath, 'utf8')
      const messages = JSON.parse(jsonData)
      return Array.isArray(messages) ? messages : []
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error(`读取频道消息文件失败 [${filePath}]:`, error)
      }
      return []
    }
  }

  private async countMessagesFromFile(filePath: string): Promise<number> {
    const messages = await this.readChannelMessagesFromFile(filePath)
    return messages.length
  }

  private isSameBotInfo(left: BotInfo, right: BotInfo) {
    return left.selfId === right.selfId
      && left.platform === right.platform
      && left.username === right.username
      && left.avatar === right.avatar
      && left.status === right.status
  }

  private isSameChannelInfo(left: ChannelInfo, right: ChannelInfo) {
    return left.id === right.id
      && left.name === right.name
      && left.type === right.type
      && left.channelId === right.channelId
      && left.guildName === right.guildName
      && left.isDirect === right.isDirect
  }

  private isFileMissingError(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'ENOENT'
  }
}
