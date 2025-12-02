<template>
  <k-card>
    <div class="header">
      <h2>问答管理</h2>
      <k-button @click="openAddModal">添加新问答</k-button>
    </div>

    <k-table>
      <thead>
        <tr>
          <th>关键词</th>
          <th>回复内容</th>
          <th>类型</th>
          <th>范围</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in dialogues" :key="item.id">
          <td>{{ item.keyword }}</td>
          <td class="answer-cell">{{ item.answer }}</td>
          <td>{{ item.isRegex ? '正则' : '文本' }}</td>
          <td>{{ item.isGlobal ? '全局' : `频道 (${item.channelId})` }}</td>
          <td>
            <k-button @click="openEditModal(item)">编辑</k-button>
            <k-button type="danger" @click="handleDelete(item.id)">删除</k-button>
          </td>
        </tr>
      </tbody>
    </k-table>

    <k-modal v-model="showModal" :title="isEditing ? '编辑问答' : '添加问答'">
      <k-form>
        <k-form-item label="关键词">
          <k-input v-model="editingItem.keyword" />
        </k-form-item>
        <k-form-item label="回复内容 (支持 Markdown)">
          <k-textarea v-model="editingItem.answer" rows="5" />
        </k-form-item>
        <k-form-item label="选项">
          <k-checkbox v-model="editingItem.isRegex">使用正则表达式</k-checkbox>
          <k-checkbox v-model="editingItem.isGlobal">全局生效</k-checkbox>
        </k-form-item>
        <div class="form-actions">
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

.answer-cell {
  white-space: pre-wrap;
  word-break: break-all;
  max-width: 400px;
}

.form-actions {
  text-align: right;
  margin-top: 1rem;
}
</style>