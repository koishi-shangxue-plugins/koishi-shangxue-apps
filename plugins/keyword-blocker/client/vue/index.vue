<template>
  <k-layout>
    <div class="keyword-blocker-container">
      <!-- 顶部导航栏 -->
      <div class="header">
        <h1 class="title">关键词屏蔽管理</h1>
        <div class="actions">
          <el-button @click="refreshData" :icon="Refresh" circle />
          <el-button @click="exportConfig" :icon="Download">导出配置</el-button>
          <el-button @click="showImportDialog = true" :icon="Upload">导入配置</el-button>
          <el-button type="primary" @click="saveConfig" :icon="Check" :loading="saving">保存所有更改</el-button>
        </div>
      </div>

      <!-- Tab 切换 -->
      <el-tabs v-model="activeTab" class="tabs">
        <el-tab-pane label="消息级过滤" name="message">
          <MessageFilter v-model="config" />
        </el-tab-pane>
        <el-tab-pane label="指令级权限控制" name="command">
          <CommandFilter v-model="config" />
        </el-tab-pane>
        <el-tab-pane label="系统设置" name="settings">
          <Settings v-model="config" />
        </el-tab-pane>
        <el-tab-pane label="日志查看" name="logs">
          <Logs />
        </el-tab-pane>
      </el-tabs>

      <!-- 导入配置对话框 -->
      <el-dialog v-model="showImportDialog" title="导入配置" width="500px">
        <el-upload drag :auto-upload="false" :on-change="handleImport" accept=".json" :limit="1">
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">
            将 JSON 文件拖到此处，或<em>点击上传</em>
          </div>
        </el-upload>
      </el-dialog>
    </div>
  </k-layout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Download, Upload, Check, UploadFilled } from '@element-plus/icons-vue'
import MessageFilter from './components/MessageFilter.vue'
import CommandFilter from './components/CommandFilter.vue'
import Settings from './components/Settings.vue'
import Logs from './components/Logs.vue'
import { getConfig, updateConfig, type Config } from '../utils/api'

const activeTab = ref('message')
const config = ref<Config>({
  filterMode: 'blacklist',
  blacklist: [],
  whitelist: [],
  enableCommandFilter: false,
  commandFilterMode: 'blacklist',
  commandBlacklist: [],
  commandWhitelist: [],
  reregisterInterval: 100,
  logBlocked: false,
  replyNoPermission: true
})
const saving = ref(false)
const showImportDialog = ref(false)

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

// 刷新数据
const refreshData = () => {
  loadConfig()
  ElMessage.success('数据已刷新')
}

// 保存配置
const saveConfig = async () => {
  saving.value = true
  try {
    const result = await updateConfig(config.value)
    if (result.success) {
      ElMessage.success('保存成功')
    } else {
      ElMessage.error(result.message || '保存失败')
    }
  } catch (error) {
    ElMessage.error('保存失败')
    console.error(error)
  } finally {
    saving.value = false
  }
}

// 导出配置
const exportConfig = () => {
  const dataStr = JSON.stringify(config.value, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `keyword-blocker-config-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('配置已导出')
}

// 导入配置
const handleImport = (file: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const importedConfig = JSON.parse(e.target?.result as string)
      ElMessageBox.confirm('确定要导入此配置吗？这将覆盖当前配置。', '确认导入', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        config.value = importedConfig
        showImportDialog.value = false
        ElMessage.success('配置已导入，请点击保存按钮应用更改')
      }).catch(() => {
        ElMessage.info('已取消导入')
      })
    } catch (error) {
      ElMessage.error('配置文件格式错误')
      console.error(error)
    }
  }
  reader.readAsText(file.raw)
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped lang="scss">
.keyword-blocker-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;

    .title {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
    }

    .actions {
      display: flex;
      gap: 12px;
    }
  }

  .tabs {
    :deep(.el-tabs__content) {
      padding-top: 20px;
    }
  }
}
</style>
