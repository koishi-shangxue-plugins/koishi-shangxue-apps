<template>
  <div class="nextchat-settings">
    <k-comment type="primary">
      <div class="content">
        <p class="subtitle"></p>
        <p class="subtitle">点击下方按钮在新窗口打开 NextChat 界面</p>

        <div class="button-container">
          <k-button type="primary" size="large" @click="openNextChat">
            <k-icon name="external-link" />
            点我打开 NextChat
          </k-button>
        </div>

        <div class="info-section">
          <h3>配置信息</h3>
          <div class="info-item">
            <span class="label">API 地址：</span>
            <code>{{ apiUrl }}</code>
          </div>
          <div class="info-item">
            <span class="label">访问令牌：</span>
            <code>{{ config?.token || 'sk-nextchat-koishi-adapter' }}</code>
          </div>
        </div>
      </div>
    </k-comment>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, ref } from 'vue';

const config = inject('manager.settings.config', ref({})) as any;

// 计算API地址
const apiUrl = computed(() => {
  const protocol = window.location.protocol;
  const host = window.location.host;
  const path = config.value?.path || '/nextchat/v1/chat/completions';
  return `${protocol}//${host}${path}`;
});

// 打开NextChat
function openNextChat() {
  const protocol = window.location.protocol;
  const host = window.location.host;

  let nextchatBaseUrl = config.value?.NextChat_host || 'https://chat.bailili.top/#/';

  try {
    const url = new URL(nextchatBaseUrl);
    nextchatBaseUrl = `${url.protocol}//${url.host}`;
  } catch (e) {
    if (!nextchatBaseUrl.startsWith('http://') && !nextchatBaseUrl.startsWith('https://')) {
      nextchatBaseUrl = `https://${nextchatBaseUrl}`;
    }
  }

  const settings = {
    key: config.value?.token || 'sk-nextchat-koishi-adapter',
    url: `${protocol}//${host}/nextchat`,
  };

  const settingsQuery = encodeURIComponent(JSON.stringify(settings));
  const targetUrl = `${nextchatBaseUrl}/#/?settings=${settingsQuery}`;

  window.open(targetUrl, '_blank');
}
</script>

<style lang="scss" scoped>
.nextchat-settings {
  padding: 0;
  margin-top: -1rem;
  margin-bottom: -1rem;

  .content {
    padding: 0;
  }

  h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: #333;
  }

  .subtitle {
    margin: 0 0 1.5rem 0;
    color: #666;
    line-height: 1.6;
  }

  .button-container {
    margin: 1.5rem 0;
    text-align: center;

    .k-button {
      padding: 0.75rem 2rem;
      font-size: 1.1rem;
      font-weight: 600;
      border: 3px solid #5a67d8 !important;
      box-shadow: 0 2px 8px rgba(90, 103, 216, 0.3);
      transition: all 0.3s ease;

      &:hover {
        border-color: #4c51bf !important;
        box-shadow: 0 4px 12px rgba(90, 103, 216, 0.5);
        transform: translateY(-1px);
      }
    }
  }

  .info-section {
    margin: 1.5rem 0;
    padding: 1rem;
    background: rgba(248, 249, 250, 0.5);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;

    h3 {
      margin: 0 0 0.75rem 0;
      font-size: 1.1rem;
      color: #333;
    }

    .info-item {
      margin: 0.5rem 0;
      line-height: 1.8;

      .label {
        font-weight: 600;
        color: #555;
      }

      code {
        background: rgba(233, 236, 239, 0.6);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-family: "Courier New", monospace;
        font-size: 0.9rem;
        color: #d63384;
      }
    }
  }

  .warning-section {
    margin-top: 1.5rem;

    h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
      color: #856404;
    }

    p {
      margin: 0.5rem 0;
      line-height: 1.6;
    }

    ul {
      margin: 0.5rem 0 0 1.5rem;
      padding: 0;

      li {
        margin: 0.3rem 0;
        line-height: 1.6;
      }
    }

    code {
      background: #fff3cd;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-family: "Courier New", monospace;
      font-size: 0.9rem;
      color: #856404;
    }
  }
}
</style>