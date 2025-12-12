import { Context, Schema, Logger } from 'koishi'

import { } from '@koishijs/plugin-server'
import { } from '@koishijs/plugin-console'

import { NextChatBot } from './bot'

import { resolve } from 'node:path'

// 全局日志函数
export let loggerError: (message: any, ...args: any[]) => void;
export let loggerInfo: (message: any, ...args: any[]) => void;
export let logInfo: (message: any, ...args: any[]) => void;
export let logDebug: (message: any, ...args: any[]) => void;

export const name = 'adapter-nextchat'
export const inject = ['server', 'console']
export const reusable = false
export const filter = false

const logger = new Logger(`Development:${name}-dev`)

export const usage = `
---

<p>NextChat 适配器 - 通过 NextChat 界面与 Koishi 对话</p>
<p>➣ 启用后可在控制台侧边栏找到 NextChat 页面</p>
<p>➣ 支持 OpenAI API 格式，兼容 NextChat 客户端</p>

---
`

export interface Config {
  path?: string;
  token?: string;
  selfId?: string;
  selfname?: string;
  selfavatar?: string;
  userId?: string;
  username?: string;
  loggerInfo?: boolean;
  loggerDebug?: boolean;
}

// 定义 OpenAI Chat Completions API 请求体的类型
interface ChatCompletionRequest {
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream?: boolean;
  model?: string;
  user?: string;
  username?: string;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    path: Schema.string().default('/nextchat/v1/chat/completions').description('API 路径').role('link'),
    token: Schema.string().default('sk-nextchat-koishi-adapter').description('访问令牌（APIkey）').role('textarea', { rows: [2, 4] }),
  }).description('基础设置'),

  Schema.object({
    selfId: Schema.string().default('nextchat').description('机器人 ID'),
    selfname: Schema.string().default('nextchat').description('机器人昵称'),
    selfavatar: Schema.string().default('https://avatars.githubusercontent.com/u/153288546').description('机器人头像').role('link'),
    userId: Schema.string().default('anonymous').description('用户ID'),
    username: Schema.string().default('anonymous').description('用户昵称'),
  }).description('Session设置'),

  Schema.object({
    NextChat_host: Schema.string().default('https://chat.bailili.top/#/').description('NextChat webUI 的 **URL地址**').role('link'),
  }).description('WebUI设置'),

  Schema.object({
    loggerInfo: Schema.boolean().default(false).description('启用详细日志输出'),
    loggerDebug: Schema.boolean().default(false).description('启用调试日志模式（包含请求详情）').experimental(),
  }).description('调试选项'),
]);

export function apply(ctx: Context, config: Config) {

  ctx.on('ready', () => {
    if (ctx.server) {
      const nextchatBaseUrl = 'https://chat.bailili.top'

      // 注册重定向页面，动态生成URL
      ctx.server.get('/nextchat-redirect', async (koaCtx) => {
        // 获取当前请求的协议和主机名
        const protocol = koaCtx.protocol
        const host = koaCtx.host

        const settings = {
          key: config.token,
          url: `${protocol}://${host}/nextchat`,
        }
        const settingsQuery = encodeURIComponent(JSON.stringify(settings))
        const dynamicUrl = `${nextchatBaseUrl}/#/?settings=${settingsQuery}`

        koaCtx.redirect(dynamicUrl)
      })

      // 注册控制台入口
      ctx.console.addEntry({
        dev: resolve(__dirname, '../client/index.ts'),
        prod: resolve(__dirname, '../dist'),
      })

      // 初始化全局日志函数
      logInfo = (message: any, ...args: any[]) => {
        if (config.loggerInfo) {
          logger.info(message, ...args);
        }
      };
      loggerInfo = (message: any, ...args: any[]) => {
        ctx.logger.info(message, ...args);
      };
      loggerError = (message: any, ...args: any[]) => {
        ctx.logger.error(message, ...args);
      };
      logDebug = (message: any, ...args: any[]) => {
        if (config.loggerDebug) {
          logger.debug(message, ...args);
        }
      };

      ctx.plugin(NextChatBot, config)

      logInfo(`[${config.selfId}] NextChat Bot插件已注册`)

      // 注册路由处理 OpenAI 格式的请求
      const apiPath = config.path || '/nextchat/v1/chat/completions'

      // 注册 /nextchat 页面，显示跳转链接
      ctx.server.get('/nextchat', async (koaCtx) => {
        const protocol = koaCtx.protocol
        const host = koaCtx.host
        const nextchatBaseUrl = 'https://chat.bailili.top'

        const settings = {
          key: config.token,
          url: `${protocol}://${host}/nextchat`,
        }
        const settingsQuery = encodeURIComponent(JSON.stringify(settings))
        const targetUrl = `${nextchatBaseUrl}/#/?settings=${settingsQuery}`

        koaCtx.type = 'html'
        koaCtx.body = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NextChat - Koishi 适配器</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
      font-size: 32px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 16px;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 15px 40px;
      border-radius: 50px;
      font-size: 18px;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }
    .info {
      margin-top: 30px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 10px;
      text-align: left;
    }
    .info h3 {
      color: #333;
      margin-bottom: 10px;
      font-size: 18px;
    }
    .info p {
      color: #666;
      line-height: 1.6;
      margin-bottom: 10px;
    }
    .info code {
      background: #e9ecef;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: "Courier New", monospace;
      font-size: 14px;
    }
    .warning {
      margin-top: 20px;
      padding: 15px;
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      border-radius: 4px;
      text-align: left;
    }
    .warning strong {
      color: #856404;
    }
    .warning p {
      color: #856404;
      margin-top: 5px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <p class="subtitle">
      点击下方按钮在新窗口打开 NextChat 界面<br>
      已自动配置 API 地址和访问令牌
    </p>
    <a href="${targetUrl}" target="_blank" class="btn">
      🚀 打开 NextChat
    </a>
    
    <div class="info">
      <h3>📋 配置信息</h3>
      <p><strong>API 地址：</strong><code>${protocol}://${host}${apiPath}</code></p>
      <p><strong>访问令牌：</strong><code>${config.token}</code></p>
    </div>
    
  </div>
</body>
</html>
        `
      })

      // 注册路由
      ctx.server.get(apiPath, async (koaCtx) => {
        koaCtx.status = 405
        koaCtx.body = { error: { message: 'Method Not Allowed', type: 'invalid_request_error' } }
      })

      ctx.server.all(apiPath, async (koaCtx, next) => {
        // 设置CORS头
        koaCtx.set('Access-Control-Allow-Origin', '*')
        koaCtx.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        koaCtx.set('Access-Control-Allow-Private-Network', 'true')

        if (koaCtx.method === 'OPTIONS') {
          logInfo(`[${config.selfId}] 处理OPTIONS预检请求: ${koaCtx.path}`)
          koaCtx.status = 200
          return
        }

        if (koaCtx.method !== 'POST') {
          koaCtx.status = 405
          koaCtx.body = { error: { message: 'Method Not Allowed', type: 'invalid_request_error' } }
          return
        }

        await next()
      })

      ctx.server.post(apiPath, async (koaCtx) => {
        const startTime = Date.now()

        // 设置CORS头
        koaCtx.set('Access-Control-Allow-Origin', '*')
        koaCtx.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
        koaCtx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        koaCtx.set('Access-Control-Allow-Private-Network', 'true')

        try {
          // 记录请求信息
          logInfo(`[${config.selfId}] 收到POST请求: ${koaCtx.method} ${koaCtx.path}`)
          logInfo(`[${config.selfId}] 请求头:`, JSON.stringify(koaCtx.headers, null, 2))
          logDebug(`[${config.selfId}] 详细请求头:`, koaCtx.headers)

          // 验证 token（如果配置了）
          if (config.token) {
            const auth = koaCtx.headers.authorization
            if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== config.token) {
              loggerError(`[${config.selfId}] Token 验证失败，期望: Bearer ${config.token}，实际: ${auth}`)
              koaCtx.status = 401
              koaCtx.body = { error: { message: 'Unauthorized', type: 'invalid_request_error' } }
              return
            }
            logDebug(`[${config.selfId}] Token 验证通过`)
          }

          const body = (koaCtx.request as any).body as ChatCompletionRequest
          logInfo(`[${config.selfId}] 请求体:`, JSON.stringify(body, null, 2))

          // 验证请求格式
          if (!body || !body.messages || !Array.isArray(body.messages)) {
            loggerError(`[${config.selfId}] 请求格式无效，body:`, body)
            koaCtx.status = 400
            koaCtx.body = { error: { message: 'Invalid request format', type: 'invalid_request_error' } }
            return
          }

          // 获取 Bot 实例
          const bot = ctx.bots.find(b => b.platform === 'nextchat' && b.selfId === config.selfId)
          if (!bot) {
            loggerError(`[${config.selfId}] 未找到 NextChat Bot 实例`)
            loggerError(`[${config.selfId}] 当前可用的Bot实例:`, ctx.bots.map(b => ({ platform: b.platform, selfId: b.selfId })))
            loggerError(`[${config.selfId}] 查找条件: platform=nextchat, selfId=${config.selfId}`)
            koaCtx.status = 500
            koaCtx.body = { error: { message: 'Bot not found', type: 'server_error' } }
            return
          }

          logDebug(`[${config.selfId}] 找到Bot实例: platform=${bot.platform}, selfId=${bot.selfId}`)

          // 处理对话请求
          const nextChatBot = bot as unknown as NextChatBot
          const response = await nextChatBot.handleChatCompletion(body)

          const processingTime = Date.now() - startTime

          logInfo(`[${config.selfId}] 请求处理完成，耗时: ${processingTime}ms`)

          if (response.__isStream) {
            // 流式响应
            logDebug(`[${config.selfId}] 发送流式响应`)
            koaCtx.set('Content-Type', 'text/event-stream')
            koaCtx.set('Cache-Control', 'no-cache')
            koaCtx.set('Connection', 'keep-alive')

            const streamData = nextChatBot.createStreamResponse(response.content, response.model)
            koaCtx.status = 200
            koaCtx.body = streamData
          } else {
            // 普通响应
            logDebug(`[${config.selfId}] 响应:`, JSON.stringify(response, null, 2))
            koaCtx.status = 200
            koaCtx.body = response
          }
        } catch (error) {
          const processingTime = Date.now() - startTime
          loggerError(`[${config.selfId}] 处理请求时出错 (耗时: ${processingTime}ms):`, error)
          loggerError(`[${config.selfId}] 错误堆栈:`, error.stack)

          koaCtx.status = 500
          koaCtx.body = {
            error: {
              message: 'Internal server error',
              type: 'server_error',
              details: error.message
            }
          }
        }
      })

      loggerInfo(`NextChat 适配器已启动
      监听路径: http://localhost:${ctx.server.port}${apiPath}
      重定向页面: http://localhost:${ctx.server.port}/nextchat-redirect`)
    }
  })
}