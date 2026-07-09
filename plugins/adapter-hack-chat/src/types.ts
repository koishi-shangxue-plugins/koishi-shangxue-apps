export interface HackChatJoin {
  cmd: 'join'
  channel: string
  nick: string
}

export interface HackChatSession {
  cmd: 'session'
  restored: boolean
  token: string
  channels: string[]
  time: number
}

export interface HackChatInfo {
  cmd: 'info'
  text: string
  id?: number
  channel?: string
  time?: number
  type?: string
  from?: string
  to?: number
  inviteChannel?: string
}

export interface HackChatWarn {
  cmd: 'warn'
  text: string
  id?: number
  channel?: string | false
  time?: number
}

export interface HackChatUser {
  isme?: boolean
  isBot?: boolean
  nick: string
  trip?: string
  uType?: string
  hash?: string
  level?: number
  userid?: number
  color?: string
  flair?: string | false
  channel?: string
}

export interface HackChatOnlineSet {
  cmd: 'onlineSet'
  nicks: string[]
  users: HackChatUser[]
  channel: string
  time: number
}

export interface HackChatChat {
  cmd: 'chat'
  nick: string
  uType?: string
  userid?: number
  channel: string
  text: string
  level?: number
  flair?: string | false
  id: number
  trip?: string
  color?: string
  time: number
}

export interface HackChatGuildRequest {
  id: string
  channel: string
  inviteChannel: string
  from?: string
  text?: string
  time?: number
}

export type HackChatPayload =
  | HackChatJoin
  | HackChatSession
  | HackChatInfo
  | HackChatWarn
  | HackChatOnlineSet
  | HackChatChat
  | Record<string, unknown>

export interface HackChatCachedMessage {
  id: string
  text: string
  nick: string
  channel: string
  time: number
  flair?: string | false
  color?: string
  trip?: string
  level?: number
  userId?: number
  quoteId?: string
}

export interface HackChatMessageEntry {
  message: HackChatCachedMessage
  user: HackChatUser
}
