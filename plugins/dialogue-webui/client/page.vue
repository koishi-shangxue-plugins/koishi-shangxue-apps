<template>
  <div class="dialogue-card">
    <div class="card-header">
      <h2>问答管理</h2>
      <button class="k-button add-action" @click="openAddModal">添加新问答</button>
    </div>

    <!-- 手动构建的表格 - 添加横向滚动容器 -->
    <div class="table-container">
      <div class="manual-table">
        <div class="table-header">
          <div class="table-cell" style="flex: 1.5;">关键词</div>
          <div class="table-cell" style="flex: 2;">回复内容</div>
          <div class="table-cell" style="flex: 1;">类型</div>
          <div class="table-cell" style="flex: 1;">过滤条件</div>
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
            <div class="table-cell" style="flex: 1;">{{ getFilterLabel(dialogue) }}</div>
            <div class="table-cell actions" style="flex: 0 0 240px;">
              <button class="k-button small" @click="openEditModal(dialogue)">编辑</button>
              <button class="k-button small" @click="openFilterModal(dialogue)">条件</button>
              <button class="k-button small delete-action"
                @click="confirmDelete(dialogue.id, dialogue.question)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑问答模态框 -->
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
        </div>
        <div class="modal-footer">
          <button class="k-button" @click="showModal = false">取消</button>
          <button v-if="isEditMode" class="k-button delete-action"
            @click="confirmDelete(currentDialogue.id, currentDialogue.question || '')">删除</button>
          <button class="k-button primary" @click="handleSave">{{ isEditMode ? '保存' : '创建' }}</button>
        </div>
      </div>
    </div>

    <!-- 过滤器设置模态框 -->
    <div v-if="showFilterModal" class="modal-backdrop" @click.self="showFilterModal = false">
      <div class="modal-panel large">
        <div class="modal-header">
          <h3>{{ currentDialogue.question || '过滤器设置' }}</h3>
          <p class="modal-subtitle">过滤器设置</p>
        </div>
        <div class="modal-body">
          <FilterBuilder v-model="currentDialogue.filterGroups" />
        </div>
        <div class="modal-footer">
          <button class="k-button" @click="showFilterModal = false">取消</button>
          <button class="k-button primary" @click="handleSaveFilter">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useDialogLogic } from './logic'
import FilterBuilder from './filter.vue'
import { Dialogue } from './types'

const {
  dialogues,
  showModal,
  showFilterModal,
  isEditMode,
  currentDialogue,
  openAddModal,
  openEditModal,
  openFilterModal,
  handleSave,
  handleSaveFilter,
  handleDelete,
} = useDialogLogic()

// 确认删除问答
const confirmDelete = async (id: number | null | undefined, question: string) => {
  if (!id) return
  try {
    await ElMessageBox.confirm(
      `确定要删除问答 "${question}" 吗？<br><br>此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: true
      }
    )
    handleDelete(id)
  } catch {
    // 用户取消删除
  }
}

const typeOptions = [
  { label: '关键词', value: 'keyword' },
  { label: '正则表达式', value: 'regexp' },
]

const getTypeLabel = (value: string) => typeOptions.find(o => o.value === value)?.label || value

// 获取过滤条件的简短描述
const getFilterLabel = (dialogue: Dialogue) => {
  if (dialogue.filterGroups && dialogue.filterGroups.length > 0) {
    const totalConditions = dialogue.filterGroups.reduce((sum, group) => sum + group.conditions.length, 0)
    return `${dialogue.filterGroups.length}组/${totalConditions}条件`
  }
  // 兼容旧数据
  if (dialogue.scope) {
    const scopeLabels: Record<string, string> = {
      global: '全局',
      group: '群组',
      private: '私聊'
    }
    return scopeLabels[dialogue.scope] || dialogue.scope
  }
  return '无'
}

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

/* 表格横向滚动容器 - 手机端适配 */
.table-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.manual-table {
  min-width: 800px;
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
  flex-shrink: 0;
}

/* 手机端优化 */
@media (max-width: 768px) {
  .dialogue-card {
    padding: 0.5rem;
  }

  .card-header {
    flex-direction: column;
    gap: 0.5rem;
    align-items: stretch;
  }

  .card-header h2 {
    font-size: 1.125rem;
  }

  .modal-panel {
    width: 95%;
    padding: 1rem;
  }

  .modal-panel.large {
    width: 95%;
    max-width: none;
  }
}

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

@media (prefers-color-scheme: dark) {
  .modal-backdrop {
    background-color: rgba(0, 0, 0, 0.7);
  }
}

.modal-panel {
  background-color: var(--k-color-bg-card);
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  padding: 1.5rem;
  width: 90%;
  max-width: 500px;
  box-shadow: var(--k-shadow-2, 0 5px 15px rgba(0, 0, 0, 0.2));
  max-height: 90vh;
  overflow-y: auto;
}

.modal-panel.large {
  max-width: 1000px;
}

.modal-header h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.25rem;
}

.modal-subtitle {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  color: var(--k-color-text-light, #999);
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
  border: 1px solid rgba(0, 0, 0, 0.1);
  background-color: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  cursor: pointer;
  transition: background-color 0.2s;
  font-weight: 500;
}

.k-button:hover {
  background-color: rgba(240, 240, 240, 0.9);
}

.k-button:active {
  background-color: rgba(230, 230, 230, 0.9);
}

.k-button.small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.k-button.primary {
  background-color: #409eff;
  color: white;
  border: none;
}

.k-button.primary:hover {
  background-color: #66b1ff;
}

.k-button.primary:active {
  background-color: #3a8ee6;
}

@media (prefers-color-scheme: dark) {
  .k-button {
    background-color: rgba(50, 50, 50, 0.9);
    color: #e0e0e0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .k-button:hover {
    background-color: rgba(70, 70, 70, 0.9);
  }

  .k-button:active {
    background-color: rgba(60, 60, 60, 0.9);
  }
}

.k-input,
textarea.k-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
}

.k-input:focus,
textarea.k-input:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

@media (prefers-color-scheme: dark) {

  .k-input,
  textarea.k-input {
    background-color: rgba(50, 50, 50, 0.9);
    color: #e0e0e0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .k-input:focus,
  textarea.k-input:focus {
    border-color: #409eff;
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.3);
  }
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
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
  font-weight: 500;
}

.radio-input:checked+.radio-button {
  background-color: #409eff;
  color: white;
  border-color: #409eff;
}

.radio-input:hover:not(:checked)+.radio-button {
  background-color: rgba(240, 240, 240, 0.9);
  border-color: #409eff;
}

.radio-input:focus+.radio-button {
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

@media (prefers-color-scheme: dark) {
  .radio-button {
    background-color: rgba(50, 50, 50, 0.9);
    color: #e0e0e0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .radio-input:hover:not(:checked)+.radio-button {
    background-color: rgba(70, 70, 70, 0.9);
  }
}
</style>