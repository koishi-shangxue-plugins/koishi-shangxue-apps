import { Schema } from 'koishi'

// 仓库配置接口
export interface RepoConfig {
  owner: string
  repo: string
}

// 定义配置项接口
export interface Config {
  token: string
  repositories: RepoConfig[]
  mode: 'webhook' | 'pull'
  interval?: number
  webhookPath?: string
  webhookSecret?: string
  useProxy?: boolean
  proxyUrl?: string
  loggerinfo?: boolean
}

// 定义配置项 Schema
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    token: Schema.string().required().description('GitHub Personal Access Token (PAT)').role('secret'),
    repositories: Schema.array(Schema.object({
      owner: Schema.string().description('仓库所有者 (Owner)'),
      repo: Schema.string().description('仓库名称 (Repo)'),
    })).role('table').default([
  {
    "owner": "koishi-shangxue-plugins",
    "repo": "koishi-plugin-adapter-github"
  }
]).description('监听的仓库列表'),
  }).description('基础设置'),

  Schema.object({
    mode: Schema.union(['webhook', 'pull']).default('pull').description('通信模式'),
  }).description('通信模式选择'),

  Schema.union([
    Schema.object({
      mode: Schema.const('webhook').required(),
      webhookPath: Schema.string().default('/github/webhook').description('Webhook 路径'),
      webhookSecret: Schema.string().description('Webhook 密钥（可选，用于验证请求）').role('secret'),
    }),
    Schema.object({
      mode: Schema.const('pull'),
      interval: Schema.number().default(20).description('轮询间隔 (单位：秒，默认 20 秒)'),
    }),
  ]).description('模式配置'),

  Schema.union([
    Schema.object({
      useProxy: Schema.const(true).required(),
      proxyUrl: Schema.string().description('请输入代理地址。').default("socks://localhost:7897"),
    }),
    Schema.object({
      useProxy: Schema.const(false).default(false),
    }),
  ]).description('代理配置（仅 Pull 模式需要）'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
  }).description("调试设置"),
])
