<template>
  <div class="chat-onebot-container">
    <iframe :src="iframeUrl" class="chat-onebot-iframe" frameborder="0"
      allow="clipboard-read; clipboard-write"></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { send } from '@koishijs/client'

// iframe URL
const iframeUrl = ref('/chat-onebot/')

// 获取配置并设置 URL
onMounted(async () => {
  try {
    const result: any = await (send as any)('chat-onebot/get-config')
    if (result?.mode === 'online') {
      iframeUrl.value = 'https://stapxs.github.io/Stapxs-QQ-Lite-2.0/'
    } else {
      iframeUrl.value = '/chat-onebot/'
    }
  } catch (e) {
    // 默认使用本地模式
    iframeUrl.value = '/chat-onebot/'
  }
})
</script>

<style scoped>
.chat-onebot-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.chat-onebot-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>