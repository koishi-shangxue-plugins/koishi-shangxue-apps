import { Context, Logger } from 'koishi'
import { GitHubBot } from './bot'
import { Config } from './config'

export const name = 'adapter-github'

// 统一日志输出
export const logger = new Logger('github')

// 导出配置项
export * from './config'

// 插件入口
export function apply(ctx: Context, config: Config) {
  let bot: GitHubBot | null = null
  let isDisposing = false

  ctx.on('ready', async () => {
    // 防止重复创建 bot 实例
    if (bot || isDisposing) return

    bot = new GitHubBot(ctx, config)
    await bot.start()
  })

  ctx.on('dispose', async () => {
    if (isDisposing) return
    isDisposing = true

    if (bot) {
      await bot.stop()
      bot = null
    }
  })
}
