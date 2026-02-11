import { Context, Logger } from 'koishi'
import { GitHubBot } from './bot'
import { Config } from './config'

export const name = 'adapter-github'

export const inject = {
  required: ['logger', 'i18n'],
  optional: ['assets']
};

// 统一日志输出
export const logger = new Logger('github')

// 导出配置项
export * from './config'

export const usage =`
---
`

// 插件入口
export function apply(ctx: Context, config: Config) {
  // 创建子上下文，确保 bot 的生命周期与插件绑定
  const botCtx = ctx.guild()

  const bot = new GitHubBot(botCtx, config)

  // 在子上下文销毁时自动清理
  botCtx.on('dispose', async () => {
    await bot.stop()
  })
}
