import { BotInfo, ChannelInfo, MessageInfo, QuoteInfo } from './types'
import { Context, Session, h } from 'koishi'
import { FileManager } from './file-manager'
import { Config } from './config'
import { Utils } from './utils'
import { PluginLogger } from './logger'
import { } from '@koishijs/plugin-console'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export class MessageHandler {
  private utils: Utils

  private correctChannelIds: Map<string, string> = new Map()

  private scheduledTasks: Set<() => void> = new Set()

  private channelRefreshInFlight: Set<string> = new Set()

  private lastChannelRefreshAt: Map<string, number> = new Map()

  private readonly CHANNEL_REFRESH_TTL_MS = 10 * 60 * 1000

  constructor(
    private ctx: Context,
    private config: Config,
    private fileManager: FileManager,
    private logger: PluginLogger
  ) {
    this.utils = new Utils(config)
  }

  recordUserMessage(session: Session, timestamp: number) {
    this.scheduleTask('记录用户消息', async () => {
      await this.processUserMessage(session, timestamp)
    })
  }

  recordBotMessage(session: Session, timestamp: number) {
    this.scheduleTask('记录机器人消息', async () => {
      await this.processBotMessage(session, timestamp)
    })
  }

  setCorrectChannelId(selfId: string, channelId: string) {
    this.correctChannelIds.set(selfId, channelId)
    this.logger.logInfo('设置正确的 channelId:', { selfId, channelId })
  }

  getCorrectChannelId(selfId: string): string | undefined {
    return this.correctChannelIds.get(selfId)
  }

  updateBotInfoToFile(session: Session) {
    this.scheduleTask('更新机器人信息', async () => {
      const botInfo: BotInfo = {
        selfId: session.selfId,
        platform: session.platform || 'unknown',
        username: session.bot.user?.name || `Bot-${session.selfId}`,
        avatar: session.bot.user?.avatar,
        status: 'online'
      }

      await this.fileManager.upsertBotInfo(botInfo)
      this.logger.logInfo('更新机器人信息到文件:', botInfo.username)
    })
  }

  updateChannelInfoToFile(session: Session): string {
    const isDirect = session.isDirect || session.channelId?.includes('private')
    const directUserName = session.username || session.event?.user?.name || session.userId

    const existingChannel = this.fileManager.getCachedChannelInfo(session.selfId, session.channelId)

    let immediateName = session.channelId
    if (isDirect) {
      if (directUserName && directUserName !== session.userId) {
        immediateName = `私聊（${directUserName}）`
      } else if (existingChannel?.name && !existingChannel.name.includes('未知')) {
        immediateName = existingChannel.name
      } else if (session.platform && session.platform.toLowerCase().includes('sandbox')) {
        immediateName = `私聊（${session.userId}）`
      } else {
        immediateName = '私聊（未知用户）'
      }
    } else if (existingChannel?.guildName) {
      immediateName = existingChannel.guildName
    }

    const channelKey = `${session.selfId}:${session.channelId}`
    if (this.shouldRefreshChannelInfo(channelKey, existingChannel, isDirect, session.channelId, directUserName)) {
      this.scheduleTask('更新频道信息', async () => {
        await this.refreshChannelInfo(session, existingChannel, isDirect, directUserName)
      })
    }

    return immediateName
  }

  public async downloadAndCacheMedia(url: string, type: 'image' | 'media' | 'avatar') {
    try {
      if (!url || url.startsWith('data:')) return url

      // 如果已经是 Vite @fs 路径，直接返回
      if (url.includes('/vite/@fs/')) return url

      let folder = 'media'
      if (type === 'image') folder = 'images'
      else if (type === 'avatar') folder = 'avatars'

      const dir = path.join(this.ctx.baseDir, 'data', 'chat-patch', 'persist-media', folder)
      await fs.mkdir(dir, { recursive: true })

      const hash = createHash('md5').update(url).digest('hex')
      const ext = path.extname(new URL(url).pathname) || (type === 'image' ? '.jpg' : '.mp4')
      const filename = `${hash}${ext}`
      const filePath = path.join(dir, filename)

      if (!(await this.fileExists(filePath))) {
        const buffer = await this.ctx.http.get(url, { responseType: 'arraybuffer' })
        await fs.writeFile(filePath, Buffer.from(buffer))
      }

      // 返回 Vite @fs 路径格式，让浏览器通过 Vite 开发服务器加载本地文件
      // Windows 路径需要转换为正斜杠
      const normalizedPath = filePath.replace(/\\/g, '/')
      return `/vite/@fs/${normalizedPath}`
    } catch (e) {
      this.logger.warn('下载并缓存媒体失败:', e)
      return url
    }
  }

  private processMediaElementsAsync(elements: h[], isUserMessage: boolean = true) {
    if (!elements) return

    this.scheduleTask('处理媒体元素', async () => {
      await this.processMediaElements(elements, isUserMessage)
    })
  }

  private async processUserMessage(session: Session, timestamp?: number) {
    try {
      if (!timestamp) timestamp = Date.now()

      this.updateBotInfoToFile(session)

      const guildName = this.updateChannelInfoToFile(session)
      const isDirect = session.isDirect || session.channelId?.includes('private')

      if (session.elements) {
        this.processMediaElementsAsync(session.elements, true)
      }
      if (session.quote?.elements) {
        this.processMediaElementsAsync(session.quote.elements, true)
      }

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
      this.logger.error('处理用户消息失败:', error)
    }
  }

  private async processBotMessage(session: Session, timestamp?: number) {
    try {
      if (!timestamp) timestamp = Date.now()

      const correctChannelId = this.getCorrectChannelId(session.selfId)
      const finalChannelId = correctChannelId || session.channelId

      this.updateBotInfoToFile(session)

      const guildName = this.updateChannelInfoToFile(session)
      const isDirect = session.isDirect || finalChannelId?.includes('private')

      let content = session.content || ''

      if (!content && session.event?.message?.elements) {
        content = this.utils.extractTextContent(session.event.message.elements).trim()
      }

      let quoteInfo: QuoteInfo | undefined = undefined
      const quoteMatch = content.match(/<quote id="([^"]+)"\/>/)
      if (quoteMatch) {
        const quoteId = quoteMatch[1]
        const messages = await this.fileManager.readChannelMessages(session.selfId, finalChannelId)
        const quotedMsg = messages.find((message) => message.id === quoteId)

        if (quotedMsg) {
          const realId = quotedMsg.id.startsWith('bot-msg-') ? quotedMsg.realId : quotedMsg.id

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
          content = content.replace(/<quote id="[^"]+"\/>\s*/, '')

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

      // 异步保存消息（不阻塞）
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
      this.logger.error('处理机器人消息失败:', error)
    }
  }

  dispose() {
    for (const dispose of this.scheduledTasks) {
      dispose()
    }
    this.scheduledTasks.clear()
  }

  private scheduleTask(label: string, task: () => Promise<void>) {
    const dispose = this.ctx.setTimeout(() => {
      this.scheduledTasks.delete(dispose)
      void task().catch((error) => {
        this.logger.error(`${label}失败:`, error)
      })
    }, 0)

    this.scheduledTasks.add(dispose)
  }

  private shouldRefreshChannelInfo(
    channelKey: string,
    existingChannel: ChannelInfo | undefined,
    isDirect: boolean,
    channelId: string,
    directUserName?: string
  ) {
    if (this.channelRefreshInFlight.has(channelKey)) {
      return false
    }

    const lastRefresh = this.lastChannelRefreshAt.get(channelKey) || 0
    if (Date.now() - lastRefresh < this.CHANNEL_REFRESH_TTL_MS) {
      return false
    }

    if (isDirect) {
      return !directUserName && (!existingChannel || existingChannel.name.includes('未知'))
    }

    return !existingChannel?.guildName || existingChannel.guildName === channelId
  }

  private async refreshChannelInfo(
    session: Session,
    existingChannel: ChannelInfo | undefined,
    isDirect: boolean,
    directUserName?: string
  ) {
    const channelKey = `${session.selfId}:${session.channelId}`
    this.channelRefreshInFlight.add(channelKey)

    try {
      let guildName = existingChannel?.guildName || session.channelId

      if (!isDirect) {
        guildName = await this.resolveGuildName(session)
      }

      const finalName = this.buildChannelName(session, existingChannel, isDirect, directUserName, guildName)
      const channelInfo: ChannelInfo = {
        id: session.channelId,
        name: finalName,
        type: session.type || 0,
        channelId: session.channelId,
        guildName,
        isDirect: !!isDirect
      }

      await this.fileManager.upsertChannelInfo(session.selfId, session.channelId, channelInfo)
      this.lastChannelRefreshAt.set(channelKey, Date.now())
      this.logger.logInfo('更新频道信息到文件:', channelInfo.name)
    } finally {
      this.channelRefreshInFlight.delete(channelKey)
    }
  }

  private async resolveGuildName(session: Session): Promise<string> {
    try {
      if (session.guildId && session.bot.getGuild && typeof session.bot.getGuild === 'function') {
        const guild = await session.bot.getGuild(session.guildId)
        return guild?.name || session.channelId
      }

      if (session.guildId && session.bot.getChannel && typeof session.bot.getChannel === 'function') {
        const channel = await session.bot.getChannel(session.guildId)
        return channel?.name || session.channelId
      }
    } catch (error) {
      this.logger.logInfo('获取频道信息失败，使用频道ID作为备用:', error)
    }

    return session.channelId
  }

  private buildChannelName(
    session: Session,
    existingChannel: ChannelInfo | undefined,
    isDirect: boolean,
    directUserName: string | undefined,
    guildName: string
  ) {
    if (isDirect) {
      if (directUserName && directUserName !== session.userId) {
        return `私聊（${directUserName}）`
      }

      if (existingChannel?.name && !existingChannel.name.includes('未知')) {
        return existingChannel.name
      }

      if (session.platform && session.platform.toLowerCase().includes('sandbox')) {
        return `私聊（${session.userId}）`
      }

      return '私聊（未知用户）'
    }

    return guildName || session.channelId
  }

  private async processMediaElements(elements: h[], isUserMessage: boolean) {
    for (const el of elements) {
      if (['image', 'img', 'mface'].includes(el.type)) {
        const src = el.attrs.src || el.attrs.url || el.attrs.file
        if (src && isUserMessage) {
          try {
            await this.downloadAndCacheMedia(src, 'image')
          } catch (error) {
            this.logger.warn('缓存图片失败:', error)
          }
        }
      } else if (el.type === 'audio') {
        const src = el.attrs.src || el.attrs.url || el.attrs.file
        if (src && isUserMessage) {
          try {
            await this.downloadAndCacheMedia(src, 'media')
          } catch (error) {
            this.logger.warn('缓存语音失败:', error)
          }
        }
      }

      if (el.children?.length) {
        await this.processMediaElements(el.children, isUserMessage)
      }
    }
  }

  private async fileExists(filePath: string) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}
