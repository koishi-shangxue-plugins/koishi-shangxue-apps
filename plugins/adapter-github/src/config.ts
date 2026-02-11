import { Schema } from 'koishi'

// 定义配置项接口
export interface Config {
  token: string
  owner: string
  repo: string
  interval?: number
  useProxy?: boolean
  proxyUrl?: string
  loggerinfo?: boolean
}

// 定义配置项 Schema
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    token: Schema.string().required().description('GitHub Personal Access Token (PAT)').role('secret'),
    owner: Schema.string().required().description('仓库所有者 (Owner)'),
    repo: Schema.string().required().description('仓库名称 (Repo)'),
    interval: Schema.number().default(20).description('轮询间隔 (单位：秒，默认 20 秒)'),
  }).description('基础设置'),

  Schema.union([
    Schema.object({
      useProxy: Schema.const(true).required(),
      proxyUrl: Schema.string().description('请输入代理地址。').default("socks://localhost:7897"),
    }),
    Schema.object({
      useProxy: Schema.const(false).default(false),
    }),
  ]).description('代理配置'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
  }).description("调试设置"),
])
