/**
 * chatjimmy.ai 提供商适配器
 * https://chatjimmy.ai
 *
 * API 端点: https://chatjimmy.ai/api/chat
 * 模型: llama3.1-8B（免费）
 * 响应格式: 纯文本，末尾附带 <|stats|>...<|/stats|> 统计信息需要去除
 */

module.exports = {
  name: 'chatjimmy-llama3',
  description: 'ChatJimmy.ai - 免费 Llama 3.1 8B',

  /**
   * 发送对话请求
   * @param {Array<{role: string, content: string}>} messages 消息列表
   * @param {object} [options] 可选参数（暂未使用）
   * @returns {Promise<string>} AI 回复的纯文本
   */
  async chat(messages, options) {
    const url = 'https://chatjimmy.ai/api/chat'

    const headers = {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cache-Control': 'no-cache',
      'Origin': 'https://chatjimmy.ai',
      'Pragma': 'no-cache',
      'Referer': 'https://chatjimmy.ai/',
      'Sec-Ch-Ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    }

    // 提取 system prompt（如果有）
    const systemMsg = messages.find(m => m.role === 'system')
    const systemPrompt = systemMsg ? systemMsg.content : ''

    // 过滤掉 system 消息，只保留 user/assistant 对话
    const chatMessages = messages.filter(m => m.role !== 'system')

    const body = {
      messages: chatMessages,
      chatOptions: {
        selectedModel: 'llama3.1-8B',
        systemPrompt,
        topK: 8,
      },
      attachment: null,
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      throw new Error(`chatjimmy.ai 请求失败: HTTP ${res.status} ${res.statusText}`)
    }

    const text = await res.text()

    // 去除末尾的 <|stats|>...<|/stats|> 统计信息
    const cleaned = text.replace(/<\|stats\|>[\s\S]*?<\|\/stats\|>/g, '').trim()

    if (!cleaned) {
      throw new Error('chatjimmy.ai 返回了空响应')
    }

    return cleaned
  },
}
