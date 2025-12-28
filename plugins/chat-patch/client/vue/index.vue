<template>
  <div
    class="chat-patch-wrapper absolute inset-0 flex overflow-hidden bg-[var(--k-page-bg)] text-[var(--k-text-color)]">
    <el-container class="h-full w-full">
      <!-- 机器人列表 -->
      <el-aside v-if="!isMobile || mobileView === 'bots'" :width="isMobile ? '100%' : '260px'"
        class="flex flex-col border-r border-[var(--k-border-color)] bg-[var(--k-card-bg)]">
        <div class="flex h-12 items-center px-4 font-bold border-b border-[var(--k-border-color)]">机器人</div>
        <el-scrollbar class="flex-1">
          <div v-for="bot in bots" :key="bot.selfId"
            :class="['flex items-center p-3 cursor-pointer transition-colors hover:bg-[var(--k-button-hover-bg)]', { 'bg-[var(--k-button-active-bg)] text-[var(--k-color-primary)]': selectedBot === bot.selfId }]"
            @click="selectBot(bot.selfId)" @contextmenu.prevent="onBotMenu($event, bot)">
            <el-avatar :size="40" :src="bot.avatar" class="flex-shrink-0">{{ bot.username[0] }}</el-avatar>
            <div class="ml-3 flex-1 overflow-hidden">
              <div class="flex items-center gap-1 text-sm font-medium truncate">
                {{ bot.username }}
                <el-icon v-if="pinnedBots.has(bot.selfId)" class="text-orange-400">
                  <StarFilled />
                </el-icon>
              </div>
              <div class="text-xs text-[var(--k-text-color-secondary)] truncate">{{ bot.platform }}</div>
            </div>
            <div :class="['w-2 h-2 rounded-full ml-2', bot.status === 'online' ? 'bg-green-500' : 'bg-gray-400']"></div>
          </div>
        </el-scrollbar>
      </el-aside>

      <!-- 频道列表 -->
      <el-aside v-if="(!isMobile && selectedBot) || (isMobile && mobileView === 'channels')"
        :width="isMobile ? '100%' : '240px'"
        class="flex flex-col border-r border-[var(--k-border-color)] bg-[var(--k-card-bg)]">
        <div class="flex h-12 items-center px-4 font-bold border-b border-[var(--k-border-color)]">
          <el-button v-if="isMobile" icon="ArrowLeft" circle size="small" class="mr-2" @click="goBack" />
          频道
        </div>
        <el-scrollbar class="flex-1">
          <div v-for="channel in currentChannels" :key="channel.id"
            :class="['flex items-center p-3 cursor-pointer transition-colors hover:bg-[var(--k-button-hover-bg)]', { 'bg-[var(--k-button-active-bg)] text-[var(--k-color-primary)]': selectedChannel === channel.id }]"
            @click="selectChannel(channel.id)" @contextmenu.prevent="onChannelMenu($event, channel)">
            <div class="flex-1 overflow-hidden">
              <div class="flex items-center gap-1 text-sm truncate">
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
      <el-main v-if="!isMobile || mobileView === 'messages'" class="flex flex-col p-0 bg-[var(--k-page-bg)]">
        <template v-if="selectedBot && selectedChannel">
          <div
            class="flex h-12 items-center px-4 font-bold border-b border-[var(--k-border-color)] bg-[var(--k-card-bg)]">
            <el-button v-if="isMobile" icon="ArrowLeft" circle size="small" class="mr-2" @click="goBack" />
            {{ currentChannelName }}
          </div>

          <div class="flex-1 overflow-hidden relative">
            <el-scrollbar ref="scrollRef">
              <div class="p-5">
                <div v-for="msg in currentMessages" :key="msg.id"
                  :class="['flex mb-5 gap-3', msg.isBot ? 'flex-row-reverse' : 'flex-row']">
                  <el-avatar :size="36" :src="msg.avatar" class="flex-shrink-0">
                    {{ msg.username[0] }}
                  </el-avatar>
                  <div :class="['max-w-[85%] md:max-w-[70%] flex flex-col', msg.isBot ? 'items-end' : 'items-start']">
                    <div class="flex items-center gap-2 mb-1 text-xs text-[var(--k-text-color-secondary)]">
                      <span class="font-medium">{{ msg.username }}</span>
                      <span>{{ formatTime(msg.timestamp) }}</span>
                    </div>
                    <div
                      :class="['p-3 rounded-lg shadow-sm text-sm break-all', msg.isBot ? 'bg-[#95ec69] text-black' : 'bg-[var(--k-card-bg)] text-[var(--k-text-color)]']">
                      <!-- 引用消息渲染 -->
                      <div v-if="msg.quote"
                        class="mb-2 p-2 text-xs bg-black/5 rounded border-l-4 border-gray-300 text-left">
                        <div class="font-bold opacity-70 mb-1">{{ msg.quote.user.username }}:</div>
                        <div class="opacity-90">
                          <template v-if="msg.quote.elements && msg.quote.elements.length">
                            <render-element v-for="(el, i) in msg.quote.elements" :key="i" :element="el"
                              :bot-id="selectedBot" :channel-id="selectedChannel" />
                          </template>
                          <template v-else>{{ msg.quote.content }}</template>
                        </div>
                      </div>
                      <!-- 消息内容渲染 -->
                      <div class="text-left">
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
          <div class="p-4 border-t border-[var(--k-border-color)] bg-[var(--k-card-bg)]">
            <div class="mb-2 flex gap-2">
              <el-upload action="#" :auto-upload="false" :show-file-list="false" :on-change="handleFileChange" multiple>
                <el-button circle class="!w-12 !h-12"><el-icon :size="24">
                    <Picture />
                  </el-icon></el-button>
              </el-upload>
            </div>
            <div v-if="uploadedImages.length" class="flex gap-2 mb-2 overflow-x-auto pb-2">
              <div v-for="img in uploadedImages" :key="img.tempId" class="relative w-16 h-16 flex-shrink-0">
                <el-image :src="img.preview" fit="cover"
                  class="w-full h-full rounded border border-[var(--k-border-color)]" />
                <el-icon class="absolute -top-1 -right-1 cursor-pointer text-red-500 bg-white rounded-full"
                  @click="removeImage(img.tempId)">
                  <CircleCloseFilled />
                </el-icon>
              </div>
            </div>
            <div class="flex gap-3 items-end">
              <el-input v-model="inputText" type="textarea" :rows="3" placeholder="输入消息..." class="flex-1"
                @keydown.enter.prevent="handleSend" />
              <el-button type="primary" :loading="isSending" @click="handleSend" class="px-6 h-12">发送</el-button>
            </div>
          </div>
        </template>
        <el-empty v-else description="请选择频道开始对话" class="h-full flex items-center justify-center" />
      </el-main>
    </el-container>

    <!-- 右键菜单 -->
    <div v-if="menu.show"
      class="fixed bg-[var(--k-card-bg)] border border-[var(--k-border-color)] shadow-lg z-[2000] py-1 rounded min-w-[120px]"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <div class="px-4 py-2 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)]"
        @click="handleMenuAction('pin')">{{
          menu.isPinned ? '取消置顶' : '置顶' }}</div>
      <div class="px-4 py-2 cursor-pointer text-sm text-red-500 hover:bg-[var(--k-button-hover-bg)]"
        @click="handleMenuAction('delete')">删除数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, h, defineComponent, onMounted } from 'vue'
import { StarFilled, Picture, CircleCloseFilled, ArrowLeft } from '@element-plus/icons-vue'
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

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString()

// 消息渲染组件
const RenderElement = defineComponent({
  props: ['element', 'botId', 'channelId'],
  setup(props) {
    const imgUrl = ref('')
    const isMedia = ['img', 'image', 'mface', 'audio', 'video'].includes(props.element.type)

    if (isMedia) {
      const url = props.element.attrs.src || props.element.attrs.url || props.element.attrs.file
      if (url) {
        getCachedImageUrl(`${props.botId}:${props.channelId}`, url).then(res => {
          if (res) imgUrl.value = res
          else cacheImage(`${props.botId}:${props.channelId}`, url).then(r => imgUrl.value = r || url)
        })
      }
    }

    return () => {
      const { element } = props
      const type = element.type
      const attrs = element.attrs

      if (type === 'text') return h('span', attrs.content)
      if (type === 'img' || type === 'image' || type === 'mface') {
        return h('el-image', {
          src: imgUrl.value,
          previewSrcList: [imgUrl.value],
          class: 'max-w-[200px] block rounded my-1',
          previewTeleported: true
        })
      }
      if (type === 'audio') {
        return h('audio', { src: imgUrl.value, controls: true, class: 'max-w-full my-1' })
      }
      if (type === 'video') {
        return h('video', { src: imgUrl.value, controls: true, class: 'max-w-full my-1 rounded' })
      }
      if (type === 'at') return h('span', { class: 'text-blue-500 font-bold' }, `@${attrs.name || attrs.id}`)
      if (type === 'quote') return null

      return h('span', { class: 'text-gray-400 italic' }, `[${type}]`)
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
    await ElMessageBox.confirm('确定删除所有数据吗？', '警告', { type: 'warning' })
    if (menu.value.type === 'bot') await deleteBotData(menu.value.id)
    else await deleteChannelData(selectedBot.value, menu.value.id)
    location.reload()
  }
}

onMounted(() => {
  window.addEventListener('click', () => menu.value.show = false)
})
</script>