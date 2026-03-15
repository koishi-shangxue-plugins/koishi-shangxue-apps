import { BotInfo, ChannelInfo, ChatData, MessageInfo } from './types'
import { Context } from 'koishi'
import { Config } from './config'
import { Utils } from './utils'
import { PluginLogger } from './logger'

import path from 'node:path'
import { promises as fs } from 'node:fs'

interface ChannelChunkMeta {
  id: number
  fileName: string
  messageCount: number
}

interface ChannelIndexData {
  version: 1
  channelId: string
  totalMessages: number
  nextChunkId: number
  chunks: ChannelChunkMeta[]
}

interface StoredChannelEntry {
  selfId: string
  channelId: string
  channelKey: string
  channelDirPath: string
  indexFilePath: string
}

export class FileManager {
  private storageBaseDir: string
  private chatHistoryDir: string // 聊天记录根目录
  private metadataFilePath: string // 元数据文件路径（存储bots、channels、pinned等信息）
  private utils: Utils

  private memoryCache: ChatData = this.createEmptyChatData()

  private channelMessagesCache: Map<string, MessageInfo[]> = new Map()

  private recentMessageIdsCache: Map<string, string[]> = new Map()

  private pendingBotMessageIds: Map<string, string[]> = new Map()

  private messageChunkLocationCache: Map<string, Map<string, string>> = new Map()

  private dirtyChannelKeys: Set<string> = new Set()

  private pendingMessages: Map<string, MessageInfo[]> = new Map() // 按channelKey分组的待写入消息

  private writeTimers: Map<string, (() => void)> = new Map() // 每个频道独立的写入定时器

  private metadataLoadPromise: Promise<void> | null = null

  private channelLoadPromises: Map<string, Promise<MessageInfo[]>> = new Map()

  private writeQueue: Promise<void> = Promise.resolve()

  private disposed = false

  private readonly WRITE_DEBOUNCE_MS = 1000

  private readonly RECENT_MESSAGE_ID_CACHE_SIZE = 200

  constructor(
    private ctx: Context,
    private config: Config,
    private logger: PluginLogger
  ) {
    const baseDir = path.resolve(ctx.baseDir, 'data', 'chat-patch')
    this.storageBaseDir = path.join(baseDir, 'v2')
    this.chatHistoryDir = path.join(this.storageBaseDir, 'chat-history')
    this.metadataFilePath = path.join(this.storageBaseDir, 'metadata.json')
    this.utils = new Utils(config, ctx)

    // 异步清理旧版本数据，避免阻塞启动。
    this.ctx.setTimeout(() => {
      void this.cleanupLegacyStorage(baseDir)
    }, 0)
  }

  async initialize() {
    await this.ensureMetadataLoaded()
  }

  readChatDataFromFile(): ChatData {
    this.memoryCache.messages = this.getChannelMessagesCacheSnapshot()
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

  // 清理旧版本数据目录
  private async cleanupLegacyStorage(baseDir: string) {
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

    const legacyPaths = [
      path.join(baseDir, 'metadata.json'),
      path.join(baseDir, 'chat-history')
    ]

    for (const legacyPath of legacyPaths) {
      try {
        await fs.rm(legacyPath, { recursive: true, force: true })
        this.logger.logInfo(`已清理旧版数据路径: ${legacyPath}`)
      } catch (error) {
        this.logger.warn(`清理旧版数据路径失败: ${legacyPath}`, error)
      }
    }
  }

  // 确保目录存在
  private async ensureDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true })
  }

  // 读取单个频道的消息（公共方法）
  async readChannelMessages(selfId: string, channelId: string): Promise<MessageInfo[]> {
    await this.ensureMetadataLoaded()

    const channelKey = `${selfId}:${channelId}`
    const cached = this.getCachedChannelMessages(channelKey)
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

  async readChannelMessagesPage(selfId: string, channelId: string, limit: number, offset = 0): Promise<{ messages: MessageInfo[], total: number }> {
    await this.ensureMetadataLoaded()

    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)
    if (limit <= 0 || offset >= indexData.totalMessages) {
      return {
        messages: [],
        total: indexData.totalMessages
      }
    }

    const entry = this.createStoredChannelEntry(selfId, channelId)
    const collected: MessageInfo[] = []
    let skipped = 0

    for (let chunkIndex = indexData.chunks.length - 1; chunkIndex >= 0; chunkIndex -= 1) {
      const chunk = indexData.chunks[chunkIndex]
      const chunkMessages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)

      for (let messageIndex = chunkMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        if (skipped < offset) {
          skipped += 1
          continue
        }

        collected.push(chunkMessages[messageIndex])
        if (collected.length >= limit) {
          return {
            messages: collected.reverse(),
            total: indexData.totalMessages
          }
        }
      }
    }

    return {
      messages: collected.reverse(),
      total: indexData.totalMessages
    }
  }

  async findChannelMessageById(selfId: string, channelId: string, messageId: string): Promise<MessageInfo | null> {
    await this.ensureMetadataLoaded()

    const channelKey = `${selfId}:${channelId}`
    const cachedMessages = this.peekCachedChannelMessages(channelKey)
    const cachedMatched = cachedMessages?.find((message) => message.id === messageId)
    if (cachedMatched) {
      return cachedMatched
    }

    const entry = this.createStoredChannelEntry(selfId, channelId)
    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)
    for (let chunkIndex = indexData.chunks.length - 1; chunkIndex >= 0; chunkIndex -= 1) {
      const chunk = indexData.chunks[chunkIndex]
      const messages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)
      const matched = messages.find((message) => message.id === messageId)
      if (matched) {
        return matched
      }
    }

    return null
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
      await this.atomicWriteTextFile(this.metadataFilePath, jsonData)
    } catch (error) {
      this.logger.error('写入元数据失败:', error)
    }
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

    const cachedMessages = this.peekCachedChannelMessages(channelKey)
    const [selfId, channelId] = channelKey.split(':')

    if (!selfId || !channelId) return

    const uniqueMessages = this.deduplicateMessages(messagesToWrite)
    if (!uniqueMessages.length) {
      return
    }

    if (cachedMessages) {
      const nextMessages = this.mergeChannelMessages(cachedMessages, uniqueMessages)
      this.setCachedChannelMessages(channelKey, this.limitChannelMessages(nextMessages))
    }

    this.rememberRecentMessageIds(channelKey, uniqueMessages.map((message) => message.id))

    // 只向最后一个 chunk 追加，避免整频道重写。
    this.enqueueWrite(async () => {
      await this.appendMessagesToChannel(selfId, channelId, uniqueMessages)
      this.logger.logInfo(`批量写入 ${uniqueMessages.length} 条消息到频道 ${channelKey}`)
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

    if (!messageInfo.timestamp) {
      messageInfo.timestamp = Date.now()
    }

    const cleanedMessageInfo = await this.utils.cleanBase64ContentAsync(messageInfo, false)
    const pendingMessages = this.pendingMessages.get(channelKey) || []
    if (pendingMessages.some((message) => message.id === cleanedMessageInfo.id)) {
      return
    }

    const cachedMessages = this.peekCachedChannelMessages(channelKey)
    if (cachedMessages?.some((message) => message.id === cleanedMessageInfo.id)) {
      return
    }

    if (!cachedMessages) {
      if (this.hasRecentMessageId(channelKey, cleanedMessageInfo.id)) {
        return
      }

      const existsInStorage = await this.channelMessageExists(messageInfo.selfId, messageInfo.channelId, cleanedMessageInfo.id)
      if (existsInStorage) {
        return
      }
    }

    pendingMessages.push(cleanedMessageInfo)
    this.pendingMessages.set(channelKey, pendingMessages)
    this.rememberRecentMessageIds(channelKey, [cleanedMessageInfo.id])

    if (cleanedMessageInfo.type === 'bot' && cleanedMessageInfo.sending) {
      this.registerPendingBotMessage(channelKey, cleanedMessageInfo.id)
    }

    if (cachedMessages) {
      const nextMessages = this.mergeChannelMessages(cachedMessages, [cleanedMessageInfo])
      this.setCachedChannelMessages(channelKey, this.limitChannelMessages(nextMessages))
    }

    // 安排写入
    this.scheduleWrite(channelKey)
  }

  async cleanupExcessMessagesInStorage() {
    let cleanedCount = 0

    for (const channelKey of [...this.dirtyChannelKeys]) {
      const [selfId, channelId] = channelKey.split(':')
      if (!selfId || !channelId) {
        this.dirtyChannelKeys.delete(channelKey)
        continue
      }

      const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)
      if (indexData.totalMessages <= this.config.maxMessagesPerChannel) {
        this.dirtyChannelKeys.delete(channelKey)
        continue
      }

      const removedCount = await this.trimChannelToLimit(selfId, channelId, indexData, this.config.maxMessagesPerChannel)
      if (!removedCount) {
        continue
      }

      cleanedCount += removedCount
      if (this.peekCachedChannelMessages(channelKey)) {
        this.setCachedChannelMessages(channelKey, await this.loadChannelMessagesNoCache(selfId, channelId))
      }
      this.dirtyChannelKeys.delete(channelKey)
      this.logger.logInfo(`频道 ${channelKey} 清理了 ${removedCount} 条旧消息，保留最新 ${indexData.totalMessages} 条`)
    }

    if (cleanedCount > 0) {
      this.logger.logInfo('定期清理完成，清理了', cleanedCount, '条超量消息')
    }
  }

  async getAllChannelMessageCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}

    await this.scanStoredChannels(async (entry) => {
      counts[entry.channelKey] = await this.countChannelMessages(entry.selfId, entry.channelId)
    })

    return counts
  }

  async deleteChannelData(selfId: string, channelId: string) {
    await this.ensureMetadataLoaded()

    const channelKey = `${selfId}:${channelId}`
    const deletedMessages = await this.countChannelMessages(selfId, channelId)

    this.deleteCachedChannelMessages(channelKey)
    this.deleteRecentMessageIds(channelKey)
    this.deletePendingBotMessages(channelKey)
    this.deleteMessageChunkLocations(channelKey)
    this.dirtyChannelKeys.delete(channelKey)
    this.pendingMessages.delete(channelKey)

    const timer = this.writeTimers.get(channelKey)
    if (timer) {
      timer()
      this.writeTimers.delete(channelKey)
    }

    if (this.memoryCache.channels[selfId]?.[channelId]) {
      delete this.memoryCache.channels[selfId][channelId]
      if (!Object.keys(this.memoryCache.channels[selfId]).length) {
        delete this.memoryCache.channels[selfId]
      }
    }

    this.memoryCache.pinnedChannels = this.memoryCache.pinnedChannels.filter((item) => item !== channelKey)

    await this.removeChannelStorage(selfId, channelId)

    this.scheduleMetadataWrite()

    return { deletedMessages }
  }

  async deleteBotData(selfId: string) {
    await this.ensureMetadataLoaded()

    const botDir = path.join(this.chatHistoryDir, selfId)
    const channels = await this.listBotChannels(selfId)
    let deletedMessages = 0

    for (const entry of channels) {
      deletedMessages += await this.countChannelMessages(entry.selfId, entry.channelId)
      this.deleteCachedChannelMessages(entry.channelKey)
      this.deleteRecentMessageIds(entry.channelKey)
      this.deletePendingBotMessages(entry.channelKey)
      this.deleteMessageChunkLocations(entry.channelKey)
      this.dirtyChannelKeys.delete(entry.channelKey)
      this.pendingMessages.delete(entry.channelKey)

      const timer = this.writeTimers.get(entry.channelKey)
      if (timer) {
        timer()
        this.writeTimers.delete(entry.channelKey)
      }
    }

    const deletedChannels = channels.length

    delete this.memoryCache.bots[selfId]
    delete this.memoryCache.channels[selfId]
    this.memoryCache.pinnedBots = this.memoryCache.pinnedBots.filter((item) => item !== selfId)
    this.memoryCache.pinnedChannels = this.memoryCache.pinnedChannels.filter((item) => !item.startsWith(`${selfId}:`))

    try {
      await fs.rm(botDir, { recursive: true, force: true })
    } catch (error) {
      this.logger.error(`删除机器人目录失败 [${selfId}]:`, error)
    }

    this.scheduleMetadataWrite()

    return {
      deletedChannels,
      deletedMessages
    }
  }

  async updateUserProfileInBotData(selfId: string, userId: string, userName?: string, avatar?: string) {
    await this.ensureMetadataLoaded()

    let changed = false

    const botChannels = this.memoryCache.channels[selfId] || {}
    const possibleChannelIds = [
      userId,
      `private:${userId}`,
      `direct:${userId}`
    ]

    for (const channelId of possibleChannelIds) {
      const channel = botChannels[channelId]
      if (!channel || !channel.isDirect || !userName) {
        continue
      }

      const newName = `私聊（${userName}）`
      if (channel.name !== newName) {
        channel.name = newName
        changed = true
      }
    }

    const channels = await this.listBotChannels(selfId)
    for (const entry of channels) {
      const entryChanged = await this.updateUserProfileInChannel(entry.selfId, entry.channelId, userId, userName, avatar)
      if (!entryChanged) {
        continue
      }

      if (this.peekCachedChannelMessages(entry.channelKey)) {
        this.setCachedChannelMessages(entry.channelKey, await this.loadChannelMessagesNoCache(entry.selfId, entry.channelId))
      }
      changed = true
    }

    if (changed) {
      this.scheduleMetadataWrite()
    }

    return changed
  }

  async markLatestBotMessageAsSent(selfId: string, channelId: string, realId: string): Promise<MessageInfo | undefined> {
    const channelKey = `${selfId}:${channelId}`
    const tempMessageId = this.peekLatestPendingBotMessageId(channelKey)

    let matched: MessageInfo | undefined
    if (tempMessageId) {
      matched = await this.findAndUpdateBotMessageByTempId(selfId, channelId, tempMessageId, realId)
      this.consumePendingBotMessageId(channelKey, tempMessageId)
    }

    if (!matched) {
      matched = await this.findAndUpdateLatestBotMessage(selfId, channelId, realId)
    }

    if (!matched) {
      return undefined
    }

    const cachedMessages = this.peekCachedChannelMessages(channelKey)
    if (cachedMessages) {
      const cachedMatched = cachedMessages.find((message) => message.id === matched?.id)
      if (cachedMatched) {
        cachedMatched.realId = realId
        cachedMatched.sending = false
        this.setCachedChannelMessages(channelKey, cachedMessages)
      }
    }

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
      messages: this.getChannelMessagesCacheSnapshot()
    }
  }

  private async loadChannelMessages(selfId: string, channelId: string): Promise<MessageInfo[]> {
    const messages = await this.loadChannelMessagesNoCache(selfId, channelId)
    this.setCachedChannelMessages(`${selfId}:${channelId}`, messages)
    return messages
  }

  private async loadChannelMessagesNoCache(selfId: string, channelId: string): Promise<MessageInfo[]> {
    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)
    const channelDirPath = this.getChannelDirPath(selfId, channelId)
    const messages: MessageInfo[] = []
    const channelKey = `${selfId}:${channelId}`

    for (const chunk of indexData.chunks) {
      const chunkMessages = await this.readChunkMessages(channelDirPath, chunk.fileName)
      messages.push(...chunkMessages)
      this.rememberMessageChunkLocation(channelKey, chunk.fileName, chunkMessages.map((message) => message.id))
    }

    this.rememberRecentMessageIds(channelKey, messages.slice(-this.getRecentMessageIdCacheLimit()).map((message) => message.id))

    return messages
  }

  private scheduleMetadataWrite() {
    this.enqueueWrite(async () => {
      const { messages, ...metadata } = this.readChatDataFromFile()
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

  private async listStoredChannels(): Promise<StoredChannelEntry[]> {
    const result: StoredChannelEntry[] = []

    await this.scanStoredChannels(async (entry) => {
      result.push(entry)
    })

    return result
  }

  private async listBotChannels(selfId: string): Promise<StoredChannelEntry[]> {
    const result: StoredChannelEntry[] = []

    await this.scanStoredChannels(async (entry) => {
      if (entry.selfId === selfId) {
        result.push(entry)
      }
    }, selfId)

    return result
  }

  private async scanStoredChannels(visitor: (entry: StoredChannelEntry) => Promise<void>, botIdFilter?: string) {
    try {
      const botDirs = await fs.readdir(this.chatHistoryDir, { withFileTypes: true })
      for (const botEntry of botDirs) {
        const botName = this.normalizeDirentName(botEntry.name)
        if (!botEntry.isDirectory()) continue
        if (botIdFilter && botName !== botIdFilter) continue

        const botDir = path.join(this.chatHistoryDir, botName)
        const channelEntries = await fs.readdir(botDir, { withFileTypes: true })

        for (const channelEntry of channelEntries) {
          const channelId = await this.resolveStoredChannelId(botName, channelEntry)
          if (!channelId) {
            continue
          }

          await visitor(this.createStoredChannelEntry(botName, channelId))
        }
      }
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error('扫描频道文件失败:', error)
      }
    }
  }

  private createStoredChannelEntry(selfId: string, channelId: string): StoredChannelEntry {
    const channelDirPath = this.getChannelDirPath(selfId, channelId)
    return {
      selfId,
      channelId,
      channelKey: `${selfId}:${channelId}`,
      channelDirPath,
      indexFilePath: this.getChannelIndexPath(selfId, channelId)
    }
  }

  private async resolveStoredChannelId(selfId: string, entry: { isFile(): boolean, isDirectory(): boolean, name: string | Buffer }) {
    const entryName = this.normalizeDirentName(entry.name)

    if (!entry.isDirectory()) {
      return undefined
    }

    const encodedChannelId = entryName
    const channelDirPath = path.join(this.chatHistoryDir, selfId, encodedChannelId)
    const indexFilePath = path.join(channelDirPath, 'index.json')

    try {
      const jsonData = await fs.readFile(indexFilePath, 'utf8')
      const indexData = JSON.parse(jsonData) as Partial<ChannelIndexData>
      if (typeof indexData.channelId === 'string') {
        return indexData.channelId
      }
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error(`读取频道索引失败 [${selfId}:${entryName}]:`, error)
      }
    }

    return this.decodeChannelId(encodedChannelId)
  }

  private getBotDirPath(selfId: string) {
    return path.join(this.chatHistoryDir, selfId)
  }

  private getEncodedChannelId(channelId: string) {
    return encodeURIComponent(channelId)
  }

  private decodeChannelId(encodedChannelId: string) {
    try {
      return decodeURIComponent(encodedChannelId)
    } catch {
      return encodedChannelId
    }
  }

  private normalizeDirentName(name: string | Buffer) {
    return typeof name === 'string' ? name : name.toString('utf8')
  }

  private getChannelDirPath(selfId: string, channelId: string) {
    return path.join(this.getBotDirPath(selfId), this.getEncodedChannelId(channelId))
  }

  private getChannelIndexPath(selfId: string, channelId: string) {
    return path.join(this.getChannelDirPath(selfId, channelId), 'index.json')
  }

  private getChunkFilePath(channelDirPath: string, fileName: string) {
    return path.join(channelDirPath, fileName)
  }

  private createEmptyChannelIndex(channelId: string): ChannelIndexData {
    return {
      version: 1,
      channelId,
      totalMessages: 0,
      nextChunkId: 1,
      chunks: []
    }
  }

  private createChunkFileName(chunkId: number) {
    return `chunk-${String(chunkId).padStart(6, '0')}.json`
  }

  private async loadOrCreateChannelIndex(selfId: string, channelId: string): Promise<ChannelIndexData> {
    const entry = this.createStoredChannelEntry(selfId, channelId)

    try {
      const jsonData = await fs.readFile(entry.indexFilePath, 'utf8')
      const indexData = JSON.parse(jsonData) as ChannelIndexData
      const normalizedIndexData = this.normalizeChannelIndex(channelId, indexData)
      this.syncDirtyChannelState(entry.channelKey, normalizedIndexData.totalMessages)
      return normalizedIndexData
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error(`读取频道索引失败 [${entry.channelKey}]:`, error)
      }
    }

    const indexData = this.createEmptyChannelIndex(channelId)
    await this.ensureDir(entry.channelDirPath)

    await this.writeChannelIndex(entry.indexFilePath, indexData)
    this.syncDirtyChannelState(entry.channelKey, indexData.totalMessages)

    return indexData
  }

  private normalizeChannelIndex(channelId: string, indexData: ChannelIndexData): ChannelIndexData {
    return {
      version: 1,
      channelId,
      totalMessages: indexData.totalMessages || 0,
      nextChunkId: indexData.nextChunkId || (indexData.chunks?.length || 0) + 1,
      chunks: Array.isArray(indexData.chunks) ? indexData.chunks : []
    }
  }

  private async writeChannelIndex(indexFilePath: string, indexData: ChannelIndexData) {
    await this.ensureDir(path.dirname(indexFilePath))
    await this.atomicWriteTextFile(indexFilePath, JSON.stringify(indexData, null, 2))
  }

  private async readChunkMessages(channelDirPath: string, fileName: string): Promise<MessageInfo[]> {
    try {
      const jsonData = await fs.readFile(this.getChunkFilePath(channelDirPath, fileName), 'utf8')
      const messages = JSON.parse(jsonData)
      return Array.isArray(messages) ? messages : []
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error(`读取消息分块失败 [${channelDirPath}/${fileName}]:`, error)
      }
      return []
    }
  }

  private async writeChunkMessages(channelDirPath: string, fileName: string, messages: MessageInfo[]) {
    await this.ensureDir(channelDirPath)
    await this.atomicWriteTextFile(this.getChunkFilePath(channelDirPath, fileName), JSON.stringify(messages, null, 2))
  }

  private async writeMessagesToChunks(channelDirPath: string, indexData: ChannelIndexData, messages: MessageInfo[]) {
    const oldChunks = [...indexData.chunks]
    indexData.chunks = []
    indexData.totalMessages = 0
    indexData.nextChunkId = 1

    for (let offset = 0; offset < messages.length; offset += this.config.messageChunkSize) {
      const chunkMessages = messages.slice(offset, offset + this.config.messageChunkSize)
      const chunkId = indexData.nextChunkId
      const fileName = this.createChunkFileName(chunkId)
      await this.writeChunkMessages(channelDirPath, fileName, chunkMessages)
      indexData.chunks.push({ id: chunkId, fileName, messageCount: chunkMessages.length })
      indexData.nextChunkId += 1
      indexData.totalMessages += chunkMessages.length
    }

    for (const chunk of oldChunks) {
      try {
        await fs.unlink(this.getChunkFilePath(channelDirPath, chunk.fileName))
      } catch (error) {
        if (!this.isFileMissingError(error)) {
          this.logger.warn(`删除旧消息分块失败 [${channelDirPath}/${chunk.fileName}]:`, error)
        }
      }
    }

    await this.writeChannelIndex(path.join(channelDirPath, 'index.json'), indexData)
  }

  private async appendMessagesToChannel(selfId: string, channelId: string, messages: MessageInfo[]) {
    if (!messages.length) {
      return
    }

    const entry = this.createStoredChannelEntry(selfId, channelId)
    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)
    await this.ensureDir(entry.channelDirPath)

    let remainingMessages = [...messages]
    const lastChunk = indexData.chunks[indexData.chunks.length - 1]

    if (lastChunk && lastChunk.messageCount < this.config.messageChunkSize) {
      const chunkMessages = await this.readChunkMessages(entry.channelDirPath, lastChunk.fileName)
      const writableCount = this.config.messageChunkSize - chunkMessages.length
      const appendMessages = remainingMessages.slice(0, writableCount)
      if (appendMessages.length) {
        chunkMessages.push(...appendMessages)
        lastChunk.messageCount = chunkMessages.length
        indexData.totalMessages += appendMessages.length
        remainingMessages = remainingMessages.slice(appendMessages.length)
        await this.writeChunkMessages(entry.channelDirPath, lastChunk.fileName, chunkMessages)
        this.rememberMessageChunkLocation(entry.channelKey, lastChunk.fileName, appendMessages.map((message) => message.id))
      }
    }

    while (remainingMessages.length) {
      const chunkMessages = remainingMessages.slice(0, this.config.messageChunkSize)
      const chunkId = indexData.nextChunkId
      const fileName = this.createChunkFileName(chunkId)
      await this.writeChunkMessages(entry.channelDirPath, fileName, chunkMessages)
      indexData.chunks.push({ id: chunkId, fileName, messageCount: chunkMessages.length })
      indexData.nextChunkId += 1
      indexData.totalMessages += chunkMessages.length
      this.rememberMessageChunkLocation(entry.channelKey, fileName, chunkMessages.map((message) => message.id))
      remainingMessages = remainingMessages.slice(chunkMessages.length)
    }

    this.syncDirtyChannelState(entry.channelKey, indexData.totalMessages)
    await this.writeChannelIndex(entry.indexFilePath, indexData)
  }

  private async trimChannelToLimit(selfId: string, channelId: string, indexData: ChannelIndexData, limit: number) {
    const entry = this.createStoredChannelEntry(selfId, channelId)
    let overflow = indexData.totalMessages - limit
    if (overflow <= 0) {
      return 0
    }

    let removedCount = 0

    while (overflow > 0 && indexData.chunks.length) {
      const chunk = indexData.chunks[0]
      if (chunk.messageCount <= overflow) {
        const removedChunkMessages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)
        overflow -= chunk.messageCount
        removedCount += chunk.messageCount
        indexData.totalMessages -= chunk.messageCount
        indexData.chunks.shift()
        this.forgetRecentMessageIds(entry.channelKey, removedChunkMessages.map((message) => message.id))
        this.forgetMessageChunkLocation(entry.channelKey, removedChunkMessages.map((message) => message.id))
        try {
          await fs.unlink(this.getChunkFilePath(entry.channelDirPath, chunk.fileName))
        } catch (error) {
          if (!this.isFileMissingError(error)) {
            this.logger.warn(`删除消息分块失败 [${entry.channelKey}:${chunk.fileName}]:`, error)
          }
        }
        continue
      }

      const chunkMessages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)
      const keptMessages = chunkMessages.slice(overflow)
      const removedMessages = chunkMessages.slice(0, overflow)
      removedCount += overflow
      indexData.totalMessages -= overflow
      chunk.messageCount = keptMessages.length
      overflow = 0
      this.forgetRecentMessageIds(entry.channelKey, removedMessages.map((message) => message.id))
      this.forgetMessageChunkLocation(entry.channelKey, removedMessages.map((message) => message.id))
      await this.writeChunkMessages(entry.channelDirPath, chunk.fileName, keptMessages)
    }

    this.syncDirtyChannelState(entry.channelKey, indexData.totalMessages)
    await this.writeChannelIndex(entry.indexFilePath, indexData)
    return removedCount
  }

  private async countChannelMessages(selfId: string, channelId: string) {
    const entry = this.createStoredChannelEntry(selfId, channelId)

    try {
      const jsonData = await fs.readFile(entry.indexFilePath, 'utf8')
      const indexData = JSON.parse(jsonData) as Partial<ChannelIndexData>
      if (typeof indexData.totalMessages === 'number') {
        return indexData.totalMessages
      }
    } catch (error) {
      if (!this.isFileMissingError(error)) {
        this.logger.error(`读取频道索引失败 [${entry.channelKey}]:`, error)
      }
    }

    return 0
  }

  private async removeChannelStorage(selfId: string, channelId: string) {
    const entry = this.createStoredChannelEntry(selfId, channelId)

    try {
      await fs.rm(entry.channelDirPath, { recursive: true, force: true })
    } catch (error) {
      this.logger.error(`删除频道目录失败 [${entry.channelKey}]:`, error)
    }
  }

  private async updateUserProfileInChannel(selfId: string, channelId: string, userId: string, userName?: string, avatar?: string) {
    const entry = this.createStoredChannelEntry(selfId, channelId)
    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)
    let changed = false

    for (const chunk of indexData.chunks) {
      const messages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)
      let chunkChanged = false

      for (const message of messages) {
        if (message.userId !== userId) {
          continue
        }

        if (userName && message.username !== userName) {
          message.username = userName
          chunkChanged = true
        }

        if (avatar && message.avatar !== avatar) {
          message.avatar = avatar
          chunkChanged = true
        }
      }

      if (!chunkChanged) {
        continue
      }

      await this.writeChunkMessages(entry.channelDirPath, chunk.fileName, messages)
      changed = true
    }

    return changed
  }

  private async findAndUpdateLatestBotMessage(selfId: string, channelId: string, realId: string): Promise<MessageInfo | undefined> {
    const entry = this.createStoredChannelEntry(selfId, channelId)
    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)

    for (let index = indexData.chunks.length - 1; index >= 0; index -= 1) {
      const chunk = indexData.chunks[index]
      const messages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)
      const matched = [...messages].reverse().find((message) => message.type === 'bot' && message.sending)
      if (!matched) {
        continue
      }

      matched.realId = realId
      matched.sending = false
      await this.writeChunkMessages(entry.channelDirPath, chunk.fileName, messages)
      return matched
    }

    return undefined
  }

  private async findAndUpdateBotMessageByTempId(selfId: string, channelId: string, tempMessageId: string, realId: string): Promise<MessageInfo | undefined> {
    const channelKey = `${selfId}:${channelId}`
    const pendingMessages = this.pendingMessages.get(channelKey)
    const pendingMatched = pendingMessages?.find((message) => message.id === tempMessageId)
    if (pendingMatched) {
      pendingMatched.realId = realId
      pendingMatched.sending = false
      return pendingMatched
    }

    const cachedMessages = this.peekCachedChannelMessages(channelKey)
    const cachedMatched = cachedMessages?.find((message) => message.id === tempMessageId)
    if (cachedMatched) {
      cachedMatched.realId = realId
      cachedMatched.sending = false
      this.setCachedChannelMessages(channelKey, cachedMessages)
    }

    const entry = this.createStoredChannelEntry(selfId, channelId)
    const chunkFileName = this.getMessageChunkLocation(channelKey, tempMessageId)
    if (chunkFileName) {
      const chunkMessages = await this.readChunkMessages(entry.channelDirPath, chunkFileName)
      const matched = chunkMessages.find((message) => message.id === tempMessageId)
      if (matched) {
        matched.realId = realId
        matched.sending = false
        await this.writeChunkMessages(entry.channelDirPath, chunkFileName, chunkMessages)
        return matched
      }
    }

    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)
    for (let index = indexData.chunks.length - 1; index >= 0; index -= 1) {
      const chunk = indexData.chunks[index]
      const chunkMessages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)
      const matched = chunkMessages.find((message) => message.id === tempMessageId)
      if (!matched) {
        continue
      }

      matched.realId = realId
      matched.sending = false
      await this.writeChunkMessages(entry.channelDirPath, chunk.fileName, chunkMessages)
      this.rememberMessageChunkLocation(channelKey, chunk.fileName, [matched.id])
      return matched
    }

    return cachedMatched
  }

  private deduplicateMessages(messages: MessageInfo[]) {
    const seen = new Set<string>()
    const deduplicated: MessageInfo[] = []

    for (const message of messages) {
      if (seen.has(message.id)) {
        continue
      }
      seen.add(message.id)
      deduplicated.push(message)
    }

    return deduplicated
  }

  private getCachedChannelMessages(channelKey: string) {
    const cached = this.channelMessagesCache.get(channelKey)
    if (!cached) {
      return undefined
    }

    this.channelMessagesCache.delete(channelKey)
    this.channelMessagesCache.set(channelKey, cached)
    this.memoryCache.messages = this.getChannelMessagesCacheSnapshot()
    return cached
  }

  private peekCachedChannelMessages(channelKey: string) {
    return this.channelMessagesCache.get(channelKey)
  }

  private setCachedChannelMessages(channelKey: string, messages: MessageInfo[]) {
    this.channelMessagesCache.delete(channelKey)
    this.channelMessagesCache.set(channelKey, messages)
    this.rememberRecentMessageIds(channelKey, messages.slice(-this.getRecentMessageIdCacheLimit()).map((message) => message.id))

    while (this.channelMessagesCache.size > this.config.channelCacheLimit) {
      const oldestKey = this.channelMessagesCache.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      this.channelMessagesCache.delete(oldestKey)
      this.deleteRecentMessageIds(oldestKey)
      this.deleteMessageChunkLocations(oldestKey)
    }

    this.memoryCache.messages = this.getChannelMessagesCacheSnapshot()
  }

  private deleteCachedChannelMessages(channelKey: string) {
    this.channelMessagesCache.delete(channelKey)
    delete this.memoryCache.messages[channelKey]
  }

  private getChannelMessagesCacheSnapshot() {
    return Object.fromEntries(this.channelMessagesCache.entries())
  }

  private mergeChannelMessages(baseMessages: MessageInfo[], appendedMessages: MessageInfo[]) {
    const merged = [...baseMessages]
    const knownIds = new Set(baseMessages.map((message) => message.id))

    for (const message of appendedMessages) {
      if (knownIds.has(message.id)) {
        continue
      }
      knownIds.add(message.id)
      merged.push(message)
    }

    return merged
  }

  private limitChannelMessages(messages: MessageInfo[]) {
    if (messages.length <= this.config.maxMessagesPerChannel) {
      return messages
    }

    return [...messages]
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-this.config.maxMessagesPerChannel)
  }

  private async channelMessageExists(selfId: string, channelId: string, messageId: string) {
    const entry = this.createStoredChannelEntry(selfId, channelId)
    const channelKey = entry.channelKey

    if (this.hasRecentMessageId(channelKey, messageId)) {
      return true
    }

    const indexData = await this.loadOrCreateChannelIndex(selfId, channelId)

    for (let chunkIndex = indexData.chunks.length - 1; chunkIndex >= 0; chunkIndex -= 1) {
      const chunk = indexData.chunks[chunkIndex]
      const messages = await this.readChunkMessages(entry.channelDirPath, chunk.fileName)
      if (messages.some((message) => message.id === messageId)) {
        this.rememberRecentMessageIds(channelKey, [messageId])
        return true
      }
    }

    return false
  }

  private syncDirtyChannelState(channelKey: string, totalMessages: number) {
    if (totalMessages > this.config.maxMessagesPerChannel) {
      this.dirtyChannelKeys.add(channelKey)
      return
    }

    this.dirtyChannelKeys.delete(channelKey)
  }

  private registerPendingBotMessage(channelKey: string, messageId: string) {
    const messageIds = this.pendingBotMessageIds.get(channelKey) || []
    messageIds.push(messageId)
    this.pendingBotMessageIds.set(channelKey, messageIds)
  }

  private peekLatestPendingBotMessageId(channelKey: string) {
    const messageIds = this.pendingBotMessageIds.get(channelKey)
    return messageIds?.[messageIds.length - 1]
  }

  private consumePendingBotMessageId(channelKey: string, messageId: string) {
    const messageIds = this.pendingBotMessageIds.get(channelKey)
    if (!messageIds?.length) {
      return
    }

    const nextMessageIds = messageIds.filter((id) => id !== messageId)
    if (nextMessageIds.length) {
      this.pendingBotMessageIds.set(channelKey, nextMessageIds)
      return
    }

    this.pendingBotMessageIds.delete(channelKey)
  }

  private deletePendingBotMessages(channelKey: string) {
    this.pendingBotMessageIds.delete(channelKey)
  }

  private getRecentMessageIdCacheLimit() {
    return Math.max(this.RECENT_MESSAGE_ID_CACHE_SIZE, this.config.messageChunkSize * 2)
  }

  private rememberRecentMessageIds(channelKey: string, messageIds: string[]) {
    if (!messageIds.length) {
      return
    }

    const nextMessageIds = [...(this.recentMessageIdsCache.get(channelKey) || [])]
    for (const messageId of messageIds) {
      const existingIndex = nextMessageIds.indexOf(messageId)
      if (existingIndex !== -1) {
        nextMessageIds.splice(existingIndex, 1)
      }
      nextMessageIds.push(messageId)
    }

    const maxSize = this.getRecentMessageIdCacheLimit()
    this.recentMessageIdsCache.set(channelKey, nextMessageIds.slice(-maxSize))
  }

  private forgetRecentMessageIds(channelKey: string, messageIds: string[]) {
    const currentMessageIds = this.recentMessageIdsCache.get(channelKey)
    if (!currentMessageIds?.length || !messageIds.length) {
      return
    }

    const nextMessageIds = currentMessageIds.filter((messageId) => !messageIds.includes(messageId))
    if (nextMessageIds.length) {
      this.recentMessageIdsCache.set(channelKey, nextMessageIds)
      return
    }

    this.recentMessageIdsCache.delete(channelKey)
  }

  private hasRecentMessageId(channelKey: string, messageId: string) {
    const currentMessageIds = this.recentMessageIdsCache.get(channelKey)
    return !!currentMessageIds?.includes(messageId)
  }

  private deleteRecentMessageIds(channelKey: string) {
    this.recentMessageIdsCache.delete(channelKey)
  }

  private rememberMessageChunkLocation(channelKey: string, chunkFileName: string, messageIds: string[]) {
    if (!messageIds.length) {
      return
    }

    const currentLocations = this.messageChunkLocationCache.get(channelKey) || new Map<string, string>()
    for (const messageId of messageIds) {
      currentLocations.set(messageId, chunkFileName)
    }
    this.messageChunkLocationCache.set(channelKey, currentLocations)
  }

  private forgetMessageChunkLocation(channelKey: string, messageIds: string[]) {
    const currentLocations = this.messageChunkLocationCache.get(channelKey)
    if (!currentLocations || !messageIds.length) {
      return
    }

    for (const messageId of messageIds) {
      currentLocations.delete(messageId)
    }

    if (!currentLocations.size) {
      this.messageChunkLocationCache.delete(channelKey)
    }
  }

  private getMessageChunkLocation(channelKey: string, messageId: string) {
    return this.messageChunkLocationCache.get(channelKey)?.get(messageId)
  }

  private deleteMessageChunkLocations(channelKey: string) {
    this.messageChunkLocationCache.delete(channelKey)
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

  private async atomicWriteTextFile(filePath: string, content: string) {
    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`

    await fs.writeFile(tempFilePath, content, 'utf8'
    )

    try {
      await fs.rename(tempFilePath, filePath)
    } catch (error) {
      if (this.isAtomicRenameReplaceError(error)) {
        await fs.rm(filePath, { force: true })
        await fs.rename(tempFilePath, filePath)
        return
      }

      try {
        await fs.rm(tempFilePath, { force: true })
      } catch {
        // 忽略临时文件清理失败，保留原始错误即可。
      }

      throw error
    }
  }

  private isAtomicRenameReplaceError(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error.code === 'EEXIST' || error.code === 'EPERM')
  }
}
