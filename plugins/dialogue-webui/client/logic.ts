import { ref, reactive, onMounted } from 'vue'
import { send } from '@koishijs/client'

// 定义数据结构
export interface Dialogue {
  id: number
  question: string
  answer: string
  type: 'keyword' | 'regexp'
  scope: 'global' | 'group' | 'private'
}

export function useDialogLogic() {
  // State
  const dialogues = ref<Dialogue[]>([])
  const showModal = ref(false)
  const isEditMode = ref(false)
  const currentDialogue = reactive<Partial<Dialogue>>({
    id: null,
    question: '',
    answer: '',
    type: 'keyword',
    scope: 'global',
  })

  // 从后端获取数据
  const fetchDialogues = async () => {
    try {
      dialogues.value = await send('dialogue/list')
    } catch (error) {
      console.error('获取问答列表失败:', error)
    }
  }

  // onMounted - 确保在组件挂载后执行
  onMounted(fetchDialogues)

  // 打开“添加”模态框
  const openAddModal = () => {
    isEditMode.value = false
    Object.assign(currentDialogue, {
      id: null,
      question: '',
      answer: '',
      type: 'keyword',
      scope: 'global',
    })
    showModal.value = true
  }

  // 打开“编辑”模态框
  const openEditModal = (dialogue: Dialogue) => {
    isEditMode.value = true
    Object.assign(currentDialogue, dialogue)
    showModal.value = true
  }

  // 保存（创建或更新）
  const handleSave = async () => {
    try {
      if (isEditMode.value) {
        await send('dialogue/update', currentDialogue as Dialogue)
      } else {
        await send('dialogue/create', currentDialogue as Dialogue)
      }
      showModal.value = false
      await fetchDialogues()
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  // 删除
  const handleDelete = async (id: number) => {
    if (!id) return
    try {
      await send('dialogue/delete', id)
      await fetchDialogues()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  return {
    dialogues,
    showModal,
    isEditMode,
    currentDialogue,
    openAddModal,
    openEditModal,
    handleSave,
    handleDelete,
  }
}