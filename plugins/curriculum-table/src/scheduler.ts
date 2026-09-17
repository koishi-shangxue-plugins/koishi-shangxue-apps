import { Universal } from 'koishi'
import type { Bot, Context } from 'koishi'
import type { CurriculumDatabase } from './database'
import type { LogInfo } from './logger'
import type { RenderConfig } from './render'
import { renderCourseTable } from './render'
import { getCurrentMinute, getLocalDate, getLocalWeekday } from './schedule'
import type { CurriculumCourseView, CurriculumPushV2 } from './types'

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
    return push.weekdays.length > 0 && push.weekdays.includes(weekday)
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

      const courses = await this.database.getCourseViews({ channelId: push.channelId })
      const hydratedCourses = await hydrateCourseUsers(bot, courses, push.guildId)
      const visibleCourses = filterFinishedCourses(
        hydratedCourses,
        push.dayOffset,
        this.renderConfig.hideFinishedCourses,
      )
      if (visibleCourses.length === 0 && !push.sendWhenEmpty) return

      const image = await renderCourseTable(
        this.ctx,
        this.database,
        this.renderConfig,
        {
          channelId: push.channelId,
          dayOffset: push.dayOffset,
          title: push.name,
          allowEmpty: push.sendWhenEmpty,
          courses: visibleCourses,
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

function filterFinishedCourses(
  courses: CurriculumCourseView[],
  dayOffset: number,
  hideFinished: boolean,
): CurriculumCourseView[] {
  if (!hideFinished || dayOffset > 0) return courses
  if (dayOffset < 0) return []
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  return courses.filter(course => {
    const endTime = course.curriculumtime.split('-')[1]
    const [hour, minute] = endTime.split(':').map(Number)
    return hour * 60 + minute > currentMinutes
  })
}

async function hydrateCourseUsers(
  bot: Bot,
  courses: CurriculumCourseView[],
  guildId: string,
): Promise<CurriculumCourseView[]> {
  const cache = new Map<string, { name: string; avatar: string }>()
  const result: CurriculumCourseView[] = []

  for (const course of courses) {
    let profile = cache.get(course.userid)
    if (!profile) {
      let name = course.username
      let avatar = course.useravatar
      try {
        const user = await bot.getUser(course.userid, course.guildId || guildId || undefined)
        if (user?.name) name = user.name
        if (user?.avatar) avatar = user.avatar
      } catch {
        // 平台无法查询用户时保留数据库中的信息。
      }
      avatar = await fetchAvatarDataUrl(avatar, course.userid, name)
      profile = { name, avatar }
      cache.set(course.userid, profile)
    }
    result.push({
      ...course,
      username: profile.name,
      useravatar: profile.avatar,
    })
  }
  return result
}

async function fetchAvatarDataUrl(avatar: string, userId: string, name: string): Promise<string> {
  const source = avatar || (/^\d+$/.test(userId)
    ? `https://q.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=640`
    : '')
  if (!source) return createFallbackAvatar(name || userId)
  try {
    const response = await fetch(source)
    if (!response.ok) return createFallbackAvatar(name || userId)
    const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    const buffer = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString('base64')}`
  } catch {
    return createFallbackAvatar(name || userId)
  }
}

function createFallbackAvatar(name: string): string {
  const label = (name.trim().slice(0, 1) || '?')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
    <rect width="96" height="96" fill="#dcefe9"/>
    <text x="48" y="60" text-anchor="middle" font-size="40" fill="#147a66">${label}</text>
  </svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
