import { Context, Schema, } from 'koishi'

export const name = 'keyword-blocker'
export const filter = false
export const reusable = true
export const inject = {
  required: ['console', 'logger'],
}
export const usage = `
---

现在有更好用的黑白名单插件了！

请前往插件市场安装 filter-pro

---`

export interface Config {
}

export const Config: Schema<Config> = Schema.object({

})

export function apply(ctx: Context, config: Config) {

}
