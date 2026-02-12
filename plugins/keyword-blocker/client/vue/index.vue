<template>
  <div class="keyword-blocker-wrapper">
    <div class="keyword-blocker-container">
      <!-- Tab 切换 -->
      <el-tabs v-model="activeTab" class="tabs">
        <el-tab-pane label="消息级过滤" name="message">
          <MessageFilter v-model="config" @update:modelValue="handleConfigChange" />
        </el-tab-pane>
        <el-tab-pane label="指令级权限控制" name="command">
          <CommandFilter v-model="config" @update:modelValue="handleConfigChange" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import MessageFilter from './components/MessageFilter.vue'
import CommandFilter from './components/CommandFilter.vue'
import { getConfig, updateConfig, type WebUIConfig } from '../utils/api'

const activeTab = ref('message')
const config = ref<WebUIConfig>({
  filterMode: 'blacklist',
  blacklist: [],
  whitelist: [],
  enableCommandFilter: false,
  commandFilterMode: 'blacklist',
  commandBlacklist: [],
  commandWhitelist: []
})

let saveTimer: NodeJS.Timeout | null = null

// 加载配置
const loadConfig = async () => {
  try {
    const data = await getConfig()
    config.value = data
  } catch (error) {
    ElMessage.error('加载配置失败')
    console.error(error)
  }
}

// 处理配置变化（带防抖的自动保存）
const handleConfigChange = (newConfig: WebUIConfig) => {
  config.value = newConfig

  // 清除之前的定时器
  if (saveTimer) {
    clearTimeout(saveTimer)
  }

  // 设置新的定时器，500ms 后保存
  saveTimer = setTimeout(async () => {
    try {
      await updateConfig(config.value)
      ElMessage.success('配置已自动保存')
    } catch (error) {
      ElMessage.error('保存配置失败')
      console.error(error)
    }
  }, 500)
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped lang="scss">
.keyword-blocker-wrapper {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.keyword-blocker-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 100%;

  .tabs {
    :deep(.el-tabs__content) {
      padding-top: 20px;
    }
  }
}
</style>
