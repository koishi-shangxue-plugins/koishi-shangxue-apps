<template>
  <div class="message-filter">
    <!-- 模式切换 -->
    <div class="mode-selector">
      <el-radio-group v-model="localConfig.filterMode" @change="emitChange">
        <el-radio value="blacklist">黑名单模式</el-radio>
        <el-radio value="whitelist">白名单模式</el-radio>
      </el-radio-group>
      <el-alert :title="modeDescription" type="info" :closable="false" show-icon style="margin-top: 12px" />
    </div>

    <!-- 规则列表 -->
    <div class="rules-section">
      <div class="section-header">
        <h3>规则列表</h3>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <el-button type="primary" :icon="Plus" @click="showAddDialog = true">
          添加规则
        </el-button>
        <el-input v-model="searchText" placeholder="搜索过滤值或原因" :prefix-icon="Search"
          style="width: 300px; max-width: 100%" clearable />
      </div>

      <el-table :data="paginatedRules" style="width: 100%" empty-text="暂无规则">
        <el-table-column label="类型" width="100" sortable :sort-method="sortByType">
          <template #default="{ row }">
            {{ getTypeLabel(row.type) }}
          </template>
        </el-table-column>
        <el-table-column prop="value" label="过滤值" min-width="150" sortable />
        <el-table-column prop="reason" label="原因" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="editRule(row._originalIndex)">编辑</el-button>
            <el-button link type="danger" @click="deleteRule(row._originalIndex)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <el-pagination v-if="filteredRules.length > pageSize" v-model:current-page="currentPage" :page-size="pageSize"
        :total="filteredRules.length" layout="total, prev, pager, next"
        style="margin-top: 16px; display: flex; justify-content: center;" />
    </div>

    <!-- 添加/编辑规则对话框 -->
    <el-dialog v-model="showAddDialog" :title="editingIndex === -1 ? '添加规则' : '编辑规则'" width="500px">
      <el-form :model="editingRule" label-width="100px">
        <el-form-item label="过滤类型" required>
          <el-select v-model="editingRule.type" placeholder="请选择过滤类型" style="width: 100%">
            <el-option label="用户 ID" value="userId" />
            <el-option label="频道 ID" value="channelId" />
            <el-option label="群组 ID" value="guildId" />
            <el-option label="平台名称" value="platform" />
          </el-select>
        </el-form-item>
        <el-form-item label="过滤值" required>
          <el-input v-model="editingRule.value" :placeholder="getValuePlaceholder(editingRule.type)" />
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="editingRule.reason" type="textarea" :rows="3" placeholder="请输入原因（可选）" />
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
import { Plus, Search } from '@element-plus/icons-vue'
import type { WebUIConfig, FilterRule } from '../../utils/api'

const props = defineProps<{
  modelValue: WebUIConfig
}>()

const emit = defineEmits<{
  'update:modelValue': [value: WebUIConfig]
}>()

const localConfig = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const showAddDialog = ref(false)
const editingIndex = ref(-1)
const editingRule = ref<FilterRule>({
  type: 'userId',
  value: '',
  reason: ''
})

// 搜索和分页
const searchText = ref('')
const currentPage = ref(1)
const pageSize = ref(50)

// 当前使用的规则列表
const currentRules = computed(() => {
  return localConfig.value.filterMode === 'blacklist'
    ? localConfig.value.blacklist
    : localConfig.value.whitelist
})

// 过滤后的规则列表（根据搜索文本）
const filteredRules = computed(() => {
  if (!searchText.value.trim()) {
    return currentRules.value.map((rule, index) => ({ ...rule, _originalIndex: index }))
  }

  const search = searchText.value.toLowerCase()
  return currentRules.value
    .map((rule, index) => ({ ...rule, _originalIndex: index }))
    .filter(rule =>
      rule.value.toLowerCase().includes(search) ||
      (rule.reason && rule.reason.toLowerCase().includes(search))
    )
})

// 分页后的规则列表
const paginatedRules = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredRules.value.slice(start, end)
})

// 模式描述
const modeDescription = computed(() => {
  return localConfig.value.filterMode === 'blacklist'
    ? '黑名单模式：屏蔽名单中的对象，其他放行'
    : '白名单模式：只允许名单中的对象，其他屏蔽'
})

// 获取类型标签类型（统一使用 primary）
const getTypeTagType = (type: string) => {
  return 'primary'
}

// 获取类型标签文本
const getTypeLabel = (type: string) => {
  const labelMap: Record<string, string> = {
    userId: '用户',
    channelId: '频道',
    guildId: '群组',
    platform: '平台'
  }
  return labelMap[type] || type
}

// 类型排序方法
const sortByType = (a: any, b: any) => {
  const typeOrder = ['userId', 'channelId', 'guildId', 'platform']
  return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
}

// 获取输入框占位符
const getValuePlaceholder = (type: string) => {
  const placeholderMap: Record<string, string> = {
    userId: '请输入用户 ID',
    channelId: '请输入频道 ID',
    guildId: '请输入群组 ID',
    platform: '请输入平台名称（如：onebot）'
  }
  return placeholderMap[type] || '请输入过滤值'
}

// 检查是否与指令级权限控制冲突
const checkConflictWithCommandFilter = (type: string, value: string): boolean => {
  if (!localConfig.value.enableCommandFilter) {
    return false
  }

  const commandFilters = localConfig.value.commandFilterMode === 'blacklist'
    ? localConfig.value.commandBlacklist
    : localConfig.value.commandWhitelist

  return commandFilters.some(filter => filter.type === type && filter.value === value)
}

// 触发变化事件
const emitChange = () => {
  emit('update:modelValue', localConfig.value)
}

// 编辑规则
const editRule = (index: number) => {
  const rule = currentRules.value[index]

  editingIndex.value = index
  editingRule.value = {
    type: rule.type,
    value: rule.value,
    reason: rule.reason || ''
  }
  showAddDialog.value = true
}

// 删除规则
const deleteRule = (index: number) => {
  ElMessageBox.confirm('确定要删除这条规则吗？', '确认删除', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const rules = [...currentRules.value]
    rules.splice(index, 1)
    updateRules(rules)
    ElMessage.success('删除成功')
  }).catch(() => {
    // 取消删除
  })
}

// 确认编辑
const confirmEdit = async () => {
  if (!editingRule.value.type) {
    ElMessage.warning('请选择过滤类型')
    return
  }
  if (!editingRule.value.value.trim()) {
    ElMessage.warning('请输入过滤值')
    return
  }

  // 检查是否修改了 type 或 value
  const isValueChanged = editingIndex.value === -1 ||
    (currentRules.value[editingIndex.value].type !== editingRule.value.type ||
      currentRules.value[editingIndex.value].value !== editingRule.value.value)

  // 检查冲突（添加新规则或修改了 type/value 时检查）
  if (isValueChanged) {
    const hasConflict = checkConflictWithCommandFilter(editingRule.value.type, editingRule.value.value)
    if (hasConflict) {
      try {
        await ElMessageBox.confirm(
          `此${getTypeLabel(editingRule.value.type)}已经在【指令级权限控制】中，是否删除原有记录？`,
          '检测到冲突',
          {
            confirmButtonText: '删除并继续',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        // 删除指令级权限控制中的冲突记录
        const newConfig = { ...localConfig.value }
        const commandFilters = newConfig.commandFilterMode === 'blacklist'
          ? newConfig.commandBlacklist
          : newConfig.commandWhitelist

        const conflictIndex = commandFilters.findIndex(
          filter => filter.type === editingRule.value.type && filter.value === editingRule.value.value
        )

        if (conflictIndex !== -1) {
          commandFilters.splice(conflictIndex, 1)
          if (newConfig.commandFilterMode === 'blacklist') {
            newConfig.commandBlacklist = commandFilters
          } else {
            newConfig.commandWhitelist = commandFilters
          }
          emit('update:modelValue', newConfig)
        }
      } catch {
        // 用户取消
        return
      }
    }
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
        color: var(--fg0);
      }
    }

    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;

      @media (max-width: 768px) {
        flex-direction: column;
        align-items: stretch;

        .el-input {
          width: 100% !important;
          max-width: 100% !important;
        }
      }
    }
  }

  // 修复表格列重叠问题：为固定列添加不透明背景色
  :deep(.el-table__fixed-right) {
    background-color: var(--bg1);
  }

  :deep(.el-table__fixed-right .el-table__cell) {
    background-color: var(--bg1) !important;
  }

  // 确保固定列的背景完全不透明
  :deep(.el-table__body-wrapper .el-table__row .el-table__cell) {
    &:last-child {
      background-color: var(--bg1) !important;
    }
  }
}
</style>
