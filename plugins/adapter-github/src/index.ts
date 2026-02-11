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

export const usage =`
---
## 配置说明

### 通信模式

- **Webhook 模式**：GitHub 主动推送事件到你的服务器，实时性更好，但需要配置公网可访问的 URL
- **Pull 模式**：定时轮询 GitHub API 获取事件，无需公网 URL，但有延迟

### Webhook 配置步骤

1. 选择 Webhook 模式
2. 配置 Webhook 路径（默认 \`/github/webhook\`）
3. 可选：配置 Webhook 密钥用于验证请求
4. 在 GitHub 仓库设置中添加 Webhook：
   - URL: \`http://你的服务器地址:端口/github/webhook\`
   - Content type: \`application/json\`
   - Secret: 填写你配置的密钥（如果有）
   - 选择触发事件：Issues, Pull requests, Issue comments, Pull request reviews, Discussions

### 多仓库支持

可以在"监听的仓库列表"中添加多个仓库，适配器会同时监听所有配置的仓库。
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
    await bot.stop()
  })
}
