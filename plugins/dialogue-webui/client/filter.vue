<template>
  <div class="filter-builder">
    <div class="filter-header">
      <button class="k-button small add-action" @click="addGroup">添加条件组</button>
    </div>

    <div v-if="!modelValue || modelValue.length === 0" class="empty-state">
      <p>暂无过滤条件，将匹配所有消息</p>
    </div>

    <div v-for="(group, groupIndex) in modelValue" :key="groupIndex" class="filter-group">
      <div class="group-header">
        <span class="group-label">条件组 {{ groupIndex + 1 }}</span>
        <div class="group-connector" v-if="groupIndex > 0">
          <span class="connector-label">与上一组的关系：</span>
          <div class="group-logic">
            <label>
              <input type="radio" :value="'and'" v-model="group.connector"
                @change="() => emit('update:modelValue', props.modelValue || [])" />
              <span>与（AND）</span>
            </label>
            <label>
              <input type="radio" :value="'or'" v-model="group.connector"
                @change="() => emit('update:modelValue', props.modelValue || [])" />
              <span>或（OR）</span>
            </label>
          </div>
        </div>
        <button class="k-button small delete-action" @click="confirmRemoveGroup(groupIndex)">删除组</button>
      </div>

      <div class="conditions-list">
        <div v-for="(condition, condIndex) in group.conditions" :key="condIndex" class="condition-item">
          <div class="condition-connector" v-if="condIndex > 0">
            <span class="connector-label">与上一个条件的关系：</span>
            <div class="group-logic">
              <label>
                <input type="radio" :value="'and'" v-model="condition.connector"
                  @change="() => emit('update:modelValue', props.modelValue || [])" />
                <span>与（AND）</span>
              </label>
              <label>
                <input type="radio" :value="'or'" v-model="condition.connector"
                  @change="() => emit('update:modelValue', props.modelValue || [])" />
                <span>或（OR）</span>
              </label>
            </div>
          </div>

          <div class="condition-row">
            <select v-model="condition.field" class="k-select"
              @change="() => emit('update:modelValue', props.modelValue || [])">
              <option v-for="field in fieldOptions" :key="field.value" :value="field.value">
                {{ field.label }}
              </option>
            </select>

            <select v-model="condition.operator" class="k-select"
              @change="() => emit('update:modelValue', props.modelValue || [])">
              <option v-for="op in getOperatorsForField(condition.field)" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>

            <input v-model="condition.value" class="k-input" :placeholder="getPlaceholderForField(condition.field)"
              :type="getInputTypeForField(condition.field)"
              @input="() => emit('update:modelValue', props.modelValue || [])" />

            <button class="k-button small delete-action"
              @click="confirmRemoveCondition(groupIndex, condIndex)">删除条件</button>
          </div>
        </div>

        <button class="k-button small add-action" @click="addCondition(groupIndex)">添加条件</button>
      </div>
    </div>

    <!-- 代码预览 -->
    <div v-if="modelValue && modelValue.length > 0" class="code-preview">
      <h4>过滤条件预览</h4>
      <pre><code>{{ generateCodePreview() }}</code></pre>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { FilterGroup, FilterCondition, FilterField, FilterOperator } from './types'

const props = defineProps<{
  modelValue?: FilterGroup[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: FilterGroup[]]
}>()

// 字段选项
const fieldOptions = [
  { label: '用户ID', value: 'userId' },
  { label: '频道ID', value: 'channelId' },
  { label: '群组ID', value: 'guildId' },
  { label: '机器人ID', value: 'selfId' },
  { label: '平台', value: 'platform' },
  { label: '是否私聊', value: 'isDirect' },
  { label: '用户权限等级', value: 'authority' },
  { label: '用户昵称', value: 'nickname' },
  { label: '用户名', value: 'username' },
  { label: '用户角色', value: 'roles' },
]

// 所有操作符
const allOperators = [
  { label: '等于', value: 'equals' },
  { label: '不等于', value: 'notEquals' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notContains' },
  { label: '大于', value: 'greaterThan' },
  { label: '小于', value: 'lessThan' },
  { label: '大于等于', value: 'greaterOrEqual' },
  { label: '小于等于', value: 'lessOrEqual' },
  { label: '在列表中', value: 'in' },
  { label: '不在列表中', value: 'notIn' },
]

// 根据字段类型返回适用的操作符
const getOperatorsForField = (field: FilterField | '') => {
  if (!field) return allOperators

  const numericFields = ['authority']
  const stringFields = ['userId', 'channelId', 'guildId', 'selfId', 'platform', 'nickname', 'username']
  const booleanFields = ['isDirect']
  const arrayFields = ['roles']

  if (numericFields.includes(field)) {
    return allOperators.filter(op =>
      ['equals', 'notEquals', 'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual'].includes(op.value)
    )
  } else if (booleanFields.includes(field)) {
    return allOperators.filter(op => ['equals', 'notEquals'].includes(op.value))
  } else if (arrayFields.includes(field)) {
    return allOperators.filter(op => ['contains', 'notContains', 'in', 'notIn'].includes(op.value))
  } else {
    return allOperators.filter(op =>
      ['equals', 'notEquals', 'contains', 'notContains', 'in', 'notIn'].includes(op.value)
    )
  }
}

// 根据字段返回输入框占位符
const getPlaceholderForField = (field: FilterField | '') => {
  const placeholders: Record<string, string> = {
    userId: '输入用户ID',
    channelId: '输入频道ID',
    guildId: '输入群组ID',
    selfId: '输入机器人ID',
    platform: '输入平台名称（如：onebot）',
    isDirect: '输入 true 或 false',
    authority: '输入权限等级（数字）',
    nickname: '输入昵称关键词',
    username: '输入用户名',
    roles: '输入角色（如：owner,admin）',
  }
  return placeholders[field as string] || '输入值'
}

// 根据字段返回输入框类型
const getInputTypeForField = (field: FilterField | '') => {
  if (field === 'authority') return 'number'
  return 'text'
}

// 添加条件组
const addGroup = () => {
  const newGroups = [...(props.modelValue || [])]
  newGroups.push({
    connector: 'and', // 与上一组的连接关系，默认 AND
    conditions: []
  })
  emit('update:modelValue', newGroups)
}

// 删除条件组
const removeGroup = (groupIndex: number) => {
  const newGroups = [...(props.modelValue || [])]
  newGroups.splice(groupIndex, 1)
  emit('update:modelValue', newGroups)
}

// 确认删除条件组
const confirmRemoveGroup = async (groupIndex: number) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除条件组 ${groupIndex + 1} 吗？<br><br>此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: true
      }
    )
    removeGroup(groupIndex)
  } catch {
    // 用户取消删除
  }
}

// 添加条件
const addCondition = (groupIndex: number) => {
  const newGroups = [...(props.modelValue || [])]
  // 添加新条件，使用第一个选项作为默认值
  newGroups[groupIndex].conditions.push({
    field: fieldOptions[0].value as FilterField,
    operator: allOperators[0].value as FilterOperator,
    value: '',
    connector: 'and' // 默认与上一个条件是 AND 关系
  })
  emit('update:modelValue', newGroups)
}

// 删除条件
const removeCondition = (groupIndex: number, condIndex: number) => {
  const newGroups = [...(props.modelValue || [])]
  newGroups[groupIndex].conditions.splice(condIndex, 1)
  emit('update:modelValue', newGroups)
}

// 确认删除条件
const confirmRemoveCondition = async (groupIndex: number, condIndex: number) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除此条件吗？<br><br>此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: true
      }
    )
    removeCondition(groupIndex, condIndex)
  } catch {
    // 用户取消删除
  }
}

// 生成代码预览
const generateCodePreview = () => {
  if (!props.modelValue || props.modelValue.length === 0) {
    return '// 无过滤条件'
  }

  const allGroupConditions: Array<{ condition: string; connector?: 'and' | 'or' }> = []

  props.modelValue.forEach((group) => {
    if (group.conditions.length === 0) return

    const groupConditions = group.conditions.map(cond => {
      const fieldMap: Record<string, string> = {
        userId: 'session.userId',
        channelId: 'session.channelId',
        guildId: 'session.guildId',
        selfId: 'session.selfId',
        platform: 'session.platform',
        isDirect: 'session.isDirect',
        authority: 'session.user.authority',
        nickname: 'session.user.nickname',
        username: 'session.username',
        roles: 'session.event.member?.roles',
      }

      const field = fieldMap[cond.field] || cond.field

      // 跳过空值条件
      if (!cond.field || !cond.operator || cond.value === '') {
        return ''
      }

      // 处理布尔值
      let value: string
      if (cond.field === 'isDirect') {
        // 布尔字段不需要引号
        value = String(cond.value).toLowerCase() === 'true' ? 'true' : 'false'
      } else if (typeof cond.value === 'number') {
        value = String(cond.value)
      } else {
        value = `"${cond.value}"`
      }

      switch (cond.operator) {
        case 'equals':
          return `${field} === ${value}`
        case 'notEquals':
          return `${field} !== ${value}`
        case 'contains':
          if (cond.field === 'roles') {
            return `${field}?.includes(${value})`
          }
          return `${field}?.includes(${value})`
        case 'notContains':
          if (cond.field === 'roles') {
            return `!${field}?.includes(${value})`
          }
          return `!${field}?.includes(${value})`
        case 'greaterThan':
          return `${field} > ${value}`
        case 'lessThan':
          return `${field} < ${value}`
        case 'greaterOrEqual':
          return `${field} >= ${value}`
        case 'lessOrEqual':
          return `${field} <= ${value}`
        case 'in':
          // 处理数组：支持全角、半角逗号分隔，每个元素都加引号
          const inArray = String(cond.value)
            .split(/[,，]/)
            .map(v => v.trim())
            .filter(v => v)
            .map(v => `"${v}"`)
            .join(', ')
          return `[${inArray}].includes(${field})`
        case 'notIn':
          // 处理数组：支持全角、半角逗号分隔，每个元素都加引号
          const notInArray = String(cond.value)
            .split(/[,，]/)
            .map(v => v.trim())
            .filter(v => v)
            .map(v => `"${v}"`)
            .join(', ')
          return `![${notInArray}].includes(${field})`
        default:
          return `${field} ${cond.operator} ${value}`
      }
    }).filter(c => c) // 过滤掉空条件

    if (groupConditions.length === 0) return

    // 构建组内条件，使用每个条件的 connector
    let groupCondition = groupConditions[0]
    for (let i = 1; i < groupConditions.length; i++) {
      const cond = group.conditions[i]
      const connectorSymbol = cond.connector === 'or' ? ' || ' : ' && '
      groupCondition += connectorSymbol + groupConditions[i]
    }

    // 如果有多个条件，用括号包裹
    if (groupConditions.length > 1) {
      allGroupConditions.push({ condition: `(${groupCondition})`, connector: group.connector })
    } else {
      allGroupConditions.push({ condition: groupCondition, connector: group.connector })
    }
  })

  if (allGroupConditions.length === 0) {
    return '// 无有效过滤条件'
  }

  // 构建最终条件，使用每个组的 connector
  let finalCondition = allGroupConditions[0].condition
  for (let i = 1; i < allGroupConditions.length; i++) {
    const connectorSymbol = allGroupConditions[i].connector === 'or' ? ' || ' : ' && '
    finalCondition += `\n  ${connectorSymbol}${allGroupConditions[i].condition}`
  }

  return `if (${finalCondition}) {\n  // 触发关键词回复\n}`
}
</script>

<style scoped>
.filter-builder {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.filter-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 1rem;
}

.header-buttons {
  display: flex;
  gap: 0.5rem;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--k-color-text-light);
  border: 1px dashed var(--k-color-border);
  border-radius: 4px;
}

.filter-group {
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  padding: 1rem;
  background-color: var(--k-color-bg);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--k-color-border);
}

.group-label {
  font-weight: bold;
}

.group-connector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.connector-label {
  font-size: 0.875rem;
  color: var(--k-color-text-light);
}

.group-logic {
  display: flex;
  gap: 0.5rem;
}

.group-logic label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}

.condition-item {
  margin-bottom: 0.5rem;
}

.condition-connector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background-color: var(--k-color-bg-card);
  border-radius: 4px;
}

.k-select {
  padding: 0.5rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  min-width: 120px;
  cursor: pointer;
}

.k-select option {
  background-color: white;
  color: #2c3e50;
}

/* 深色主题优化 */
@media (prefers-color-scheme: dark) {
  .k-select {
    background-color: rgba(50, 50, 50, 0.9);
    color: #e0e0e0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .k-select option {
    background-color: #323232;
    color: #e0e0e0;
  }
}

.condition-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.conditions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.condition-item {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  background-color: var(--k-color-bg-card);
}

.condition-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-label {
  font-weight: bold;
  font-size: 0.875rem;
  color: var(--k-color-text);
}

.radio-group-horizontal {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.radio-label {
  position: relative;
  display: inline-block;
}

.radio-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.radio-button {
  display: block;
  padding: 0.5rem 1rem;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  background-color: var(--k-color-bg);
  color: var(--k-color-text);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  white-space: nowrap;
}

.radio-input:checked+.radio-button {
  background-color: var(--k-color-primary);
  color: white;
  border-color: var(--k-color-primary);
}

.radio-input:hover:not(:checked)+.radio-button {
  background-color: var(--k-color-bg-hover);
  border-color: var(--k-color-primary-light);
}

.radio-input:focus+.radio-button {
  box-shadow: 0 0 0 2px var(--k-color-primary-light);
}

.value-input-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.value-input-row .k-input {
  flex: 1;
}

.group-logic input[type="radio"] {
  margin: 0;
}

.code-preview {
  margin-top: 1rem;
  padding: 1rem;
  background-color: var(--k-color-bg);
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
}

.code-preview h4 {
  margin: 0 0 0.5rem 0;
}

.code-preview pre {
  margin: 0;
  padding: 1rem;
  background-color: #1e1e1e;
  color: #d4d4d4;
  border-radius: 4px;
  overflow-x: auto;
}

.code-preview code {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
}
</style>