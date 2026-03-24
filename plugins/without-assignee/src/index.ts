import { Context, Schema } from 'koishi'

import { createDebugLogger } from './logger'
import { registerAssigneeBypass } from './reassign'

export const name = 'without-assignee'
export const reusable = false
export const filter = false

export const inject = {
  optional: ['database'],
}

export const usage = `
---

禁用 Koishi 的 assignee 机制，允许同一频道内的多个机器人同时响应无前缀指令。

默认情况下，当同一平台的同一频道内有多个机器人时，Koishi 会启用 assignee 机制，
只允许被分配的机器人响应无前缀指令，其他机器人需要通过 @机器人 的方式调用。

启用此插件后，所有机器人都可以响应无前缀指令。

---
`

export interface Config {
  loggerinfo: boolean
}

export const Config: Schema<Config> = Schema.object({
  loggerinfo: Schema.boolean().default(false).description('输出调试日志').experimental(),
}).description('调试设置')

export function apply(ctx: Context, config: Config) {
  const logDebug = createDebugLogger(ctx, config)
  registerAssigneeBypass(ctx, logDebug)
}
