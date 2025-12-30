import { Context, Schema } from 'koishi'
import { } from '@koishijs/plugin-console'
import { } from '@koishijs/plugin-server'
import path from 'node:path'
import { existsSync } from 'node:fs'

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
2. **本地模式**：使用集成的  Stapxs.QQ.Lite-3.3.3-web 挂载到koishi路由

- 默认使用本地模式，以防止遇到网络问题。

- 如果你需要使用webUI最新的版本，请使用 GitHub Pages 托管的版本。

- 如果期望更新本地版本，请提交issue请求。

---

`

export interface Config {
  mode: 'online' | 'local'
  loggerinfo: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    mode: Schema.union([
      Schema.const('online').description('在线模式 (GitHub Pages)'),
      Schema.const('local').description('本地文件模式')
    ]).default('local').description('加载模式'),
  }).description('基础配置'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description('日志调试模式').experimental(),
  }).description('调试设置'),
])

export function apply(ctx: Context, config: Config) {
  ctx.on("ready", async () => {
    const logger = ctx.logger('chat-onebot')

    function logInfo(...args: any[]) {
      if (config.loggerinfo) {
        (logger.info as (...args: any[]) => void)(...args)
      }
    }

    // 注册 API：返回配置信息
    ctx.console.addListener('chat-onebot/get-config' as any, async () => {
      return {
        mode: config.mode
      }
    })

    // 本地模式：挂载本地文件到 /chat-onebot/local 和 /chat-onebot（用于资源文件）
    const localPath = path.resolve(__dirname, '..', 'Stapxs-QQ-Lite/dist')
    if (existsSync(localPath)) {
      // 处理静态文件的函数
      const handleStaticFile = async (koaCtx: any, params0: string) => {
        let requestPath = koaCtx.params[0] || '/'

        // 移除开头的斜杠（如果有）
        if (requestPath.startsWith('/')) {
          requestPath = requestPath.substring(1)
        }

        // 如果是根路径，使用 index.html
        const filePath = requestPath === '' || requestPath === '/' ? 'index.html' : requestPath
        const fullPath = path.join(localPath, filePath)

        logInfo('本地模式 - 原始路径:', koaCtx.params[0], '处理后:', filePath, '完整路径:', fullPath)

        try {
          // 检查文件是否存在
          const fileExists = existsSync(fullPath)
          const isFile = fileExists && require('fs').statSync(fullPath).isFile()

          logInfo('文件检查:', { exists: fileExists, isFile: isFile })

          if (isFile) {
            // 在 koa-send 之前设置正确的 MIME 类型
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
            // 文件不存在，返回 index.html（支持 SPA 路由）
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

      // 主路由：/chat-onebot/local
      ctx.server.get('/chat-onebot/local(/.*)?', async (koaCtx) => {
        await handleStaticFile(koaCtx, koaCtx.params[0])
      })

      // 额外路由：/chat-onebot（用于处理 HTML 中的相对路径资源）
      ctx.server.get('/chat-onebot(/(?!local).+)', async (koaCtx) => {
        await handleStaticFile(koaCtx, koaCtx.params[0])
      })

      logInfo('本地模式已启用，路径:', localPath)
    } else {
      logger.warn(`本地文件路径不存在: ${localPath}`)
      logger.warn('本地模式不可用，请下载 Stapxs QQ Lite 并解压到指定目录')
      logger.warn('下载地址: https://github.com/Stapxs/Stapxs-QQ-Lite-2.0/releases/download/v3.3.3/Stapxs.QQ.Lite-3.3.3-web.zip')
    }

    // 注册控制台入口
    ctx.console.addEntry({
      dev: path.resolve(__dirname, '../client/index.ts'),
      prod: path.resolve(__dirname, '../dist'),
    })

    logInfo('chat-onebot 已启动')
    logInfo('当前模式:', config.mode === 'online' ? '在线模式' : '本地模式')
    logInfo('访问地址: /chat-onebot')
  })
}
