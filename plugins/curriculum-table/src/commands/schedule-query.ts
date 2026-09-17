import type { Context } from 'koishi'
import type { CurriculumDatabase } from '../database'
import type { LogInfo } from '../logger'
import type { RenderConfig } from '../render'
import { renderCourseTable } from '../render'
import { hydrateCourseUsers } from '../users'

/** 注册当前群组课表查询指令。 */
export function registerScheduleQueryCommand(
  ctx: Context,
  database: CurriculumDatabase,
  renderConfig: RenderConfig,
  fontDir: string,
  templatePath: string,
  logger: LogInfo,
): void {
  ctx.command('课表日程查询 [day:string]')
    .example('课表日程查询')
    .example('课表日程查询 明天')
    .action(async ({ session }, day) => {
      if (!session?.channelId) return '当前会话不支持群组课表查询。'
      const dayOffset = parseDayOffset(day)
      if (dayOffset === null) {
        return `无法识别日期“${day}”，请输入数字、昨天、今天、明天或后天。`
      }

      const courses = await database.getCourseViews({ channelId: session.channelId })
      const hydratedCourses = await hydrateCourseUsers(
        session.bot,
        courses,
        session.guildId,
      )
      const image = await renderCourseTable(
        ctx,
        database,
        renderConfig,
        {
          channelId: session.channelId,
          dayOffset,
          title: '课表日程查询',
          allowEmpty: true,
          courses: hydratedCourses,
        },
        fontDir,
        templatePath,
        logger,
      )
      return image ?? '生成课表图片失败，请检查 puppeteer 和日志。'
    })
}

function parseDayOffset(day?: string): number | null {
  if (!day?.trim()) return 0
  const value = day.trim()
  const number = Number(value)
  if (Number.isInteger(number)) return number
  const dayMap: Record<string, number> = {
    前天: -2,
    昨天: -1,
    今天: 0,
    明天: 1,
    后天: 2,
    大后天: 3,
  }
  if (value in dayMap) return dayMap[value]
  const future = value.match(/^(大*)(后天)$/)
  const past = value.match(/^(大*)(前天)$/)
  if (future?.[1]) return future[1].length + 2
  if (past?.[1]) return -(past[1].length + 2)
  return null
}
