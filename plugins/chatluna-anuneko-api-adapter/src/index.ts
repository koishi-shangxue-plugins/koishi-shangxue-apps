import { Context, Logger, Schema } from 'koishi'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import {
  ChatLunaError,
  ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import { createLogger } from 'koishi-plugin-chatluna/utils/logger'
import { AnunekoClient } from './anuneko-client'
import { initializeLogger } from './logger'

export let logger: Logger
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
<p>该服务需要配置有效的 x-token 才能使用。支持橘猫(Orange Cat)和黑猫(Exotic Shorthair)两种模型。</p>
`

export function apply(ctx: Context, config: Config) {
  logger = createLogger(ctx, 'chatluna-anuneko-api-adapter')
  initializeLogger(logger, config)

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

    plugin.registerClient(() => new AnunekoClient(ctx, config, plugin))

    await plugin.initClient()
  })
}

export interface Config extends ChatLunaPlugin.Config {
  platform: string
  xToken: string
  cookie?: string
  loggerinfo: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  ChatLunaPlugin.Config,
  Schema.object({
    platform: Schema.string().default('anuneko'),
    xToken: Schema.string()
      .required()
      .description('anuneko API 的 x-token').role('textarea', { rows: [2, 4] }),
    cookie: Schema.string()
      .description('anuneko API 的 Cookie（可选）').role('textarea', { rows: [2, 4] }),
    loggerinfo: Schema.boolean()
      .default(false)
      .description('日志调试模式')
      .experimental()
  })
]).i18n({
  'zh-CN': require('./locales/zh-CN.schema.yml'),
  'en-US': require('./locales/en-US.schema.yml')
}) as Schema<Config>

export const inject = ['chatluna']

export const name = 'chatluna-anuneko-api-adapter'