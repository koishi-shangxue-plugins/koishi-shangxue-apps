import { Context, Logger, Schema } from 'koishi'
import { GitHubBot } from './bot/bot'
import { Config } from './config'

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
    const webhookPath = config.webhookPath || '/github/webhook'

    // 使用 Koishi 的 HTTP 服务
    ctx.inject(['server'], (serverCtx) => {
      const server = (serverCtx as any).server

      // GET 路由用于测试
      server.get(webhookPath, (koaCtx: any) => {
        koaCtx.status = 200
        koaCtx.type = 'text/plain; charset=utf-8'
        koaCtx.body = '请将此地址配置为 GitHub Webhook 地址\n\nGitHub Webhook Endpoint\nPlease configure this URL as your GitHub webhook URL.'
      })

      // POST 路由处理 webhook 事件
      server.post(webhookPath, async (koaCtx: any) => {
        logger.info(`收到 Webhook 请求: ${koaCtx.headers['x-github-event']}`)

        const signature = koaCtx.headers['x-hub-signature-256'] as string
        const event = koaCtx.headers['x-github-event'] as string
        const payload = koaCtx.request.body

        logger.info(`Webhook payload: ${JSON.stringify(payload).substring(0, 200)}...`)

        // 验证签名
        const rawBody = JSON.stringify(payload)
        if (signature && !bot.verifyWebhookSignature(rawBody, signature)) {
          logger.warn('Webhook 签名验证失败')
          koaCtx.status = 401
          koaCtx.body = { error: 'Invalid signature' }
          return
        }

        // 提取仓库信息
        const owner = payload.repository?.owner?.login
        const repo = payload.repository?.name

        if (!owner || !repo) {
          logger.warn('Webhook 事件缺少仓库信息')
          koaCtx.status = 400
          koaCtx.body = { error: 'Missing repository info' }
          return
        }

        logger.info(`仓库信息: ${owner}/${repo}`)

        // 检查是否在监听列表中
        const isMonitored = config.repositories.some(
          r => r.owner === owner && r.repo === repo
        )

        if (!isMonitored) {
          logger.info(`收到未监听仓库的 webhook: ${owner}/${repo}`)
          koaCtx.status = 200
          koaCtx.body = { message: 'Repository not monitored' }
          return
        }

        // 处理事件
        try {
          await bot.handleWebhookEvent(payload, owner, repo)
          koaCtx.status = 200
          koaCtx.body = { message: 'Event processed' }
        } catch (error) {
          logger.error('处理 webhook 事件失败:', error)
          koaCtx.status = 500
          koaCtx.body = { error: 'Internal server error' }
        }
      })

      logger.info(`GitHub Webhook 路由已注册: ${webhookPath}`)
    })
  }

  // 在子上下文销毁时自动清理
  botCtx.on('dispose', async () => {
    await bot.stop()
  })
}
