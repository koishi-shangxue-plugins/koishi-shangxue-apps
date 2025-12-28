import { ref } from 'vue'
import { send } from '@koishijs/client'
import type { MessageInfo } from '../types'

export function useChatActions() {
  const isSending = ref(false)

  async function sendMessage(botId: string, channelId: string, content: string, images: any[]) {
    if (isSending.value) return
    isSending.value = true
    try {
      const result = await (send as any)('send-message', {
        selfId: botId,
        channelId: channelId,
        content: content,
        images: images.map(img => ({
          tempId: img.tempId,
          filename: img.filename
        }))
      })
      return result
    } finally {
      isSending.value = false
    }
  }

  async function deleteBotData(botId: string) {
    return await (send as any)('delete-bot-data', { selfId: botId })
  }

  async function deleteChannelData(botId: string, channelId: string) {
    return await (send as any)('delete-channel-data', { selfId: botId, channelId: channelId })
  }

  async function clearHistory(botId: string, channelId: string) {
    return await (send as any)('clear-channel-history', { selfId: botId, channelId: channelId })
  }

  async function togglePinBot(botId: string, pinned: boolean, pinnedBots: Set<string>) {
    if (pinned) pinnedBots.delete(botId)
    else pinnedBots.add(botId)
    await (send as any)('set-pinned-bots', { pinnedBots: Array.from(pinnedBots) })
  }

  async function togglePinChannel(botId: string, channelId: string, pinned: boolean, pinnedChannels: Set<string>) {
    const key = `${botId}:${channelId}`
    if (pinned) pinnedChannels.delete(key)
    else pinnedChannels.add(key)
    await (send as any)('set-pinned-channels', { pinnedChannels: Array.from(pinnedChannels) })
  }

  return {
    isSending,
    sendMessage,
    deleteBotData,
    deleteChannelData,
    clearHistory,
    togglePinBot,
    togglePinChannel
  }
}