import WebSocket, { RawData } from 'ws'
import type { HackChatLogger } from '../index'
import type { HackChatBot } from './index'
import { MessageCache } from './cache'
import { createHackChatWebSocketUrl, isRecord, parseJson } from '../utils'
import type { HackChatChat, HackChatGuildRequest, HackChatInfo, HackChatOnlineSet, HackChatUser, HackChatWarn } from '../types'

interface RoomState {
  socket: WebSocket | null
  reconnectDispose: (() => void) | null
  heartbeatDispose: (() => void) | null
  disposed: boolean
  sessionToken: string | null
  users: Map<string, HackChatUser>
  messages: MessageCache
  currentNick: string
  nickAttempt: number
  nickRetryPending: boolean
}

function cloneUser(user: HackChatUser): HackChatUser {
  return { ...user }
}

export class HackChatConnection {
  private readonly state: RoomState

  constructor(
    private readonly bot: HackChatBot,
    public readonly channel: string,
    private readonly logger: HackChatLogger,
  ) {
    this.state = {
      socket: null,
      reconnectDispose: null,
      heartbeatDispose: null,
      disposed: false,
      sessionToken: null,
      users: new Map<string, HackChatUser>(),
      messages: new MessageCache(bot.config.historyLimit),
      currentNick: bot.baseNick,
      nickAttempt: 1,
      nickRetryPending: false,
    }
  }

  get connected() {
    return this.state.socket?.readyState === WebSocket.OPEN
  }

  async start() {
    this.state.disposed = false
    await this.connect()
  }

  async stop() {
    this.state.disposed = true
    this.state.nickRetryPending = false
    this.clearReconnect()
    this.clearHeartbeat()
    this.closeSocket()
    this.state.sessionToken = null
    this.state.currentNick = this.bot.baseNick
    this.state.nickAttempt = 1
    this.state.users.clear()
    this.state.messages.clear()
  }

  sendMessage(content: string) {
    if (!this.state.socket || this.state.socket.readyState !== WebSocket.OPEN) {
      throw new Error(`房间未连接：${this.channel}`)
    }
    this.state.socket.send(JSON.stringify({
      cmd: 'chat',
      text: content,
    }))
  }

  getUser(userId: string) {
    return this.state.users.get(userId)
  }

  getUsers() {
    return [...this.state.users.values()]
  }

  getMessage(messageId: string) {
    return this.state.messages.find(messageId)
  }

  listMessages(next?: string) {
    return this.state.messages.list(next)
  }

  private async connect() {
    if (this.state.disposed || this.state.socket) return

    const socket = new WebSocket(createHackChatWebSocketUrl(this.bot.config.baseUrl))
    this.state.socket = socket

    socket.on('open', () => {
      this.logger.debug('房间已连接', this.channel)
      this.clearReconnect()
      this.startHeartbeat()
      this.bot.onRoomConnected(this.channel)
      socket.send(JSON.stringify({
        cmd: 'join',
        channel: this.channel,
        nick: this.state.currentNick,
      }))
    })

    socket.on('message', async (data: RawData) => {
      const raw = this.toRawText(data)
      this.logger.debug('收到WS报文', this.channel, raw)
      const payload = parseJson(raw)
      if (!payload) return
      await this.handlePayload(payload)
    })

    socket.on('close', () => {
      this.logger.debug('房间已断开', this.channel)
      this.closeSocket()
      this.clearHeartbeat()
      if (!this.state.disposed) {
        this.bot.onRoomDisconnected(this.channel)
        if (this.state.nickRetryPending) {
          this.state.nickRetryPending = false
          this.scheduleReconnect(250)
        } else {
          this.scheduleReconnect()
        }
      }
    })

    socket.on('error', (error) => {
      this.logger.error('WebSocket 错误', this.channel, error)
    })
  }

  private closeSocket() {
    if (!this.state.socket) return
    const socket = this.state.socket
    this.state.socket = null
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
  }

  private async handlePayload(payload: unknown) {
    if (!isRecord(payload) || typeof payload.cmd !== 'string') return
    switch (payload.cmd) {
      case 'onlineSet':
        if (this.isOnlineSet(payload)) this.handleOnlineSet(payload)
        return
      case 'onlineAdd':
        if (this.isOnlineAdd(payload)) this.handleOnlineAdd(payload)
        return
      case 'onlineRemove':
        if (this.isOnlineRemove(payload)) this.handleOnlineRemove(payload)
        return
      case 'session':
        if (typeof payload.token === 'string') this.state.sessionToken = payload.token
        return
      case 'info':
        if (this.isInfo(payload)) this.handleInfo(payload)
        return
      case 'warn':
        if (this.isWarn(payload)) this.handleWarn(payload)
        return
      case 'chat':
        if (this.isChat(payload)) this.handleChat(payload)
        return
      default:
        return
    }
  }

  private isOnlineSet(payload: unknown): payload is HackChatOnlineSet {
    return isRecord(payload)
      && Array.isArray(payload.nicks)
      && Array.isArray(payload.users)
      && typeof payload.channel === 'string'
      && typeof payload.time === 'number'
  }

  private isOnlineAdd(payload: unknown): payload is HackChatUser & { cmd: 'onlineAdd'; channel: string; time: number } {
    return isRecord(payload)
      && typeof payload.nick === 'string'
      && typeof payload.channel === 'string'
      && typeof payload.time === 'number'
  }

  private isOnlineRemove(payload: unknown): payload is { cmd: 'onlineRemove'; nick: string; userid?: number; channel: string; time: number } {
    return isRecord(payload)
      && typeof payload.nick === 'string'
      && typeof payload.channel === 'string'
      && typeof payload.time === 'number'
  }

  private isInfo(payload: unknown): payload is HackChatInfo {
    return isRecord(payload) && typeof payload.text === 'string'
  }

  private isWarn(payload: unknown): payload is HackChatWarn {
    return isRecord(payload) && typeof payload.text === 'string'
  }

  private isChat(payload: unknown): payload is HackChatChat {
    return isRecord(payload)
      && typeof payload.nick === 'string'
      && typeof payload.channel === 'string'
      && typeof payload.text === 'string'
      && typeof payload.id === 'number'
      && typeof payload.time === 'number'
  }

  private handleOnlineSet(payload: HackChatOnlineSet) {
    this.state.users.clear()
    for (const user of payload.users) {
      const copied = cloneUser(user)
      this.state.users.set(user.nick, copied)
      this.bot.upsertMember(this.channel, copied)
    }
    this.bot.onRoomOnlineSet(this.channel, payload)
  }

  private handleOnlineAdd(payload: HackChatUser & { cmd: 'onlineAdd'; channel: string; time: number }) {
    const copied = cloneUser(payload)
    this.state.users.set(payload.nick, copied)
    const existed = this.bot.upsertMember(this.channel, copied)
    this.bot.dispatchMemberEvent(this.channel, existed ? 'guild-member-updated' : 'guild-member-added', payload.nick)
  }

  private handleOnlineRemove(payload: { nick: string; userid?: number; channel: string; time: number }) {
    const existed = this.state.users.get(payload.nick)
    this.state.users.delete(payload.nick)
    if (existed) {
      this.bot.removeMember(this.channel, payload.nick)
      this.bot.dispatchMemberEvent(this.channel, 'guild-member-removed', payload.nick)
    }
  }

  private handleInfo(payload: HackChatInfo) {
    if (payload.type === 'invite' && payload.inviteChannel) {
      const request: HackChatGuildRequest = {
        id: payload.id != null ? String(payload.id) : `invite:${payload.inviteChannel}:${payload.time ?? Date.now()}`,
        channel: payload.channel || this.channel,
        inviteChannel: payload.inviteChannel,
        from: payload.from,
        text: payload.text,
        time: payload.time,
      }
      this.bot.dispatchGuildRequest(request)
      return
    }
    this.bot.dispatchNotice(this.channel, payload.text, payload.id ? String(payload.id) : `info:${Date.now()}`, payload.time)
  }

  private handleWarn(payload: HackChatWarn) {
    if (payload.text.includes('Nickname taken')) {
      this.state.nickRetryPending = true
      this.state.nickAttempt += 1
      this.state.currentNick = `${this.bot.baseNick}(${this.state.nickAttempt})`
      this.logger.warn('昵称已占用，自动切换为', this.state.currentNick)
      this.state.socket?.close()
      return
    }
    this.bot.dispatchNotice(this.channel, payload.text, payload.id ? String(payload.id) : `warn:${Date.now()}`, payload.time)
  }

  private handleChat(payload: HackChatChat) {
    const message = {
      id: String(payload.id),
      text: payload.text,
      nick: payload.nick,
      channel: payload.channel,
      time: payload.time,
      flair: payload.flair,
      color: payload.color,
      trip: payload.trip,
      level: payload.level,
      userId: payload.userid,
    }
    this.state.messages.push(message)
    const user = {
      nick: payload.nick,
      trip: payload.trip,
      uType: payload.uType,
      userid: payload.userid,
      color: payload.color,
      flair: payload.flair,
      level: payload.level,
      channel: payload.channel,
      isBot: false,
    }
    this.state.users.set(payload.nick, user)
    this.bot.upsertMember(this.channel, user)
    this.bot.dispatchChat(this.channel, message, payload.nick === this.state.currentNick)
  }

  private startHeartbeat() {
    this.clearHeartbeat()
    this.state.heartbeatDispose = this.bot.ctx.setInterval(() => {
      if (this.state.socket && this.state.socket.readyState === WebSocket.OPEN) {
        this.state.socket.ping()
      }
    }, 30_000)
  }

  private clearHeartbeat() {
    if (!this.state.heartbeatDispose) return
    this.state.heartbeatDispose()
    this.state.heartbeatDispose = null
  }

  private scheduleReconnect(delay = this.bot.config.reconnectDelay * 1000) {
    if (this.state.reconnectDispose) return
    this.state.reconnectDispose = this.bot.ctx.setTimeout(() => {
      this.state.reconnectDispose = null
      void this.connect()
    }, delay)
  }

  private clearReconnect() {
    if (!this.state.reconnectDispose) return
    this.state.reconnectDispose()
    this.state.reconnectDispose = null
  }

  private toRawText(data: RawData) {
    if (typeof data === 'string') return data
    if (Buffer.isBuffer(data)) return data.toString()
    if (Array.isArray(data)) return Buffer.concat(data).toString()
    return Buffer.from(data).toString()
  }
}
