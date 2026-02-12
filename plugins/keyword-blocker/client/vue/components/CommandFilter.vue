<template>
  <div class="command-filter">
    <!-- 启用开关 -->
    <div class="enable-section">
      <el-switch v-model="localConfig.enableCommandFilter" size="large" active-text="启用指令级权限控制" />
    </div>

    <div v-if="localConfig.enableCommandFilter" class="filter-content">
      <!-- 模式切换 -->
      <div class="mode-selector">
        <el-radio-group v-model="localConfig.commandFilterMode">
          <el-radio value="blacklist">黑名单模式</el-radio>
          <el-radio value="whitelist">白名单模式</el-radio>
        </el-radio-group>
        <el-alert :title="modeDescription" type="info" :closable="false" show-icon style="margin-top: 12px" />
      </div>

      <!-- 用户规则列表 -->
      <div class="rules-section">
        <div class="section-header">
          <h3>用户规则列表</h3>
          <el-input v-model="searchText" placeholder="搜索用户 ID" :prefix-icon="Search" style="width: 300px" clearable />
        </div>

        <div v-if="filteredRules.length === 0" class="empty-state">
          <el-empty :description="emptyText" />
        </div>

        <div v-else class="rules-cards">
          <el-card v-for="(rule, index) in filteredRules" :key="index" class="rule-card" shadow="hover">
            <div class="card-header">
              <div class="user-info">
                <div class="user-id">{{ rule.userId }}</div>
                <div v-if="rule.reason" class="reason">{{ rule.reason }}</div>
              </div>
              <div class="card-actions">
                <el-button link type="primary" @click="editRule(index)">编辑</el-button>
                <el-button link type="danger" @click="deleteRule(index)">删除</el-button>
              </div>
            </div>
            <div class="commands-section">
              <div class="commands-label">指令列表：</div>
              <div class="commands-tags">
                <el-tag v-for="(cmd, cmdIndex) in rule.commands" :key="cmdIndex" closable
                  @close="removeCommand(index, cmdIndex)" style="margin: 4px">
                  {{ cmd }}
                </el-tag>
                <el-button link type="primary" :icon="Plus" @click="showAddCommandDialog(index)">
                  添加指令
                </el-button>
              </div>
              <el-alert v-if="rule.commands.some(c => c.includes('*'))" title="使用了通配符：* 匹配所有指令，admin.* 匹配所有 admin 开头的指令"
                type="info" :closable="false" style="margin-top: 8px" />
            </div>
          </el-card>
        </div>
      </div>
    </div>

    <div v-else class="disabled-hint">
      <el-empty description="请先启用指令级权限控制" />
    </div>

    <!-- 添加规则按钮 -->
    <el-button v-if="localConfig.enableCommandFilter" type="primary" :icon="Plus" circle size="large" class="add-button"
      @click="showAddDialog = true" />

    <!-- 添加/编辑用户规则对话框 -->
    <el-dialog v-model="showAddDialog" :title="editingIndex === -1 ? '添加用户规则' : '编辑用户规则'" width="600px">
      <el-form :model="editingRule" label-width="100px">
        <el-form-item label="用户 ID" required>
          <el-input v-model="editingRule.userId" placeholder="请输入用户 ID" />
        </el-form-item>
        <el-form-item label="指令列表" required>
          <div style="width: 100%">
            <el-tag v-for="(cmd, index) in editingRule.commands" :key="index" closable
              @close="editingRule.commands.splice(index, 1)" style="margin: 4px">
              {{ cmd }}
            </el-tag>
            <el-input v-model="newCommand" placeholder="输入指令后按回车添加" style="width: 200px; margin-top: 8px"
              @keyup.enter="addCommandToEditing">
              <template #append>
                <el-button @click="addCommandToEditing">添加</el-button>
              </template>
            </el-input>
            <div style="margin-top: 8px">
              <el-button link @click="showCommandSelector = true">从已注册指令中选择</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="限制原因">
          <el-input v-model="editingRule.reason" type="textarea" :rows="3" placeholder="请输入限制原因（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmEdit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 添加指令对话框 -->
    <el-dialog v-model="showAddCommandToRuleDialog" title="添加指令" width="400px">
      <el-input v-model="newCommandForRule" placeholder="输入指令后按回车添加" @keyup.enter="confirmAddCommandToRule">
        <template #append>
          <el-button @click="confirmAddCommandToRule">添加</el-button>
        </template>
      </el-input>
      <div style="margin-top: 12px">
        <el-button link @click="showCommandSelector = true">从已注册指令中选择</el-button>
      </div>
    </el-dialog>

    <!-- 指令选择器对话框 -->
    <el-dialog v-model="showCommandSelector" title="选择指令" width="600px">
      <el-input v-model="commandSearchText" placeholder="搜索指令" :prefix-icon="Search" style="margin-bottom: 16px"
        clearable />
      <el-checkbox-group v-model="selectedCommands" style="max-height: 400px; overflow-y: auto">
        <div v-for="cmd in filteredCommands" :key="cmd" style="margin: 8px 0">
          <el-checkbox :value="cmd">{{ cmd }}</el-checkbox>
        </div>
      </el-checkbox-group>
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
import type { Config, CommandRule } from '../../utils/api'
import { getCommands } from '../../utils/api'

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
const showAddDialog = ref(false)
const editingIndex = ref(-1)
const editingRule = ref<CommandRule>({
  userId: '',
  commands: [],
  reason: ''
})
const newCommand = ref('')
const showAddCommandToRuleDialog = ref(false)
const addingCommandToIndex = ref(-1)
const newCommandForRule = ref('')
const showCommandSelector = ref(false)
const selectedCommands = ref<string[]>([])
const commandSearchText = ref('')
const availableCommands = ref<string[]>([])

// 当前使用的规则列表
const currentRules = computed(() => {
  return localConfig.value.commandFilterMode === 'blacklist'
    ? localConfig.value.commandBlacklist
    : localConfig.value.commandWhitelist
})

// 过滤后的规则列表
const filteredRules = computed(() => {
  let rules = currentRules.value
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    rules = rules.filter(rule => rule.userId.toLowerCase().includes(search))
  }
  return rules
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
    ? '黑名单模式：禁止指定用户使用指定指令'
    : '白名单模式：只允许指定用户使用指定指令'
})

// 空状态文本
const emptyText = computed(() => {
  return searchText.value ? '没有找到匹配的用户规则' : '暂无用户规则，点击右下角按钮添加'
})

// 加载已注册指令
const loadCommands = async () => {
  try {
    const result = await getCommands()
    availableCommands.value = result.commands
  } catch (error) {
    console.error('加载指令列表失败:', error)
  }
}

// 编辑规则
const editRule = (index: number) => {
  editingIndex.value = index
  editingRule.value = { ...currentRules.value[index] }
  showAddDialog.value = true
}

// 删除规则
const deleteRule = (index: number) => {
  ElMessageBox.confirm('确定要删除这条用户规则吗？', '确认删除', {
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

// 移除指令
const removeCommand = (ruleIndex: number, cmdIndex: number) => {
  const rules = [...currentRules.value]
  rules[ruleIndex].commands.splice(cmdIndex, 1)
  updateRules(rules)
}

// 显示添加指令对话框
const showAddCommandDialog = (index: number) => {
  addingCommandToIndex.value = index
  newCommandForRule.value = ''
  showAddCommandToRuleDialog.value = true
}

// 确认添加指令到规则
const confirmAddCommandToRule = () => {
  if (!newCommandForRule.value.trim()) {
    ElMessage.warning('请输入指令')
    return
  }
  const rules = [...currentRules.value]
  rules[addingCommandToIndex.value].commands.push(newCommandForRule.value.trim())
  updateRules(rules)
  showAddCommandToRuleDialog.value = false
  ElMessage.success('添加成功')
}

// 添加指令到编辑中的规则
const addCommandToEditing = () => {
  if (!newCommand.value.trim()) {
    ElMessage.warning('请输入指令')
    return
  }
  editingRule.value.commands.push(newCommand.value.trim())
  newCommand.value = ''
}

// 确认编辑
const confirmEdit = () => {
  if (!editingRule.value.userId) {
    ElMessage.warning('请输入用户 ID')
    return
  }
  if (editingRule.value.commands.length === 0) {
    ElMessage.warning('请至少添加一个指令')
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

// 确认选择指令
const confirmSelectCommands = () => {
  if (showAddCommandToRuleDialog.value) {
    // 添加到现有规则
    const rules = [...currentRules.value]
    rules[addingCommandToIndex.value].commands.push(...selectedCommands.value)
    updateRules(rules)
    showAddCommandToRuleDialog.value = false
  } else {
    // 添加到编辑中的规则
    editingRule.value.commands.push(...selectedCommands.value)
  }
  showCommandSelector.value = false
  selectedCommands.value = []
  ElMessage.success('添加成功')
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
    userId: '',
    commands: [],
    reason: ''
  }
  newCommand.value = ''
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

      .rules-cards {
        display: grid;
        gap: 16px;

        .rule-card {
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;

            .user-info {
              flex: 1;

              .user-id {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 4px;
              }

              .reason {
                font-size: 14px;
                color: #909399;
              }
            }

            .card-actions {
              display: flex;
              gap: 8px;
            }
          }

          .commands-section {
            .commands-label {
              font-size: 14px;
              font-weight: 500;
              margin-bottom: 8px;
            }

            .commands-tags {
              display: flex;
              flex-wrap: wrap;
              align-items: center;
            }
          }
        }
      }
    }
  }

  .disabled-hint {
    padding: 40px 0;
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
