import { Context, Schema } from 'koishi'
import { BaseData } from './service'

export const name = 'basedata'

export { BaseData }

export interface Config {
  retryCount: number
}

export const Config: Schema<Config> = Schema.object({
  retryCount: Schema.number().default(3).min(0).description('文件下载失败时的自动重试次数。'),
})

declare module 'koishi' {
  interface Context {
    basedata: BaseData
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.on("ready", async () => {
    ctx.plugin(BaseData, config)
  })
}
