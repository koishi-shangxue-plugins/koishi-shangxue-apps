import { Context } from 'koishi'
// 导入 server 类型扩充，使 ctx.server 可用
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
  ctx.on('ready', async () => {
    // 初始化日志函数
    initLogger(ctx, config)

    // 注册各路由
    registerPageRoute(ctx, config)
    registerModelRoutes(ctx, config)
    registerChatRoute(ctx, config)

    loggerInfo(`[freeluna] 服务已启动：http://localhost:${ctx.server.port}${config.basePath}/openai-compatible/v1/chat/completions`)

    // 启动时预热：加载注册表和所有提供商 JS，后续请求直接使用缓存
    const providers = await loadAllProviders(config)
    if (providers.length === 0) {
      loggerInfo('[freeluna] 警告：未能加载任何提供商，请检查配置后重启插件')
    }
  })

  // 插件卸载时清除配置缓存
  ctx.on('dispose', () => {
    clearConfigCache()
  })
}
