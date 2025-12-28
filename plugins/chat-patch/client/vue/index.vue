<template>
  <div
    class="chat-patch-wrapper absolute inset-0 flex overflow-hidden bg-[var(--k-page-bg)] text-[var(--k-text-color)] font-sans">
    <el-container class="h-full w-full">
      <!-- 机器人列表 -->
      <el-aside v-if="!isMobile || mobileView === 'bots'" :width="isMobile ? '100%' : '280px'"
        class="flex flex-col border-r border-[var(--k-border-color)] bg-[var(--k-card-bg)]">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] text-lg text-[var(--k-text-color)]">
          机器人</div>
        <el-scrollbar class="flex-1">
          <div v-for="bot in bots" :key="bot.selfId"
            :class="['flex items-center p-4 cursor-pointer transition-all hover:bg-[var(--k-button-hover-bg)] border-l-4 border-transparent', { '!border-[var(--k-color-primary)] bg-[var(--k-button-active-bg)] text-[var(--k-color-primary)]': selectedBot === bot.selfId }]"
            @click="selectBot(bot.selfId)" @contextmenu.prevent="onBotMenu($event, bot)">
            <el-avatar :size="44" :src="bot.avatar" class="flex-shrink-0 shadow-sm">{{ bot.username[0] }}</el-avatar>
            <div class="ml-3 flex-1 overflow-hidden">
              <div class="flex items-center gap-1 text-sm font-bold truncate">
                {{ bot.username }}
                <el-icon v-if="pinnedBots.has(bot.selfId)" class="text-orange-400">
                  <StarFilled />
                </el-icon>
              </div>
              <div class="text-xs text-[var(--k-text-color-secondary)] truncate opacity-80">{{ bot.platform }}</div>
            </div>
            <div
              :class="['w-2.5 h-2.5 rounded-full ml-2 shadow-inner', bot.status === 'online' ? 'bg-green-500' : 'bg-gray-400']">
            </div>
          </div>
        </el-scrollbar>
      </el-aside>

      <!-- 频道列表 -->
      <el-aside v-if="(!isMobile && selectedBot) || (isMobile && mobileView === 'channels')"
        :width="isMobile ? '100%' : '260px'"
        class="flex flex-col border-r border-[var(--k-border-color)] bg-[var(--k-card-bg)]">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] text-lg text-[var(--k-text-color)]">
          <el-button v-if="isMobile" icon="ArrowLeft" circle size="small" class="mr-3" @click="goBack" />
          频道
        </div>
        <el-scrollbar class="flex-1">
          <div v-for="channel in currentChannels" :key="channel.id"
            :class="['flex items-center p-4 cursor-pointer transition-all hover:bg-[var(--k-button-hover-bg)] border-l-4 border-transparent', { '!border-[var(--k-color-primary)] bg-[var(--k-button-active-bg)] text-[var(--k-color-primary)]': selectedChannel === channel.id }]"
            @click="selectChannel(channel.id)" @contextmenu.prevent="onChannelMenu($event, channel)">
            <div class="flex-1 overflow-hidden">
              <div class="flex items-center gap-1 text-sm font-medium truncate">
                {{ channel.name }}
                <el-icon v-if="pinnedChannels.has(`${selectedBot}:${channel.id}`)" class="text-orange-400">
                  <StarFilled />
                </el-icon>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </el-aside>

      <!-- 消息主区域 -->
      <el-main v-if="!isMobile || mobileView === 'messages'" class="flex flex-col p-0 bg-[var(--k-page-bg)] relative">
        <template v-if="selectedBot && selectedChannel">
          <div
            class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] bg-[var(--k-card-bg)] shadow-sm z-10 text-[var(--k-text-color)]">
            <el-button v-if="isMobile" icon="ArrowLeft" circle size="small" class="mr-3" @click="goBack" />
            <span class="truncate">{{ currentChannelName }}</span>
          </div>

          <div class="flex-1 overflow-hidden relative bg-opacity-50 bg-gray-100 dark:bg-black/20">
            <el-scrollbar ref="scrollRef">
              <div class="p-6 flex flex-col min-h-full">
                <div v-for="msg in currentMessages" :key="msg.id"
                  :class="['flex mb-6 gap-3 group', msg.isBot ? 'flex-row-reverse' : 'flex-row']">
                  <el-avatar :size="40" :src="msg.avatar" class="flex-shrink-0 shadow-sm">
                    {{ msg.username[0] }}
                  </el-avatar>
                  <div :class="['max-w-[85%] md:max-w-[75%] flex flex-col', msg.isBot ? 'items-end' : 'items-start']">
                    <div class="flex items-center gap-2 mb-1.5 text-xs text-[var(--k-text-color-secondary)]">
                      <span class="font-bold">{{ msg.username }}</span>
                      <span class="opacity-60">{{ formatTime(msg.timestamp) }}</span>
                    </div>
                    <div
                      :class="['p-3.5 rounded-2xl shadow-sm text-[15px] leading-relaxed break-all relative', msg.isBot ? 'bg-[#95ec69] text-black rounded-tr-none' : 'bg-[var(--k-card-bg)] text-[var(--k-text-color)] rounded-tl-none border border-[var(--k-border-color)]']">
                      <!-- 引用消息渲染 -->
                      <div v-if="msg.quote"
                        class="mb-2.5 p-2.5 text-sm bg-black/5 dark:bg-white/5 rounded-lg border-l-4 border-gray-400/50 text-left">
                        <div class="font-bold opacity-70 mb-1 text-xs">{{ msg.quote.user.username }}:</div>
                        <div class="opacity-90">
                          <template v-if="msg.quote.elements && msg.quote.elements.length">
                            <render-element v-for="(el, i) in msg.quote.elements" :key="i" :element="el"
                              :bot-id="selectedBot" :channel-id="selectedChannel" />
                          </template>
                          <template v-else>{{ msg.quote.content }}</template>
                        </div>
                      </div>
                      <!-- 消息内容渲染 -->
                      <div class="text-left min-w-[20px]">
                        <template v-if="msg.elements && msg.elements.length">
                          <render-element v-for="(el, i) in msg.elements" :key="i" :element="el" :bot-id="selectedBot"
                            :channel-id="selectedChannel" />
                        </template>
                        <template v-else>{{ msg.content }}</template>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </el-scrollbar>
          </div>

          <!-- 输入区域 -->
          <div
            class="p-4 border-t border-[var(--k-border-color)] bg-[var(--k-card-bg)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            <div class="mb-3 flex gap-3">
              <el-upload action="#" :auto-upload="false" :show-file-list="false" :on-change="handleFileChange" multiple>
                <el-button circle class="!w-14 !h-14 !text-2xl shadow-sm hover:scale-105 transition-transform"><el-icon>
                    <Picture />
                  </el-icon></el-button>
              </el-upload>
            </div>
            <div v-if="uploadedImages.length" class="flex gap-3 mb-3 overflow-x-auto pb-2 scrollbar-hide">
              <div v-for="img in uploadedImages" :key="img.tempId" class="relative w-20 h-20 flex-shrink-0 group">
                <el-image :src="img.preview" fit="cover"
                  class="w-full h-full rounded-lg border-2 border-[var(--k-border-color)] shadow-sm" />
                <el-icon
                  class="absolute -top-2 -right-2 cursor-pointer text-red-500 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  @click="removeImage(img.tempId)">
                  <CircleCloseFilled />
                </el-icon>
              </div>
            </div>
            <div class="flex gap-4 items-end">
              <el-input v-model="inputText" type="textarea" :rows="3" placeholder="输入消息..." class="flex-1 !text-base"
                @keydown.enter.prevent="handleSend" />
              <el-button type="primary" :loading="isSending" @click="handleSend"
                class="px-8 h-12 !text-base font-bold shadow-md">发送</el-button>
            </div>
          </div>
        </template>
        <el-empty v-else description="请选择频道开始对话" class="h-full flex items-center justify-center opacity-60" />
      </el-main>
    </el-container>

    <!-- 合并转发详情弹窗 -->
    <el-dialog v-model="forwardDialog.show" title="聊天记录" width="500px" class="forward-dialog" teleported>
      <el-scrollbar max-height="60vh">
        <div class="p-4 space-y-6">
          <div v-for="(msg, idx) in forwardDialog.messages" :key="idx" class="flex gap-3">
            <el-avatar :size="32" :src="msg.attrs?.avatar" class="flex-shrink-0">{{ msg.attrs?.nickname?.[0]
              }}</el-avatar>
            <div class="flex-1 overflow-hidden">
              <div class="text-xs text-gray-500 mb-1 font-bold">{{ msg.attrs?.nickname }}</div>
              <div class="p-2.5 bg-gray-100 dark:bg-white/5 rounded-lg text-sm break-all">
                <render-element v-for="(el, i) in msg.children" :key="i" :element="el" :bot-id="selectedBot"
                  :channel-id="selectedChannel" />
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </el-dialog>

    <!-- 右键菜单 -->
    <div v-if="menu.show"
      class="fixed bg-[var(--k-card-bg)] border border-[var(--k-border-color)] shadow-xl z-[2000] py-1.5 rounded-lg min-w-[140px] backdrop-blur-sm bg-opacity-90"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <div
        class="px-4 py-2.5 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
        @click="handleMenuAction('pin')">
        <el-icon>
          <Star />
        </el-icon> {{ menu.isPinned ? '取消置顶' : '置顶' }}
      </div>
      <div
        class="px-4 py-2.5 cursor-pointer text-sm text-red-500 hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
        @click="handleMenuAction('delete')">
        <el-icon>
          <Delete />
        </el-icon> 删除数据
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, h, defineComponent, onMounted, reactive, watch } from 'vue'
import { StarFilled, Star, Picture, CircleCloseFilled, ArrowLeft, Delete, Collection } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { send } from '@koishijs/client'
import { useChatLogic } from './chat-logic'

const {
  bots, selectedBot, selectedChannel, currentChannels, currentMessages, currentChannelName,
  inputText, uploadedImages, isSending, pinnedBots, pinnedChannels, scrollRef,
  isMobile, mobileView, goBack,
  selectBot, selectChannel, handleSend, togglePinBot, togglePinChannel, deleteBotData, deleteChannelData,
  getCachedImageUrl, cacheImage
} = useChatLogic()

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// 合并转发弹窗状态
const forwardDialog = reactive({
  show: false,
  messages: [] as any[]
})

const showForwardDetail = (elements: any[]) => {
  forwardDialog.messages = elements.filter(e => e.type === 'message')
  forwardDialog.show = true
}

// 消息渲染组件
const RenderElement = defineComponent({
  props: ['element', 'botId', 'channelId'],
  setup(props) {
    const imgUrl = ref('')
    const isMedia = ['img', 'image', 'mface', 'audio', 'video'].includes(props.element.type)

    const loadMedia = async () => {
      const url = props.element.attrs.src || props.element.attrs.url || props.element.attrs.file
      if (url) {
        const res = await getCachedImageUrl(`${props.botId}:${props.channelId}`, url)
        if (res) imgUrl.value = res
        else {
          const r = await cacheImage(`${props.botId}:${props.channelId}`, url)
          imgUrl.value = r || url
        }
      }
    }

    if (isMedia) loadMedia()
    watch(() => props.element.attrs.src || props.element.attrs.url || props.element.attrs.file, loadMedia)

    return () => {
      const { element } = props
      const type = element.type
      const attrs = element.attrs

      if (type === 'text') return h('span', attrs.content)
      if (type === 'img' || type === 'image' || type === 'mface') {
        // 关键修复：使用原生 img 标签，因为 el-image 在某些环境下可能因为尺寸计算问题不显示
        return h('div', { class: 'inline-block my-1.5' }, [
          h('img', {
            src: imgUrl.value,
            class: 'max-w-[280px] max-h-[400px] rounded-lg shadow-sm border border-black/5 block cursor-pointer',
            style: 'min-width: 50px; min-height: 50px; object-fit: contain; background: rgba(0,0,0,0.05)',
            onClick: () => {
              // 模拟预览效果
              window.open(imgUrl.value, '_blank')
            },
            onError: (e: any) => {
              e.target.src = '' // 防止死循环
              e.target.alt = '图片加载失败'
            }
          })
        ])
      }
      if (type === 'audio') {
        return h('audio', { src: imgUrl.value, controls: true, class: 'max-w-full my-1.5 block' })
      }
      if (type === 'video') {
        return h('video', { src: imgUrl.value, controls: true, class: 'max-w-full my-1.5 rounded-lg shadow-sm block' })
      }
      if (type === 'at') return h('span', { class: 'text-blue-500 font-bold hover:underline cursor-default mx-0.5' }, `@${attrs.name || attrs.id}`)

      // 合并转发渲染
      if (type === 'figure' || type === 'forward') {
        return h('div', {
          class: 'my-2 p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 max-w-[300px] cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
          onClick: (e: Event) => { e.stopPropagation(); showForwardDetail(element.children || []) }
        }, [
          h('div', { class: 'flex items-center gap-2 mb-2 font-bold text-sm opacity-80' }, [
            h('el-icon', null, { default: () => h(Collection) }),
            h('span', '合并转发记录')
          ]),
          h('div', { class: 'space-y-1.5' }, (element.children || []).filter((c: any) => c.type === 'message').slice(0, 4).map((child: any) => {
            return h('div', { class: 'text-xs truncate opacity-70' }, [
              h('span', { class: 'font-bold mr-1' }, `${child.attrs?.nickname || '用户'}:`),
              h('span', child.children?.[0]?.attrs?.content || '[富媒体内容]')
            ])
          })),
          (element.children?.length > 4) ? h('div', { class: 'mt-2 pt-2 border-t border-black/5 dark:border-white/5 text-[10px] opacity-50' }, `查看更多 ${element.children.length} 条内容...`) : null
        ])
      }

      if (type === 'quote') return null

      return h('span', { class: 'text-gray-400 italic text-xs' }, `[${type}]`)
    }
  }
})

const handleFileChange = async (file: any) => {
  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result as string
    const res = await (send as any)('upload-image', {
      file: base64,
      filename: file.name,
      mimeType: file.raw.type
    })
    if (res.success) {
      uploadedImages.value.push({
        tempId: res.tempId,
        preview: URL.createObjectURL(file.raw),
        filename: file.name
      })
    }
  }
  reader.readAsDataURL(file.raw)
}

const removeImage = (id: string) => {
  uploadedImages.value = uploadedImages.value.filter(i => i.tempId !== id)
}

const menu = ref({ show: false, x: 0, y: 0, type: '', id: '', isPinned: false })
const onBotMenu = (e: MouseEvent, bot: any) => {
  menu.value = { show: true, x: e.clientX, y: e.clientY, type: 'bot', id: bot.selfId, isPinned: pinnedBots.value.has(bot.selfId) }
}
const onChannelMenu = (e: MouseEvent, channel: any) => {
  menu.value = { show: true, x: e.clientX, y: e.clientY, type: 'channel', id: channel.id, isPinned: pinnedChannels.value.has(`${selectedBot.value}:${channel.id}`) }
}
const handleMenuAction = async (action: string) => {
  menu.value.show = false
  if (action === 'pin') {
    if (menu.value.type === 'bot') await togglePinBot(menu.value.id, menu.value.isPinned, pinnedBots.value)
    else await togglePinChannel(selectedBot.value, menu.value.id, menu.value.isPinned, pinnedChannels.value)
  } else if (action === 'delete') {
    await ElMessageBox.confirm('确定删除所有数据吗？此操作不可恢复。', '警告', {
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })
    if (menu.value.type === 'bot') await deleteBotData(menu.value.id)
    else await deleteChannelData(selectedBot.value, menu.value.id)
    location.reload()
  }
}

onMounted(() => {
  window.addEventListener('click', () => menu.value.show = false)
})
</script>

<style>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.chat-patch-wrapper .el-textarea__inner {
  border-radius: 12px;
  padding: 10px 12px;
  resize: none;
}

.chat-patch-wrapper .el-button--primary {
  border-radius: 10px;
}

.forward-dialog .el-dialog__body {
  padding: 0;
}
</style>