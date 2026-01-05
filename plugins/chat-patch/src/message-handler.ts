import { BotInfo, ChannelInfo, MessageInfo, QuoteInfo } from './types'
import { Context, Session, h, Logger } from 'koishi'
import { FileManager } from './file-manager'
import { Config } from './config'
import { Utils } from './utils'
import { } from '@koishijs/plugin-console'

export class MessageHandler {
  private logger: Logger
  private utils: Utils
  // 存储正确的 channelId 映射，key 是 selfId，value 是正确的 channelId
  private correctChannelIds: Map<string, string> = new Map()

  constructor(
    private ctx: Context,
    private config: Config,
    private fileManager: FileManager
  ) {
    this.logger = ctx.logger('chat-patch')
    this.utils = new Utils(config)
  }

  // 设置正确的 channelId
  setCorrectChannelId(selfId: string, channelId: string) {
    this.correctChannelIds.set(selfId, channelId)
    this.logInfo('设置正确的 channelId:', { selfId, channelId })
  }

  // 获取正确的 channelId
  getCorrectChannelId(selfId: string): string | undefined {
    return this.correctChannelIds.get(selfId)
  }

  // 更新机器人信息到JSON文件
  async updateBotInfoToFile(session: Session) {
    const data = this.fileManager.readChatDataFromFile()

    const botInfo: BotInfo = {
      selfId: session.selfId,
      platform: session.platform || 'unknown',
      username: session.bot.user?.name || `Bot-${session.selfId}`,
      avatar: session.bot.user?.avatar,
      status: 'online'
    }

    data.bots[session.selfId] = botInfo
    this.fileManager.writeChatDataToFile(data)
    this.logInfo('更新机器人信息到文件:', botInfo.username)
  }

  // 更新频道信息到JSON文件
  async updateChannelInfoToFile(session: Session): Promise<string> {
    const isDirect = session.isDirect || session.channelId?.includes('private')
    let guildName = session.channelId
    // 直接使用 session.username 作为私聊用户名
    const directUserName = session.username || session.event?.user?.name || session.userId

    const data = this.fileManager.readChatDataFromFile()

    if (!isDirect) {
      try {
        // 获取群组名称
        if (session.guildId && session.bot.getGuild && typeof session.bot.getGuild === 'function') {
          const guild = await session.bot.getGuild(session.guildId)
          guildName = guild?.name || session.channelId
        }

        // 如果没有getGuild方法，尝试使用getChannel方法
        if (session.guildId && !session.bot.getGuild && session.bot.getChannel && typeof session.bot.getChannel === 'function') {
          try {
            const channel = await session.bot.getChannel(session.guildId)
            guildName = channel?.name || session.channelId
          } catch (channelError) {
            this.logInfo('获取频道信息失败，使用频道ID作为备用:', channelError)
          }
        }
      } catch (error) {
        this.logInfo('获取频道信息失败，使用频道ID作为备用:', error)
        guildName = session.channelId
      }
    }

    if (!data.channels[session.selfId]) {
      data.channels[session.selfId] = {}
    }

    // 获取现有频道信息
    const existingChannel = data.channels[session.selfId][session.channelId]

    // 构造频道名称
    let finalName: string
    if (isDirect) {
      // 私聊频道：优先使用真实用户名
      if (directUserName && directUserName !== session.userId) {
        finalName = `私聊（${directUserName}）`
      } else if (existingChannel?.name && !existingChannel.name.includes('未知')) {
        // 如果已有名称且不是"未知用户"，保持原名称
        finalName = existingChannel.name
      } else if (session.platform && session.platform.toLowerCase().includes('sandbox')) {
        // sandbox 平台直接使用 userId 作为频道名称
        finalName = `私聊（${session.userId}）`
      } else {
        finalName = '私聊（未知用户）'
      }
    } else {
      finalName = guildName || session.channelId
    }

    const channelInfo: ChannelInfo = {
      id: session.channelId,
      name: finalName,
      type: session.type || 0,
      channelId: session.channelId,
      guildName: guildName,
      isDirect: !!isDirect
    }

    // 记录名称变化
    if (existingChannel && existingChannel.name !== finalName) {
      this.logInfo('更新频道名称:', {
        channelId: session.channelId,
        oldName: existingChannel.name,
        newName: finalName
      })
    }

    data.channels[session.selfId][session.channelId] = channelInfo
    this.fileManager.writeChatDataToFile(data)
    this.logInfo('更新频道信息到文件:', channelInfo.name)

    return guildName
  }

  // 下载并缓存媒体文件
  public async downloadAndCacheMedia(url: string, type: 'image' | 'media' | 'avatar') {
    try {
      if (!url || url.startsWith('data:') || url.startsWith('file:')) return url

      let folder = 'media'
      if (type === 'image') folder = 'images'
      else if (type === 'avatar') folder = 'avatars'

      const dir = require('node:path').join(this.ctx.baseDir, 'data', 'chat-patch', 'persist-media', folder)
      if (!require('node:fs').existsSync(dir)) {
        require('node:fs').mkdirSync(dir, { recursive: true })
      }

      // 使用 URL 的 hash 作为文件名，避免重复下载
      const crypto = require('node:crypto')
      const hash = crypto.createHash('md5').update(url).digest('hex')
      const ext = require('node:path').extname(new URL(url).pathname) || (type === 'image' ? '.jpg' : '.mp4')
      const filename = `${hash}${ext}`
      const filePath = require('node:path').join(dir, filename)

      if (require('node:fs').existsSync(filePath)) {
        return require('node:url').pathToFileURL(filePath).href
      }

      const buffer = await this.ctx.http.get(url, { responseType: 'arraybuffer' })
      require('node:fs').writeFileSync(filePath, Buffer.from(buffer))

      return require('node:url').pathToFileURL(filePath).href
    } catch (e) {
      return url
    }
  }

  // 处理消息中的媒体元素并缓存
  // 只缓存用户的图片和语音，不缓存视频和文件
  private async processMediaElements(elements: h[], isUserMessage: boolean = true) {
    if (!elements) return elements
    for (const el of elements) {
      if (['image', 'img', 'mface'].includes(el.type)) {
        const src = el.attrs.src || el.attrs.url || el.attrs.file
        if (src && isUserMessage) {
          // 只缓存用户消息的图片
          el.attrs.src = await this.downloadAndCacheMedia(src, 'image')
        }
      } else if (el.type === 'audio') {
        const src = el.attrs.src || el.attrs.url || el.attrs.file
        if (src && isUserMessage) {
          // 只缓存用户消息的语音
          el.attrs.src = await this.downloadAndCacheMedia(src, 'media')
        }
      }
      // 视频和文件不再缓存，保持原始URL
      if (el.children) await this.processMediaElements(el.children, isUserMessage)
    }
    return elements
  }

  async broadcastMessageEvent(session: Session) {
    try {
      await this.updateBotInfoToFile(session)
      const guildName = await this.updateChannelInfoToFile(session)
      const isDirect = session.isDirect || session.channelId?.includes('private')

      const timestamp = Date.now()

      // 处理媒体缓存 - 用户消息只缓存图片和语音
      if (session.elements) {
        await this.processMediaElements(session.elements, true)
      }
      if (session.quote?.elements) {
        await this.processMediaElements(session.quote.elements, true)
      }

      // 处理 quote 信息
      let quoteInfo: QuoteInfo | undefined = undefined
      if (session.quote) {
        quoteInfo = {
          messageId: session.quote.messageId || session.quote.id,
          id: session.quote.id,
          content: session.quote.content || '',
          elements: session.quote.elements,
          user: {
            id: session.quote.user?.id || session.quote.user?.userId || 'unknown',
            name: session.quote.user?.name || session.quote.user?.username || 'unknown',
            userId: session.quote.user?.userId || session.quote.user?.id || 'unknown',
            avatar: session.quote.user?.avatar,
            username: session.quote.user?.username || session.quote.user?.name || 'unknown'
          },
          timestamp: session.quote.timestamp || Date.now()
        }
      }

      // 从 session 中提取用户消息内容
      let content = ''
      let elements: h[] = []

      if (session.content) {
        content = session.content
      } else if (session.stripped?.content) {
        content = session.stripped.content
      }

      if (session.elements) {
        elements = session.elements
        if (!content) {
          content = session.elements
            .filter((element: any) => element.type === 'text')
            .map((element: any) => element.attrs?.content || '')
            .join('')
        }
      }

      // 创建消息信息对象
      const messageInfo: MessageInfo = {
        id: session.event?.message?.id || `msg-${timestamp}`,
        content: content || session.content || '',
        userId: session.userId || session.event?.user?.id || 'unknown',
        username: session.username || session.event?.user?.name || session.userId || 'unknown',
        avatar: session.event?.user?.avatar,
        timestamp: timestamp,
        channelId: session.channelId,
        selfId: session.selfId,
        elements: this.utils.cleanBase64Content(elements, false),
        type: 'user',
        guildName: guildName,
        platform: session.platform || 'unknown',
        quote: quoteInfo ? this.utils.cleanBase64Content(quoteInfo, false) : undefined,
        isDirect: !!isDirect
      }

      await this.fileManager.addMessageToFile(messageInfo)

      const messageEvent = {
        type: 'message',
        selfId: session.selfId,
        platform: session.platform || 'unknown',
        channelId: session.channelId,
        messageId: session.event?.message?.id || `msg-${timestamp}`,
        content: content || session.content || '',
        userId: session.userId || session.event?.user?.id || 'unknown',
        username: session.username || session.event?.user?.name || session.userId || 'unknown',
        avatar: session.event?.user?.avatar,
        timestamp: timestamp,
        guildName: guildName,
        channelType: session.type || 0,
        elements: this.utils.cleanBase64Content(elements, false),
        quote: quoteInfo ? this.utils.cleanBase64Content(quoteInfo, false) : undefined,
        isDirect: session.isDirect,
        bot: {
          avatar: session.bot.user?.avatar,
          name: session.bot.user?.name,
        }
      }

      this.ctx.console.broadcast('chat-message-event', messageEvent)
    } catch (error) {
      this.logger.error('广播消息事件失败:', error)
    }
  }

  // 处理机器人发送的消息
  async broadcastBotMessageEvent(session: Session) {
    try {
      // 获取正确的 channelId
      const correctChannelId = this.getCorrectChannelId(session.selfId)

      // 使用正确的 channelId，如果没有则使用 session.channelId
      const finalChannelId = correctChannelId || session.channelId

      await this.updateBotInfoToFile(session)
      const guildName = await this.updateChannelInfoToFile(session)
      const isDirect = session.isDirect || finalChannelId?.includes('private')

      const timestamp = Date.now()

      // 机器人消息不缓存任何媒体
      // 保持原始URL，不进行缓存处理

      // 优先使用 session.content，它包含了完整的消息内容（含标签）
      let content = session.content || ''

      if (!content && session.event?.message?.elements) {
        content = this.utils.extractTextContent(session.event.message.elements).trim()
      }

      // 尝试从 content 中提取 quote id 并构建 quote 对象
      let quoteInfo: QuoteInfo | undefined = undefined
      const quoteMatch = content.match(/<quote id="([^"]+)"\/>/)
      if (quoteMatch) {
        const quoteId = quoteMatch[1]
        const data = this.fileManager.readChatDataFromFile()
        const channelKey = `${session.selfId}:${finalChannelId}`
        // 在当前频道的消息历史中查找被引用的消息
        const quotedMsg = data.messages[channelKey]?.find(m => m.id === quoteId)

        if (quotedMsg) {
          // 如果是虚拟 ID，尝试获取其真实的 messageId
          const realId = quotedMsg.id.startsWith('bot-msg-') ? (quotedMsg as any).realId : quotedMsg.id

          quoteInfo = {
            messageId: realId || quotedMsg.id,
            id: realId || quotedMsg.id,
            content: quotedMsg.content,
            elements: quotedMsg.elements,
            user: {
              id: quotedMsg.userId,
              name: quotedMsg.username,
              userId: quotedMsg.userId,
              avatar: quotedMsg.avatar,
              username: quotedMsg.username
            },
            timestamp: quotedMsg.timestamp
          }
          // 移除 content 中的 quote 标签，避免重复显示
          content = content.replace(/<quote id="[^"]+"\/>\s*/, '')

          // 修正 content 中的 quote 标签为真实 ID，以便 bot.sendMessage 能够正确识别
          if (realId) {
            session.content = session.content.replace(/id="[^"]+"/, `id="${realId}"`)
          }
        }
      }

      // 创建机器人消息信息对象
      const messageInfo: MessageInfo = {
        id: `bot-msg-${timestamp}`,
        content: content,
        userId: session.selfId,
        username: session.bot.user?.name || `Bot-${session.selfId}`,
        avatar: session.bot.user?.avatar,
        timestamp: timestamp,
        channelId: finalChannelId,
        selfId: session.selfId,
        elements: this.utils.cleanBase64Content(session.event?.message?.elements, true),
        type: 'bot',
        guildName: guildName,
        platform: session.platform || 'unknown',
        quote: quoteInfo,
        isDirect: !!isDirect,
        sending: true // 标记为正在发送
      }

      await this.fileManager.addMessageToFile(messageInfo)

      const messageEvent = {
        type: 'bot-message',
        selfId: session.selfId,
        platform: session.platform || 'unknown',
        channelId: finalChannelId,
        messageId: `bot-msg-${timestamp}`,
        content: content,
        userId: session.selfId,
        username: session.bot.user?.name || `Bot-${session.selfId}`,
        avatar: session.bot.user?.avatar,
        timestamp: timestamp,
        guildName: guildName,
        channelType: session.event?.channel?.type || session.type || 0,
        elements: this.utils.cleanBase64Content(session.event?.message?.elements, true),
        quote: quoteInfo,
        isDirect: !!isDirect,
        sending: true,
        bot: {
          avatar: session.bot.user?.avatar,
          name: session.bot.user?.name,
        }
      }

      this.ctx.console.broadcast('chat-bot-message-event', messageEvent)
    } catch (error) {
      this.logger.error('广播机器人消息事件失败:', error)
    }
  }

  private logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      (this.logger.info as (...args: any[]) => void)(...args)
    }
  }
}
