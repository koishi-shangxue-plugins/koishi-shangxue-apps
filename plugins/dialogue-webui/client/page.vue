<template>
  <k-card>
    <div class="header">
      <h2>问答管理 (双击单元格进行编辑)</h2>
      <k-button @click="openAddModal">添加新问答</k-button>
    </div>

    <div class="table-container">
      <k-table class="dialogue-table">
        <thead>
          <tr>
            <th>关键词</th>
            <th>回复内容</th>
            <th>类型</th>
            <th>范围</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in dialogues" :key="item.id" @dblclick="openEditModal(item)">
            <td>{{ item.keyword }}</td>
            <td class="answer-cell">{{ item.answer }}</td>
            <td>{{ item.isRegex ? '正则' : '文本' }}</td>
            <td>{{ item.isGlobal ? '全局' : `频道 (${item.channelId})` }}</td>
          </tr>
        </tbody>
      </k-table>
    </div>

    <k-modal v-model="showModal" :title="isEditing ? '编辑问答' : '添加问答'">
      <k-form>
        <k-form-item label="关键词">
          <k-input v-model="editingItem.keyword" />
        </k-form-item>
        <k-form-item label="回复内容 (支持 Markdown)">
          <k-textarea v-model="editingItem.answer" rows="8" />
        </k-form-item>
        <k-form-item label="选项">
          <k-checkbox v-model="editingItem.isRegex">使用正则表达式</k-checkbox>
          <k-checkbox v-model="editingItem.isGlobal">全局生效</k-checkbox>
        </k-form-item>
        <div class="form-actions">
          <k-button v-if="isEditing" type="danger" @click="handleDelete(editingItem.id)">删除</k-button>
          <div style="flex-grow: 1;"></div>
          <k-button @click="showModal = false">取消</k-button>
          <k-button type="primary" @click="handleSubmit">保存</k-button>
        </div>
      </k-form>
    </k-modal>
  </k-card>
</template>

<script lang="ts" setup>
import { useDialogLogic } from './logic'

// 从自定义 Hook 中解构出所有需要的数据和方法
const {
  dialogues,
  showModal,
  isEditing,
  editingItem,
  openAddModal,
  openEditModal,
  handleDelete,
  handleSubmit,
} = useDialogLogic()
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.table-container {
  overflow-x: auto;
}

.dialogue-table {
  width: 100%;
  border-collapse: collapse;
}

.dialogue-table th,
.dialogue-table td {
  border: 1px solid var(--k-color-border);
  padding: 0.75rem 1rem;
  text-align: left;
  vertical-align: top;
}

.dialogue-table tbody tr {
  cursor: pointer;
  transition: background-color 0.2s;
}

.dialogue-table tbody tr:hover {
  background-color: var(--k-color-hover);
}

.answer-cell {
  white-space: pre-wrap;
  word-break: break-all;
  max-width: 400px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>