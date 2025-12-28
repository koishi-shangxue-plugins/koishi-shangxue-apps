import { ref, computed } from 'vue'
import { receive, send } from '@koishijs/client'
import type { ChatData, BotInfo, ChannelInfo, MessageInfo, PluginConfig } from '../types'

export function useChatData() {
  const chatData = ref<ChatData>({
    bots: {},
    channels: {},
    messages: {}
  })

  const pluginConfig = ref<PluginConfig>({
    maxMessagesPerChannel: 1000,
    keepMessagesOnClear: 50,
    loggerinfo: false,
    blockedPlatforms: [],
    chatContainerHeight: 80,
    clearIndexedDBOnStart: true
  })

  const pinnedBots = ref<Set<string>>(new Set())
  const pinnedChannels = ref<Set<string>>(new Set())

  // 记录每个频道的分页状态
  const channelPagination = ref<Record<string, { offset: number, hasMore: boolean }>>({})

  // 计算属性
  const bots = computed(() => {
    return Object.values(chatData.value.bots).sort((a, b) => {
      const aPinned = pinnedBots.value.has(a.selfId)
      const bPinned = pinnedBots.value.has(b.selfId)
      return aPinned === bPinned ? 0 : aPinned ? -1 : 1
    })
  })

  const getChannels = (botId: string) => {
    if (!botId || !chatData.value.channels[botId]) return []
    return Object.values(chatData.value.channels[botId]).sort((a, b) => {
      const aPinned = pinnedChannels.value.has(`${botId}:${a.id}`)
      const bPinned = pinnedChannels.value.has(`${botId}:${b.id}`)
      return aPinned === bPinned ? 0 : aPinned ? -1 : 1
    })
  }

  const getMessages = (botId: string, channelId: string) => {
    const key = `${botId}:${channelId}`
    return chatData.value.messages[key] || []
  }

  const getPagination = (botId: string, channelId: string) => {
    const key = `${botId}:${channelId}`
    return channelPagination.value[key] || { offset: 0, hasMore: true }
  }

  // 加载数据
  async function loadInitialData() {
    const result = await (send as any)('get-chat-data')
    if (result.success && result.data) {
      chatData.value = {
        bots: result.data.bots || {},
        channels: result.data.channels || {},
        messages: result.data.messages || {}
      }
      pinnedBots.value = new Set(result.data.pinnedBots || [])
      pinnedChannels.value = new Set(result.data.pinnedChannels || [])
    }
  }

  async function loadConfig() {
    const result = await (send as any)('get-plugin-config')
    if (result.success && result.config) {
      pluginConfig.value = result.config
    }
  }

  // 消息处理
  function addMessage(msg: any) {
    const selfId = msg.selfId
    const channelId = msg.channelId
    const key = `${selfId}:${channelId}`

    // 1. 确保机器人存在
    if (!chatData.value.bots[selfId]) {
      chatData.value.bots[selfId] = {
        selfId,
        platform: msg.platform || 'unknown',
        username: msg.bot?.name || `Bot-${selfId}`,
        avatar: msg.bot?.avatar,
        status: 'online'
      }
    }

    // 2. 确保频道存在
    if (!chatData.value.channels[selfId]) {
      chatData.value.channels[selfId] = {}
    }
    if (!chatData.value.channels[selfId][channelId]) {
      chatData.value.channels[selfId][channelId] = {
        id: channelId,
        name: msg.guildName || msg.username || channelId,
        type: msg.channelType || 0
      }
    }

    // 3. 消息去重与添加
    if (!chatData.value.messages[key]) chatData.value.messages[key] = []

    const messages = chatData.value.messages[key]
    // 严格去重：检查 ID，如果是机器人发送的临时消息，则通过内容和时间戳近似匹配
    const isDuplicate = messages.some(m => {
      if (m.id === msg.messageId || m.id === msg.id) return true
      // 针对机器人发送消息的特殊去重逻辑
      if ((msg.type === 'bot-message' || msg.type === 'bot-message-sent') && m.isBot && Math.abs(m.timestamp - msg.timestamp) < 2000 && m.content === msg.content) return true
      return false
    })

    if (!isDuplicate) {
      const newMsg: MessageInfo = {
        id: msg.messageId || msg.id,
        content: msg.content,
        userId: msg.userId,
        username: msg.username,
        avatar: msg.avatar,
        timestamp: msg.timestamp,
        channelId: channelId,
        selfId: selfId,
        elements: msg.elements,
        isBot: msg.isBot || msg.type === 'bot-message' || msg.type === 'bot',
        quote: msg.quote
      }
      messages.push(newMsg)
      messages.sort((a, b) => a.timestamp - b.timestamp)
    }

    // 强制触发响应式更新，确保列表实时刷新
    chatData.value = { ...chatData.value }
  }

  async function loadHistory(botId: string, channelId: string, limit = 50) {
    const key = `${botId}:${channelId}`
    const pagination = getPagination(botId, channelId)
    if (!pagination.hasMore) return

    const result = await (send as any)('get-history-messages', {
      selfId: botId,
      channelId: channelId,
      limit,
      offset: pagination.offset
    })

    if (result.success && result.messages) {
      if (!chatData.value.messages[key]) chatData.value.messages[key] = []
      const existing = chatData.value.messages[key]

      // 合并并去重
      const newMsgs = result.messages.filter((m: any) => !existing.find(e => e.id === m.id))
      chatData.value.messages[key] = [...newMsgs, ...existing].sort((a, b) => a.timestamp - b.timestamp)

      channelPagination.value[key] = {
        offset: pagination.offset + result.messages.length,
        hasMore: result.messages.length >= limit && result.total > (pagination.offset + result.messages.length)
      }

      chatData.value = { ...chatData.value }
      return result.messages.length
    }
    return 0
  }

  return {
    chatData,
    pluginConfig,
    pinnedBots,
    pinnedChannels,
    bots,
    getChannels,
    getMessages,
    getPagination,
    loadInitialData,
    loadConfig,
    addMessage,
    loadHistory
  }
}