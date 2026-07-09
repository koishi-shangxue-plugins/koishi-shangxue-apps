import { Bot, Context, Fragment, Universal, h } from 'koishi'
import type { HackChatLogger } from '../index'
import { createHackChatLogger } from '../index'
import type { Config } from '../config'
import type { HackChatCachedMessage, HackChatGuildRequest, HackChatOnlineSet, HackChatUser } from '../types'
import { createHackChatAvatarUrl } from '../utils'
import { HackChatConnection } from './connection'
import { HackChatMessageEncoder } from './message'

interface RoomSnapshot {
  connection: HackChatConnection
  temporary?: boolean
}

function avatarUrl(bot: HackChatBot) {
  return createHackChatAvatarUrl(bot.config.baseUrl)
}

function getUserId(user: HackChatUser | HackChatCachedMessage): string {
  if ('userid' in user && typeof user.userid === 'number') return String(user.userid)
  return user.nick
}

function toUserRecord(user: HackChatUser | HackChatCachedMessage, avatar: string): Universal.User {
  return {
    id: getUserId(user),
    name: user.nick,
    nick: user.nick,
    avatar,
  }
}

function buildMemberSession(selfId: string, platform: string, channel: string, type: 'guild-member-added' | 'guild-member-updated' | 'guild-member-removed', user: HackChatUser, timestamp: number, baseUrl: string) {
  const avatar = createHackChatAvatarUrl(baseUrl)
  const userId = getUserId(user)
  return {
    type,
    platform,
    selfId,
    timestamp,
    guild: {
      id: channel,
      name: channel,
    },
    channel: {
      id: channel,
      name: channel,
      type: Universal.Channel.Type.TEXT,
    },
    user: {
      id: userId,
      name: user.nick,
      username: user.nick,
      nickname: user.nick,
      avatar,
    },
    member: {
      name: user.nick,
      nick: user.nick,
      user: {
        id: userId,
        name: user.nick,
        username: user.nick,
        nickname: user.nick,
        avatar,
      },
    },
  }
}

function buildGuildRequestSession(selfId: string, platform: string, request: HackChatGuildRequest, baseUrl: string) {
  const avatar = createHackChatAvatarUrl(baseUrl)
  return {
    type: 'guild-request',
    platform,
    selfId,
    timestamp: request.time ?? Date.now(),
    messageId: request.id,
    guild: {
      id: request.inviteChannel,
      name: request.inviteChannel,
    },
    channel: {
      id: request.inviteChannel,
      name: request.inviteChannel,
      type: Universal.Channel.Type.TEXT,
    },
    user: {
      id: request.from ?? request.inviteChannel,
      name: request.from ?? request.inviteChannel,
      username: request.from ?? request.inviteChannel,
      nickname: request.from ?? request.inviteChannel,
      avatar,
    },
  }
}

export class HackChatBot extends Bot<Context, Config> {
  static MessageEncoder = HackChatMessageEncoder

  readonly log: HackChatLogger
  readonly baseNick: string
  private readonly rooms = new Map<string, RoomSnapshot>()
  private readonly members = new Map<string, Map<string, HackChatUser>>()
  private readonly guildRequests = new Map<string, HackChatGuildRequest>()
  private emptyRoomDispose: (() => void) | null = null

  constructor(ctx: Context, config: Config, logger?: HackChatLogger) {
    super(ctx, config, 'hack-chat')
    this.baseNick = config.nick
    this.log = logger ?? createHackChatLogger(ctx, config, 'hack-chat')
    this.selfId = config.nick
    this.user = {
      id: this.selfId,
      name: this.selfId,
      username: this.selfId,
      nickname: this.selfId,
      avatar: avatarUrl(this),
    }
  }

  async start() {
    if (!this.config.rooms.length) {
      this.scheduleEmptyRoomDispose()
      return
    }
    this.clearEmptyRoomDispose()
    this.status = Universal.Status.CONNECT
    await Promise.all(this.config.rooms.map((room) => this.startRoom(room.channel)))
  }

  async stop() {
    this.clearEmptyRoomDispose()
    await Promise.all([...this.rooms.keys()].map((channel) => this.stopRoom(channel)))
    this.guildRequests.clear()
    await super.stop()
  }

  async startRoom(channel: string, temporary = false) {
    const room = this.ensureRoom(channel, temporary)
    await room.connection.start()
  }

  async stopRoom(channel: string) {
    const room = this.rooms.get(channel)
    if (!room) return
    this.members.delete(channel)
    await room.connection.stop()
    this.rooms.delete(channel)
  }

  async handleGuildRequest(messageId: string, approve: boolean, comment?: string) {
    const request = this.guildRequests.get(messageId)
    if (!request) return
    if (!approve) {
      //  this.log.warn('拒绝入群邀请', request.inviteChannel, comment ?? '')
      return
    }
    await this.startRoom(request.inviteChannel, true)
    this.dispatch(this.session({
      type: 'guild-added',
      platform: this.platform,
      selfId: this.selfId,
      timestamp: request.time ?? Date.now(),
      guild: {
        id: request.inviteChannel,
        name: request.inviteChannel,
      },
    }))
  }

  async sendMessage(channelId: string, content: Fragment): Promise<string[]> {
    return super.sendMessage(channelId, content)
  }

  async sendPrivateMessage(): Promise<string[]> {
    throw new Error('hack.chat 不支持私聊')
  }

  async getGuildList(): Promise<Universal.List<Universal.Guild>> {
    const names = new Set<string>()
    for (const room of this.config.rooms) names.add(room.channel)
    for (const channel of this.rooms.keys()) names.add(channel)
    return {
      data: [...names].map((name) => ({
        id: name,
        name,
        avatar: avatarUrl(this),
      })),
    }
  }

  async getGuild(guildId: string): Promise<Universal.Guild> {
    return {
      id: guildId,
      name: guildId,
      avatar: avatarUrl(this),
    }
  }

  async getChannel(channelId: string): Promise<Universal.Channel> {
    return {
      id: channelId,
      name: channelId,
      type: Universal.Channel.Type.TEXT,
    }
  }

  async getChannelList(guildId: string): Promise<Universal.List<Universal.Channel>> {
    return {
      data: [{
        id: guildId,
        name: guildId,
        type: Universal.Channel.Type.TEXT,
      }],
    }
  }

  async getUser(userId: string): Promise<Universal.User> {
    const user = this.findUser(userId)
    if (!user) {
      return {
        id: userId,
        name: userId,
        avatar: avatarUrl(this),
      }
    }
    return toUserRecord(user, avatarUrl(this))
  }

  async getGuildMember(guildId: string, userId: string): Promise<Universal.GuildMember> {
    const user = this.findUserInRoom(guildId, userId)
    return {
      user: user ? toUserRecord(user, avatarUrl(this)) : await this.getUser(userId),
      name: user?.nick,
      nick: user?.nick,
    }
  }

  async getGuildMemberList(guildId: string, next?: string): Promise<Universal.List<Universal.GuildMember>> {
    const members = this.members.get(guildId)
    if (!members) return { data: [] }
    const list = [...members.values()]
    const start = next ? Math.max(list.findIndex((user) => user.nick === next) + 1, 0) : 0
    return {
      data: list.slice(start).map((user) => ({
        user: toUserRecord(user, avatarUrl(this)),
        name: user.nick,
        nick: user.nick,
      })),
    }
  }

  async getMessage(channelId: string, messageId: string): Promise<Universal.Message> {
    const room = this.rooms.get(channelId)
    const message = room?.connection.getMessage(messageId)
    if (!message) {
      return {
        id: messageId,
        content: '',
        channel: { id: channelId, type: Universal.Channel.Type.TEXT },
      }
    }
    return this.toUniversalMessage(message)
  }

  async getMessageList(channelId: string, next?: string): Promise<Universal.List<Universal.Message>> {
    const room = this.rooms.get(channelId)
    if (!room) return { data: [] }
    return {
      data: room.connection.listMessages(next).map((message) => this.toUniversalMessage(message)),
    }
  }

  onRoomConnected(channel: string) {
    this.refreshStatus()
    this.log.debug('房间在线', channel)
  }

  onRoomDisconnected(channel: string) {
    this.refreshStatus()
    this.log.debug('房间离线', channel)
  }

  onRoomOnlineSet(channel: string, payload: HackChatOnlineSet) {
    this.syncMembers(channel, payload.users)
    //  this.log.debug('收到在线列表', channel, payload.users.length)
  }

  dispatchMemberEvent(channel: string, type: 'guild-member-added' | 'guild-member-updated' | 'guild-member-removed', nick: string) {
    const user = this.findUserInRoom(channel, nick)
    if (!user && type !== 'guild-member-removed') return
    const session = this.session(buildMemberSession(this.selfId, this.platform, channel, type, user || { nick }, Date.now(), this.config.baseUrl))
    this.dispatch(session)
  }

  dispatchGuildRequest(request: HackChatGuildRequest) {
    this.guildRequests.set(request.id, request)
    const session = this.session(buildGuildRequestSession(this.selfId, this.platform, request, this.config.baseUrl))
    this.dispatch(session)
    if (this.config.autoAcceptGuildRequest) {
      void this.handleGuildRequest(request.id, true)
    }
  }

  syncIdentity(nick: string) {
    this.selfId = nick
    if (this.user) {
      this.user.id = nick
      this.user.name = nick
      this.user.avatar = avatarUrl(this)
    }
  }

  async sendRoomText(channelId: string, content: string): Promise<void> {
    const room = this.ensureRoom(channelId, false)
    if (!room.connection.connected) {
      await room.connection.start()
    }
    room.connection.sendMessage(content)
  }

  dispatchNotice(channel: string, text: string, messageId: string, timestamp?: number) {
    const session = this.session({
      type: 'notice',
      platform: this.platform,
      selfId: this.selfId,
      timestamp: timestamp ?? Date.now(),
      channel: {
        id: channel,
        name: channel,
        type: Universal.Channel.Type.TEXT,
      },
      guild: {
        id: channel,
        name: channel,
      },
      message: {
        id: messageId,
        content: text,
      },
    })
    session.content = text
    this.dispatch(session)
  }

  dispatchChat(channel: string, message: HackChatCachedMessage, selfMessage: boolean) {
    const elements = this.parseMessageElements(channel, message.text)
    const session = this.session({
      type: 'message',
      platform: this.platform,
      selfId: this.selfId,
      timestamp: message.time,
      user: {
        id: message.userId != null ? String(message.userId) : message.nick,
        name: message.nick,
        username: message.nick,
        nickname: message.nick,
        avatar: avatarUrl(this),
      },
      channel: {
        id: channel,
        name: channel,
        type: Universal.Channel.Type.TEXT,
      },
      guild: {
        id: channel,
        name: channel,
      },
      message: {
        id: message.id,
        content: message.text,
      },
    })
    session.elements = elements
    session.content = message.text
    session.isDirect = false
    if (selfMessage) {
      session.subtype = 'self'
    }
    this.dispatch(session)
  }

  handleQuote(channel: string, quoteId: string | undefined, children: Fragment) {
    const quoted = quoteId ? this.getMessage(channel, quoteId) : Promise.resolve(null)
    return quoted.then(async (message) => {
      if (!message || !message.content) return children
      const quotedText = message.content.split('\n').map((line) => `> ${line}`).join('\n')
      const content = typeof children === 'string' ? children : h.normalize(children).map((element) => typeof element === 'string' ? element : element.toString()).join('')
      return `${quotedText}\n\n${content}`
    })
  }

  private ensureRoom(channel: string, temporary: boolean) {
    const existed = this.rooms.get(channel)
    if (existed) {
      existed.temporary ||= temporary
      return existed
    }
    const connection = new HackChatConnection(this, channel, this.log.child(channel))
    const room = { connection, temporary }
    this.rooms.set(channel, room)
    return room
  }

  private clearEmptyRoomDispose() {
    if (!this.emptyRoomDispose) return
    this.emptyRoomDispose()
    this.emptyRoomDispose = null
  }

  private scheduleEmptyRoomDispose() {
    if (this.emptyRoomDispose) return
    this.emptyRoomDispose = this.ctx.setTimeout(() => {
      this.emptyRoomDispose = null
      this.log.warn('未配置任何房间，插件将自动关闭')
      this.ctx.scope.dispose()
    }, 3000)
  }

  private refreshStatus() {
    const active = [...this.rooms.values()].some((room) => room.connection.connected)
    if (active) {
      this.online()
    } else {
      this.offline()
    }
  }

  private syncMembers(channel: string, users: HackChatUser[]) {
    const next = new Map<string, HackChatUser>()
    for (const user of users) {
      next.set(user.nick, { ...user })
    }
    this.members.set(channel, next)
  }

  upsertMember(channel: string, user: HackChatUser) {
    const members = this.members.get(channel) ?? new Map<string, HackChatUser>()
    const existed = members.has(user.nick)
    members.set(user.nick, { ...user })
    this.members.set(channel, members)
    return existed
  }

  removeMember(channel: string, nick: string) {
    const members = this.members.get(channel)
    if (!members) return false
    const existed = members.delete(nick)
    return existed
  }

  private findUser(userId: string) {
    for (const room of this.members.values()) {
      for (const user of room.values()) {
        if (user.nick === userId) return user
        if (user.userid != null && String(user.userid) === userId) return user
      }
    }
    return undefined
  }

  private findUserInRoom(guildId: string, userId: string) {
    const room = this.members.get(guildId)
    if (!room) return undefined
    for (const user of room.values()) {
      if (user.nick === userId) return user
      if (user.userid != null && String(user.userid) === userId) return user
    }
    return undefined
  }

  private toUniversalMessage(message: HackChatCachedMessage): Universal.Message {
    return {
      id: message.id,
      content: message.text,
      channel: {
        id: message.channel,
        name: message.channel,
        type: Universal.Channel.Type.TEXT,
      },
      user: {
        id: message.userId != null ? String(message.userId) : message.nick,
        name: message.nick,
        avatar: avatarUrl(this),
      },
      timestamp: message.time,
    }
  }

  private parseMessageElements(channel: string, text: string) {
    const users = [...(this.members.get(channel)?.values() ?? [])]
    const names = new Set(users.map((user) => user.nick))
    const elements: h[] = []
    const pattern = /(^|[\s])@([^\s@]+)(?=\s|$)/g
    let index = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
      const prefix = match[1]
      const name = match[2]
      const mentionStart = match.index + prefix.length
      const mentionEnd = mentionStart + name.length + 1
      if (mentionStart > index) {
        elements.push(h.text(text.slice(index, mentionStart)))
      }
      if (names.has(name)) {
        elements.push(h.at(name, { name }))
      } else {
        elements.push(h.text(`@${name}`))
      }
      index = mentionEnd
    }
    if (index < text.length) {
      elements.push(h.text(text.slice(index)))
    }
    if (!elements.length) {
      elements.push(h.text(text))
    }
    return elements
  }
}
