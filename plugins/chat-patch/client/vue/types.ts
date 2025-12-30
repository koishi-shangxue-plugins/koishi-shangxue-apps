// 定义通用的聊天相关类型

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

export interface MessageElement {
  type: string
  attrs: Record<string, any>
  children: MessageElement[]
}

export interface QuoteInfo {
  messageId: string
  id: string
  content: string
  elements?: MessageElement[]
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
  elements?: MessageElement[]
  isBot?: boolean
  quote?: QuoteInfo
  sending?: boolean
  realId?: string
}

export interface ChatData {
  bots: Record<string, BotInfo>
  channels: Record<string, Record<string, ChannelInfo>>
  messages: Record<string, MessageInfo[]>
}

export interface PluginConfig {
  maxMessagesPerChannel: number
  keepMessagesOnClear: number
  loggerinfo: boolean
  blockedPlatforms: Array<{
    platformName: string
    exactMatch: boolean
  }>
  chatContainerHeight: number
  clearIndexedDBOnStart: boolean
}