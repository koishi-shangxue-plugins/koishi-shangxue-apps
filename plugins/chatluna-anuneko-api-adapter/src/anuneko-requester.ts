import { ChatGeneration, ChatGenerationChunk } from '@langchain/core/outputs'
import {
  ModelRequester,
  ModelRequestParams
} from 'koishi-plugin-chatluna/llm-core/platform/api'
import {
  ClientConfig,
  ClientConfigPool
} from 'koishi-plugin-chatluna/llm-core/platform/config'
import { Config, logger } from './index'
import { logInfo } from './logger'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { Context } from 'koishi'
import {
  AIMessageChunk,
  HumanMessage,
  SystemMessage
} from '@langchain/core/messages'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 扩展 ModelRequestParams 以包含运行时可用的属性
interface InternalModelRequestParams extends ModelRequestParams {
  input: (HumanMessage | SystemMessage)[]
}

export class AnunekoRequester extends ModelRequester {
  // 存储每个用户的会话ID
  private sessionMap = new Map<string, string>()
  // 存储每个用户的当前模型
  private modelMap = new Map<string, string>()

  constructor(
    ctx: Context,
    _configPool: ClientConfigPool<ClientConfig>,
    public _pluginConfig: Config,
    _plugin: ChatLunaPlugin
  ) {
    super(ctx, _configPool, _pluginConfig, _plugin)
  }

  // 清理指定用户的会话
  public clearSession(userId: string): boolean {
    const hasSession = this.sessionMap.has(userId)
    this.sessionMap.delete(userId)
    this.modelMap.delete(userId)
    return hasSession
  }

  // 清理所有会话
  public clearAllSessions(): number {
    const count = this.sessionMap.size
    this.sessionMap.clear()
    this.modelMap.clear()
    return count
  }

  // 构建请求头
  public buildHeaders() {
    const headers: Record<string, string> = {
      'accept': '*/*',
      'content-type': 'application/json',
      'origin': 'https://anuneko.com',
      'referer': 'https://anuneko.com/',
      'user-agent': 'Mozilla/5.0',
      'x-app_id': 'com.anuttacon.neko',
      'x-client_type': '4',
      'x-device_id': '7b75a432-6b24-48ad-b9d3-3dc57648e3e3',
      'x-token': this._pluginConfig.xToken
    }

    if (this._pluginConfig.cookie) {
      headers['Cookie'] = this._pluginConfig.cookie
    }

    return headers
  }

  // 创建新会话
  private async createNewSession(userId: string, modelName: string): Promise<string | null> {
    const headers = this.buildHeaders()
    const data = { model: modelName }

    try {
      logInfo('Creating new session with model:', modelName)
      const response = await fetch('https://anuneko.com/api/v1/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      })

      const responseData = await response.json()
      const chatId = responseData.chat_id || responseData.id
      if (chatId) {
        this.sessionMap.set(userId, chatId)
        this.modelMap.set(userId, modelName)
        logInfo('New session created with ID:', chatId)

        // 切换模型以确保一致性
        await this.switchModel(userId, chatId, modelName)
        return chatId
      }
    } catch (error) {
      this.logger.error('Failed to create new session:', error)
    }

    return null
  }

  // 切换模型
  private async switchModel(userId: string, chatId: string, modelName: string): Promise<boolean> {
    const headers = this.buildHeaders()
    const data = { chat_id: chatId, model: modelName }

    try {
      logInfo('Switching model to:', modelName)
      const response = await fetch('https://anuneko.com/api/v1/user/select_model', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      })

      if (response.ok) {
        this.modelMap.set(userId, modelName)
        logInfo('Model switched successfully')
        return true
      }
    } catch (error) {
      this.logger.error('Failed to switch model:', error)
    }

    return false
  }

  // 自动选择分支
  private async sendChoice(msgId: string): Promise<void> {
    const headers = this.buildHeaders()
    const data = { msg_id: msgId, choice_idx: 0 }

    try {
      await fetch('https://anuneko.com/api/v1/msg/select-choice', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      })
      logInfo('Choice sent for msg_id:', msgId)
    } catch (error) {
      this.logger.error('Failed to send choice:', error)
    }
  }

  // 流式回复
  async *completionStreamInternal(
    params: ModelRequestParams
  ): AsyncGenerator<ChatGenerationChunk> {
    const internalParams = params as InternalModelRequestParams
    const lastMessage = internalParams.input.at(-1)

    logInfo('Receive params from chatluna', JSON.stringify(params, null, 2))

    if (!(lastMessage instanceof HumanMessage)) {
      this.logger.warn('The last message is not from a human.')
      return
    }

    const prompt = lastMessage.content as string
    // 使用 channelId 作为会话标识，如果没有则使用 userId
    const sessionKey = (lastMessage as any).channelId || lastMessage.id || 'default'

    logInfo('使用会话标识:', sessionKey)

    // 从模型名称推断使用的模型
    let modelName = 'Orange Cat' // 默认橘猫
    if (params.model.includes('exotic') || params.model.includes('shorthair')) {
      modelName = 'Exotic Shorthair'
    }

    // 获取或创建会话
    let sessionId = this.sessionMap.get(sessionKey)
    const currentModel = this.modelMap.get(sessionKey)

    // 如果没有会话或模型不匹配，创建新会话
    if (!sessionId || currentModel !== modelName) {
      sessionId = await this.createNewSession(sessionKey, modelName)
      if (!sessionId) {
        const errorText = '创建会话失败，请稍后再试。'
        yield new ChatGenerationChunk({
          text: errorText,
          message: new AIMessageChunk({ content: errorText })
        })
        return
      }
    }

    const headers = this.buildHeaders()
    const url = `https://anuneko.com/api/v1/msg/${sessionId}/stream`
    const data = { contents: [prompt] }

    let retries = 3
    while (retries > 0) {
      try {
        logInfo('Sending request to API:', url, JSON.stringify(data, null, 2))

        let result = ''
        let currentMsgId: string | null = null

        // 使用流式请求
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(data)
        })

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        // 处理流式响应
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunkStr = decoder.decode(value, { stream: true })
          const lines = chunkStr.split('\n')

          for (const line of lines) {
            if (!line || !line.startsWith('data: ')) {
              // 检查是否是错误响应
              if (line.trim()) {
                try {
                  const errorJson = JSON.parse(line)
                  if (errorJson.code === 'chat_choice_shown') {
                    const errorText = '⚠️ 检测到对话分支未选择，请重试或新建会话。'
                    yield new ChatGenerationChunk({
                      text: errorText,
                      message: new AIMessageChunk({ content: errorText })
                    })
                    return
                  }
                } catch {
                  // 忽略解析错误
                }
              }
              continue
            }

            const rawJson = line.substring(6).trim()
            if (!rawJson) continue

            try {
              const j = JSON.parse(rawJson)

              // 更新 msg_id
              if (j.msg_id) {
                currentMsgId = j.msg_id
              }

              // 处理多分支内容
              if (j.c && Array.isArray(j.c)) {
                for (const choice of j.c) {
                  const idx = choice.c ?? 0
                  if (idx === 0 && choice.v) {
                    result += choice.v
                  }
                }
              }
              // 处理常规内容
              else if (j.v && typeof j.v === 'string') {
                result += j.v
              }
            } catch (error) {
              logInfo('Failed to parse JSON:', rawJson, error)
            }
          }
        }

        // 流结束后，如果有 msg_id，自动确认选择第一项
        if (currentMsgId) {
          await this.sendChoice(currentMsgId)
        }

        logInfo('Received complete response:', result)

        yield new ChatGenerationChunk({
          text: result,
          message: new AIMessageChunk({ content: result })
        })
        return // 成功，退出重试循环
      } catch (error) {
        this.logger.error(`Request failed, ${retries - 1} retries left.`, error)
        retries--
        if (retries === 0) {
          const errorText = `请求失败，请稍后再试: ${error.message}`
          yield new ChatGenerationChunk({
            text: errorText,
            message: new AIMessageChunk({ content: errorText })
          })
        } else {
          await sleep(1000) // 等待1秒后重试
        }
      }
    }
  }

  get logger() {
    return logger
  }
}