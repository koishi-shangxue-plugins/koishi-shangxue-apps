<template>
  <div class="logs">
    <!-- 统计信息 -->
    <div class="stats-section">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-value">{{ stats.todayMessageCount }}</div>
            <div class="stat-label">今日屏蔽消息数</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-value">{{ stats.todayCommandCount }}</div>
            <div class="stat-label">今日屏蔽指令数</div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-label" style="margin-bottom: 8px">最活跃的被屏蔽用户</div>
            <div v-if="stats.topUsers.length === 0" class="stat-empty">暂无数据</div>
            <div v-else class="stat-list">
              <div v-for="user in stats.topUsers.slice(0, 3)" :key="user.userId" class="stat-item">
                <span class="stat-item-label">{{ user.userId }}</span>
                <span class="stat-item-value">{{ user.count }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-label" style="margin-bottom: 8px">最常被屏蔽的指令</div>
            <div v-if="stats.topCommands.length === 0" class="stat-empty">暂无数据</div>
            <div v-else class="stat-list">
              <div v-for="cmd in stats.topCommands.slice(0, 3)" :key="cmd.command" class="stat-item">
                <span class="stat-item-label">{{ cmd.command }}</span>
                <span class="stat-item-value">{{ cmd.count }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 日志列表 -->
    <el-card class="logs-card">
      <template #header>
        <div class="card-header">
          <span>日志列表</span>
          <div class="header-actions">
            <el-button @click="loadLogs" :icon="Refresh">刷新</el-button>
            <el-button @click="exportLogs" :icon="Download">导出日志</el-button>
            <el-button type="danger" @click="handleClearLogs" :icon="Delete">清空日志</el-button>
          </div>
        </div>
      </template>

      <!-- 筛选器 -->
      <div class="filters">
        <el-select v-model="filterType" placeholder="类型" clearable style="width: 120px">
          <el-option label="消息" value="message" />
          <el-option label="指令" value="command" />
        </el-select>
        <el-input v-model="filterUserId" placeholder="用户 ID" clearable style="width: 200px" />
        <el-button type="primary" @click="loadLogs">筛选</el-button>
      </div>

      <!-- 表格 -->
      <el-table v-loading="loading" :data="logs" style="width: 100%; margin-top: 16px" :empty-text="emptyText">
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.type === 'message' ? 'primary' : 'success'">
              {{ row.type === 'message' ? '消息' : '指令' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="userId" label="用户 ID" width="150" />
        <el-table-column prop="channelId" label="频道 ID" width="150">
          <template #default="{ row }">
            <span style="color: #909399">{{ row.channelId || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="guildId" label="群组 ID" width="150">
          <template #default="{ row }">
            <span style="color: #909399">{{ row.guildId || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="platform" label="平台" width="100">
          <template #default="{ row }">
            <span style="color: #909399">{{ row.platform || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容/指令" min-width="200" show-overflow-tooltip />
        <el-table-column prop="reason" label="屏蔽原因" width="150" />
      </el-table>

      <!-- 分页 -->
      <el-pagination v-if="total > 0" v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]" :total="total" layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 16px; justify-content: flex-end" @current-change="loadLogs" @size-change="loadLogs" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Download, Delete } from '@element-plus/icons-vue'
import { getLogs, clearLogs, getStats, type BlockLog, type Stats } from '../../utils/api'

const logs = ref<BlockLog[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const filterType = ref<'message' | 'command' | ''>('')
const filterUserId = ref('')
const loading = ref(false)
const stats = ref<Stats>({
  todayMessageCount: 0,
  todayCommandCount: 0,
  topUsers: [],
  topCommands: []
})

let refreshTimer: NodeJS.Timeout | null = null

const emptyText = computed(() => {
  return loading.value ? '加载中...' : '暂无日志'
})

// 加载日志
const loadLogs = async () => {
  loading.value = true
  try {
    const result = await getLogs({
      page: currentPage.value,
      limit: pageSize.value,
      type: filterType.value || undefined,
      userId: filterUserId.value || undefined
    })
    logs.value = result.logs
    total.value = result.total
  } catch (error) {
    ElMessage.error('加载日志失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

// 加载统计信息
const loadStats = async () => {
  try {
    stats.value = await getStats()
  } catch (error) {
    console.error('加载统计信息失败:', error)
  }
}

// 清空日志
const handleClearLogs = () => {
  ElMessageBox.confirm('确定要清空所有日志吗？此操作不可恢复。', '确认清空', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await clearLogs()
      ElMessage.success('日志已清空')
      loadLogs()
      loadStats()
    } catch (error) {
      ElMessage.error('清空日志失败')
      console.error(error)
    }
  }).catch(() => {
    // 取消清空
  })
}

// 导出日志
const exportLogs = () => {
  const dataStr = JSON.stringify(logs.value, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `keyword-blocker-logs-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('日志已导出')
}

// 格式化时间
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 启动自动刷新
const startAutoRefresh = () => {
  refreshTimer = setInterval(() => {
    loadLogs()
    loadStats()
  }, 10000) // 每10秒刷新一次
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  loadLogs()
  loadStats()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped lang="scss">
.logs {
  .stats-section {
    margin-bottom: 20px;

    .stat-card {
      text-align: center;

      .stat-value {
        font-size: 32px;
        font-weight: 600;
        color: var(--el-color-primary);
        margin-bottom: 8px;
      }

      .stat-label {
        font-size: 14px;
        color: #909399;
      }

      .stat-empty {
        font-size: 13px;
        color: #c0c4cc;
      }

      .stat-list {
        .stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 13px;

          .stat-item-label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-right: 8px;
          }

          .stat-item-value {
            font-weight: 600;
            color: var(--el-color-primary);
          }
        }
      }
    }
  }

  .logs-card {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .header-actions {
        display: flex;
        gap: 8px;
      }
    }

    .filters {
      display: flex;
      gap: 12px;
      align-items: center;
    }
  }
}
</style>
