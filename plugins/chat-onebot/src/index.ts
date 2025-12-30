import { Context, Schema } from 'koishi'
import { } from '@koishijs/plugin-console'
import { } from '@koishijs/plugin-server'
import path from 'node:path'
import { existsSync } from 'node:fs'

export const name = 'chat-onebot'
export const reusable = false

export const inject = {
  required: ['console', 'server']
}

export const usage = `
## chat-onebot

集成 Stapxs QQ Lite 2.0 到 Koishi 控制台。

### 使用说明

1. **在线模式**：直接使用 GitHub Pages 托管的版本
2. **本地模式**：需要先下载并解压 Stapxs QQ Lite 到插件目录

### 本地部署步骤

1. 下载：https://github.com/Stapxs/Stapxs-QQ-Lite-2.0/releases/download/v3.3.3/Stapxs.QQ.Lite-3.3.3-web.zip
2. 解压到插件目录下的 \`Stapxs-QQ-Lite/dist\` 文件夹
3. 在配置中选择"本地文件"模式
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
  }).description('基础设置'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description('日志调试模式').experimental(),
  }).description('调试设置'),
])

export function apply(ctx: Context, config: Config) {
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

  if (config.mode === 'online') {
    // 在线模式：创建一个简单的 iframe 页面
    ctx.console.addEntry({
      dev: path.resolve(__dirname, '../client/index.ts'),
      prod: path.resolve(__dirname, '../dist'),
    })
    logInfo('chat-onebot 已启动（在线模式）')
  } else {
    // 本地模式：挂载本地文件（固定路径）
    const localPath = path.resolve(__dirname, '..', 'Stapxs-QQ-Lite/dist')

    // 检查路径是否存在
    if (!existsSync(localPath)) {
      logger.warn(`本地文件路径不存在: ${localPath}`)
      logger.warn('请下载 Stapxs QQ Lite 并解压到指定目录，或切换到在线模式')
      logger.warn('下载地址: https://github.com/Stapxs/Stapxs-QQ-Lite-2.0/releases/download/v3.3.3/Stapxs.QQ.Lite-3.3.3-web.zip')
      return
    }

    // 使用 server 插件挂载静态文件目录
    ctx.server.get('/chat-onebot(/.*)?', async (koaCtx) => {
      const requestPath = koaCtx.params[0] || '/index.html'
      const filePath = requestPath === '/' ? '/index.html' : requestPath
      const fullPath = path.join(localPath, filePath)

      logInfo('请求路径:', requestPath, '文件路径:', filePath, '完整路径:', fullPath)

      try {
        // 检查文件是否存在
        if (existsSync(fullPath) && require('fs').statSync(fullPath).isFile()) {
          // 文件存在，直接返回
          await require('koa-send')(koaCtx, filePath, { root: localPath })
        } else {
          // 文件不存在，返回 index.html（支持 SPA 路由）
          await require('koa-send')(koaCtx, '/index.html', { root: localPath })
        }
      } catch (error) {
        logger.error('文件服务错误:', error)
        koaCtx.status = 500
        koaCtx.body = 'Internal Server Error'
      }
    })

    // 注册控制台入口
    ctx.console.addEntry({
      dev: path.resolve(__dirname, '../client/index.ts'),
      prod: path.resolve(__dirname, '../dist'),
    })

    logInfo('chat-onebot 已启动（本地模式）')
    logInfo('静态文件路径:', localPath)
    logInfo('访问地址: /chat-onebot/')
  }
}
