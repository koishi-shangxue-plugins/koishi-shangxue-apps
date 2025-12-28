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
    let guildName = session.channelId
    let directUserName = session.username || session.userId || '未知用户'

    const data = this.fileManager.readChatDataFromFile()

    try {
      // 获取群组名称
      if (session.guildId && session.bot.getGuild && typeof session.bot.getGuild === 'function') {
        const guild = await session.bot.getGuild(session.guildId)
        guildName = guild?.name || session.channelId
      }

      // 获取私聊用户昵称
      if (session.userId && session.isDirect && session.bot.getUser && typeof session.bot.getUser === 'function') {
        try {
          const user = await session.bot.getUser(session.userId)
          directUserName = user?.name || session.username || session.userId || '未知用户'
        } catch (userError) {
          this.logInfo('获取用户信息失败，使用备用名称:', userError)
        }
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

    if (!data.channels[session.selfId]) {
      data.channels[session.selfId] = {}
    }

    const channelInfo: ChannelInfo = {
      id: session.channelId,
      name: session.isDirect
        ? `私聊（${session.username || session.userId || directUserName}）`
        : `${guildName} (${session.channelId})`,
      type: session.type || 0,
      channelId: session.channelId,
      guildName: guildName,
      isDirect: session.isDirect
    }

    data.channels[session.selfId][session.channelId] = channelInfo
    this.fileManager.writeChatDataToFile(data)
    this.logInfo('更新频道信息到文件:', channelInfo.name)

    return guildName
  }

  async broadcastMessageEvent(session: Session) {
    try {
      await this.updateBotInfoToFile(session)
      const guildName = await this.updateChannelInfoToFile(session)

      const timestamp = Date.now()

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
        elements: this.utils.cleanBase64Content(elements),
        type: 'user',
        guildName: guildName,
        platform: session.platform || 'unknown',
        quote: quoteInfo ? this.utils.cleanBase64Content(quoteInfo) : undefined,
        isDirect: session.isDirect
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
        elements: this.utils.cleanBase64Content(elements),
        quote: quoteInfo ? this.utils.cleanBase64Content(quoteInfo) : undefined,
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

      // 调试日志：检查 channelId 的来源
      this.logInfo('机器人发送消息调试信息:', {
        'session.channelId': session.channelId,
        'session.event?.channel?.id': session.event?.channel?.id,
        'correctChannelId': correctChannelId,
        'session.guildId': session.guildId,
        'session.isDirect': session.isDirect,
        'session.platform': session.platform
      })

      // 使用正确的 channelId，如果没有则使用 session.channelId
      const finalChannelId = correctChannelId || session.channelId

      await this.updateBotInfoToFile(session)
      const guildName = await this.updateChannelInfoToFile(session)

      const timestamp = Date.now()

      let content = ''

      if (session.event?.message?.elements) {
        content = this.utils.extractTextContent(session.event.message.elements).trim()
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
        elements: this.utils.cleanBase64Content(session.event?.message?.elements),
        type: 'bot',
        guildName: guildName,
        platform: session.platform || 'unknown',
        isDirect: session.isDirect
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
        elements: this.utils.cleanBase64Content(session.event?.message?.elements),
        isDirect: session.isDirect,
        bot: {
          avatar: session.bot.user?.avatar,
          name: session.bot.user?.name,
        }
      }

      // 检查是否包含图片元素
      const imageElements = session.event?.message?.elements?.filter((element: any) =>
        element.type === 'img' || element.type === 'image' || element.type === 'mface'
      ) || []

      this.logInfo('机器人发送消息 (before-send):', {
        selfId: session.selfId,
        channelId: messageEvent.channelId,
        originalChannelId: session.channelId,
        correctedChannelId: finalChannelId,
        content: content,
        platform: session.platform,
        imageCount: imageElements.length,
        imageUrls: imageElements.map((el: any) => el.attrs?.src || el.attrs?.url || el.attrs?.file)
      })

      // 清理已使用的 channelId 映射
      this.correctChannelIds.delete(session.selfId)

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