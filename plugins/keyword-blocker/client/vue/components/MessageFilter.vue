<template>
  <div class="message-filter">
    <!-- 模式切换 -->
    <div class="mode-selector">
      <el-radio-group v-model="localConfig.filterMode">
        <el-radio value="blacklist">黑名单模式</el-radio>
        <el-radio value="whitelist">白名单模式</el-radio>
      </el-radio-group>
      <el-alert :title="modeDescription" type="info" :closable="false" show-icon style="margin-top: 12px" />
    </div>

    <!-- 规则列表 -->
    <div class="rules-section">
      <div class="section-header">
        <h3>过滤规则列表</h3>
        <el-input v-model="searchText" placeholder="搜索过滤值或原因" :prefix-icon="Search" style="width: 300px" clearable />
      </div>

      <el-table :data="filteredRules" style="width: 100%" :empty-text="emptyText">
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column prop="type" label="过滤类型" width="150">
          <template #default="{ row }">
            <el-tag :type="getTypeTagType(row.type)">{{ getTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="value" label="过滤值" min-width="200" />
        <el-table-column prop="reason" label="过滤原因" min-width="200">
          <template #default="{ row }">
            <span style="color: #909399">{{ row.reason || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row, $index }">
            <el-button link type="primary" @click="editRule($index)">编辑</el-button>
            <el-button link type="danger" @click="deleteRule($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination v-if="currentRules.length > 0" v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]" :total="currentRules.length" layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 16px; justify-content: flex-end" />
    </div>

    <!-- 添加规则按钮 -->
    <el-button type="primary" :icon="Plus" circle size="large" class="add-button" @click="showAddDialog = true" />

    <!-- 添加/编辑规则对话框 -->
    <el-dialog v-model="showAddDialog" :title="editingIndex === -1 ? '添加规则' : '编辑规则'" width="500px">
      <el-form :model="editingRule" label-width="100px">
        <el-form-item label="过滤类型" required>
          <el-select v-model="editingRule.type" placeholder="请选择过滤类型">
            <el-option label="用户 ID" value="userId" />
            <el-option label="频道 ID" value="channelId" />
            <el-option label="群组 ID" value="guildId" />
            <el-option label="平台名称" value="platform" />
          </el-select>
        </el-form-item>
        <el-form-item label="过滤值" required>
          <el-input v-model="editingRule.value" placeholder="请输入过滤值" />
        </el-form-item>
        <el-form-item label="过滤原因">
          <el-input v-model="editingRule.reason" type="textarea" :rows="3" placeholder="请输入过滤原因（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import type { Config, FilterRule } from '../utils/api'

const props = defineProps<{
  modelValue: Config
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Config]
}>()

const localConfig = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const searchText = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const showAddDialog = ref(false)
const editingIndex = ref(-1)
const editingRule = ref<FilterRule>({
  type: 'userId',
  value: '',
  reason: ''
})

// 当前使用的规则列表
const currentRules = computed(() => {
  return localConfig.value.filterMode === 'blacklist'
    ? localConfig.value.blacklist
    : localConfig.value.whitelist
})

// 过滤后的规则列表
const filteredRules = computed(() => {
  let rules = currentRules.value
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    rules = rules.filter(rule =>
      rule.value.toLowerCase().includes(search) ||
      rule.reason?.toLowerCase().includes(search)
    )
  }
  const start = (currentPage.value - 1) * pageSize.value
  return rules.slice(start, start + pageSize.value)
})

// 模式描述
const modeDescription = computed(() => {
  return localConfig.value.filterMode === 'blacklist'
    ? '黑名单模式：屏蔽名单中的对象，其他放行'
    : '白名单模式：只允许名单中的对象，其他屏蔽'
})

// 空状态文本
const emptyText = computed(() => {
  return searchText.value ? '没有找到匹配的规则' : '暂无规则，点击右下角按钮添加'
})

// 获取类型标签颜色
const getTypeTagType = (type: string) => {
  const typeMap: Record<string, any> = {
    userId: 'primary',
    channelId: 'success',
    guildId: 'warning',
    platform: 'info'
  }
  return typeMap[type] || ''
}

// 获取类型标签文本
const getTypeLabel = (type: string) => {
  const labelMap: Record<string, string> = {
    userId: '用户 ID',
    channelId: '频道 ID',
    guildId: '群组 ID',
    platform: '平台名称'
  }
  return labelMap[type] || type
}

// 编辑规则
const editRule = (index: number) => {
  const actualIndex = (currentPage.value - 1) * pageSize.value + index
  editingIndex.value = actualIndex
  editingRule.value = { ...currentRules.value[actualIndex] }
  showAddDialog.value = true
}

// 删除规则
const deleteRule = (index: number) => {
  const actualIndex = (currentPage.value - 1) * pageSize.value + index
  ElMessageBox.confirm('确定要删除这条规则吗？', '确认删除', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const rules = [...currentRules.value]
    rules.splice(actualIndex, 1)
    updateRules(rules)
    ElMessage.success('删除成功')
  }).catch(() => {
    // 取消删除
  })
}

// 确认编辑
const confirmEdit = () => {
  if (!editingRule.value.value) {
    ElMessage.warning('请输入过滤值')
    return
  }

  const rules = [...currentRules.value]
  if (editingIndex.value === -1) {
    // 添加新规则
    rules.push({ ...editingRule.value })
    ElMessage.success('添加成功')
  } else {
    // 编辑现有规则
    rules[editingIndex.value] = { ...editingRule.value }
    ElMessage.success('修改成功')
  }

  updateRules(rules)
  showAddDialog.value = false
  resetEditingRule()
}

// 更新规则列表
const updateRules = (rules: FilterRule[]) => {
  const newConfig = { ...localConfig.value }
  if (newConfig.filterMode === 'blacklist') {
    newConfig.blacklist = rules
  } else {
    newConfig.whitelist = rules
  }
  emit('update:modelValue', newConfig)
}

// 重置编辑状态
const resetEditingRule = () => {
  editingIndex.value = -1
  editingRule.value = {
    type: 'userId',
    value: '',
    reason: ''
  }
}

// 监听对话框关闭
watch(showAddDialog, (val) => {
  if (!val) {
    resetEditingRule()
  }
})
</script>

<style scoped lang="scss">
.message-filter {
  .mode-selector {
    margin-bottom: 24px;
  }

  .rules-section {
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
    }
  }

  .add-button {
    position: fixed;
    right: 40px;
    bottom: 40px;
    z-index: 100;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  }
}
</style>
