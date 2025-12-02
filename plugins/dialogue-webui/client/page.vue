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
          <div class="table-cell" style="flex: 1;">{{ dialogue.type }}</div>
          <div class="table-cell" style="flex: 1;">{{ dialogue.scope }}</div>
          <div class="table-cell actions" style="flex: 0 0 180px;">
            <button class="k-button primary small" @click="openEditModal(dialogue)">编辑</button>
            <button class="k-button danger small" @click="handleDelete(dialogue.id)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 手动构建的模态框 -->
    <div v-if="showModal" class="modal-backdrop">
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
            <label>回复内容 (支持 Markdown)</label>
            <textarea class="k-input" v-model="currentDialogue.answer" placeholder="输入回复内容" :rows="5"></textarea>
          </div>
          <div class="form-item">
            <label>类型</label>
            <select class="k-select" v-model="currentDialogue.type">
              <option value="keyword">关键词</option>
              <option value="regexp">正则表达式</option>
            </select>
          </div>
          <div class="form-item">
            <label>范围</label>
            <select class="k-select" v-model="currentDialogue.scope">
              <option value="global">全局</option>
              <option value="group">群组</option>
              <option value="private">私聊</option>
            </select>
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
  /* 增加不透明度以增强聚焦效果 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-panel {
  background-color: var(--k-color-bg-card);
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
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
.k-select,
textarea.k-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  background-color: var(--k-color-bg);
  color: var(--k-color-text);
}

.k-select option {
  background-color: var(--k-color-bg-card);
  color: var(--k-color-text);
}

textarea.k-input {
  resize: vertical;
  font-family: inherit;
}
</style>