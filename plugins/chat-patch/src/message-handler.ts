import { BotInfo, ChannelInfo, MessageInfo, QuoteInfo } from './types'
import { Context, Session, h, Logger } from 'koishi'
import { FileManager } from './file-manager'
import { Config } from './config'
import { Utils } from './utils'
import { } from '@koishijs/plugin-console'

export class MessageHandler {
  private logger: Logger
  private utils: Utils

  private correctChannelIds: Map<string, string> = new Map()

  constructor(
    private ctx: Context,
    private config: Config,
    private fileManager: FileManager
  ) {
    this.logger = ctx.logger('chat-patch')
    this.utils = new Utils(config)
  }

  recordUserMessage(session: Session, timestamp: number) {

    setImmediate(() => {
      this.processUserMessage(session, timestamp).catch(error => {
        this.logger.error('记录用户消息失败:', error)
      })
    })
  }

  recordBotMessage(session: Session, timestamp: number) {

    setImmediate(() => {
      this.processBotMessage(session, timestamp).catch(error => {
        this.logger.error('记录机器人消息失败:', error)
      })
    })
  }

  setCorrectChannelId(selfId: string, channelId: string) {
    this.correctChannelIds.set(selfId, channelId)
    this.logInfo('设置正确的 channelId:', { selfId, channelId })
  }

  getCorrectChannelId(selfId: string): string | undefined {
    return this.correctChannelIds.get(selfId)
  }

  updateBotInfoToFile(session: Session) {

    setImmediate(() => {
      try {
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
      } catch (error) {
        this.logger.error('更新机器人信息失败:', error)
      }
    })
  }

  updateChannelInfoToFile(session: Session): string {
    const isDirect = session.isDirect || session.channelId?.includes('private')
    const directUserName = session.username || session.event?.user?.name || session.userId

    const data = this.fileManager.readChatDataFromFile()
    const existingChannel = data.channels[session.selfId]?.[session.channelId]

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

    setImmediate(async () => {
      try {
        let guildName = session.channelId

        if (!isDirect) {
          try {

            if (session.guildId && session.bot.getGuild && typeof session.bot.getGuild === 'function') {
              const guild = await session.bot.getGuild(session.guildId)
              guildName = guild?.name || session.channelId
            } else if (session.guildId && !session.bot.getGuild && session.bot.getChannel && typeof session.bot.getChannel === 'function') {
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

        const freshData = this.fileManager.readChatDataFromFile()
        if (!freshData.channels[session.selfId]) {
          freshData.channels[session.selfId] = {}
        }

        const existingChannel = freshData.channels[session.selfId][session.channelId]

        let finalName: string
        if (isDirect) {
          if (directUserName && directUserName !== session.userId) {
            finalName = `私聊（${directUserName}）`
          } else if (existingChannel?.name && !existingChannel.name.includes('未知')) {
            finalName = existingChannel.name
          } else if (session.platform && session.platform.toLowerCase().includes('sandbox')) {
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

        if (existingChannel && existingChannel.name !== finalName) {
          this.logInfo('更新频道名称:', {
            channelId: session.channelId,
            oldName: existingChannel.name,
            newName: finalName
          })
        }

        freshData.channels[session.selfId][session.channelId] = channelInfo
        this.fileManager.writeChatDataToFile(freshData)
        this.logInfo('更新频道信息到文件:', channelInfo.name)
      } catch (error) {
        this.logger.error('异步更新频道信息失败:', error)
      }
    })

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

      const dir = require('node:path').join(this.ctx.baseDir, 'data', 'chat-patch', 'persist-media', folder)
      if (!require('node:fs').existsSync(dir)) {
        require('node:fs').mkdirSync(dir, { recursive: true })
      }

      const crypto = require('node:crypto')
      const hash = crypto.createHash('md5').update(url).digest('hex')
      const ext = require('node:path').extname(new URL(url).pathname) || (type === 'image' ? '.jpg' : '.mp4')
      const filename = `${hash}${ext}`
      const filePath = require('node:path').join(dir, filename)

      if (!require('node:fs').existsSync(filePath)) {
        const buffer = await this.ctx.http.get(url, { responseType: 'arraybuffer' })
        require('node:fs').writeFileSync(filePath, Buffer.from(buffer))
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

    setImmediate(async () => {
      try {
        for (const el of elements) {
          if (['image', 'img', 'mface'].includes(el.type)) {
            const src = el.attrs.src || el.attrs.url || el.attrs.file
            if (src && isUserMessage) {

              this.downloadAndCacheMedia(src, 'image').catch(e => {
                this.logger.warn('缓存图片失败:', e)
              })
            }
          } else if (el.type === 'audio') {
            const src = el.attrs.src || el.attrs.url || el.attrs.file
            if (src && isUserMessage) {

              this.downloadAndCacheMedia(src, 'media').catch(e => {
                this.logger.warn('缓存语音失败:', e)
              })
            }
          }

          if (el.children) this.processMediaElementsAsync(el.children, isUserMessage)
        }
      } catch (error) {
        this.logger.error('处理媒体元素失败:', error)
      }
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
        const data = this.fileManager.readChatDataFromFile()
        const channelKey = `${session.selfId}:${finalChannelId}`
        const quotedMsg = data.messages[channelKey]?.find(m => m.id === quoteId)

        if (quotedMsg) {
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

  private logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      (this.logger.info as (...args: any[]) => void)(...args)
    }
  }
}
