import { ref, computed, onMounted, nextTick, onUnmounted, reactive } from 'vue'
import { receive } from '@koishijs/client'
import { useChatData } from './composables/useChatData'
import { useChatActions } from './composables/useChatActions'
import { useImageCache } from './composables/useImageCache'
import { ElMessage } from 'element-plus'

export function useChatLogic() {
  const {
    bots, pinnedBots, pinnedChannels, getChannels, getMessages,
    loadInitialData, loadConfig, addMessage, loadHistory, getPagination
  } = useChatData()

  const {
    isSending, sendMessage, deleteBotData, deleteChannelData,
    togglePinBot, togglePinChannel
  } = useChatActions()

  const { getCachedImageUrl, cacheImage } = useImageCache()

  // 状态管理
  const selectedBot = ref('')
  const selectedChannel = ref('')
  const inputText = ref('')
  const uploadedImages = ref<any[]>([])
  const scrollRef = ref<any>(null)
  const isMobile = ref(false)
  const mobileView = ref<'bots' | 'channels' | 'messages' | 'forward' | 'image'>('bots')
  const isLoadingHistory = ref(false)

  // 合并转发详情状态
  const forwardData = reactive({
    messages: [] as any[]
  })

  // 图片查看器状态
  const imageViewer = reactive({
    url: ''
  })

  // 计算属性
  const currentChannels = computed(() => getChannels(selectedBot.value))
  const currentMessages = computed(() => getMessages(selectedBot.value, selectedChannel.value))
  const currentChannelName = computed(() => {
    const c = currentChannels.value.find(i => i.id === selectedChannel.value)
    return c ? c.name : ''
  })

  // 方法
  const selectBot = (id: string) => {
    selectedBot.value = id
    selectedChannel.value = ''
    if (isMobile.value) mobileView.value = 'channels'
  }

  const selectChannel = async (id: string) => {
    selectedChannel.value = id
    if (isMobile.value) mobileView.value = 'messages'

    // 如果没有消息，加载第一页
    if (currentMessages.value.length === 0) {
      await loadHistory(selectedBot.value, id)
    }

    await nextTick()
    scrollToBottom()
  }

  const goBack = () => {
    if (mobileView.value === 'image') mobileView.value = 'messages'
    else if (mobileView.value === 'forward') mobileView.value = 'messages'
    else if (mobileView.value === 'messages') mobileView.value = 'channels'
    else if (mobileView.value === 'channels') mobileView.value = 'bots'
  }

  const showForward = (elements: any[]) => {
    forwardData.messages = elements.filter(e => e.type === 'message')
    mobileView.value = 'forward'
  }

  const openImageViewer = (url: string) => {
    imageViewer.url = url
    mobileView.value = 'image'
  }

  const downloadImage = (url: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-image-${Date.now()}.png`
    a.click()
  }

  const scrollToBottom = () => {
    if (scrollRef.value) {
      const wrap = scrollRef.value.wrapRef
      if (wrap) wrap.scrollTop = wrap.scrollHeight
    }
  }

  const handleScroll = async ({ scrollTop }: { scrollTop: number }) => {
    if (scrollTop <= 10 && !isLoadingHistory.value && selectedBot.value && selectedChannel.value) {
      const pagination = getPagination(selectedBot.value, selectedChannel.value)
      if (pagination.hasMore) {
        isLoadingHistory.value = true
        const wrap = scrollRef.value?.wrapRef
        const oldHeight = wrap?.scrollHeight || 0

        await loadHistory(selectedBot.value, selectedChannel.value)

        await nextTick()
        // 保持滚动位置
        if (wrap) {
          wrap.scrollTop = wrap.scrollHeight - oldHeight
        }
        isLoadingHistory.value = false
      }
    }
  }

  const handleSend = async () => {
    if (!selectedBot.value || !selectedChannel.value) return
    if (!inputText.value.trim() && !uploadedImages.value.length) return

    const res = await sendMessage(selectedBot.value, selectedChannel.value, inputText.value, uploadedImages.value)
    if (res?.success) {
      inputText.value = ''
      uploadedImages.value = []
      scrollToBottom()
    } else {
      ElMessage.error(res?.error || '发送失败')
    }
  }

  const checkMobile = () => {
    isMobile.value = window.innerWidth <= 768
  }

  // 生命周期
  let dispose: any[] = []

  onMounted(async () => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
    await loadConfig()
    await loadInitialData()

    const d1 = receive('chat-message-event', (ev: any) => {
      addMessage(ev)
      if (ev.selfId === selectedBot.value && ev.channelId === selectedChannel.value) {
        // 只有在底部附近才自动滚动
        const wrap = scrollRef.value?.wrapRef
        if (wrap && wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 100) {
          nextTick(scrollToBottom)
        }
      }
    })
    if (typeof d1 === 'function') dispose.push(d1)

    const d2 = receive('bot-message-sent-event', (ev: any) => {
      addMessage(ev)
      if (ev.selfId === selectedBot.value && ev.channelId === selectedChannel.value) {
        nextTick(scrollToBottom)
      }
    })
    if (typeof d2 === 'function') dispose.push(d2)

    const d3 = receive('chat-bot-message-event', (ev: any) => {
      addMessage(ev)
      if (ev.selfId === selectedBot.value && ev.channelId === selectedChannel.value) {
        nextTick(scrollToBottom)
      }
    })
    if (typeof d3 === 'function') dispose.push(d3)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', checkMobile)
    dispose.forEach(d => d?.())
  })

  return {
    // 数据
    bots,
    selectedBot,
    selectedChannel,
    currentChannels,
    currentMessages,
    currentChannelName,
    inputText,
    uploadedImages,
    isSending,
    pinnedBots,
    pinnedChannels,
    scrollRef,
    isMobile,
    mobileView,
    forwardData,
    imageViewer,
    isLoadingHistory,

    // 方法
    selectBot,
    selectChannel,
    handleSend,
    togglePinBot,
    togglePinChannel,
    deleteBotData,
    deleteChannelData,
    getCachedImageUrl,
    cacheImage,
    getMessages,
    goBack,
    showForward,
    openImageViewer,
    downloadImage,
    handleScroll
  }
}