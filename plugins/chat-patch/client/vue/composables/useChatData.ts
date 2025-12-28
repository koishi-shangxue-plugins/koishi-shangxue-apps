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
  function addMessage(msg: MessageInfo) {
    const key = `${msg.selfId}:${msg.channelId}`

    // 确保机器人和频道存在于列表中
    if (!chatData.value.channels[msg.selfId]) {
      chatData.value.channels[msg.selfId] = {}
    }
    if (!chatData.value.channels[msg.selfId][msg.channelId]) {
      chatData.value.channels[msg.selfId][msg.channelId] = {
        id: msg.channelId,
        name: msg.username || msg.channelId,
        type: 0
      }
    }

    if (!chatData.value.messages[key]) chatData.value.messages[key] = []

    const messages = chatData.value.messages[key]
    if (!messages.find(m => m.id === msg.id)) {
      messages.push(msg)
      messages.sort((a, b) => a.timestamp - b.timestamp)
      if (messages.length > 100) {
        chatData.value.messages[key] = messages.slice(-100)
      }
    }

    // 强制触发响应式更新
    chatData.value = { ...chatData.value }
  }

  return {
    chatData,
    pluginConfig,
    pinnedBots,
    pinnedChannels,
    bots,
    getChannels,
    getMessages,
    loadInitialData,
    loadConfig,
    addMessage
  }
}