<template>
  <div class="chat-onebot-container">
    <iframe ref="iframeRef" :src="iframeUrl" class="chat-onebot-iframe" frameborder="0"
      allow="clipboard-read; clipboard-write"></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { send } from '@koishijs/client'

// iframe 引用
const iframeRef = ref<HTMLIFrameElement>()
// iframe URL
const iframeUrl = ref('/chat-onebot/')
// WebSocket 地址
const wsAddress = ref('')

// 获取配置并设置 URL
onMounted(async () => {
  try {
    const result: any = await (send as any)('chat-onebot/get-config')
    if (result?.mode === 'online') {
      iframeUrl.value = 'https://stapxs.github.io/Stapxs-QQ-Lite-2.0/'
    } else {
      iframeUrl.value = '/chat-onebot/'
    }
    // 保存 WebSocket 地址
    wsAddress.value = result?.wsAddress || ''

    // 监听 iframe 加载完成
    if (iframeRef.value) {
      iframeRef.value.addEventListener('load', injectWebSocketAddress)
    }
  } catch (e) {
    // 默认使用本地模式
    iframeUrl.value = '/chat-onebot/'
  }
})

// 注入 WebSocket 地址到 iframe
function injectWebSocketAddress() {
  if (!iframeRef.value || !wsAddress.value) return

  try {
    const iframeWindow = iframeRef.value.contentWindow
    if (!iframeWindow) return

    // 使用 MutationObserver 监听 DOM 变化
    const script = iframeWindow.document.createElement('script')
    script.textContent = `
      (function() {
        const wsAddress = ${JSON.stringify(wsAddress.value)};
        
        // 尝试填充输入框
        function tryFillInput() {
          const input = document.querySelector('#sev_address');
          if (input && input.value === '') {
            input.value = wsAddress;
            return true;
          }
          return false;
        }
        
        // 立即尝试
        if (tryFillInput()) return;
        
        // 使用 MutationObserver 监听 DOM 变化
        const observer = new MutationObserver(() => {
          if (tryFillInput()) {
            observer.disconnect();
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // 10秒后停止监听
        setTimeout(() => observer.disconnect(), 10000);
      })();
    `
    iframeWindow.document.head.appendChild(script)
  } catch (e) {
    // 跨域限制，无法注入
    console.warn('无法注入 WebSocket 地址（可能是跨域限制）')
  }
}
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