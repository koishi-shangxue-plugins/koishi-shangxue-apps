
import type { Context } from 'koishi'
import type { Config } from '../config'
import type { CurriculumTable, LogInfoFn } from '../types'
import { TABLE_NAME } from '../types'

export function registerDedupCommand(ctx: Context, config: Config, logInfo: LogInfoFn): void {
  ctx.command(`${config.baseCommand}.${config.deduplicateCoursesCommand}`)
    .action(async ({ session }) => {
      const userId = session.userId
      const channelId = session.channelId

      try {
        const courses = await ctx.database.get(TABLE_NAME, { userid: userId, channelId })
        if (courses.length === 0) return '您在本群还没有添加任何课程。'

        const uniqueMap = new Map<string, CurriculumTable>()
        const duplicates: CurriculumTable[] = []

        for (const course of courses) {
          const days = Array.isArray(course.curriculumndate) ? course.curriculumndate : [course.curriculumndate]
          const key = `${course.curriculumname}-${days.join(',')}-${course.curriculumtime}`
          if (uniqueMap.has(key)) {
            duplicates.push(course)
          } else {
            uniqueMap.set(key, course)
          }
        }

        if (duplicates.length === 0) return '没有检测到重复的课程。'

        let removed = 0
        for (const dup of duplicates) {
          await ctx.database.remove(TABLE_NAME, { id: dup.id })
          removed++
        }
        logInfo(`去重完成，移除 ${removed} 条`)
        return `已成功移除 ${removed} 门重复的课程。`
      } catch (e) {
        ctx.logger.error('课程去重失败:', e)
        return '课程去重失败，请重试或检查日志。'
      }
    })
}
