import { Context, Logger } from 'koishi'
import { GitHubBot } from './bot/bot'
import { Config } from './config'
import { registerWebhookRouter } from './webhook-router'

export const name = 'adapter-github'

export const inject = {
  required: ['logger', 'i18n'],
  optional: ['assets', 'server']
};

// 统一日志输出
export const logger = new Logger('github')

// 导出配置项
export * from './config'

export const usage = `
GitHub 适配器支持两种通信模式：

- **Webhook 模式**：实时接收 GitHub 事件推送（需要公网 URL）
- **Pull 模式**：定时轮询获取事件（无需公网 URL）

详细配置说明请参考 [README 文档]()
`

// 插件入口
export function apply(ctx: Context, config: Config) {
  // 创建子上下文，确保 bot 的生命周期与插件绑定
  const botCtx = ctx.guild()

  const bot = new GitHubBot(botCtx, config)

  // 如果是 webhook 模式，注册路由
  if (config.mode === 'webhook') {
    registerWebhookRouter(ctx, bot, config)
  }

  // 在子上下文销毁时自动清理
  botCtx.on('dispose', async () => {
    // 与start一样 koishi会自动调用
    //  await bot.stop()
  })
}
