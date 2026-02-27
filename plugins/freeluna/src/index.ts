import { Context } from 'koishi'
// 导入 server 类型扩充，使 ctx.server 可用
import { } from '@koishijs/plugin-server'

import type { Config as ConfigType } from './types'
import { ConfigSchema } from './config'
import { initLogger, loggerInfo } from './logger'
import { clearConfigCache } from './remoteConfig'
import { registerPageRoute } from './routes/page'
import { registerModelRoutes } from './routes/models'
import { registerChatRoute } from './routes/chat'

export const name = 'freeluna'
export const reusable = false
export const filter = false

// 声明依赖的服务
export const inject = {
  required: ['server'],
}

export const usage = `
---
<p>🌙 <strong>FreeLuna</strong> - 免费 LLM API 服务</p>
<p>➣ 挂载 OpenAI 兼容接口，动态加载免费 API 配置</p>
<p>➣ 无需频繁更新插件，只需更新远程配置文件即可切换免费 API</p>
---
`

export const Config = ConfigSchema

export function apply(ctx: Context, config: ConfigType) {
  ctx.on('ready', () => {
    // 初始化日志函数
    initLogger(ctx, config)

    // 注册各路由
    registerPageRoute(ctx, config)
    registerModelRoutes(ctx, config)
    registerChatRoute(ctx, config)

    loggerInfo(`[freeluna] 服务已启动：http://localhost:${ctx.server.port}${config.basePath}/openai-compatible/v1/chat/completions`)
  })

  // 插件卸载时清除配置缓存
  ctx.on('dispose', () => {
    clearConfigCache()
  })
}
