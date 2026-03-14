import { Context } from 'koishi'
import { Config } from './config'
import { registerDailyRestart, registerIntervalRestart } from './scheduler'

export const name = 'timed-reboot'
export const reusable = false
export const filter = false
export const inject = ['logger',]
export { Config } from './config'

export function apply(ctx: Context, config: Config) {
  registerDailyRestart(ctx, config)
  registerIntervalRestart(ctx, config)
}
