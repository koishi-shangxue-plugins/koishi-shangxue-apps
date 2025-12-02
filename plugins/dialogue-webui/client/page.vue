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
    <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
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
            <label>回复内容</label>
            <textarea class="k-input" v-model="currentDialogue.answer"
              placeholder="你好，{{session.username}}！试试 {{h.image('https://... Taffy.png')}}" :rows="5"></textarea>
          </div>

          <!-- 类型选择 -->
          <div class="form-item">
            <label>类型</label>
            <div class="radio-group">
              <label v-for="option in typeOptions" :key="option.value" class="radio-label">
                <input type="radio" :value="option.value" v-model="currentDialogue.type" class="radio-input">
                <span class="radio-button">{{ option.label }}</span>
              </label>
            </div>
          </div>

          <!-- 范围选择 -->
          <div class="form-item">
            <label>范围</label>
            <div class="radio-group">
              <label v-for="option in scopeOptions" :key="option.value" class="radio-label">
                <input type="radio" :value="option.value" v-model="currentDialogue.scope" class="radio-input">
                <span class="radio-button">{{ option.label }}</span>
              </label>
            </div>
          </div>

          <!-- 条件渲染：群组ID输入框 -->
          <div v-if="currentDialogue.scope === 'group'" class="form-item">
            <label>群组ID</label>
            <input class="k-input" v-model="currentDialogue.contextId" placeholder="输入生效的群组ID（可使用逗号分隔多个ID）" />
          </div>

          <!-- 条件渲染：用户ID输入框 -->
          <div v-if="currentDialogue.scope === 'private'" class="form-item">
            <label>用户ID</label>
            <input class="k-input" v-model="currentDialogue.contextId" placeholder="输入生效的用户ID（可使用逗号分隔多个ID）" />
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

const typeOptions = [
  { label: '关键词', value: 'keyword' },
  { label: '正则表达式', value: 'regexp' },
]
const scopeOptions = [
  { label: '全局', value: 'global' },
  { label: '群组', value: 'group' },
  { label: '私聊', value: 'private' },
]

const getTypeLabel = (value: string) => typeOptions.find(o => o.value === value)?.label || value
const getScopeLabel = (value: string) => scopeOptions.find(o => o.value === value)?.label || value


</script>

<style scoped>
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

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(var(--k-color-bg-rgb), 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-panel {
  background-color: var(--k-color-bg-card);
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  box-shadow: var(--k-shadow-2, 0 5px 15px rgba(0, 0, 0, 0.2));
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

.form-item {
  display: flex;
  flex-direction: column;
}

.form-item label {
  margin-bottom: 0.5rem;
  font-weight: bold;
}

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

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.radio-label {
  position: relative;
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
}

.radio-input:checked+.radio-button {
  background-color: var(--k-color-primary);
  color: white;
  border-color: var(--k-color-primary);
}

.radio-input:focus+.radio-button {
  box-shadow: 0 0 0 2px var(--k-color-primary-light);
}
</style>