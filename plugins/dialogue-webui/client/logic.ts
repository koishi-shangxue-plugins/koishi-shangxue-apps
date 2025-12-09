import { ref, reactive, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { Dialogue } from './types'

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
    contextId: '',
  })

  // 从后端获取数据
  const fetchDialogues = async () => {
    try {
      dialogues.value = await (send as any)('webdialogue/list') as any
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
      contextId: '',
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
    // 输入验证
    if (!currentDialogue.question?.trim() || !currentDialogue.answer?.trim()) {
      alert('关键词和回复内容不能为空！')
      return
    }

    try {
      if (isEditMode.value) {
        await (send as any)('webdialogue/update', currentDialogue)
      } else {
        await (send as any)('webdialogue/create', currentDialogue)
      }
      showModal.value = false
      await fetchDialogues()
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  // 删除
  const handleDelete = async (id: number | null | undefined) => {
    if (!id) return
    // 二次确认
    if (window.confirm('确定要删除这条问答吗？')) {
      try {
        await (send as any)('webdialogue/delete', id)
        // 如果是在编辑模态框中删除，需要关闭模态框
        if (showModal.value && isEditMode.value && currentDialogue.id === id) {
          showModal.value = false
        }
        await fetchDialogues()
      } catch (error) {
        console.error('删除失败:', error)
      }
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