/**
 * MKE AI QwQ-32B 提供商适配器
 * https://api.mkeai.com/pricing
 *
 * API 端点: https://api.mkeai.com/v1/chat/completions
 * 模型: QwQ-32B（免费）
 * 响应格式: OpenAI 兼容格式
 */

const API_URL = 'https://api.mkeai.com/v1/chat/completions'
const API_KEY_BASE64 = 'c2stQ2RqRVdBMTVmQnU0S2gyWVViWktGUFE3NzEzbjNycHVzamhnSkdldmthQXFJNEM3'

module.exports = {
  name: 'mkeai-qwq-32b',
  description: 'MKE AI - 免费 QwQ-32B',

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
      model: 'QwQ-32B',
      messages: messages,
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      throw new Error(`MKE AI API 请求失败: HTTP ${res.status} ${res.statusText}`)
    }

    const data = await res.json()

    // 提取 OpenAI 格式的回复内容
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('MKE AI API 返回格式异常')
    }

    const content = data.choices[0].message.content

    if (!content) {
      throw new Error('MKE AI API 返回了空响应')
    }

    return content
  },
}
