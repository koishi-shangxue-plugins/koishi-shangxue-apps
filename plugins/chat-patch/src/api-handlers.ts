import { FileManager } from './file-manager'
import { MessageHandler } from './message-handler'
import { Context, h, Logger } from 'koishi'
import { Config } from './config'
import { } from '@koishijs/plugin-console'
import { URL, pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import * as mime from 'mime-types'

export class ApiHandlers {
  private logger: Logger

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
        // 这个 API 主要用于前端调用，后端不直接操作 IndexedDB
        return { success: true, message: '可以清空 IndexedDB' }
      } catch (error: any) {
        this.logger.error('清空 IndexedDB 数据失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    // 获取所有聊天数据的 API
    this.ctx.console.addListener('get-chat-data' as any, async () => {
      try {
        const data = this.fileManager.readChatDataFromFile()
        const cleanedData = this.fileManager.cleanExcessMessages(data)

        this.logInfo('获取聊天数据:', {
          机器人数量: Object.keys(cleanedData.bots).length,
          频道数量: Object.keys(cleanedData.channels).reduce((total, botId) =>
            total + Object.keys(cleanedData.channels[botId] || {}).length, 0),
          消息频道数: Object.keys(cleanedData.messages).length,
          总消息数: Object.values(cleanedData.messages).reduce((total, msgs) => total + msgs.length, 0)
        })

        return {
          success: true,
          data: {
            ...cleanedData,
            pinnedBots: cleanedData.pinnedBots,
            pinnedChannels: cleanedData.pinnedChannels
          }
        }
      } catch (error: any) {
        this.logger.error('获取聊天数据失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    // 获取历史消息的 API
    this.ctx.console.addListener('get-history-messages' as any, async (requestData: {
      selfId: string
      channelId: string
      limit?: number
      offset?: number
    }) => {
      try {
        const data = this.fileManager.readChatDataFromFile()
        const channelKey = `${requestData.selfId}:${requestData.channelId}`
        let messages = data.messages[channelKey] || []

        // 按时间戳降序排列（最新的消息在前面）
        const sortedMessages = messages.sort((a, b) => b.timestamp - a.timestamp)

        // 如果提供了分页参数，则进行分页处理
        if (requestData.limit !== undefined) {
          const limit = requestData.limit
          const offset = requestData.offset || 0
          messages = sortedMessages.slice(offset, offset + limit)
          // 重新按时间戳升序排列，以保持消息显示顺序
          messages = messages.sort((a, b) => a.timestamp - b.timestamp)
        } else {
          // 默认返回所有消息，按时间戳升序排列
          messages = sortedMessages.sort((a, b) => a.timestamp - b.timestamp)
        }

        this.logInfo('获取历史消息:', channelKey, '共', messages.length, '条消息')

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

    // 获取所有频道消息数量的 API
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

    // 图片获取 API
    this.ctx.console.addListener('fetch-image' as any, async (data: { url: string }) => {
      try {
        // 检查是否是本地文件路径
        if (this.isFileUrl(data.url)) {
          this.logInfo('处理本地文件请求:', data.url)
          return await this.handleLocalFileRequest(data.url)
        }

        // 处理网络图片
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
        const base64 = Buffer.from(buffer).toString('base64')
        const contentType = response.headers.get('content-type') || 'image/jpeg'
        return {
          success: true,
          base64: base64,
          contentType: contentType,
          dataUrl: `data:${contentType};base64,${base64}`
        }
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) }
      }
    })

    // 清理频道历史记录的 API
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

    // 发送消息的 API
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

        const bot = this.ctx.bots.find((bot: any) => bot.selfId === data.selfId)
        if (!bot) {
          this.logger.error('未找到机器人:', data.selfId)
          return { success: false, error: '未找到指定的机器人' }
        }

        let messageContent = data.content

        // 如果有图片，添加图片元素
        if (data.images && data.images.length > 0) {
          const tempDir = this.ctx.baseDir + '/data/chat-patch/temp'

          for (const image of data.images) {
            const files = require('fs').readdirSync(tempDir).filter((file: string) =>
              file.includes(`temp_${image.tempId}`)
            )

            if (files.length > 0) {
              const imagePath = `${tempDir}/${files[0]}`
              // 使用 pathToFileURL 创建正确的文件 URL
              const fileUrl = this.createFileUrl(imagePath)
              messageContent += h.image(fileUrl).toString()
              this.logInfo('添加图片到消息:', { imagePath, fileUrl })
            }
          }
        }

        const parsedContent = h.parse(messageContent)

        // 在发送消息前，通知 MessageHandler 正确的 channelId
        this.messageHandler.setCorrectChannelId(data.selfId, data.channelId)

        const result = await bot.sendMessage(data.channelId, parsedContent)
        this.logInfo('消息发送成功:', result)

        // 广播机器人消息发送成功事件，包含真实的 messageId
        const messageId = Array.isArray(result) ? result[0] : result;
        if (messageId) {
          const bot = this.ctx.bots.find((b: any) => b.selfId === data.selfId);
          const botMessageEvent = {
            type: 'bot-message-sent',
            selfId: data.selfId,
            platform: bot?.platform || 'unknown',
            channelId: data.channelId,
            messageId: messageId,
            content: messageContent,
            userId: data.selfId,
            botUsername: bot?.user?.name || `Bot-${data.selfId}`,
            botAvatar: bot?.user?.avatar,
            timestamp: Date.now(),
            guildName: '', // 这个信息在前端会补充
            channelType: 0, // 这个信息在前端会补充
            elements: [], // 这个信息在前端会补充
            isDirect: false // 这个信息在前端会补充
          };

          this.ctx.console.broadcast('bot-message-sent-event', botMessageEvent);
        }

        return {
          success: true,
          messageId: messageId,
          tempImageIds: data.images?.map(img => img.tempId) || []
        }
      } catch (error: any) {
        this.logger.error('发送消息失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    // 清理临时图片的 API（由前端在消息发送成功后调用）
    this.ctx.console.addListener('cleanup-temp-images' as any, async (data: {
      tempImageIds: string[]
    }) => {
      try {
        this.logInfo('收到清理临时图片请求:', data.tempImageIds)

        // 不立即删除，只是记录日志，让定时任务处理清理
        this.logInfo('临时图片将由定时任务清理，保持文件可用性')

        return { success: true, cleanedCount: 0 }
      } catch (error: any) {
        this.logger.error('清理临时图片失败:', error)
        return { success: false, error: error?.message || String(error) }
      }
    })

    // 删除机器人所有数据的 API
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

    // 删除频道所有数据的 API
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

    // 设置置顶机器人列表的 API
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

    // 设置置顶频道列表的 API
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

    // 上传图片的 API
    this.ctx.console.addListener('upload-image' as any, async (data: {
      file: string // base64 encoded image
      filename: string
      mimeType: string
      isGif?: boolean // 是否为GIF图片
    }) => {
      try {
        this.logInfo('收到图片上传请求:', { filename: data.filename, mimeType: data.mimeType, isGif: data.isGif })

        // 将base64转换为Buffer
        const base64Data = data.file.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')

        // 生成临时文件路径，保持原始扩展名以保持GIF格式
        const tempId = Date.now() + '_' + Math.random().toString(36).substring(2, 11)
        const extension = data.filename.split('.').pop()?.toLowerCase() || (data.isGif ? 'gif' : 'jpg')
        const tempFilename = `temp_${tempId}.${extension}`

        // 保存到临时目录
        const tempDir = this.ctx.baseDir + '/data/chat-patch/temp'
        if (!require('fs').existsSync(tempDir)) {
          require('fs').mkdirSync(tempDir, { recursive: true })
        }

        const tempPath = `${tempDir}/${tempFilename}`

        // 对于GIF文件，直接保存原始数据以保持动画
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

    // 删除临时图片的 API
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

    // 定时清理过期临时文件（备用机制）
    this.setupTempFileCleanup()

    // 获取插件配置的 API
    this.ctx.console.addListener('get-plugin-config' as any, async () => {
      try {
        return {
          success: true,
          config: {
            maxMessagesPerChannel: this.config.maxMessagesPerChannel,
            keepMessagesOnClear: this.config.keepMessagesOnClear,
            keepTempImages: this.config.keepTempImages,
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

    // 调试API：获取原始文件数据
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
  }

  // 检查是否为文件 URL
  private isFileUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)
      return parsedUrl.protocol === 'file:'
    } catch {
      return false
    }
  }

  // 创建文件 URL
  private createFileUrl(filePath: string): string {
    try {
      return pathToFileURL(filePath).href
    } catch (error) {
      this.logger.error('创建文件URL失败:', { filePath, error })
      // 回退到简单的字符串拼接
      return `file://${filePath}`
    }
  }

  // 处理本地文件请求
  private async handleLocalFileRequest(fileUrl: string) {
    try {
      // 使用 fileURLToPath 转换 file:// URL 为系统路径
      const filePath = fileURLToPath(fileUrl)

      // 改用 node:fs 直接读取文件，避免 ctx.http.file 可能存在的编码或协议处理问题
      const buffer = readFileSync(filePath)
      const base64 = buffer.toString('base64')

      // 使用 mime-types 库精确推断 MIME 类型
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

  // 设置定时清理临时文件
  private setupTempFileCleanup() {
    // 每5分钟执行一次基于数量的清理
    setInterval(() => {
      this.cleanupTempImagesByCount()
    }, 5 * 60 * 1000) // 5分钟
  }

  // 基于数量清理临时图片（保留最新的N张）
  private async cleanupTempImagesByCount() {
    try {
      const tempDir = this.ctx.baseDir + '/data/chat-patch/temp'
      if (!require('fs').existsSync(tempDir)) {
        return
      }

      const now = Date.now()
      const protectionTime = 30 * 1000 // 30秒保护期，刚上传的图片不会被删除

      const files = require('fs').readdirSync(tempDir)
        .filter((file: string) => file.startsWith('temp_'))
        .map((file: string) => {
          const filePath = `${tempDir}/${file}`
          try {
            const stats = require('fs').statSync(filePath)
            const fileAge = now - stats.mtime.getTime()
            return {
              name: file,
              path: filePath,
              mtime: stats.mtime.getTime(),
              age: fileAge,
              protected: fileAge < protectionTime // 是否在保护期内
            }
          } catch (error) {
            return null
          }
        })
        .filter((file: any) => file !== null)
        .sort((a: any, b: any) => b.mtime - a.mtime) // 按修改时间降序排列（最新的在前）

      const keepCount = this.config.keepTempImages
      let cleanedCount = 0
      let protectedCount = 0

      // 分离受保护的文件和可删除的文件
      const protectedFiles = files.filter((file: any) => file.protected)
      const deletableFiles = files.filter((file: any) => !file.protected)

      protectedCount = protectedFiles.length

      // 如果可删除的文件数量超过了保留数量，则删除多余的
      if (deletableFiles.length > keepCount) {
        const filesToDelete = deletableFiles.slice(keepCount) // 保留前N个，删除其余的

        for (const file of filesToDelete) {
          try {
            if (require('fs').existsSync(file.path)) {
              require('fs').unlinkSync(file.path)
              cleanedCount++
              this.logInfo('清理多余临时图片:', file.path)
            }
          } catch (fileError) {
            this.logger.warn('删除临时文件失败:', { file: file.name, error: fileError })
          }
        }
      }

      if (cleanedCount > 0 || protectedCount > 0) {
        this.logInfo(`基于数量清理完成，保留最新 ${keepCount} 张图片，清理了 ${cleanedCount} 张多余图片，保护了 ${protectedCount} 张新上传图片`)
      }
    } catch (error) {
      this.logger.warn('基于数量清理临时文件失败:', error)
    }
  }

  private logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      (this.logger.info as (...args: any[]) => void)(...args)
    }
  }
}
