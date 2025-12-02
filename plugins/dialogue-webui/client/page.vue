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
import { ref, onMounted, reactive } from 'vue'
import { useClient } from '@koishijs/client'

// 定义数据结构
interface Dialogue {
  id: number
  keyword: string
  answer: string
  isRegex: boolean
  channelId: string
  isGlobal: boolean
}

const client = useClient()
const dialogues = ref<Dialogue[]>([])
const showModal = ref(false)
const isEditing = ref(false)

// 使用 reactive 来处理表单对象
const editingItem = reactive<Partial<Dialogue>>({
  id: undefined,
  keyword: '',
  answer: '',
  isRegex: false,
  isGlobal: false,
  channelId: '', // 默认非全局时需要一个频道ID，但这里我们让后端处理
})

// 获取所有问答
const fetchDialogues = async () => {
  try {
    const response = await client.http.get('/dialogue/list')
    if (response.data.success) {
      dialogues.value = response.data.data
    }
  } catch (error) {
    console.error('获取问答列表失败:', error)
  }
}

// 组件挂载时获取数据
onMounted(fetchDialogues)

// 打开添加模态框
const openAddModal = () => {
  isEditing.value = false
  // 重置表单
  Object.assign(editingItem, {
    id: undefined,
    keyword: '',
    answer: '',
    isRegex: false,
    isGlobal: false,
  })
  showModal.value = true
}

// 打开编辑模态框
const openEditModal = (item: Dialogue) => {
  isEditing.value = true
  // 将选中项的数据填充到表单
  Object.assign(editingItem, item)
  showModal.value = true
}

// 处理删除
const handleDelete = async (id: number) => {
  if (confirm('确定要删除这个问答吗？')) {
    try {
      await client.http.post('/dialogue/delete', { id })
      await fetchDialogues() // 重新获取列表
    } catch (error) {
      console.error('删除失败:', error)
    }
  }
}

// 处理表单提交 (添加/更新)
const handleSubmit = async () => {
  try {
    if (isEditing.value) {
      // 更新
      await client.http.post('/dialogue/update', editingItem)
    } else {
      // 创建
      await client.http.post('/dialogue/create', editingItem)
    }
    showModal.value = false
    await fetchDialogues() // 重新获取列表
  } catch (error) {
    console.error('保存失败:', error)
  }
}
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