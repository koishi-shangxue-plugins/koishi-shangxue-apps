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
    ]).description('监听的仓库列表<br>-> 请填入机器人创建的仓库 以确保权限完整'),
  }).description('基础设置'),

  Schema.object({
    mode: Schema.union([
      Schema.const('webhook').description('server'),
      Schema.const('pull').description('polling')
    ]).default('pull').description('通信模式<br>-> 相关接入方法 请参考文档'),
  }).description('通信模式选择'),

  Schema.union([
    Schema.intersect([
      Schema.object({
        mode: Schema.const('webhook').required(),
        webhookPath: Schema.string().default('/github/webhook').description('Webhook 路径<br>默认地址：`http://127.0.0.1:5140/github/webhook`'),
        webhookSecret: Schema.string().description('Webhook 密钥（可选，用于验证请求）').role('secret'),
      }),
    ]),
    Schema.intersect([
      Schema.object({
        mode: Schema.const('pull'),
        interval: Schema.number().default(20).description('轮询间隔 (单位：秒，默认 20 秒)'),
        useProxy: Schema.boolean().default(false).description('是否使用代理'),
      }),
      Schema.union([
        Schema.object({
          useProxy: Schema.const(true).required().description('是否使用代理'),
          proxyUrl: Schema.string().description('代理地址（仅支持 http/https 协议）').default("http://localhost:7897"),
        }),
        Schema.object({
          useProxy: Schema.const(false).description('是否使用代理'),
        }),
      ]),
    ]),
  ]).description('模式配置'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
  }).description("调试设置"),
])
