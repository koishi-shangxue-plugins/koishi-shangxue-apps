import { Context } from 'koishi'

import { } from '@koishijs/plugin-server'

import type { Config as ConfigType } from './types'
import { ConfigSchema } from './config'
import { initLogger, loggerInfo } from './logger'
import { clearConfigCache, loadAllProviders } from './remoteConfig'
import { registerPageRoute } from './routes/page'
import { registerModelRoutes } from './routes/models'
import { registerChatRoute } from './routes/chat'

export const name = 'freeluna'
export const reusable = false
export const filter = false

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
  ctx.on('ready', async () => {
    
    initLogger(ctx, config)

    
    registerPageRoute(ctx, config)
    registerModelRoutes(ctx, config)
    registerChatRoute(ctx, config)

    loggerInfo(`[freeluna] 服务已启动：http://localhost:${ctx.server.port}${config.basePath}/openai-compatible/v1/chat/completions`)

    
    const providers = await loadAllProviders(config)
    if (providers.length === 0) {
      loggerInfo('[freeluna] 警告：未能加载任何提供商，请检查配置后重启插件')
    }
  })

  
  ctx.on('dispose', () => {
    clearConfigCache()
  })
}
