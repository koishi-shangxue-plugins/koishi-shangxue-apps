<template>
  <div class="dialogue-card">
    <div class="card-header">
      <h2>问答管理</h2>
      <button class="k-button primary" @click="openAddModal">添加新问答</button>
    </div>

    <!-- 手动构建的表格 -->
    <div class="manual-table">
      <div class="table-header">
        <div class="table-cell" style="flex: 1.5;">关键词</div>
        <div class="table-cell" style="flex: 2;">回复内容</div>
        <div class="table-cell" style="flex: 1;">类型</div>
        <div class="table-cell" style="flex: 1;">范围</div>
        <div class="table-cell" style="flex: 0 0 180px;">操作</div>
      </div>
      <div class="table-body">
        <div v-if="!dialogues.length" class="table-row empty">
          <div class="table-cell">暂无数据</div>
        </div>
        <div v-for="dialogue in dialogues" :key="dialogue.id" class="table-row">
          <div class="table-cell" style="flex: 1.5;" :title="dialogue.question">{{ dialogue.question }}</div>
          <div class="table-cell" style="flex: 2;" :title="dialogue.answer">{{ dialogue.answer }}</div>
          <div class="table-cell" style="flex: 1;">{{ getTypeLabel(dialogue.type) }}</div>
          <div class="table-cell" style="flex: 1;">{{ getScopeLabel(dialogue.scope) }}</div>
          <div class="table-cell actions" style="flex: 0 0 180px;">
            <button class="k-button primary small" @click="openEditModal(dialogue)">编辑</button>
            <button class="k-button danger small" @click="handleDelete(dialogue.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 手动构建的模态框 -->
    <div v-if="showModal" class="modal-backdrop" @click.self="closeAllDropdowns(); showModal = false">
      <div class="modal-panel">
        <div class="modal-header">
          <h3>{{ isEditMode ? '编辑问答' : '添加新问答' }}</h3>
        </div>
        <div class="modal-body">
          <div class="form-item">
            <label>关键词</label>
            <input class="k-input" v-model="currentDialogue.question" placeholder="输入触发的关键词或正则表达式" />
          </div>
          <div class="form-item">
            <label>回复内容 (支持 JS 模板)</label>
            <textarea class="k-input" v-model="currentDialogue.answer"
              placeholder="你好，{{session.username}}！试试 {{h.image('https://... Taffy.png')}}" :rows="5"></textarea>
          </div>

          <!-- 类型选择框 (内联实现) -->
          <div class="form-item">
            <label>类型</label>
            <div class="custom-select">
              <div class="select-trigger" @click="toggleTypeDropdown">
                <span>{{ selectedTypeLabel }}</span>
                <span class="arrow" :class="{ open: isTypeDropdownOpen }"></span>
              </div>
              <div v-if="isTypeDropdownOpen" class="select-options">
                <div v-for="option in typeOptions" :key="option.value" class="select-option"
                  :class="{ selected: option.value === currentDialogue.type }" @click="selectType(option.value)">
                  {{ option.label }}
                </div>
              </div>
            </div>
          </div>

          <!-- 范围选择框 (内联实现) -->
          <div class="form-item">
            <label>范围</label>
            <div class="custom-select">
              <div class="select-trigger" @click="toggleScopeDropdown">
                <span>{{ selectedScopeLabel }}</span>
                <span class="arrow" :class="{ open: isScopeDropdownOpen }"></span>
              </div>
              <div v-if="isScopeDropdownOpen" class="select-options">
                <div v-for="option in scopeOptions" :key="option.value" class="select-option"
                  :class="{ selected: option.value === currentDialogue.scope }" @click="selectScope(option.value)">
                  {{ option.label }}
                </div>
              </div>
            </div>
          </div>

        </div>
        <div class="modal-footer">
          <button class="k-button" @click="showModal = false">取消</button>
          <button v-if="isEditMode" class="k-button danger" @click="handleDelete(currentDialogue.id)">删除</button>
          <button class="k-button primary" @click="handleSave">{{ isEditMode ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useDialogLogic } from './logic'

const {
  dialogues,
  showModal,
  isEditMode,
  currentDialogue,
  openAddModal,
  openEditModal,
  handleSave,
  handleDelete,
} = useDialogLogic()

// 下拉框选项
const typeOptions = [
  { label: '关键词', value: 'keyword' },
  { label: '正则表达式', value: 'regexp' },
]
const scopeOptions = [
  { label: '全局', value: 'global' },
  { label: '群组', value: 'group' },
  { label: '私聊', value: 'private' },
]

// 将英文值映射到中文标签的辅助函数
const getTypeLabel = (value: string) => typeOptions.find(o => o.value === value)?.label || value
const getScopeLabel = (value: string) => scopeOptions.find(o => o.value === value)?.label || value

// 为每个下拉框独立管理状态
const isTypeDropdownOpen = ref(false)
const isScopeDropdownOpen = ref(false)

// 计算属性，用于显示当前选中的标签
const selectedTypeLabel = computed(() => typeOptions.find(o => o.value === currentDialogue.type)?.label || '请选择')
const selectedScopeLabel = computed(() => scopeOptions.find(o => o.value === currentDialogue.scope)?.label || '请选择')

// 关闭所有下拉框的辅助函数
const closeAllDropdowns = () => {
  isTypeDropdownOpen.value = false
  isScopeDropdownOpen.value = false
}

// 类型下拉框的控制函数
const toggleTypeDropdown = () => {
  isScopeDropdownOpen.value = false // 打开一个时关闭另一个
  isTypeDropdownOpen.value = !isTypeDropdownOpen.value
}
const selectType = (value: string) => {
  currentDialogue.type = value as 'keyword' | 'regexp'
  isTypeDropdownOpen.value = false
}

// 范围下拉框的控制函数
const toggleScopeDropdown = () => {
  isTypeDropdownOpen.value = false // 打开一个时关闭另一个
  isScopeDropdownOpen.value = !isScopeDropdownOpen.value
}
const selectScope = (value: string) => {
  currentDialogue.scope = value as 'global' | 'group' | 'private'
  isScopeDropdownOpen.value = false
}

</script>

<style scoped>
/* 基础卡片和头部样式 */
.dialogue-card {
  padding: 1rem;
  background-color: var(--k-color-bg-card);
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.card-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

/* 手动表格样式 */
.manual-table {
  display: flex;
  flex-direction: column;
  margin-top: 1rem;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  overflow: hidden;
}

.table-header,
.table-row {
  display: flex;
  border-bottom: 1px solid var(--k-color-border);
}

.table-header {
  font-weight: bold;
  background-color: var(--k-color-bg-header);
}

.table-row:last-child {
  border-bottom: none;
}

.table-row.empty .table-cell {
  width: 100%;
  justify-content: center;
  color: var(--k-color-text-light);
}

.table-cell {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-cell.actions {
  gap: 0.5rem;
}

/* 模态框样式 */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-panel {
  background-color: rgba(54, 58, 69, 0.85);
  /* 半透明背景 */
  backdrop-filter: blur(8px);
  /* 模糊效果 */
  -webkit-backdrop-filter: blur(8px);
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  /* 添加一个细微的边框以增强立体感 */
}

.modal-header h3 {
  margin: 0 0 1rem 0;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* 表单元素样式 */
.form-item {
  display: flex;
  flex-direction: column;
}

.form-item label {
  margin-bottom: 0.5rem;
  font-weight: bold;
}

/* 模拟 Koishi 按钮和输入框样式 */
.k-button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: 1px solid var(--k-color-border);
  background-color: var(--k-color-bg-btn);
  color: var(--k-color-text);
  cursor: pointer;
  transition: background-color 0.2s;
}

.k-button:hover {
  background-color: var(--k-color-bg-hover);
}

.k-button.primary {
  background-color: var(--k-color-primary);
  color: white;
  border-color: var(--k-color-primary);
}

.k-button.primary:hover {
  background-color: var(--k-color-primary-dark);
}

.k-button.danger {
  background-color: var(--k-color-danger);
  color: white;
  border-color: var(--k-color-danger);
}

.k-button.danger:hover {
  background-color: var(--k-color-danger-dark);
}

.k-button.small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.k-input,
textarea.k-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  background-color: var(--k-color-bg);
  color: var(--k-color-text);
}

textarea.k-input {
  resize: vertical;
  font-family: inherit;
}

/* 自定义下拉选择框样式 */
.custom-select {
  position: relative;
  width: 100%;
}

.select-trigger {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  background-color: var(--k-color-bg);
  color: var(--k-color-text);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.arrow {
  border: solid var(--k-color-text);
  border-width: 0 2px 2px 0;
  display: inline-block;
  padding: 3px;
  transform: rotate(45deg);
  transition: transform 0.2s;
}

.arrow.open {
  transform: rotate(-135deg);
}

.select-options {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  /* 半透明背景和模糊效果，实现“毛玻璃”质感 */
  background-color: rgba(44, 48, 59, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  margin-top: 0.25rem;
  z-index: 1010;
  max-height: 200px;
  overflow-y: auto;
}

.select-option {
  padding: 0.5rem 1rem;
  cursor: pointer;
  position: relative;
  padding-left: 2.25rem;
  /* 为勾选标记留出空间 */
  display: flex;
  align-items: center;
}

.select-option.selected {
  font-weight: 600;
  color: var(--k-color-primary);
}

.select-option.selected::before {
  content: '✓';
  position: absolute;
  left: 0.75rem;
  font-size: 1.1rem;
  line-height: 1;
}

.select-option:hover {
  background-color: var(--k-color-bg-hover);
}
</style>