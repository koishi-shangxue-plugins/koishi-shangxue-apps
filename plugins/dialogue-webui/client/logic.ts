import { ref, reactive, onMounted } from 'vue'
import { Context } from '@koishijs/client'

// 我们将在 hook 内部获取 client 实例，以确保 Koishi 环境已准备就绪

// 定义数据结构
export interface Dialogue {
  id: number
  keyword: string
  answer: string
  isRegex: boolean
  channelId: string
  isGlobal: boolean
}

// 封装所有业务逻辑的自定义 Hook
export function useDialogLogic() {
  // 在 hook 函数内部获取 client 实例
  const client: Context = window.KOISHI_CLIENT

  const dialogues = ref<Dialogue[]>([])
  const showModal = ref(false)
  const isEditing = ref(false)

  const editingItem = reactive<Partial<Dialogue>>({
    id: undefined,
    keyword: '',
    answer: '',
    isRegex: false,
    isGlobal: false,
    channelId: '',
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
    Object.assign(editingItem, item)
    showModal.value = true
  }

  // 处理删除
  const handleDelete = async (id: number) => {
    if (confirm('确定要删除这个问答吗？')) {
      try {
        await client.http.post('/dialogue/delete', { id })
        await fetchDialogues()
      } catch (error) {
        console.error('删除失败:', error)
      }
    }
  }

  // 处理表单提交 (添加/更新)
  const handleSubmit = async () => {
    try {
      if (isEditing.value) {
        await client.http.post('/dialogue/update', editingItem)
      } else {
        await client.http.post('/dialogue/create', editingItem)
      }
      showModal.value = false
      await fetchDialogues()
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  // 返回所有需要在组件中使用的数据和方法
  return {
    dialogues,
    showModal,
    isEditing,
    editingItem,
    openAddModal,
    openEditModal,
    handleDelete,
    handleSubmit,
  }
}

// 扩展 window 类型以避免 TypeScript 报错
declare global {
  interface Window {
    KOISHI_CLIENT: Context
  }
}