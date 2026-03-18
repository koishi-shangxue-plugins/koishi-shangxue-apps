import { ref, reactive, onMounted } from 'vue'
import { send } from '@koishijs/client'
import { Dialogue } from './types'

type SendFn = <T = unknown>(event: string, ...args: unknown[]) => Promise<T>
const sendConsole = send as unknown as SendFn

type DialogueForm = Omit<Dialogue, 'id'> & { id: number | null }

export function useDialogLogic() {
  // State
  const dialogues = ref<Dialogue[]>([])
  const showModal = ref(false)
  const showFilterModal = ref(false)
  const isEditMode = ref(false)
  const currentDialogue = reactive<DialogueForm>({
    id: null,
    question: '',
    answer: '',
    type: 'keyword',
    filterGroups: [],
  })

  // 从后端获取数据
  const fetchDialogues = async () => {
    try {
      dialogues.value = await sendConsole<Dialogue[]>('webdialogue/list')
    } catch (error) {
      console.error('获取问答列表失败:', error)
    }
  }

  // onMounted
  onMounted(fetchDialogues)

  // 打开"添加"模态框
  const openAddModal = () => {
    isEditMode.value = false
    Object.assign(currentDialogue, {
      id: null,
      question: '',
      answer: '',
      type: 'keyword',
      filterGroups: [],
    })
    showModal.value = true
  }

  // 打开"编辑"模态框
  const openEditModal = (dialogue: Dialogue) => {
    isEditMode.value = true
    // 确保 filterGroups 存在，兼容旧数据
    Object.assign(currentDialogue, {
      ...dialogue,
      // 只保留一个条件组（扁平化条件组）
      filterGroups: (dialogue.filterGroups || []).slice(0, 1)
    })
    showModal.value = true
  }

  // 打开"过滤器设置"模态框
  const openFilterModal = (dialogue: Dialogue) => {
    isEditMode.value = true
    // 确保 filterGroups 存在，兼容旧数据
    Object.assign(currentDialogue, {
      ...dialogue,
      // 只保留一个条件组（扁平化条件组）
      filterGroups: (dialogue.filterGroups || []).slice(0, 1)
    })
    showFilterModal.value = true
  }

  // 保存（创建或更新）
  const handleSave = async () => {
    // 统一去掉前后空格，避免“关键词/回复内容”被空格干扰
    currentDialogue.question = currentDialogue.question.trim()
    currentDialogue.answer = currentDialogue.answer.trim()
    // 输入验证
    if (!currentDialogue.question || !currentDialogue.answer) {
      alert('关键词和回复内容不能为空！')
      return
    }

    try {
      const { id, ...payload } = currentDialogue
      // 只允许一个条件组（扁平化条件组）
      payload.filterGroups = (payload.filterGroups || []).slice(0, 1)
      if (isEditMode.value) {
        if (typeof id !== 'number') {
          alert('当前问答缺少 id，无法保存。')
          return
        }
        await sendConsole('webdialogue/update', { ...payload, id })
      } else {
        await sendConsole('webdialogue/create', payload)
      }
      showModal.value = false
      await fetchDialogues()
    } catch (error) {
      console.error('保存失败:', error)
    }
  }

  // 保存过滤器设置
  const handleSaveFilter = async () => {
    if (typeof currentDialogue.id !== 'number') return

    try {
      const { id, ...payload } = currentDialogue
      // 只允许一个条件组（扁平化条件组）
      payload.filterGroups = (payload.filterGroups || []).slice(0, 1)
      await sendConsole('webdialogue/update', { ...payload, id })
      showFilterModal.value = false
      await fetchDialogues()
    } catch (error) {
      console.error('保存过滤器失败:', error)
    }
  }

  // 删除
  const handleDelete = async (id: number | null | undefined) => {
    if (!id) return
    try {
      await sendConsole('webdialogue/delete', id)
      // 如果是在编辑模态框中删除，需要关闭模态框
      if (showModal.value && isEditMode.value && currentDialogue.id === id) {
        showModal.value = false
      }
      await fetchDialogues()
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  return {
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
  }
}
