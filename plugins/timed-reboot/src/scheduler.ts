import {} from '@koishijs/loader'
import { Context } from 'koishi'
import type { Config } from './config'

function msUntilNextOccurrence(timeStr: string): number {
  const now = new Date()
  const parts = timeStr.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const s = parts[2] ?? 0

  const target = new Date(now)
  target.setHours(h, m, s, 0)

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  return target.getTime() - now.getTime()
}

export function registerDailyRestart(ctx: Context, config: Config): void {
  if (config.intervalMode !== 'daily') return

  const timeStr = config.dailyTime ?? '03:00:00'
  const delay = msUntilNextOccurrence(timeStr)
  const triggerAt = new Date(Date.now() + delay)

  ctx.logger.info(`每日定时重启已注册，下次触发：${triggerAt.toLocaleString()}（约 ${Math.round(delay / 60000)} 分钟后）`)

  ctx.setTimeout(() => {
    ctx.logger.info(`触发每日定时重启，当前时间：${new Date().toLocaleString()}`)
    ctx.loader.fullReload()
  }, delay)
}

export function registerIntervalRestart(ctx: Context, config: Config): void {
  if (config.intervalMode !== 'custom') return

  const ic = config.intervalConfig
  if (!ic) return

  let intervalMs: number
  let label: string

  if (ic.unit === 'hours') {
    intervalMs = ic.value * 60 * 60 * 1000
    label = `${ic.value} 小时`
  } else {
    intervalMs = ic.value * 24 * 60 * 60 * 1000
    label = `${ic.value} 天`
  }

  ctx.logger.info(`间隔重启已启用，将每 ${label} 重启一次`)

  ctx.setInterval(() => {
    ctx.logger.info(`触发间隔重启，当前时间：${new Date().toLocaleString()}`)
    ctx.loader.fullReload()
  }, intervalMs)
}
