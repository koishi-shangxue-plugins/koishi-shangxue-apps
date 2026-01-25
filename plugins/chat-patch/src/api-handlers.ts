import { FileManager } from './file-manager'
import { MessageHandler } from './message-handler'
import { Context, h, Logger, Universal } from 'koishi'
import { Config } from './config'
import { } from '@koishijs/plugin-console'
import { URL, pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import * as mime from 'mime-types'

export class ApiHandlers {
  private logger: Logger

  private currentTempVideo: string | null = null

  constructor(
    private ctx: Context,
    private config: Config,
    private fileManager: FileManager,
    private messageHandler: MessageHandler
  ) {
    this.logger = ctx.logger('chat-patch')
  }

  registerApiHandlers() {
    this.ctx.console.addListener('clear-all-indexeddb-data' as any, async () => {
      try {
        this.logInfo('收到清空 IndexedDB 数据请求')

        return { success: true, message: '可以清空 IndexedDB' }
      } catch (error: any) {
        this.logger.error('清空 IndexedDB 数据失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('get-chat-data' as any, async () => {
      try {
        // 只读取元数据，不加载消息到内存
        const data = this.fileManager.readMetadataOnly()

        this.logInfo('获取基础聊天数据（仅元数据）')

        return {
          success: true,
          data: {
            bots: data.bots || {},
            channels: data.channels || {},
            pinnedBots: data.pinnedBots || [],
            pinnedChannels: data.pinnedChannels || [],
            // 不返回消息数据，由前端按需加载
            messages: {}
          }
        }
      } catch (error: any) {
        this.logger.error('获取聊天数据失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('get-history-messages' as any, async (requestData: {
      selfId: string
      channelId: string
      limit?: number
      offset?: number
    }) => {
      try {
        // 直接从文件读取该频道的消息，不加载所有消息到内存
        let messages = this.fileManager.readChannelMessages(requestData.selfId, requestData.channelId)

        const sortedMessages = messages.sort((a, b) => b.timestamp - a.timestamp)

        if (requestData.limit !== undefined) {
          const limit = requestData.limit
          const offset = requestData.offset || 0
          messages = sortedMessages.slice(offset, offset + limit)

          messages = messages.sort((a, b) => a.timestamp - b.timestamp)
        } else {
          // 如果没有指定limit，返回所有消息（按时间正序）
          messages = sortedMessages.sort((a, b) => a.timestamp - b.timestamp)
        }

        this.logInfo('获取历史消息:', `${requestData.selfId}:${requestData.channelId}`, '共', messages.length, '条消息')

        return {
          success: true,
          messages: messages,
          total: sortedMessages.length
        }
      } catch (error: any) {
        this.logger.error('获取历史消息失败:', error)
        return { success: false, error: error?.message || String(error), messages: [], total: 0 }
      }
    })

    this.ctx.console.addListener('get-all-channel-message-counts' as any, async () => {
      try {
        const data = this.fileManager.readChatDataFromFile()
        const counts: Record<string, number> = {}

        for (const [channelKey, messages] of Object.entries(data.messages)) {
          counts[channelKey] = messages.length
        }

        this.logInfo('获取所有频道消息数量:', {
          频道数: Object.keys(counts).length,
          总消息数: Object.values(counts).reduce((total, count) => total + count, 0)
        })

        return {
          success: true,
          counts: counts
        }
      } catch (error: any) {
        this.logger.error('获取频道消息数量失败:', error)
        return { success: false, error: error?.message || String(error), counts: {} }
      }
    })

    this.ctx.console.addListener('fetch-image' as any, async (data: { url: string }) => {
      try {
        // 如果已经是 Vite @fs 路径，直接返回
        if (data.url.includes('/vite/@fs/')) {
          return {
            success: true,
            viteUrl: data.url
          }
        }

        // 如果是本地文件 URL，转换为 Vite @fs 路径
        if (this.isFileUrl(data.url)) {
          this.logInfo('处理本地文件请求:', data.url)
          const filePath = require('node:url').fileURLToPath(data.url)
          const normalizedPath = filePath.replace(/\\/g, '/')
          return {
            success: true,
            viteUrl: `/vite/@fs/${normalizedPath}`
          }
        }

        // 网络图片：下载并缓存到本地，返回 Vite @fs 路径
        const dir = require('node:path').join(this.ctx.baseDir, 'data', 'chat-patch', 'persist-media', 'images')
        if (!require('node:fs').existsSync(dir)) {
          require('node:fs').mkdirSync(dir, { recursive: true })
        }

        const crypto = require('node:crypto')
        const hash = crypto.createHash('md5').update(data.url).digest('hex')
        const ext = require('node:path').extname(new URL(data.url).pathname) || '.jpg'
        const filename = `${hash}${ext}`
        const filePath = require('node:path').join(dir, filename)

        // 如果文件不存在，下载并保存
        if (!require('node:fs').existsSync(filePath)) {
          const response = await fetch(data.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': ''
            }
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const buffer = await response.arrayBuffer()
          require('node:fs').writeFileSync(filePath, Buffer.from(buffer))
        }

        // 返回 Vite @fs 路径
        const normalizedPath = filePath.replace(/\\/g, '/')
        return {
          success: true,
          viteUrl: `/vite/@fs/${normalizedPath}`
        }
      } catch (error: any) {
        this.logger.error('获取图片失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('clear-channel-history' as any, async (data: {
      selfId: string
      channelId: string
      keepCount?: number
    }) => {
      try {
        this.logInfo('收到清理历史记录请求:', data)

        const chatData = this.fileManager.readChatDataFromFile()
        const channelKey = `${data.selfId}:${data.channelId}`

        if (!chatData.messages[channelKey]) {
          return { success: true, message: '频道没有历史消息' }
        }

        const messages = chatData.messages[channelKey]
        const originalCount = messages.length

        const keepCount = data.keepCount || this.config.keepMessagesOnClear

        if (keepCount > 0 && originalCount <= keepCount) {
          return { success: true, message: `消息数量(${originalCount})未超过保留数量(${keepCount})，无需清理` }
        }

        const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp)
        const keptMessages = keepCount > 0 ? sortedMessages.slice(-keepCount) : []
        const clearedCount = originalCount - keptMessages.length

        chatData.messages[channelKey] = keptMessages
        this.fileManager.writeChatDataToFile(chatData)

        this.logInfo(`频道 ${channelKey} 历史记录清理完成:`, {
          原始消息数: originalCount,
          保留消息数: keptMessages.length,
          清理消息数: clearedCount
        })

        return {
          success: true,
          message: `成功清理 ${clearedCount} 条历史消息，保留最新 ${keptMessages.length} 条`,
          clearedCount: clearedCount,
          keptCount: keptMessages.length
        }
      } catch (error: any) {
        this.logger.error('清理频道历史记录失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('send-message' as any, async (data: {
      selfId: string
      channelId: string
      content: string
      images?: Array<{
        tempId: string
        filename: string
      }>
    }) => {
      try {
        this.logInfo('收到发送消息请求:', data)

        const bot = this.ctx.bots.find((bot: any) => bot.selfId === data.selfId || bot.user?.id === data.selfId)
        if (!bot) {
          this.logger.error('未找到机器人:', data.selfId, '当前可用机器人:', this.ctx.bots.map((b: any) => b.selfId))
          return { success: false, error: `未找到机器人 ${data.selfId}，请检查机器人是否在线` }
        }

        if (bot.status !== Universal.Status.ONLINE) {
          this.logger.error('机器人离线:', data.selfId, '状态:', bot.status)
          return { success: false, error: `机器人 ${data.selfId} 当前离线` }
        }

        let messageContent = data.content

        if (data.images && data.images.length > 0) {
          const tempDir = this.ctx.baseDir + '/data/chat-patch/temp'

          for (const image of data.images) {
            const files = require('fs').readdirSync(tempDir).filter((file: string) =>
              file.includes(`temp_${image.tempId}`)
            )

            if (files.length > 0) {
              const imagePath = `${tempDir}/${files[0]}`

              const fileUrl = this.createFileUrl(imagePath)
              messageContent += h.image(fileUrl).toString()
              this.logInfo('添加图片到消息:', { imagePath, fileUrl })
            }
          }
        }

        const parsedContent = h.parse(messageContent)

        this.messageHandler.setCorrectChannelId(data.selfId, data.channelId)

        const result = await bot.sendMessage(data.channelId, parsedContent)
        this.logInfo('消息发送成功:', result)

        const messageId = Array.isArray(result) ? result[0] : result;

        if (messageId) {
          const chatData = this.fileManager.readChatDataFromFile()
          const channelKey = `${data.selfId}:${data.channelId}`
          const messages = chatData.messages[channelKey] || []

          const msg = [...messages].reverse().find(m => m.type === 'bot' && m.sending)
          if (msg) {
            msg.realId = messageId;
            msg.sending = false;
            this.fileManager.writeChatDataToFile(chatData)

            this.ctx.console.broadcast('bot-message-updated', {
              channelKey,
              tempId: msg.id,
              realId: messageId
            })
          }
        }

        return {
          success: !!messageId,
          messageId: messageId,
          tempImageIds: data.images?.map(img => img.tempId) || []
        }
      } catch (error: any) {
        this.logger.error('发送消息失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('cleanup-temp-images' as any, async (data: {
      tempImageIds: string[]
    }) => {
      try {
        this.logInfo('收到清理临时图片请求:', data.tempImageIds)

        this.logInfo('临时图片将由定时任务清理，保持文件可用性')

        return { success: true, cleanedCount: 0 }
      } catch (error: any) {
        this.logger.error('清理临时图片失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('delete-bot-data' as any, async (data: {
      selfId: string
    }) => {
      try {
        this.logInfo('收到删除机器人数据请求:', data)

        const chatData = this.fileManager.readChatDataFromFile()
        let deletedChannels = 0
        let deletedMessages = 0

        if (chatData.channels[data.selfId]) {
          deletedChannels = Object.keys(chatData.channels[data.selfId]).length
          delete chatData.channels[data.selfId]
        }

        const channelsToDelete = Object.keys(chatData.messages).filter(key => key.startsWith(`${data.selfId}:`))
        for (const channelKey of channelsToDelete) {
          deletedMessages += chatData.messages[channelKey].length
          delete chatData.messages[channelKey]
        }

        delete chatData.bots[data.selfId]
        this.fileManager.writeChatDataToFile(chatData)

        this.logInfo(`机器人 ${data.selfId} 数据删除完成:`, {
          删除频道数: deletedChannels,
          删除消息数: deletedMessages
        })

        return {
          success: true,
          message: `成功删除机器人数据：${deletedChannels} 个频道，${deletedMessages} 条消息`,
          deletedChannels,
          deletedMessages
        }
      } catch (error: any) {
        this.logger.error('删除机器人数据失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('delete-channel-data' as any, async (data: {
      selfId: string
      channelId: string
    }) => {
      try {
        this.logInfo('收到删除频道数据请求:', data)

        const chatData = this.fileManager.readChatDataFromFile()
        const channelKey = `${data.selfId}:${data.channelId}`
        let deletedMessages = 0

        if (chatData.messages[channelKey]) {
          deletedMessages = chatData.messages[channelKey].length
          delete chatData.messages[channelKey]
        }

        if (chatData.channels[data.selfId] && chatData.channels[data.selfId][data.channelId]) {
          delete chatData.channels[data.selfId][data.channelId]
        }

        this.fileManager.writeChatDataToFile(chatData)

        this.logInfo(`频道 ${channelKey} 数据删除完成:`, {
          删除消息数: deletedMessages
        })

        return {
          success: true,
          message: `成功删除频道数据：${deletedMessages} 条消息`,
          deletedMessages
        }
      } catch (error: any) {
        this.logger.error('删除频道数据失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('set-pinned-bots' as any, async (data: {
      pinnedBots: string[]
    }) => {
      try {
        this.logInfo('收到设置置顶机器人请求:', data.pinnedBots)
        const chatData = this.fileManager.readChatDataFromFile()
        chatData.pinnedBots = data.pinnedBots
        this.fileManager.writeChatDataToFile(chatData)
        return { success: true }
      } catch (error: any) {
        this.logger.error('设置置顶机器人失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('set-pinned-channels' as any, async (data: {
      pinnedChannels: string[]
    }) => {
      try {
        this.logInfo('收到设置置顶频道请求:', data.pinnedChannels)
        const chatData = this.fileManager.readChatDataFromFile()
        chatData.pinnedChannels = data.pinnedChannels
        this.fileManager.writeChatDataToFile(chatData)
        return { success: true }
      } catch (error: any) {
        this.logger.error('设置置顶频道失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('upload-image' as any, async (data: {
      file: string
      filename: string
      mimeType: string
      isGif?: boolean
    }) => {
      try {
        this.logInfo('收到图片上传请求:', { filename: data.filename, mimeType: data.mimeType, isGif: data.isGif })

        const base64Data = data.file.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        const tempId = Date.now() + '_' + Math.random().toString(36).substring(2, 11)
        const extension = data.filename.split('.').pop()?.toLowerCase() || (data.isGif ? 'gif' : 'jpg')
        const tempFilename = `temp_${tempId}.${extension}`

        const tempDir = this.ctx.baseDir + '/data/chat-patch/temp'
        if (!require('fs').existsSync(tempDir)) {
          require('fs').mkdirSync(tempDir, { recursive: true })
        }

        const tempPath = `${tempDir}/${tempFilename}`

        require('fs').writeFileSync(tempPath, buffer)

        this.logInfo('图片上传成功:', { tempPath, size: buffer.length, isGif: data.isGif })

        return {
          success: true,
          tempId: tempId,
          tempPath: tempPath,
          filename: data.filename,
          size: buffer.length,
          isGif: data.isGif
        }
      } catch (error: any) {
        this.logger.error('图片上传失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('delete-temp-image' as any, async (data: {
      tempId: string
    }) => {
      try {
        const tempDir = this.ctx.baseDir + '/data/chat-patch/temp'
        const files = require('fs').readdirSync(tempDir).filter((file: string) =>
          file.includes(`temp_${data.tempId}`)
        )

        for (const file of files) {
          const filePath = `${tempDir}/${file}`
          if (require('fs').existsSync(filePath)) {
            require('fs').unlinkSync(filePath)
            this.logInfo('删除临时图片:', filePath)
          }
        }

        return { success: true }
      } catch (error: any) {
        this.logger.error('删除临时图片失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.setupTempFileCleanup()

    this.ctx.console.addListener('get-plugin-config' as any, async () => {
      try {
        return {
          success: true,
          config: {
            maxMessagesPerChannel: this.config.maxMessagesPerChannel,
            keepMessagesOnClear: this.config.keepMessagesOnClear,
            maxPersistImages: this.config.maxPersistImages,
            loggerinfo: this.config.loggerinfo,
            blockedPlatforms: this.config.blockedPlatforms || [],
            clearIndexedDBOnStart: this.config.clearIndexedDBOnStart
          }
        }
      } catch (error: any) {
        this.logger.error('获取插件配置失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('get-user-info' as any, async (data: { selfId: string, userId: string, guildId?: string }) => {
      try {
        const bot = this.ctx.bots.find(b => b.selfId === data.selfId)
        if (!bot) return { success: false, error: '机器人不存在' }

        if (!bot.getUser || typeof bot.getUser !== 'function') {
          return { success: false, error: '此平台不支持查看用户信息' }
        }

        const user = await bot.getUser(data.userId, data.guildId)

        if (user) {

          if (user.avatar) {
            user.avatar = await this.messageHandler.downloadAndCacheMedia(user.avatar, 'avatar')
          }

          const chatData = this.fileManager.readChatDataFromFile()
          let changed = false

          const botChannels = chatData.channels[data.selfId] || {}

          const possibleChannelIds = [
            data.userId,
            `private:${data.userId}`,
            `direct:${data.userId}`
          ]

          for (const channelId of possibleChannelIds) {
            const channel = botChannels[channelId]
            if (channel && channel.isDirect) {
              const newName = `私聊（${user.name}）`
              if (channel.name !== newName) {
                channel.name = newName
                changed = true
                this.logInfo('更新私聊频道名称:', { channelId, oldName: channel.name, newName })
              }
            }
          }

          const channelKeyPrefix = `${data.selfId}:`
          for (const [key, messages] of Object.entries(chatData.messages)) {
            if (key.startsWith(channelKeyPrefix)) {
              messages.forEach(msg => {
                if (msg.userId === data.userId) {
                  if (user.name && msg.username !== user.name) {
                    msg.username = user.name
                    changed = true
                  }
                  if (user.avatar && msg.avatar !== user.avatar) {
                    msg.avatar = user.avatar
                    changed = true
                  }
                }
              });
            }
          }

          if (changed) {
            this.fileManager.writeChatDataToFile(chatData)

            this.ctx.console.broadcast('chat-data-updated', {})
          }
        }

        return { success: true, data: user }
      } catch (error: any) {
        return { success: false, error: error?.message || '获取用户信息失败' }
      }
    })

    this.ctx.console.addListener('debug-get-raw-data' as any, async () => {
      try {
        const data = this.fileManager.readChatDataFromFile()
        return {
          success: true,
          data: data
        }
      } catch (error: any) {
        this.logger.error('获取原始数据失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    this.ctx.console.addListener('fetch-video-temp' as any, async (data: { url: string }) => {
      try {
        this.logInfo('收到视频临时加载请求:', data.url)

        // 如果已经是 Vite @fs 路径，直接返回
        if (data.url.includes('/vite/@fs/')) {
          return {
            success: true,
            viteUrl: data.url
          }
        }

        // 如果是本地文件 URL，转换为 Vite @fs 路径
        if (this.isFileUrl(data.url)) {
          const filePath = require('node:url').fileURLToPath(data.url)
          const normalizedPath = filePath.replace(/\\/g, '/')
          return {
            success: true,
            viteUrl: `/vite/@fs/${normalizedPath}`
          }
        }

        // 网络视频：下载并缓存到本地，返回 Vite @fs 路径
        const dir = require('node:path').join(this.ctx.baseDir, 'data', 'chat-patch', 'persist-media', 'media')
        if (!require('node:fs').existsSync(dir)) {
          require('node:fs').mkdirSync(dir, { recursive: true })
        }

        const crypto = require('node:crypto')
        const hash = crypto.createHash('md5').update(data.url).digest('hex')
        const ext = require('node:path').extname(new URL(data.url).pathname) || '.mp4'
        const filename = `${hash}${ext}`
        const filePath = require('node:path').join(dir, filename)

        // 如果文件不存在，下载并保存
        if (!require('node:fs').existsSync(filePath)) {
          const response = await fetch(data.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': ''
            }
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const buffer = await response.arrayBuffer()
          require('node:fs').writeFileSync(filePath, Buffer.from(buffer))
          this.logInfo('视频下载成功:', { size: buffer.byteLength, path: filePath })
        }

        // 返回 Vite @fs 路径
        const normalizedPath = filePath.replace(/\\/g, '/')
        return {
          success: true,
          viteUrl: `/vite/@fs/${normalizedPath}`
        }
      } catch (error: any) {
        this.logger.error('视频临时加载失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })
  }

  private isFileUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)
      return parsedUrl.protocol === 'file:'
    } catch {
      return false
    }
  }

  private createFileUrl(filePath: string): string {
    try {
      return pathToFileURL(filePath).href
    } catch (error) {
      this.logger.error('创建文件URL失败:', { filePath, error })

      return `file://${filePath}`
    }
  }

  private async handleLocalFileRequest(fileUrl: string) {
    try {

      const filePath = fileURLToPath(fileUrl)

      const buffer = readFileSync(filePath)
      const base64 = buffer.toString('base64')

      const contentType = mime.lookup(filePath) || 'application/octet-stream'

      this.logInfo('成功读取本地文件:', { fileUrl, filePath, contentType })

      return {
        success: true,
        base64: base64,
        contentType: contentType,
        dataUrl: `data:${contentType};base64,${base64}`
      }
    } catch (error: any) {
      this.logger.error('读取本地文件失败:', { fileUrl, error: error.message })
      return {
        success: false,
        error: `读取本地文件失败: ${error.message}`
      }
    }
  }

  private setupTempFileCleanup() {

    this.ctx.setInterval(() => {
      this.cleanupMediaCache()
    }, 5 * 60 * 1000)
  }

  private async cleanupMediaCache() {
    const baseDir = this.ctx.baseDir + '/data/chat-patch/persist-media'
    if (!require('node:fs').existsSync(baseDir)) return

    const cleanupDir = (dirName: string, limit: number) => {
      const dirPath = require('node:path').join(baseDir, dirName)
      if (!require('node:fs').existsSync(dirPath)) return

      const files = require('node:fs').readdirSync(dirPath)
        .map(file => {
          const filePath = require('node:path').join(dirPath, file)
          const stats = require('node:fs').statSync(filePath)
          return { name: file, path: filePath, mtime: stats.mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)

      if (files.length > limit) {
        files.slice(limit).forEach(f => {
          try { require('node:fs').unlinkSync(f.path) } catch { }
        })
      }
    }

    cleanupDir('images', 100)
    cleanupDir('media', 20)
  }

  private logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      (this.logger.info as (...args: any[]) => void)(...args)
    }
  }
}
