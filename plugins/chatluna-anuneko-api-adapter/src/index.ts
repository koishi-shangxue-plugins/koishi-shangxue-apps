import { Context, Logger, Schema } from 'koishi'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import {
  ChatLunaError,
  ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import { createLogger } from 'koishi-plugin-chatluna/utils/logger'
import { AnunekoClient } from './anuneko-client'
import { initializeLogger, logInfo } from './logger'

export let logger: Logger
export let anunekoClient: any = null
export const reusable = true
export const usage = `
<p><strong>零成本、快速体验Chatluna</strong>。</p>
<ul>
<li><strong>API来源：</strong> anuneko.com</li>
<li>
<strong>接口地址：</strong>
<a href="https://anuneko.com" target="_blank" rel="noopener noreferrer">https://anuneko.com</a>
</li>
</ul>
<p><strong>请注意：</strong></p>
<p>该服务需要配置有效的 x-token 才能使用。</p>
<p>该服务可能需要科学上网。</p>
<p>支持橘猫(Orange Cat)和黑猫(Exotic Shorthair)两种模型。</p>

---

x-token 获取方法见仓库文件 https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/blob/main/plugins/chatluna-anuneko-api-adapter/data/2025-12-23_19-01-43.png
`

export function apply(ctx: Context, config: Config) {
  logger = createLogger(ctx, 'chatluna-anuneko-api-adapter')
  initializeLogger(logger, config)

  // 测试命令
  ctx.command('anuneko <message:text>', '测试 anuneko API')
    .action(async ({ session }, message) => {
      if (!message) {
        return '请输入消息内容，例如：/anuneko 你好'
      }

      try {
        const headers = {
          'accept': '*/*',
          'content-type': 'application/json',
          'origin': 'https://anuneko.com',
          'referer': 'https://anuneko.com/',
          'user-agent': 'Mozilla/5.0',
          'x-app_id': 'com.anuttacon.neko',
          'x-client_type': '4',
          'x-device_id': '7b75a432-6b24-48ad-b9d3-3dc57648e3e3',
          'x-token': config.xToken
        }
        const signal = AbortSignal.timeout(config.requestTimeout * 1000)

        if (config.cookie) {
          headers['Cookie'] = config.cookie
        }

        // 创建新会话
        logInfo('创建新会话...')
        const createResponse = await fetch('https://anuneko.com/api/v1/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({ model: 'Orange Cat' }),
          signal
        })

        const createData = await createResponse.json()
        const chatId = createData.chat_id || createData.id
        if (!chatId) {
          return '❌ 创建会话失败'
        }

        logInfo('会话创建成功，ID:', chatId)

        // 发送消息并获取流式响应
        const url = `https://anuneko.com/api/v1/msg/${chatId}/stream`
        const data = { contents: [message] }

        logInfo('发送消息...')
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal
        })

        if (!response.ok) {
          return `❌ 请求失败: ${response.status} ${response.statusText}`
        }

        let result = ''
        let currentMsgId: string | null = null

        // 处理流式响应
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunkStr = decoder.decode(value, { stream: true })
          logInfo('收到数据块:', chunkStr.substring(0, 200))

          const lines = chunkStr.split('\n')

          for (const line of lines) {
            if (!line.trim()) {
              continue
            }

            logInfo('处理行:', line.substring(0, 100))

            if (!line.startsWith('data: ')) {
              logInfo('非 data: 格式的行:', line)
              continue
            }

            const rawJson = line.substring(6).trim()
            if (!rawJson) continue

            try {
              const j = JSON.parse(rawJson)
              logInfo('解析的 JSON:', JSON.stringify(j))

              if (j.msg_id) {
                currentMsgId = j.msg_id
                logInfo('更新 msg_id:', currentMsgId)
              }

              // 处理多分支内容
              if (j.c && Array.isArray(j.c)) {
                logInfo('处理多分支内容')
                for (const choice of j.c) {
                  const idx = choice.c ?? 0
                  if (idx === 0 && choice.v) {
                    result += choice.v
                    logInfo('添加内容:', choice.v)
                  }
                }
              }
              // 处理常规内容
              else if (j.v && typeof j.v === 'string') {
                result += j.v
                logInfo('添加常规内容:', j.v)
              }
            } catch (error) {
              logger.error('解析 JSON 失败:', rawJson, error)
            }
          }
        }

        logInfo('最终结果长度:', result.length)
        logInfo('最终结果内容:', result)

        // 自动选择分支
        if (currentMsgId) {
          await fetch('https://anuneko.com/api/v1/msg/select-choice', {
            method: 'POST',
            headers,
            body: JSON.stringify({ msg_id: currentMsgId, choice_idx: 0 }),
            signal
          })
        }

        logInfo('收到完整响应')
        return result || '❌ 未收到响应'
      } catch (error) {
        logger.error('请求失败:', error)
        return `❌ 请求失败: ${error.message}`
      }
    })

  // 清理命令
  ctx.command('anuneko-clean', '清理当前频道的 anuneko 对话记录')
    .action(async ({ session }) => {
      try {
        if (!anunekoClient) {
          return '❌ anuneko 客户端未初始化'
        }

        // 使用 channelId 作为会话标识
        const sessionKey = session.channelId || session.userId
        const requester = anunekoClient._requester

        if (requester && typeof requester.clearSession === 'function') {
          const cleared = requester.clearSession(sessionKey)
          if (cleared) {
            return '✅ 已清理当前频道的对话记录，下次对话将创建新会话'
          } else {
            return '✅ 当前频道还没有对话记录'
          }
        }

        return '❌ 无法访问会话管理器'
      } catch (error) {
        logger.error('清理失败:', error)
        return `❌ 清理失败: ${error.message}`
      }
    })

  ctx.on('ready', async () => {
    if (config.platform == null || config.platform.length < 1) {
      throw new ChatLunaError(
        ChatLunaErrorCode.UNKNOWN_ERROR,
        new Error('Cannot find any platform')
      )
    }

    const platform = config.platform

    const plugin = new ChatLunaPlugin(ctx, config, platform)

    plugin.parseConfig((config) => {
      // 创建一个假的客户端配置
      return [
        {
          apiKey: config.xToken || 'any',
          apiEndpoint: 'https://anuneko.com',
          platform,
          chatLimit: config.chatTimeLimit,
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          concurrentMaxSize: config.chatConcurrentMaxSize
        }
      ]
    })

    plugin.registerClient(() => {
      const client = new AnunekoClient(ctx, config, plugin)
      if (!anunekoClient) {
        anunekoClient = client
      }
      return client
    })

    await plugin.initClient()
  })
}

export interface Config extends ChatLunaPlugin.Config {
  platform: string
  xToken: string
  cookie?: string
  loggerinfo: boolean
  requestTimeout: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    platform: Schema.string().default('anuneko'),
    xToken: Schema.string()
      .required()
      .role('textarea', { rows: [2, 4] })
      .description('anuneko API 的 x-token'),
    cookie: Schema.string()
      .role('textarea', { rows: [2, 4] })
      .description('anuneko API 的 Cookie（可选）'),
    loggerinfo: Schema.boolean()
      .default(false)
      .description('日志调试模式')
      .experimental(),
    requestTimeout: Schema.number()
      .default(120)
      .description('请求 API 的超时时间，单位为秒。')
  }).description('基础设置'),
  ChatLunaPlugin.Config,
]).i18n({
  'zh-CN': require('./locales/zh-CN.schema.yml'),
  'en-US': require('./locales/en-US.schema.yml')
}) as Schema<Config>

export const inject = ['chatluna']

export const name = 'chatluna-anuneko-api-adapter'