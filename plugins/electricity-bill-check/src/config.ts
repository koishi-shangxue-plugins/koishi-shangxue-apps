import { Schema } from 'koishi'
import type { Config as PluginConfig } from './types'

export const Config: Schema<PluginConfig> = Schema.object({
  tasks: Schema.array(Schema.object({
    regex: Schema.string()
      .description('用于提取电费结果的正则表达式，需使用捕获组')
      .default('([\\d.]+)度?'),
    botId: Schema.string()
      .description('发送消息的 Bot ID')
      .default('1787850032'),
    channelId: Schema.string()
      .description('播报到的群号 / 频道 ID')
      .default('572978374'),
    maxRetries: Schema.number()
      .min(0)
      .default(5)
      .description('请求失败后的最大重试次数'),
    retryDelaySeconds: Schema.number()
      .min(1)
      .default(60)
      .description('每次重试之间的等待秒数'),
    requestTimeoutSeconds: Schema.number()
      .min(1)
      .default(10)
      .description('单次请求超时时间（秒）'),
    enabled: Schema.boolean()
      .default(true)
      .description('是否启用该查询任务'),
  }).description('查询任务配置')).role('table'),
  loggerinfo: Schema.boolean()
    .default(false)
    .description('是否输出调试日志')
    .experimental(),
})
