import type { Context } from 'koishi'
import type { ElectricityBillRuntime } from './runtime'

export function registerCommands(ctx: Context, runtime: ElectricityBillRuntime) {
  ctx.command('electricity-check', '手动触发电费查询')
    .action(async () => {
      return runtime.runManualCheck()
    })

  ctx.command('electricity-status', '查看电费查询状态')
    .action(async () => {
      return runtime.getStatusText()
    })
}
