import { ref, computed, onMounted, nextTick, onUnmounted, reactive } from 'vue'
import { receive, send } from '@koishijs/client'
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
  const forwardDialogVisible = ref(false)

  // 图片查看器状态
  const imageViewer = reactive({
    url: ''
  })
  const imageViewerVisible = ref(false)

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
    if (isMobile.value) {
      mobileView.value = 'forward'
    } else {
      forwardDialogVisible.value = true
    }
  }

  const openImageViewer = (url: string) => {
    imageViewer.url = url
    if (isMobile.value) {
      mobileView.value = 'image'
    } else {
      imageViewerVisible.value = true
    }
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

  // 复读消息 (+1)
  const repeatMessage = async (msg: any) => {
    if (!selectedBot.value || !selectedChannel.value) return

    // 提取消息内容，如果是富媒体则需要特殊处理，这里简单复读文本内容
    const res = await sendMessage(selectedBot.value, selectedChannel.value, msg.content, [])
    if (res?.success) {
      scrollToBottom()
    } else {
      ElMessage.error(res?.error || '复读失败')
    }
  }

  // 处理粘贴图片
  const handlePaste = async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          // 模拟文件上传逻辑
          const reader = new FileReader()
          reader.onload = async (e) => {
            const base64 = e.target?.result as string
            const res = await (send as any)('upload-image', {
              file: base64,
              filename: `pasted_image_${Date.now()}.png`,
              mimeType: file.type
            })
            if (res.success) {
              uploadedImages.value.push({
                tempId: res.tempId,
                preview: URL.createObjectURL(file),
                filename: `pasted_image_${Date.now()}.png`
              })
            }
          }
          reader.readAsDataURL(file)
        }
      }
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
    forwardDialogVisible,
    imageViewerVisible,

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
    handleScroll,
    repeatMessage,
    handlePaste
  }
}