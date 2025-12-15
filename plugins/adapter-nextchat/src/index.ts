import { Context, Session } from 'koishi'
import { } from '@koishijs/plugin-server'
import { } from '@koishijs/plugin-console'
import { resolve } from 'node:path'

import type { Config as ConfigType } from './types'
import { ConfigSchema } from './config'
import { NextChatBot } from './bot'
import { initLogger, logInfo, loggerInfo } from './logger'
import { registerModelRoutes } from './routes/models'
import { registerPageRoute } from './routes/page'
import { registerChatRoute } from './routes/chat'

// 导出日志函数供其他模块使用
export { loggerError, loggerInfo, logInfo, logDebug } from './logger'

export const name = 'adapter-nextchat'
export const inject = {
  "required": [
    "server",
    "console",
    "database",
    "assets"
  ]
}

export const reusable = false
export const filter = false

export const usage = `
---

<p>NextChat 适配器 - 通过 NextChat 界面与 Koishi 对话</p>
<p>➣ 启用后可在控制台侧边栏找到 NextChat 页面</p>
<p>➣ 支持 OpenAI API 格式</p>

---

需要使用 assets 服务进行富媒体文件的上传。

所需服务：server、console、database、assets

---
`

export const Config = ConfigSchema

export function apply(ctx: Context, config: ConfigType) {
  ctx.on('before-attach-user', (_, fields) => {
    fields.add('authority')
  })

  // 处理权限更新
  ctx.middleware(async (session: Session<'authority'>, next) => {
    if (session.platform === 'nextchat' && session['_authority'] !== undefined) {
      const authority = session['_authority'];
      await session.observeUser(['authority']);
      if (session.user.authority !== authority) {
        session.user.authority = authority;
        await session.user.$update();
      }
    }
    return next();
  }, true);

  ctx.on('ready', () => {
    if (ctx.server) {
      ctx.console.addEntry({
        dev: resolve(__dirname, '../client/index.ts'),
        prod: resolve(__dirname, '../dist'),
      })

      initLogger(ctx, config)

      ctx.plugin(NextChatBot, config)

      registerPageRoute(ctx, config)
      registerModelRoutes(ctx, config)
      registerChatRoute(ctx, config)

      loggerInfo(`server listening at http://localhost:${ctx.server.port}${config.path}`)
    }
  })
}
