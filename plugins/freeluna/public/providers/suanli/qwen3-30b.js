/**
 * 算力云 Qwen3-30B-A3B 提供商适配器
 * https://qwq.aigpu.cn/
 * https://api.suanli.cn/pricing
 *
 * API 端点: https://api.suanli.cn/v1/chat/completions
 * 模型: free:Qwen3-30B-A3B（免费）
 * 响应格式: OpenAI 兼容格式
 */

const API_URL = 'https://api.suanli.cn/v1/chat/completions'
// 旧key: const API_KEY_BASE64 = 'c2stV0JLY2d4cTYzMzk2ZVhNRllRWWR5cmFMbkF0emNPTEVBeEJtSmI2RkFCc241d2NG'
const API_KEY_BASE64 = 'c2stVzBycFN0Yzk1VDdKVllWd0RZYzI5SXlpcmp0cFBQYnk2U296Rk1RcjE3bThLV2Vv'

module.exports = {
  name: 'suanli-qwen3-30b',
  description: '算力云 - 免费 Qwen3-30B-A3B',

  /**
   * 发送对话请求
   * @param {Array<{role: string, content: string}>} messages 消息列表
   * @param {object} [options] 可选参数
   * @returns {Promise<string>} AI 回复的纯文本
   */
  async chat(messages, options) {
    const headers = {
      'Authorization': `Bearer ${Buffer.from(API_KEY_BASE64, 'base64').toString()}`,
      'Content-Type': 'application/json',
    }

    const body = {
      model: 'free:Qwen3-30B-A3B',
      messages: messages,
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      throw new Error(`算力云 API 请求失败: HTTP ${res.status} ${res.statusText}`)
    }

    const data = await res.json()

    // 提取 OpenAI 格式的回复内容
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('算力云 API 返回格式异常')
    }

    const content = data.choices[0].message.content

    if (!content) {
      throw new Error('算力云 API 返回了空响应')
    }

    return content
  },
}
