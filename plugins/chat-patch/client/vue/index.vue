<template>
  <div
    class="chat-patch-wrapper absolute inset-0 flex overflow-hidden bg-[var(--k-page-bg)] text-[var(--k-text-color)] font-sans"
    :style="isMobile ? 'height: 100dvh; width: 100vw; position: fixed; top: 0; left: 0;' : 'height: 100%; width: 100%;'">
    <el-container class="h-full w-full overflow-hidden">
      <!-- 机器人列表 -->
      <el-aside v-show="!isMobile || mobileView === 'bots'" :width="isMobile ? '100%' : '280px'"
        class="flex flex-col border-r border-[var(--k-border-color)] bg-[var(--k-page-bg)] brightness-95 dark:brightness-90 h-full overflow-hidden">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] text-lg text-[var(--k-text-color)] flex-shrink-0">
          机器人</div>
        <el-scrollbar class="flex-1 overflow-auto">
          <div v-if="bots.length === 0" class="p-10 text-center opacity-40 text-sm">暂无机器人数据</div>
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
      <el-aside v-show="(!isMobile && selectedBot) || (isMobile && mobileView === 'channels')"
        :width="isMobile ? '100%' : '260px'"
        class="flex flex-col border-r border-[var(--k-border-color)] bg-[var(--k-page-bg)] brightness-100 dark:brightness-95 h-full overflow-hidden">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] text-lg text-[var(--k-text-color)] flex-shrink-0">
          <el-button v-if="isMobile" icon="ArrowLeft" circle size="small" class="mr-3" @click="goBack" />
          频道
        </div>
        <el-scrollbar class="flex-1 overflow-auto">
          <div v-if="currentChannels.length === 0" class="p-10 text-center opacity-40 text-sm">暂无频道数据</div>
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
      <el-main v-show="(!isMobile && selectedBot && selectedChannel) || (isMobile && mobileView === 'messages')"
        class="flex flex-col p-0 bg-[var(--k-page-bg)] relative brightness-105 dark:brightness-100 h-full overflow-hidden">
        <template v-if="selectedBot && selectedChannel">
          <div
            class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] bg-[var(--k-card-bg)] shadow-sm z-10 text-[var(--k-text-color)]">
            <el-button v-if="isMobile" icon="ArrowLeft" circle size="small" class="mr-3" @click="goBack" />
            <span class="truncate">{{ currentChannelName }}</span>
            <span v-if="selectedChannel" class="ml-2 text-xs opacity-40 font-mono hidden md:inline">({{ selectedChannel
            }})</span>
          </div>

          <div class="flex-1 overflow-hidden relative bg-opacity-50 bg-gray-100 dark:bg-black/20">
            <el-scrollbar ref="scrollRef" @scroll="handleScroll" class="h-full">
              <div class="p-6 flex flex-col"
                :style="isMobile ? { paddingBottom: 'calc(180px + env(safe-area-inset-bottom))' } : { minHeight: '100%' }">
                <div v-if="isLoadingHistory" class="flex justify-center py-4">
                  <el-icon class="is-loading text-[var(--k-color-primary)]">
                    <Loading />
                  </el-icon>
                </div>
                <div v-for="msg in currentMessages" :key="msg.id" :data-id="msg.id"
                  :class="['flex mb-6 gap-3 group', (msg.isBot || msg.userId === selectedBot) ? 'flex-row-reverse' : 'flex-row']">
                  <el-avatar :size="40" :src="msg.avatar"
                    class="flex-shrink-0 shadow-sm cursor-pointer hover:brightness-90" @click="showUserProfile(msg)">
                    {{ msg.username[0] }}
                  </el-avatar>
                  <div
                    :class="['max-w-[85%] md:max-w-[75%] flex flex-col', (msg.isBot || msg.userId === selectedBot) ? 'items-end' : 'items-start']">
                    <div class="flex items-center gap-2 mb-1.5 text-xs text-[var(--k-text-color-secondary)]">
                      <span class="font-bold">{{ msg.username }}</span>
                      <span class="opacity-60">{{ formatTime(msg.timestamp) }}</span>
                    </div>
                    <div
                      :class="['flex items-end gap-2 group/msg', (msg.isBot || msg.userId === selectedBot) ? 'flex-row' : 'flex-row-reverse']">
                      <!-- +1 按钮：靠近屏幕中心的一侧，底部对齐 -->
                      <div
                        :class="['transition-opacity cursor-pointer text-blue-500 hover:scale-110 active:scale-95 mb-1', isMobile ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100']"
                        title="复读这条消息" @click.stop="repeatMessage(msg)">
                        <div v-if="msg.sending" class="w-8 h-8 flex items-center justify-center">
                          <el-icon class="is-loading">
                            <Loading />
                          </el-icon>
                        </div>
                        <div v-else
                          class="w-8 h-8 rounded-full border-2 border-blue-500 flex items-center justify-center font-bold text-xs bg-blue-50/10">
                          +1</div>
                      </div>

                      <div
                        :class="['p-3.5 rounded-2xl shadow-sm text-[15px] leading-relaxed break-all relative cursor-context-menu', (msg.isBot || msg.userId === selectedBot) ? 'bg-[#95ec69] text-black rounded-tr-none' : 'bg-[var(--k-card-bg)] text-[var(--k-text-color)] rounded-tl-none border border-[var(--k-border-color)]']"
                        @contextmenu.stop="onMessageMenu($event, msg)">
                        <!-- 引用消息渲染 -->
                        <div v-if="msg.quote"
                          class="mb-2.5 p-2.5 text-sm bg-black/5 dark:bg-white/5 rounded-lg border-l-4 border-gray-400/50 text-left relative group/quote">
                          <div class="font-bold opacity-70 mb-1 text-xs">{{ msg.quote.user.username }}:</div>
                          <div class="opacity-90">
                            <template v-if="msg.quote.elements && msg.quote.elements.length">
                              <render-element v-for="(el, i) in msg.quote.elements" :key="i" :element="el"
                                :bot-id="selectedBot" :channel-id="selectedChannel" :in-quote="true" />
                            </template>
                            <template v-else>{{ msg.quote.content }}</template>
                          </div>
                          <!-- 定位消息按钮 -->
                          <div
                            class="absolute top-1 right-1 opacity-0 group-hover/quote:opacity-100 transition-opacity cursor-pointer text-[var(--k-color-primary)] hover:scale-110"
                            title="定位到原消息" @click.stop="scrollToMessage(msg.quote.id)">
                            <el-icon>
                              <Top />
                            </el-icon>
                          </div>
                        </div>
                        <!-- 消息内容渲染 -->
                        <div class="text-left min-w-[20px]">
                          <template v-if="msg.elements && msg.elements.length">
                            <render-element v-for="(el, i) in msg.elements" :key="i" :element="el" :bot-id="selectedBot"
                              :channel-id="selectedChannel" />
                          </template>
                          <template v-else-if="msg.content">{{ msg.content }}</template>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </el-scrollbar>
          </div>

          <!-- 输入区域 -->
          <div
            :class="['p-4 border-t border-[var(--k-border-color)] bg-[var(--k-card-bg)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)]', isMobile ? 'fixed left-0 right-0 z-50 transition-all duration-200' : '']"
            :style="isMobile ? {
              bottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '0',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)'
            } : {}">
            <!-- 图片预览区域 -->
            <div v-if="uploadedImages.length" class="flex gap-3 mb-3 overflow-x-auto pb-2 scrollbar-hide">
              <div v-for="img in uploadedImages" :key="img.tempId" class="relative w-20 h-20 flex-shrink-0 group">
                <el-image :src="img.preview" fit="cover"
                  class="w-full h-full rounded-lg border-2 border-[var(--k-border-color)] shadow-sm cursor-pointer hover:brightness-90"
                  @click="openImageViewer(img.preview)" />
                <el-icon
                  class="absolute -top-1.5 -right-1.5 cursor-pointer text-red-500 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  @click.stop="removeImage(img.tempId)">
                  <CircleCloseFilled />
                </el-icon>
              </div>
            </div>
            <div v-if="replyingTo"
              class="mb-2 px-3 py-1.5 bg-black/5 dark:bg-white/5 rounded-lg flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 truncate opacity-70">
                <el-icon>
                  <ChatLineRound />
                </el-icon>
                <span>回复 {{ replyingTo.username }}: {{ replyingTo.content.slice(0, 20) }}{{ replyingTo.content.length >
                  20 ? '...'
                  : '' }}</span>
              </div>
              <el-icon class="cursor-pointer hover:text-red-500" @click="replyingTo = null">
                <Close />
              </el-icon>
            </div>
            <div class="flex gap-3 items-end">
              <!-- 图片上传按钮 -->
              <el-upload action="#" :auto-upload="false" :show-file-list="false" :on-change="handleFileChange" multiple>
                <el-button circle class="!w-10 !h-10 !text-xl shadow-sm hover:scale-105 transition-transform">
                  <el-icon>
                    <Picture />
                  </el-icon>
                </el-button>
              </el-upload>
              <!-- 文本输入框，使用 autosize 以适应单行显示 -->
              <el-input ref="inputRef" v-model="inputText" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }"
                placeholder="输入消息..." class="flex-1 !text-base" @keydown.enter.prevent="handleSend"
                @paste="handlePaste" />
              <!-- 发送按钮 -->
              <el-button type="primary" :loading="isSending" @click="handleSend"
                class="px-6 h-10 !text-base font-bold shadow-md">发送</el-button>
            </div>
          </div>
        </template>
        <el-empty v-else description="请选择频道开始对话" class="h-full flex items-center justify-center opacity-60" />
      </el-main>

      <!-- 合并转发详情页 (手机端全屏) -->
      <el-main v-if="isMobile && mobileView === 'forward'"
        class="flex flex-col p-0 bg-[var(--k-page-bg)] absolute inset-0 z-50 overflow-hidden" style="height: 100dvh;">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] bg-[var(--k-card-bg)] shadow-sm">
          <el-button icon="ArrowLeft" circle size="small" class="mr-3" @click="goBack" />
          <span>聊天记录</span>
        </div>
        <el-scrollbar class="flex-1 bg-gray-50 dark:bg-black/10">
          <div class="p-4 space-y-6">
            <div v-for="(msg, idx) in forwardData.messages" :key="idx" class="flex gap-3">
              <el-avatar :size="36" :src="msg.attrs?.avatar" class="flex-shrink-0 shadow-sm">{{ msg.attrs?.nickname?.[0]
              }}</el-avatar>
              <div class="flex-1 overflow-hidden">
                <div class="text-xs text-[var(--k-text-color-secondary)] mb-1 font-bold">{{ msg.attrs?.nickname }}</div>
                <div
                  class="p-3 bg-[var(--k-card-bg)] rounded-2xl rounded-tl-none shadow-sm text-sm break-all border border-[var(--k-border-color)]">
                  <render-element v-for="(el, i) in msg.children" :key="i" :element="el" :bot-id="selectedBot"
                    :channel-id="selectedChannel" />
                </div>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </el-main>

      <!-- 图片查看器 (手机端全屏) -->
      <el-main v-if="isMobile && mobileView === 'image'"
        class="flex flex-col p-0 bg-black absolute inset-0 z-[60] overflow-hidden" style="height: 100dvh;">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-white/10 bg-black text-white shadow-sm flex-shrink-0">
          <el-button icon="ArrowLeft" circle size="small" class="mr-3 !bg-white/10 !border-none !text-white"
            @click="goBack" />
          <span class="truncate mr-2">查看图片</span>
          <div class="flex-1"></div>
          <el-button type="primary" icon="Download" size="small" @click="downloadImage(imageViewer.url)">下载</el-button>
        </div>
        <div class="flex-1 overflow-hidden relative flex items-center justify-center" @wheel="handleImageWheel">
          <img :src="imageViewer.url"
            class="max-w-full max-h-full object-contain transition-transform duration-200 ease-out will-change-transform"
            :style="{ transform: `scale(${imageZoom})` }" />
        </div>
      </el-main>

      <!-- 原始消息查看页 (手机端全屏) -->
      <el-main v-if="isMobile && mobileView === 'raw'"
        class="flex flex-col p-0 bg-[var(--k-page-bg)] absolute inset-0 z-[80] overflow-hidden" style="height: 100dvh;">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] bg-[var(--k-card-bg)] shadow-sm">
          <el-button icon="ArrowLeft" circle size="small" class="mr-3" @click="goBack" />
          <div class="flex-1 text-center pr-8">原始消息</div>
        </div>
        <div class="p-4 flex flex-col gap-4 h-full overflow-hidden">
          <el-input v-model="rawMessage.content" type="textarea" :rows="15" readonly class="flex-1 raw-content-area" />
          <div class="flex gap-3 pb-8">
            <el-button type="primary" class="flex-1"
              @click="copyToClipboard(rawMessage.content).then(() => ElMessage.success('已复制'))">复制内容</el-button>
            <el-button class="flex-1" @click="goBack">返回</el-button>
          </div>
        </div>
      </el-main>

      <!-- 用户资料页 (手机端全屏) -->
      <el-main v-if="isMobile && mobileView === 'profile'"
        class="flex flex-col p-0 bg-[var(--k-page-bg)] absolute inset-0 z-[70] overflow-hidden" style="height: 100dvh;">
        <div
          class="flex h-14 items-center px-4 font-bold border-b border-[var(--k-border-color)] bg-[var(--k-card-bg)] shadow-sm">
          <el-button icon="ArrowLeft" circle size="small" class="mr-3" @click="goBack" />
          <div class="flex-1 text-center pr-8">用户资料</div>
        </div>
        <div class="p-8 flex flex-col items-center gap-6">
          <el-avatar :size="120" :src="userProfile.data?.avatar" class="shadow-lg">{{ userProfile.data?.username?.[0]
          }}</el-avatar>
          <div class="text-center">
            <div class="text-2xl font-bold mb-2">{{ userProfile.data?.username || userProfile.data?.name || '未知用户' }}
            </div>
            <div class="text-sm opacity-60 font-mono">ID: {{ userProfile.data?.userId || userProfile.data?.id }}</div>
          </div>
          <el-descriptions :column="1" border class="w-full mt-4">
            <el-descriptions-item label="昵称">{{ userProfile.data?.username || userProfile.data?.name
            }}</el-descriptions-item>
            <el-descriptions-item label="平台">{{ selectedBotPlatform }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-main>
    </el-container>

    <!-- 用户资料弹窗 (桌面端) -->
    <el-dialog v-if="!isMobile" v-model="userProfileVisible" title="用户资料" width="400px" center teleported align-center>
      <div class="flex flex-col items-center gap-4 py-4">
        <el-avatar :size="80" :src="userProfile.data?.avatar" class="shadow">{{ userProfile.data?.username?.[0]
        }}</el-avatar>
        <div class="text-center">
          <div class="text-xl font-bold">{{ userProfile.data?.username || userProfile.data?.name || '未知用户' }}</div>
          <div class="text-xs opacity-50 mt-1 font-mono">ID: {{ userProfile.data?.userId || userProfile.data?.id }}
          </div>
        </div>
        <el-descriptions :column="1" border class="w-full mt-4">
          <el-descriptions-item label="昵称">{{ userProfile.data?.username || userProfile.data?.name
          }}</el-descriptions-item>
          <el-descriptions-item label="平台">{{ selectedBotPlatform }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- 合并转发详情弹窗 (桌面端) -->
    <el-dialog v-if="!isMobile" v-model="forwardDialogVisible" title="聊天记录" width="550px" class="forward-dialog"
      teleported>
      <el-scrollbar max-height="70vh">
        <div class="p-6 space-y-6 bg-gray-50 dark:bg-black/10">
          <div v-for="(msg, idx) in forwardData.messages" :key="idx" class="flex gap-3">
            <el-avatar :size="36" :src="msg.attrs?.avatar" class="flex-shrink-0 shadow-sm">{{ msg.attrs?.nickname?.[0]
            }}</el-avatar>
            <div class="flex-1 overflow-hidden">
              <div class="text-xs text-[var(--k-text-color-secondary)] mb-1 font-bold">{{ msg.attrs?.nickname }}</div>
              <div
                class="p-3 bg-[var(--k-card-bg)] rounded-2xl rounded-tl-none shadow-sm text-sm break-all border border-[var(--k-border-color)]">
                <render-element v-for="(el, i) in msg.children" :key="i" :element="el" :bot-id="selectedBot"
                  :channel-id="selectedChannel" />
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </el-dialog>

    <!-- 图片查看器弹窗 (桌面端) -->
    <el-dialog v-if="!isMobile" v-model="imageViewerVisible" title="查看图片" width="fit-content"
      class="image-viewer-dialog" teleported center>
      <div class="flex flex-col items-center gap-4">
        <img :src="imageViewer.url" class="max-w-full max-h-[70vh] rounded shadow-lg" />
        <el-button type="primary" icon="Download" @click="downloadImage(imageViewer.url)">下载图片</el-button>
      </div>
    </el-dialog>

    <!-- 原始消息查看弹窗 (桌面端) -->
    <el-dialog v-if="!isMobile" v-model="rawMessageVisible" title="原始消息内容" width="600px" center teleported align-center>
      <div class="flex flex-col gap-4">
        <el-input v-model="rawMessage.content" type="textarea" :rows="12" readonly class="raw-content-area" />
        <div class="flex justify-center gap-3">
          <el-button type="primary"
            @click="copyToClipboard(rawMessage.content).then(() => ElMessage.success('已复制到剪贴板'))">复制全部内容</el-button>
          <el-button @click="rawMessageVisible = false">关闭</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 右键菜单 -->
    <div v-if="menu.show"
      class="fixed bg-[var(--k-card-bg)] border border-[var(--k-border-color)] shadow-xl z-[2000] py-1.5 rounded-lg min-w-[140px] backdrop-blur-sm bg-opacity-90"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }">

      <!-- 机器人/频道菜单 -->
      <template v-if="menu.type === 'bot' || menu.type === 'channel'">
        <div
          class="px-4 py-2.5 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
          @click="onHandleMenuAction('pin')">
          <el-icon>
            <Star />
          </el-icon> {{ menu.isPinned ? '取消置顶' : '置顶' }}
        </div>
        <div
          class="px-4 py-2.5 cursor-pointer text-sm text-red-500 hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
          @click="onHandleMenuAction('delete')">
          <el-icon>
            <Delete />
          </el-icon> 删除数据
        </div>
      </template>

      <!-- 消息菜单 -->
      <template v-else-if="menu.type === 'message'">
        <div
          class="px-4 py-2.5 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
          @click="handleMessageAction('copy')">
          <el-icon>
            <DocumentCopy />
          </el-icon> 复制文本
        </div>
        <div
          class="px-4 py-2.5 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
          @click="handleMessageAction('copy-raw')">
          <el-icon>
            <Collection />
          </el-icon> 查看原始消息
        </div>
        <div
          class="px-4 py-2.5 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
          @click="handleMessageAction('plus1')">
          <el-icon>
            <CirclePlus />
          </el-icon> +1 复读
        </div>
        <div
          class="px-4 py-2.5 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
          @click="handleMessageAction('reply')">
          <el-icon>
            <ChatLineRound />
          </el-icon> 回复
        </div>
        <div v-if="menu.hasMedia"
          class="px-4 py-2.5 cursor-pointer text-sm hover:bg-[var(--k-button-hover-bg)] transition-colors flex items-center gap-2"
          @click="handleMessageAction('download')">
          <el-icon>
            <Download />
          </el-icon> 下载媒体
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, h, defineComponent, onMounted, reactive, watch, computed, nextTick } from 'vue'
import { StarFilled, Star, Picture, CircleCloseFilled, ArrowLeft, Delete, Collection, Download, Loading, DocumentCopy, CirclePlus, ChatLineRound, Close, Top } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { send } from '@koishijs/client'
import { useChatLogic } from './chat-logic'

const {
  bots, selectedBot, selectedChannel, currentChannels, currentMessages, currentChannelName,
  inputText, uploadedImages, isSending, pinnedBots, pinnedChannels, scrollRef,
  isMobile, mobileView, goBack, forwardData, imageViewer, imageZoom, rawMessage, isLoadingHistory,
  forwardDialogVisible, imageViewerVisible, rawMessageVisible, replyingTo, userProfile, userProfileVisible,
  selectedBotPlatform, keyboardHeight,
  selectBot, selectChannel, handleSend, togglePinBot, togglePinChannel, deleteBotData, deleteChannelData,
  getCachedImageUrl, cacheImage, showForward, openImageViewer, handleImageWheel, downloadImage, handleScroll,
  repeatMessage, handlePaste, copyToClipboard, onBotMenu, onChannelMenu, onMessageMenu, handleMenuAction, handleMessageAction, showUserProfile,
  menu, inputRef, scrollToMessage
} = useChatLogic()

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const onHandleMenuAction = async (action: string) => {
  if (action === 'delete') {
    try {
      await ElMessageBox.confirm('确定删除所有数据吗？此操作不可恢复。', '警告', {
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      })
      await handleMenuAction(action)
    } catch (e) {
      // 取消删除
    }
  } else {
    await handleMenuAction(action)
  }
}

// 消息渲染组件
const RenderElement = defineComponent({
  props: ['element', 'botId', 'channelId', 'inQuote'],
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

    // 图片加载完成后尝试滚动到底部（如果当前就在底部附近）
    const onImageLoad = () => {
      if (props.inQuote) return
      const wrap = document.querySelector('.el-main .el-scrollbar__wrap')
      if (wrap) {
        const isAtBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 150
        if (isAtBottom) {
          nextTick(() => {
            wrap.scrollTop = wrap.scrollHeight
          })
        }
      }
    }

    return () => {
      const { element, botId, channelId } = props
      const type = element.type
      const attrs = element.attrs

      if (type === 'text') return h('span', attrs.content)
      if (type === 'img' || type === 'image' || type === 'mface') {
        if (props.inQuote) return h('span', { class: 'opacity-60 italic mx-1' }, '[图片]')
        const isMface = type === 'mface'
        return h('div', { class: 'block my-1.5' }, [
          h('img', {
            src: imgUrl.value,
            class: ['rounded-lg shadow-sm border border-black/5 block cursor-pointer hover:opacity-90 transition-opacity', isMface ? 'max-w-[100px] max-h-[100px]' : 'max-w-full max-h-[400px]'],
            style: `min-width: ${isMface ? '30px' : '50px'}; min-height: ${isMface ? '30px' : '50px'}; object-fit: contain; background: rgba(0,0,0,0.05)`,
            onClick: (e: Event) => {
              e.stopPropagation()
              openImageViewer(imgUrl.value)
            },
            onLoad: onImageLoad,
            onError: (e: any) => {
              e.target.src = ''
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

      // 处理 p 元素和 i18n
      if (type === 'p') {
        return h('div', { class: 'my-1 block min-h-[1em]' }, (element.children || []).map((child: any, i: number) => h(RenderElement, { key: i, element: child, botId, channelId })))
      }
      if (type === 'i18n') {
        return h('span', { class: 'opacity-80 italic' }, `[${attrs.path || 'i18n'}]`)
      }

      // 合并转发渲染
      if (type === 'figure' || type === 'forward') {
        return h('div', {
          class: 'my-2 p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 max-w-[300px] cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
          onClick: (e: Event) => { e.stopPropagation(); showForward(element.children || []) }
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

.chat-patch-wrapper .raw-content-area .el-textarea__inner {
  font-family: monospace;
  font-size: 14px;
  line-height: 1.5;
  background: var(--k-card-bg) !important;
}

.chat-patch-wrapper .el-button--primary {
  border-radius: 10px;
}

.forward-dialog .el-dialog__body {
  padding: 0;
}

.image-viewer-dialog .el-dialog__header {
  padding-bottom: 10px;
}
</style>