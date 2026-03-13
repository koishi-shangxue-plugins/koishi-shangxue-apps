import { Context, Schema } from 'koishi'
import { Console } from '@koishijs/console'
import { } from '@koishijs/plugin-server'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { setupWsBridge } from './ws-bridge'

export const name = 'chat-onebot'
export const reusable = false
export const filter = false

export const inject = {
  required: ['console', 'server']
}

export const usage = `
---

集成 Stapxs QQ Lite 2.0 到 Koishi 控制台。

- 一个兼容 OneBot 的非官方网页 QQ 客户端

### 加载模式说明

1. **在线模式**：直接使用 GitHub Pages 托管的版本
2. **本地模式**：使用集成的  Stapxs.QQ.Lite-3.3.5-web 挂载到koishi路由

- 默认使用本地模式，以防止遇到网络问题。

- 如果你需要使用webUI最新的版本，请使用 GitHub Pages 托管的版本。

- 如果期望更新本地版本，请提交issue请求。

---

`
import { } from '@koishijs/plugin-console'
declare module 'koishi' {
  interface Context {
    console: Console
  }
}
export interface Config {
  enableWebUI: boolean
  mode: 'online' | 'local'
  wsMode: 'none' | 'forward' | 'reverse'
  protocolEndpoint?: string
  protocolToken?: string
  proxyPath?: string
  reversePath?: string
  accessToken?: string
  loggerinfo: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enableWebUI: Schema.boolean().default(true).description('Web UI 入口开关'),

  }).description('基础配置'),
  Schema.union([
    Schema.object({
      enableWebUI: Schema.const(true),
      mode: Schema.union([
        Schema.const('online').description('在线模式 (GitHub Pages)'),
        Schema.const('local').description('本地文件模式')
      ]).default('local').description('加载模式'),
    }),
    Schema.object({
      enableWebUI: Schema.const(false).required(),
    }),
  ]),

  Schema.object({
    wsMode: Schema.union([
      Schema.const('none').description('不进行任何转换'),
      Schema.const('forward').description('把正向转为反向'),
      Schema.const('reverse').description('把反向转为正向'),
    ]).default('none').description('WS桥接模式'),
  }).description('websocket转换配置'),
  Schema.union([
    Schema.object({
      wsMode: Schema.const('none' as const).description('不进行任何转换'),
    }),
    Schema.object({
      wsMode: Schema.const('forward' as const).required().description('把正向转为反向（我们主动连接协议端，WebQQ 连接我们）'),
      protocolEndpoint: Schema.string().required().description('协议端 WebSocket 地址（如 ws://127.0.0.1:3001）'),
      protocolToken: Schema.string().role('secret').description('连接协议端时携带的 token（留空则不鉴权）'),
      proxyPath: Schema.string().default('/chat-onebot/ws-proxy').description('WebQQ 连接我们的代理路径'),
      accessToken: Schema.string().role('secret').description('WebQQ 连接我们时需要提供的 token（留空则不鉴权）'),
    }),
    Schema.object({
      wsMode: Schema.const('reverse' as const).required().description('把反向转为正向（协议端连接我们，WebQQ 也连接我们）'),
      reversePath: Schema.string().default('/chat-onebot/ws-incoming').description('协议端反向 WS 连接我们的路径<br>请填入到协议端的 WS 地址中'),
      proxyPath: Schema.string().default('/chat-onebot/ws-proxy').description('WebQQ 连接我们的代理路径<br>[请填入到这个页面](/chat-onebot)'),
      accessToken: Schema.string().role('secret').description('协议端和 WebQQ 连接我们时需要提供的 token（留空则不鉴权）'),
    }),
  ]),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description('日志调试模式').experimental(),
  }).description('调试设置'),
]) as Schema<Config>

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('chat-onebot')

  function logInfo(...args: any[]) {
    if (config.loggerinfo) {
      (logger.info as (...args: any[]) => void)(...args)
    }
  }

  ctx.on("ready", async () => {

    setupWsBridge(ctx, {
      wsMode: config.wsMode,
      protocolEndpoint: config.protocolEndpoint,
      protocolToken: config.protocolToken,
      proxyPath: config.proxyPath,
      reversePath: config.reversePath,
      accessToken: config.accessToken,
    }, (msg) => logInfo(msg))

    ctx.console.addListener('chat-onebot/get-config' as any, async () => {
      return {
        mode: config.mode
      }
    })

    const localPath = path.resolve(__dirname, '..', 'Stapxs-QQ-Lite/dist')
    if (existsSync(localPath)) {
      const handleStaticFile = async (koaCtx: any, params0: string) => {
        let requestPath = koaCtx.params[0] || '/'

        if (requestPath.startsWith('/')) {
          requestPath = requestPath.substring(1)
        }

        const filePath = requestPath === '' || requestPath === '/' ? 'index.html' : requestPath
        const fullPath = path.join(localPath, filePath)

        logInfo('本地模式 - 原始路径:', koaCtx.params[0], '处理后:', filePath, '完整路径:', fullPath)

        try {
          const fileExists = existsSync(fullPath)
          const isFile = fileExists && require('fs').statSync(fullPath).isFile()

          logInfo('文件检查:', { exists: fileExists, isFile: isFile })

          if (isFile) {
            if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
              koaCtx.type = 'application/javascript; charset=utf-8'
            } else if (filePath.endsWith('.css')) {
              koaCtx.type = 'text/css; charset=utf-8'
            } else if (filePath.endsWith('.json')) {
              koaCtx.type = 'application/json; charset=utf-8'
            } else if (filePath.endsWith('.webmanifest')) {
              koaCtx.type = 'application/manifest+json; charset=utf-8'
            } else if (filePath.endsWith('.html')) {
              koaCtx.type = 'text/html; charset=utf-8'
            }

            await require('koa-send')(koaCtx, filePath, { root: localPath })
          } else {
            logInfo('文件不存在，返回 index.html')
            koaCtx.type = 'text/html; charset=utf-8'
            await require('koa-send')(koaCtx, 'index.html', { root: localPath })
          }
        } catch (error) {
          logger.error('本地模式文件服务错误:', error)
          koaCtx.status = 500
          koaCtx.body = 'Internal Server Error'
        }
      }

      ctx.server.get('/chat-onebot/local(/.*)?', async (koaCtx) => {
        await handleStaticFile(koaCtx, koaCtx.params[0])
      })

      ctx.server.get('/chat-onebot(/(?!local).+)', async (koaCtx) => {
        await handleStaticFile(koaCtx, koaCtx.params[0])
      })

      logInfo('本地模式已启用，路径:', localPath)
    } else {
      logger.warn(`本地文件路径不存在: ${localPath}`)
      logger.warn('本地模式不可用，请下载 Stapxs QQ Lite 并解压到指定目录')
      logger.warn('下载地址: https://github.com/Stapxs/Stapxs-QQ-Lite-2.0/releases/download/v3.3.3/Stapxs.QQ.Lite-3.3.3-web.zip')
    }

    if (config.enableWebUI) {
      ctx.console.addEntry({
        dev: path.resolve(__dirname, '../client/index.ts'),
        prod: path.resolve(__dirname, '../dist'),
      })
    }

    logInfo('chat-onebot 已启动')
    logInfo('当前模式:', config.mode === 'online' ? '在线模式' : '本地模式')
    logInfo('访问地址: /chat-onebot')
  })
}
