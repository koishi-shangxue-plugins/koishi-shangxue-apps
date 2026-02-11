import { Context } from 'koishi'
import { GitHubBot } from './bot/bot'
import { Config } from './config'

/**
 * 注册 Webhook 路由
 */
export function registerWebhookRouter(ctx: Context, bot: GitHubBot, config: Config) {
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
      bot.loggerInfo(`收到 Webhook 请求: ${koaCtx.headers['x-github-event']}`)

      const signature = koaCtx.headers['x-hub-signature-256'] as string
      const event = koaCtx.headers['x-github-event'] as string
      const payload = koaCtx.request.body

      bot.loggerInfo(`Webhook payload: ${JSON.stringify(payload).substring(0, 200)}...`)

      // 验证签名
      const rawBody = JSON.stringify(payload)
      if (signature && !bot.verifyWebhookSignature(rawBody, signature)) {
        bot.loggerWarn('Webhook 签名验证失败')
        koaCtx.status = 401
        koaCtx.body = { error: 'Invalid signature' }
        return
      }

      // 提取仓库信息
      const owner = payload.repository?.owner?.login
      const repo = payload.repository?.name

      if (!owner || !repo) {
        bot.loggerWarn('Webhook 事件缺少仓库信息')
        koaCtx.status = 400
        koaCtx.body = { error: 'Missing repository info' }
        return
      }

      bot.loggerInfo(`仓库信息: ${owner}/${repo}`)

      // 检查是否在监听列表中
      const isMonitored = config.repositories.some(
        r => r.owner === owner && r.repo === repo
      )

      if (!isMonitored) {
        bot.loggerInfo(`收到未监听仓库的 webhook: ${owner}/${repo}`)
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
        bot.loggerError('处理 webhook 事件失败:', error)
        koaCtx.status = 500
        koaCtx.body = { error: 'Internal server error' }
      }
    })

    bot.loggerInfo(`GitHub Webhook 路由已注册: ${webhookPath}`)
  })
}
