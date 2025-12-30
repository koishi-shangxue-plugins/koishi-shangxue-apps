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
      iframeUrl.value = '/chat-onebot/local'
    }
    // 保存 WebSocket 地址
    wsAddress.value = result?.wsAddress || ''

    // 监听 iframe 加载完成（仅本地模式可以注入）
    if (iframeRef.value && result?.mode !== 'online') {
      iframeRef.value.addEventListener('load', injectWebSocketAddress)
    }
  } catch (e) {
    // 默认使用本地模式
    iframeUrl.value = '/chat-onebot/local'
  }
})

// 注入 WebSocket 地址到 iframe
function injectWebSocketAddress() {
  if (!iframeRef.value || !wsAddress.value) {
    console.log('[chat-onebot] 跳过注入：', { hasIframe: !!iframeRef.value, hasWsAddress: !!wsAddress.value })
    return
  }

  try {
    const iframeWindow = iframeRef.value.contentWindow
    if (!iframeWindow) {
      console.log('[chat-onebot] iframe window 不可用')
      return
    }

    console.log('[chat-onebot] 开始注入 WebSocket 地址:', wsAddress.value)

    // 使用 MutationObserver 监听 DOM 变化
    const script = iframeWindow.document.createElement('script')
    script.textContent = `
      (function() {
        const wsAddress = ${JSON.stringify(wsAddress.value)};
        console.log('[chat-onebot] 注入脚本已加载，WebSocket 地址:', wsAddress);
        
        // 尝试填充输入框（模拟真实用户输入）
        function tryFillInput() {
          // 检查是否有"连接到 OneBot"关键词
          const hasKeyword = document.body.textContent.includes('连接到 OneBot');
          if (!hasKeyword) {
            console.log('[chat-onebot] 未找到关键词"连接到 OneBot"');
            return false;
          }
          
          const input = document.querySelector('#sev_address');
          console.log('[chat-onebot] 找到关键词，查找输入框:', input);
          
          if (input) {
            console.log('[chat-onebot] 找到输入框，当前值:', input.value);
            if (input.value === '') {
              // 聚焦输入框
              input.focus();
              console.log('[chat-onebot] 已聚焦输入框');
              
              // 模拟逐字符输入
              let currentValue = '';
              const chars = wsAddress.split('');
              let charIndex = 0;
              
              const typeChar = () => {
                if (charIndex < chars.length) {
                  currentValue += chars[charIndex];
                  input.value = currentValue;
                  
                  // 触发输入事件
                  const inputEvent = new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    data: chars[charIndex]
                  });
                  input.dispatchEvent(inputEvent);
                  
                  charIndex++;
                  setTimeout(typeChar, 10); // 每个字符间隔10ms
                } else {
                  // 输入完成，触发 change 事件
                  const changeEvent = new Event('change', { bubbles: true });
                  input.dispatchEvent(changeEvent);
                  
                  console.log('[chat-onebot] 模拟输入完成，最终值:', input.value);
                  
                  // 验证
                  setTimeout(() => {
                    const finalValue = document.querySelector('#sev_address')?.value;
                    console.log('[chat-onebot] 500ms后验证，输入框值:', finalValue);
                  }, 500);
                }
              };
              
              // 开始模拟输入
              setTimeout(typeChar, 100);
              
              return true;
            } else {
              console.log('[chat-onebot] 输入框已有值，跳过填充');
            }
          }
          return false;
        }
        
        // 立即尝试
        console.log('[chat-onebot] 立即尝试填充...');
        if (tryFillInput()) {
          console.log('[chat-onebot] 立即填充成功');
          return;
        }
        
        // 使用 MutationObserver 监听 DOM 变化
        console.log('[chat-onebot] 开始监听 DOM 变化...');
        const observer = new MutationObserver(() => {
          if (tryFillInput()) {
            console.log('[chat-onebot] 监听填充成功，停止监听');
            observer.disconnect();
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // 10秒后停止监听
        setTimeout(() => {
          console.log('[chat-onebot] 10秒超时，停止监听');
          observer.disconnect();
        }, 10000);
      })();
    `
    iframeWindow.document.head.appendChild(script)
    console.log('[chat-onebot] 注入脚本已添加到 iframe')
  } catch (e) {
    // 跨域限制，无法注入
    console.warn('[chat-onebot] 无法注入 WebSocket 地址（可能是跨域限制）:', e)
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