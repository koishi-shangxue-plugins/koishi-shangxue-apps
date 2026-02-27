import { Schema } from 'koishi'
import type { Config } from './types'

const defaultApiKeys = [
  { token: 'sk-freeluna-default' },
]

export const ConfigSchema: Schema<Config> = Schema.intersect([
  Schema.object({
    basePath: Schema.string()
      .default('/freeluna')
      .description('插件基础路由前缀，所有路由都挂载在此路径下'),
    remoteIndexUrl: Schema.string()
      .default('https://raw.githubusercontent.com/koishi-shangxue-plugins/koishi-shangxue-apps/main/plugins/freeluna/public/index.json')
      .description('远程提供商注册表 URL（JSON 格式），列出所有可用的免费 API 提供商'),
    apiKeys: Schema.array(Schema.object({
      token: Schema.string().description('API Key 令牌'),
    })).role('table')
      .default(defaultApiKeys)
      .description('API Key 列表<br>只有携带有效 Key（Bearer Token）的请求才会被处理'),
    cacheTtl: Schema.number()
      .default(300)
      .min(0)
      .description('提供商列表缓存时间（秒），0 表示不缓存'),
  }).description('基础设置'),

  Schema.object({
    localDebug: Schema.boolean()
      .default(false)
      .description('本地调试模式：启用后从本地 public/ 目录加载提供商配置和 JS，而非远程 URL'),
  }).description('调试设置'),

  Schema.object({
    loggerInfo: Schema.boolean()
      .default(false)
      .description('启用详细日志输出'),
    loggerDebug: Schema.boolean()
      .default(false)
      .description('启用调试日志模式（包含请求/响应详情）')
      .experimental(),
  }).description('日志设置'),
])
