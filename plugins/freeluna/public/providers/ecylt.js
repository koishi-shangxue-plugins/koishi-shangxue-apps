/**
 * ecylt.top 免费 GPT-4o-mini 提供商适配器
 * https://docs.api.ecylt.com/chatgpt/free-gpt-4o-mini#api%E6%8E%A5%E5%8F%A3%EF%BC%88json%EF%BC%89
 *
 * API: https://api.ecylt.top/v1/free_gpt/chat_json.php
 * 模型: GPT-4o-mini（免费）
 * 特点: 有状态对话，需要先创建会话获取 conversation_id
 */

const API_URL = 'https://api.ecylt.top/v1/free_gpt/chat_json.php'

/**
 * 创建新会话，返回 conversation_id
 * @param {string} [systemPrompt] 系统提示（可选）
 * @returns {Promise<string>} conversation_id
 */
async function createConversation(systemPrompt) {
  const body = { action: 'new' }
  if (systemPrompt) body.system_prompt = systemPrompt

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`创建会话失败: HTTP ${res.status}`)
  const data = await res.json()
  if (!data.conversation_id) throw new Error('创建会话失败: 未返回 conversation_id')
  return data.conversation_id
}

/**
 * 继续对话，发送消息并获取回复
 * @param {string} conversationId 会话 ID
 * @param {string} message 用户消息
 * @returns {Promise<string>} AI 回复文本
 */
async function continueConversation(conversationId, message) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'continue',
      message,
      conversation_id: conversationId,
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`对话请求失败: HTTP ${res.status}`)
  const data = await res.json()

  // 取最后一条 assistant 消息
  const messages = data.messages || []
  const lastAssistant = messages.filter(m => m.role === 'assistant').pop()
  if (!lastAssistant) throw new Error('未获取到 AI 回复')
  return lastAssistant.content
}

/**
 * 删除会话（清理云端历史）
 * @param {string} conversationId 会话 ID
 */
async function deleteConversation(conversationId) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', conversation_id: conversationId }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    // 删除失败不影响主流程
  }
}

module.exports = {
  name: 'ecylt-gpt4o-mini',
  description: 'ecylt.top - 免费 GPT-4o-mini',

  /**
   * 发送对话请求
   * 流程：创建会话 → 逐条发送历史消息 → 获取最终回复 → 删除会话
   * @param {Array<{role: string, content: string}>} messages 消息列表
   * @returns {Promise<string>} AI 回复的纯文本
   */
  async chat(messages) {
    // 提取 system prompt（如果有）
    const systemMsg = messages.find(m => m.role === 'system')
    const systemPrompt = systemMsg ? systemMsg.content : undefined

    // 过滤出 user/assistant 消息
    const chatMessages = messages.filter(m => m.role !== 'system')

    if (chatMessages.length === 0) {
      throw new Error('没有可发送的消息')
    }

    // 创建新会话
    const conversationId = await createConversation(systemPrompt)

    try {
      let lastReply = ''

      // 逐条发送消息（跳过 assistant 消息，只发 user 消息）
      // 由于 API 是有状态的，需要按顺序重放历史对话
      for (const msg of chatMessages) {
        if (msg.role === 'user') {
          lastReply = await continueConversation(conversationId, msg.content)
        }
        // assistant 消息由服务端自动记录，无需重发
      }

      if (!lastReply) {
        throw new Error('未获取到有效回复')
      }

      return lastReply
    } finally {
      // 无论成功失败，都清理云端会话历史
      await deleteConversation(conversationId)
    }
  },
}
