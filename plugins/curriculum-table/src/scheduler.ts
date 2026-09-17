import { Universal } from 'koishi'
import type { Context } from 'koishi'
import type { CurriculumDatabase } from './database'
import type { LogInfo } from './logger'
import type { RenderConfig } from './render'
import { renderCourseTable } from './render'
import { getCurrentMinute, getLocalDate, getLocalWeekday } from './schedule'
import type { CurriculumPushV2 } from './types'

export class PushScheduler {
  private timer?: () => void
  private ticking = false

  constructor(
    private readonly ctx: Context,
    private readonly database: CurriculumDatabase,
    private readonly renderConfig: RenderConfig,
    private readonly fontDir: string,
    private readonly templatePath: string,
    private readonly logger: LogInfo,
  ) {}

  start(): void {
    this.timer = this.ctx.setInterval(() => {
      void this.tick()
    }, 30_000)
    void this.tick()
  }

  dispose(): void {
    this.timer?.()
    this.timer = undefined
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      const now = new Date()
      const currentMinute = getCurrentMinute()
      const minuteKey = `${getLocalDate()}-${currentMinute}`
      const weekday = getLocalWeekday(now)
      const pushes = await this.database.listPushes()

      for (const push of pushes) {
        if (!this.shouldRun(push, minuteKey, currentMinute, weekday)) continue
        await this.runPush(push, minuteKey)
      }
    } catch (error) {
      this.logger.error('课表推送调度失败:', error)
    } finally {
      this.ticking = false
    }
  }

  private shouldRun(
    push: CurriculumPushV2,
    minuteKey: string,
    currentMinute: string,
    weekday: number,
  ): boolean {
    if (!push.enabled || push.pushTime !== currentMinute) return false
    if (push.lastPushAt === minuteKey) return false
    return push.weekdays.length === 0 || push.weekdays.includes(weekday)
  }

  private async runPush(push: CurriculumPushV2, minuteKey: string): Promise<void> {
    await this.database.markPushRun(push.id, minuteKey)
    try {
      if (!push.channelId) {
        this.logger.warn(`定时推送 #${push.id} 未配置群组 ID`)
        return
      }
      const bot = this.ctx.bots.find(item => {
        if (push.botId && (item.selfId === push.botId || item.user?.id === push.botId)) return true
        return Boolean(push.platform && item.platform === push.platform)
      })
      if (!bot || bot.status !== Universal.Status.ONLINE) {
        this.logger.warn(`定时推送：未找到在线机器人 ${push.botId || push.platform}`)
        return
      }

      const scheduleIds = push.scheduleIds.length > 0 ? push.scheduleIds : undefined
      const courses = await this.database.getCourseViews({
        channelId: push.channelId,
        scheduleIds,
      })
      if (courses.length === 0 && !push.sendWhenEmpty) return

      const image = await renderCourseTable(
        this.ctx,
        this.database,
        this.renderConfig,
        {
          channelId: push.channelId,
          dayOffset: push.dayOffset,
          scheduleIds,
          title: push.name,
          allowEmpty: push.sendWhenEmpty,
        },
        this.fontDir,
        this.templatePath,
        this.logger,
      )
      if (image) {
        await bot.sendMessage(push.channelId, image)
      }
    } catch (error) {
      this.logger.error(`定时推送到群组 ${push.channelId} 失败:`, error)
    }
  }
}
