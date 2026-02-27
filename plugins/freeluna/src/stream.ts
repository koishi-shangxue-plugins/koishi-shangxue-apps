/**
 * SSE 流式响应工具函数
 * 将完整的回复文本转换为 OpenAI 兼容的 SSE 格式字符串
 */

/**
 * 构造 SSE 流式响应字符串
 * 格式：data: {...}\n\n ... data: [DONE]\n\n
 * @param content 完整回复文本
 * @param model 模型名称
 */
export function createStreamResponse(content: string, model: string): string {
  const id = `chatcmpl-freeluna-${Date.now()}`
  const created = Math.floor(Date.now() / 1000)
  const chunks: object[] = []

  // 第一个 chunk：角色声明
  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: { role: 'assistant' },
      finish_reason: null,
    }],
  })

  // 内容 chunk：按字符逐个发送
  for (const char of content) {
    chunks.push({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: { content: char },
        finish_reason: null,
      }],
    })
  }

  // 结束 chunk
  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop',
    }],
  })

  return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'
}

/**
 * 构造 OpenAI 格式的非流式响应体
 */
export function buildChatResponse(content: string, modelName: string) {
  return {
    id: `chatcmpl-freeluna-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  }
}
