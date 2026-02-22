<template>
  <div class="command-filter">
    <!-- 启用开关 -->
    <div class="enable-section">
      <el-switch v-model="localConfig.enableCommandFilter" size="large" active-text="启用指令级权限控制" @change="emitChange" />
    </div>

    <div v-if="localConfig.enableCommandFilter" class="filter-content">
      <!-- 模式切换 -->
      <div class="mode-selector">
        <el-radio-group v-model="localConfig.commandFilterMode" @change="emitChange">
          <el-radio value="blacklist">黑名单模式</el-radio>
          <el-radio value="whitelist">白名单模式</el-radio>
        </el-radio-group>
      </div>

      <!-- 规则列表 -->
      <div class="rules-section">
        <!-- 工具栏 -->
        <div class="toolbar">
          <el-button type="primary" :icon="Plus" @click="showAddDialog = true">
            添加规则
          </el-button>
          <el-input v-model="searchText" placeholder="搜索过滤值或原因" :prefix-icon="Search"
            style="width: 300px; max-width: 100%" clearable />
        </div>

        <div v-if="filteredRules.length === 0" class="empty-state">
          <el-empty :description="emptyText" />
        </div>

        <div v-else>
          <div class="rules-cards">
            <el-card v-for="rule in paginatedRules" :key="rule._originalIndex" class="rule-card" shadow="hover">
              <div class="card-header">
                <div class="rule-info">
                  <div class="rule-type-value">
                    <span class="type-text">{{ getTypeLabel(rule.type) }}</span>
                    <span class="value">{{ rule.value }}</span>
                  </div>
                  <div v-if="rule.reason" class="reason">{{ rule.reason }}</div>
                </div>
                <div class="card-actions">
                  <el-button link type="primary" @click="editRule(rule._originalIndex)">编辑</el-button>
                  <el-button link type="danger" @click="deleteRule(rule._originalIndex)">删除</el-button>
                </div>
              </div>
              <div class="commands-section">
                <div class="commands-label">指令列表：</div>
                <div class="commands-tags">
                  <el-tag v-for="(cmd, cmdIndex) in rule.commands" :key="cmdIndex" style="margin: 4px">
                    {{ cmd }}
                  </el-tag>
                </div>
                <el-alert v-if="rule.commands.some(c => c.includes('*'))"
                  title="使用了通配符：* 匹配所有指令，admin.* 匹配所有 admin 开头的指令" type="info" :closable="false"
                  style="margin-top: 8px" />
              </div>
              <div class="permission-section">
                <div class="permission-status">
                  <span v-if="rule.replyNoPermission" class="enabled">✓ 回复权限提示</span>
                  <span v-else class="disabled">✗ 不回复权限提示</span>
                </div>
                <div v-if="rule.replyNoPermission && rule.replyMessage" class="permission-message">
                  提示语：{{ rule.replyMessage }}
                </div>
              </div>
            </el-card>
          </div>

          <!-- 分页 -->
          <el-pagination v-if="filteredRules.length > pageSize" v-model:current-page="currentPage" :page-size="pageSize"
            :total="filteredRules.length" layout="total, prev, pager, next"
            style="margin-top: 16px; display: flex; justify-content: center;" />
        </div>
      </div>
    </div>

    <div v-else class="disabled-hint">
      <el-empty description="请先启用指令级权限控制" />
    </div>

    <!-- 添加/编辑规则对话框 -->
    <el-dialog v-model="showAddDialog" :title="editingIndex === -1 ? '添加规则' : '编辑规则'" width="600px">
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
        <el-form-item label="指令列表" required>
          <div style="width: 100%">
            <div
              style="max-height: 200px; overflow-y: auto; padding: 4px; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 8px;">
              <el-tag v-for="(cmd, index) in editingRule.commands" :key="index" closable
                @close="editingRule.commands.splice(index, 1)" style="margin: 4px">
                {{ cmd }}
              </el-tag>
              <div v-if="editingRule.commands.length === 0"
                style="padding: 8px; color: var(--fg2); text-align: center;">
                暂无指令，请点击下方按钮选择
              </div>
            </div>
            <el-button type="primary" @click="openCommandSelector" style="width: 100%">
              从已注册指令中选择
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="限制原因">
          <el-input v-model="editingRule.reason" type="textarea" :rows="3" placeholder="请输入限制原因（可选）" />
        </el-form-item>
        <el-form-item label="权限提示">
          <el-checkbox v-model="editingRule.replyNoPermission">
            当用户无权限时回复提示消息
          </el-checkbox>
        </el-form-item>
        <el-form-item v-if="editingRule.replyNoPermission" label="提示语">
          <el-input v-model="editingRule.replyMessage" placeholder="你没有权限使用此指令。" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 指令选择器对话框 -->
    <el-dialog v-model="showCommandSelector" title="选择指令" width="600px">
      <div style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center;">
        <el-checkbox v-model="selectAll" @change="handleSelectAllChange">全选</el-checkbox>
        <el-input v-model="commandSearchText" placeholder="搜索指令" :prefix-icon="Search" style="flex: 1" clearable />
      </div>
      <div style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
        <el-checkbox-group v-model="selectedCommands">
          <div v-for="cmd in filteredCommands" :key="cmd" style="margin: 8px 0">
            <el-checkbox :value="cmd">{{ cmd }}</el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="showCommandSelector = false">取消</el-button>
        <el-button type="primary" @click="confirmSelectCommands">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import type { WebUIConfig, CommandRule } from '../../utils/api'
import { getCommands } from '../../utils/api'

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

const searchText = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const showAddDialog = ref(false)
const editingIndex = ref(-1)
const editingRule = ref<CommandRule>({
  type: 'userId',
  value: '',
  commands: [],
  reason: '',
  replyNoPermission: false,
  replyMessage: '你没有权限使用此指令。'
})
const showCommandSelector = ref(false)
const selectedCommands = ref<string[]>([])
const selectAll = ref(false)
const commandSearchText = ref('')
const availableCommands = ref<string[]>([])

// 当前使用的规则列表
const currentRules = computed(() => {
  return localConfig.value.commandFilterMode === 'blacklist'
    ? localConfig.value.commandBlacklist
    : localConfig.value.commandWhitelist
})

// 过滤后的规则列表（带原始索引）
const filteredRules = computed(() => {
  let rules = currentRules.value.map((rule, index) => ({ ...rule, _originalIndex: index }))
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    rules = rules.filter(rule =>
      rule.value.toLowerCase().includes(search) ||
      (rule.reason && rule.reason.toLowerCase().includes(search))
    )
  }
  return rules
})

// 分页后的规则列表
const paginatedRules = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredRules.value.slice(start, end)
})

// 过滤后的指令列表
const filteredCommands = computed(() => {
  if (!commandSearchText.value) {
    return availableCommands.value
  }
  const search = commandSearchText.value.toLowerCase()
  return availableCommands.value.filter(cmd => cmd.toLowerCase().includes(search))
})

// 模式描述
const modeDescription = computed(() => {
  return localConfig.value.commandFilterMode === 'blacklist'
    ? '黑名单模式：禁止指定对象使用指定指令'
    : '白名单模式：只允许指定对象使用指定指令'
})

// 空状态文本
const emptyText = computed(() => {
  return searchText.value ? '没有找到匹配的规则' : '暂无规则'
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

// 检查是否与消息级过滤冲突
const checkConflictWithMessageFilter = (type: string, value: string): boolean => {
  const messageFilters = localConfig.value.filterMode === 'blacklist'
    ? localConfig.value.blacklist
    : localConfig.value.whitelist

  return messageFilters.some(filter => filter.type === type && filter.value === value)
}

// 触发变化事件
const emitChange = () => {
  emit('update:modelValue', localConfig.value)
}

// 加载已注册指令
const loadCommands = async () => {
  try {
    const result = await getCommands()
    availableCommands.value = result.commands
  } catch (error) {
    console.error('加载指令列表失败:', error)
  }
}

// 打开指令选择器
const openCommandSelector = () => {
  // 预选已添加的指令
  selectedCommands.value = [...editingRule.value.commands]
  // 更新全选状态
  selectAll.value = selectedCommands.value.length === availableCommands.value.length
  showCommandSelector.value = true
}

// 处理全选变化
const handleSelectAllChange = (checked: boolean) => {
  if (checked) {
    selectedCommands.value = [...filteredCommands.value]
  } else {
    selectedCommands.value = []
  }
}

// 监听选中的指令变化，更新全选状态
watch(selectedCommands, (newVal) => {
  if (newVal.length === 0) {
    selectAll.value = false
  } else if (newVal.length === filteredCommands.value.length) {
    selectAll.value = true
  } else {
    selectAll.value = false
  }
})

// 编辑规则
const editRule = (index: number) => {
  editingIndex.value = index
  const rule = currentRules.value[index]
  editingRule.value = {
    type: rule.type,
    value: rule.value,
    commands: [...rule.commands],
    reason: rule.reason || '',
    replyNoPermission: rule.replyNoPermission || false,
    replyMessage: rule.replyMessage || '你没有权限使用此指令。'
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
  if (editingRule.value.commands.length === 0) {
    ElMessage.warning('请至少添加一个指令')
    return
  }

  // 检查是否修改了 type 或 value
  const isValueChanged = editingIndex.value === -1 ||
    (currentRules.value[editingIndex.value].type !== editingRule.value.type ||
      currentRules.value[editingIndex.value].value !== editingRule.value.value)

  // 检查冲突（添加新规则或修改了 type/value 时检查）
  if (isValueChanged) {
    const hasConflict = checkConflictWithMessageFilter(editingRule.value.type, editingRule.value.value)
    if (hasConflict) {
      try {
        await ElMessageBox.confirm(
          `此${getTypeLabel(editingRule.value.type)}已经在【消息级过滤】中，是否删除原有记录？`,
          '检测到冲突',
          {
            confirmButtonText: '删除并继续',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        // 删除消息级过滤中的冲突记录
        const newConfig = { ...localConfig.value }
        const messageFilters = newConfig.filterMode === 'blacklist'
          ? newConfig.blacklist
          : newConfig.whitelist

        const conflictIndex = messageFilters.findIndex(
          filter => filter.type === editingRule.value.type && filter.value === editingRule.value.value
        )

        if (conflictIndex !== -1) {
          messageFilters.splice(conflictIndex, 1)
          if (newConfig.filterMode === 'blacklist') {
            newConfig.blacklist = messageFilters
          } else {
            newConfig.whitelist = messageFilters
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

// 确认选择指令
const confirmSelectCommands = () => {
  if (selectedCommands.value.length === 0) {
    ElMessage.warning('请至少选择一个指令')
    return
  }

  // 直接替换为选中的指令
  editingRule.value.commands = [...selectedCommands.value]

  showCommandSelector.value = false
  ElMessage.success('选择成功')
}

// 更新规则列表
const updateRules = (rules: CommandRule[]) => {
  const newConfig = { ...localConfig.value }
  if (newConfig.commandFilterMode === 'blacklist') {
    newConfig.commandBlacklist = rules
  } else {
    newConfig.commandWhitelist = rules
  }
  emit('update:modelValue', newConfig)
}

// 重置编辑状态
const resetEditingRule = () => {
  editingIndex.value = -1
  editingRule.value = {
    type: 'userId',
    value: '',
    commands: [],
    reason: '',
    replyNoPermission: false,
    replyMessage: '你没有权限使用此指令。'
  }
}

// 监听对话框关闭
watch(showAddDialog, (val) => {
  if (!val) {
    resetEditingRule()
  }
})

onMounted(() => {
  loadCommands()
})
</script>

<style scoped lang="scss">
.command-filter {
  .enable-section {
    margin-bottom: 24px;
  }

  .filter-content {
    .mode-selector {
      margin-bottom: 24px;
    }

    .rules-section {
      .section-header {
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

      .rules-cards {
        display: grid;
        gap: 16px;

        .rule-card {
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;

            .rule-info {
              flex: 1;

              .rule-type-value {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 8px;

                .type-text {
                  font-size: 14px;
                  color: var(--fg1);
                }

                .value {
                  font-size: 16px;
                  font-weight: 600;
                  color: var(--fg0);
                }
              }

              .reason {
                font-size: 14px;
                color: var(--fg1);
              }
            }

            .card-actions {
              display: flex;
              gap: 8px;
            }
          }

          .commands-section {
            margin-bottom: 12px;

            .commands-label {
              font-size: 14px;
              font-weight: 500;
              margin-bottom: 8px;
              color: var(--fg0);
            }

            .commands-tags {
              display: flex;
              flex-wrap: wrap;
              align-items: center;

              .el-tag {
                font-size: 14px;
              }
            }
          }

          .permission-section {
            padding-top: 12px;
            border-top: 1px solid var(--border);

            .permission-status {
              font-size: 14px;
              margin-bottom: 4px;

              .enabled {
                color: var(--el-color-success);
                font-weight: 500;
              }

              .disabled {
                color: var(--fg2);
              }
            }

            .permission-message {
              font-size: 13px;
              color: var(--fg1);
              margin-top: 4px;
            }
          }
        }
      }
    }
  }

  .disabled-hint {
    padding: 40px 0;
  }
}
</style>
