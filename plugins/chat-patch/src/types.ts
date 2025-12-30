import { h } from 'koishi'

export interface BotInfo {
  selfId: string
  platform: string
  username: string
  avatar?: string
  status: 'online' | 'offline'
}

export interface ChannelInfo {
  id: string
  name: string
  type: number | string
  channelId?: string
  guildName?: string
  isDirect?: boolean
}

export interface QuoteInfo {
  messageId: string
  id: string
  content: string
  elements?: h[]
  user: {
    id: string
    name: string
    userId: string
    avatar?: string
    username: string
  }
  timestamp: number
}

export interface MessageInfo {
  id: string
  content: string
  userId: string
  username: string
  avatar?: string
  timestamp: number
  channelId: string
  selfId: string
  elements?: h[]
  type: 'user' | 'bot'
  guildId?: string
  guildName?: string
  platform: string
  quote?: QuoteInfo
  isDirect?: boolean
  sending?: boolean
  realId?: string
}

export interface ChatData {
  bots: Record<string, BotInfo>
  channels: Record<string, Record<string, ChannelInfo>>
  messages: Record<string, MessageInfo[]>
  pinnedBots: string[]
  pinnedChannels: string[]
  lastSaveTime?: number
}