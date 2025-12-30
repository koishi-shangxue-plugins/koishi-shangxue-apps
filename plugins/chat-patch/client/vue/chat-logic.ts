import { ref, computed, onMounted, nextTick, onUnmounted, reactive, watch } from 'vue'
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
  const menu = ref({ show: false, x: 0, y: 0, type: '', id: '', isPinned: false, hasMedia: false })
  const selectedBot = ref('')
  const selectedChannel = ref('')
  const inputText = ref('')
  const uploadedImages = ref<any[]>([])
  const scrollRef = ref<any>(null)
  const inputRef = ref<any>(null)
  const isMobile = ref(false)
  const viewportHeight = ref('100%')
  const mobileView = ref<'bots' | 'channels' | 'messages' | 'forward' | 'image' | 'profile' | 'raw'>('bots')
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
  const imageZoom = ref(1)

  // 原始消息查看状态
  const rawMessage = reactive({
    content: ''
  })
  const rawMessageVisible = ref(false)

  // 引用/回复状态
  const replyingTo = ref<any>(null)

  // 用户资料状态
  const userProfile = reactive({
    data: null as any
  })
  const userProfileVisible = ref(false)

  // 计算属性
  const currentChannels = computed(() => getChannels(selectedBot.value))
  const currentMessages = computed(() => getMessages(selectedBot.value, selectedChannel.value))
  const currentChannelName = computed(() => {
    const c = currentChannels.value.find(i => i.id === selectedChannel.value)
    return c ? c.name : ''
  })
  const selectedBotPlatform = computed(() => {
    const bot = bots.value.find(b => b.selfId === selectedBot.value)
    return bot?.platform || 'unknown'
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

    // 针对图片加载导致的滚动偏移，在 300ms 和 800ms 后再次校准底部
    setTimeout(scrollToBottom, 300)
    setTimeout(scrollToBottom, 800)
  }

  const goBack = () => {
    if (isMobile.value && mobileView.value !== 'bots') {
      // 手机端使用 history.back()，由 popstate 监听器处理视图切换
      window.history.back()
    } else {
      // PC 端或初始页面的逻辑
      if (mobileView.value === 'image') {
        mobileView.value = 'messages'
        imageZoom.value = 1
      }
      else if (mobileView.value === 'forward') mobileView.value = 'messages'
      else if (mobileView.value === 'profile') mobileView.value = 'messages'
      else if (mobileView.value === 'raw') mobileView.value = 'messages'
      else if (mobileView.value === 'messages') mobileView.value = 'channels'
      else if (mobileView.value === 'channels') mobileView.value = 'bots'
    }
  }

  // 处理手机物理返回键
  const handlePopState = (e: PopStateEvent) => {
    if (!isMobile.value) return
    if (e.state && e.state.view) {
      mobileView.value = e.state.view
    } else {
      mobileView.value = 'bots'
    }
  }

  // 监听视图变化，同步到 history state
  watch(mobileView, (newView, oldView) => {
    if (!isMobile.value) return
    // 只有在非 popstate 导致的改变时才 pushState (简单判断：如果当前 state 不匹配则 push)
    if (window.history.state?.view !== newView) {
      window.history.pushState({ view: newView }, '')
    }
  })

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
    imageZoom.value = 1
    if (isMobile.value) {
      mobileView.value = 'image'
    } else {
      imageViewerVisible.value = true
    }
  }

  const handleImageWheel = (e: WheelEvent) => {
    if (e.deltaY < 0) {
      imageZoom.value = Math.min(imageZoom.value + 0.1, 3)
    } else {
      imageZoom.value = Math.max(imageZoom.value - 0.1, 0.5)
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

    let content = inputText.value
    if (replyingTo.value) {
      // 优先使用真实 ID 进行引用
      const quoteId = replyingTo.value.realId || replyingTo.value.id
      content = `<quote id="${quoteId}"/>${content}`
    }

    const res = await sendMessage(selectedBot.value, selectedChannel.value, content, uploadedImages.value)
    if (res?.success) {
      inputText.value = ''
      uploadedImages.value = []
      replyingTo.value = null
      scrollToBottom()
    } else {
      ElMessage.error(res?.error || '发送失败')
    }
  }

  // 复读消息 (+1)
  const repeatMessage = async (msg: any) => {
    if (!selectedBot.value || !selectedChannel.value) return

    // 复读消息，包含引用
    let content = msg.content
    if (msg.quote) {
      content = `<quote id="${msg.quote.id}"/>${content}`
    } else if (msg.isBot || msg.userId === selectedBot.value) {
      // 如果是复读机器人自己的消息，且该消息没有引用，则尝试引用该消息本身
      const quoteId = msg.realId || msg.id
      content = `<quote id="${quoteId}"/>${content}`
    }
    const res = await sendMessage(selectedBot.value, selectedChannel.value, content, [])
    if (res?.success) {
      scrollToBottom()
    } else {
      ElMessage.error(res?.error || '复读失败')
    }
  }

  // 机器人右键菜单
  const onBotMenu = (e: MouseEvent, bot: any) => {
    e.preventDefault()
    e.stopPropagation()
    menu.value = {
      show: true,
      x: e.clientX,
      y: e.clientY,
      type: 'bot',
      id: bot.selfId,
      isPinned: pinnedBots.value.has(bot.selfId),
      hasMedia: false
    }
  }

  // 频道右键菜单
  const onChannelMenu = (e: MouseEvent, channel: any) => {
    e.preventDefault()
    e.stopPropagation()
    menu.value = {
      show: true,
      x: e.clientX,
      y: e.clientY,
      type: 'channel',
      id: channel.id,
      isPinned: pinnedChannels.value.has(`${selectedBot.value}:${channel.id}`),
      hasMedia: false
    }
  }

  // 消息右键菜单
  const onMessageMenu = (e: MouseEvent, msg: any) => {
    // 如果菜单已经显示，则关闭它并允许原生菜单弹出（第二次右键逻辑）
    if (menu.value.show && menu.value.type === 'message' && menu.value.id === msg.id) {
      menu.value.show = false
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const hasMedia = msg.elements?.some((el: any) => ['image', 'img', 'mface', 'audio', 'video'].includes(el.type))
    menu.value = {
      show: true,
      x: e.clientX,
      y: e.clientY,
      type: 'message',
      id: msg.id,
      isPinned: false,
      data: msg,
      hasMedia
    } as any
  }

  // 统一处理菜单动作
  const handleMenuAction = async (action: string) => {
    const type = menu.value.type
    const id = menu.value.id
    const isPinned = menu.value.isPinned
    menu.value.show = false

    if (action === 'pin') {
      if (type === 'bot') await togglePinBot(id, isPinned, pinnedBots.value)
      else await togglePinChannel(selectedBot.value, id, isPinned, pinnedChannels.value)
    } else if (action === 'delete') {
      // 删除逻辑保持在 index.vue 中通过 ElMessageBox 确认，或者这里直接处理
      if (type === 'bot') await deleteBotData(id)
      else await deleteChannelData(selectedBot.value, id)
      location.reload()
    }
  }

  // 兼容手机端的复制函数
  const copyToClipboard = (text: string) => {
    if (!text) {
      ElMessage.warning('未复制任何内容')
      return Promise.resolve()
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text)
    } else {
      // 回退方案
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed"
      textArea.style.left = "-999999px"
      textArea.style.top = "-999999px"
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      return new Promise<void>((res, rej) => {
        document.execCommand('copy') ? res() : rej()
        textArea.remove()
      })
    }
  }

  const handleMessageAction = async (action: string) => {
    const msg = (menu.value as any).data
    menu.value.show = false
    if (!msg) return

    if (action === 'copy') {
      // 移除 HTML 标签
      const text = (msg.content || '').replace(/<[^>]+>/g, '')
      if (!text) {
        ElMessage.warning('未复制任何内容')
      } else {
        copyToClipboard(text).then(() => ElMessage.success('已复制到剪贴板'))
      }
    } else if (action === 'copy-raw') {
      // 查看原始消息，包含引用标签
      let raw = msg.content || ''
      if (msg.quote) {
        raw = `<quote id="${msg.quote.id}"/>${raw}`
      }
      rawMessage.content = raw
      if (isMobile.value) {
        mobileView.value = 'raw'
      } else {
        rawMessageVisible.value = true
      }
    } else if (action === 'plus1') {
      await repeatMessage(msg)
    } else if (action === 'reply') {
      replyingTo.value = msg
      // 自动聚焦输入框
      nextTick(() => {
        // Element Plus 的 el-input 需要访问其内部的 textarea
        const inputEl = inputRef.value?.$el?.querySelector('textarea') || inputRef.value?.ref
        if (inputEl) {
          inputEl.focus()
        } else {
          inputRef.value?.focus?.()
        }
      })
    } else if (action === 'download') {
      const media = msg.elements?.find((el: any) => ['image', 'img', 'mface', 'audio', 'video'].includes(el.type))
      const url = media?.attrs?.src || media?.attrs?.url || media?.attrs?.file
      if (url) downloadImage(url)
    }
  }

  // 显示用户资料
  const showUserProfile = async (msg: any) => {
    if (!selectedBot.value) return

    const res = await (send as any)('get-user-info', {
      selfId: selectedBot.value,
      userId: msg.userId,
      guildId: msg.guildId
    })

    if (res.success) {
      userProfile.data = res.data
      if (isMobile.value) {
        mobileView.value = 'profile'
      } else {
        userProfileVisible.value = true
      }
    } else {
      ElMessage.error(res.error || '获取用户信息失败')
    }
  }

  // 定位消息并高亮
  const scrollToMessage = async (id: string) => {
    // 尝试在当前列表中查找，优先匹配 data-id
    let el = document.querySelector(`[data-id="${id}"]`) || document.getElementById(id)

    if (!el) {
      // 如果没找到，尝试向上加载历史记录
      if (isLoadingHistory.value) return

      ElMessage.info('正在向上查找历史消息...')

      // 最多尝试向上查找 3 次
      for (let i = 0; i < 3; i++) {
        await loadHistory(selectedBot.value, selectedChannel.value)
        // 等待 DOM 更新
        await new Promise(resolve => setTimeout(resolve, 150))
        el = document.querySelector(`[data-id="${id}"]`) || document.getElementById(id)
        if (el) break
      }
    }

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 找到消息内容容器进行高亮
      const contentEl = el.querySelector('.cursor-context-menu') || el
      contentEl.classList.add('message-highlight')
      setTimeout(() => contentEl.classList.remove('message-highlight'), 1500)
    } else {
      ElMessage.warning('消息太久远，已不在当前列表中')
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
    // 处理移动端视口高度，防止键盘遮挡
    if (window.visualViewport) {
      viewportHeight.value = `${window.visualViewport.height}px`
    } else {
      viewportHeight.value = '100%'
    }
  }

  // 生命周期
  let dispose: any[] = []

  onMounted(async () => {
    checkMobile()
    window.addEventListener('resize', checkMobile)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', checkMobile)
      window.visualViewport.addEventListener('scroll', checkMobile)
    }
    window.addEventListener('click', () => menu.value.show = false)
    window.addEventListener('popstate', handlePopState)

    // 初始化 history state
    if (isMobile.value) {
      window.history.replaceState({ view: mobileView.value }, '')
    }

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

    // 监听机器人消息更新（发送成功后从虚拟 ID 转为真实 ID）
    const d4 = receive('bot-message-updated', (data: any) => {
      const channelKey = `${selectedBot.value}:${selectedChannel.value}`
      if (data.channelKey !== channelKey) return

      const msg = currentMessages.value.find(m => m.id === data.tempId)
      if (msg) {
        msg.sending = false
        msg.realId = data.realId
      }
    })
    if (typeof d4 === 'function') dispose.push(d4)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', checkMobile)
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', checkMobile)
      window.visualViewport.removeEventListener('scroll', checkMobile)
    }
    window.removeEventListener('popstate', handlePopState)
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
    viewportHeight,
    mobileView,
    forwardData,
    imageViewer,
    imageZoom,
    rawMessage,
    isLoadingHistory,
    forwardDialogVisible,
    imageViewerVisible,
    rawMessageVisible,
    replyingTo,
    userProfile,
    userProfileVisible,
    selectedBotPlatform,
    menu,

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
    handleImageWheel,
    downloadImage,
    handleScroll,
    repeatMessage,
    handlePaste,
    copyToClipboard,
    onBotMenu,
    onChannelMenu,
    onMessageMenu,
    handleMenuAction,
    handleMessageAction,
    showUserProfile,
    inputRef,
    scrollToMessage
  }
}