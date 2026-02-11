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

  ctx.on('ready', async () => {
    bot = new GitHubBot(ctx, config)
    await bot.start()
  })

  ctx.on('dispose', async () => {
    if (bot) {
      await bot.stop()
      bot = null
    }
  })
}
