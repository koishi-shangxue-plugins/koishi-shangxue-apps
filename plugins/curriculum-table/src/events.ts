import type { Context } from 'koishi'
import type { CurriculumDatabase } from './database'
import type { LogInfo } from './logger'
import type {
  ApiResult,
  CurriculumBotInfo,
  CurriculumCourseInput,
  CurriculumCourseV2,
  CurriculumPushInput,
  CurriculumPushV2,
  CurriculumScheduleInput,
  CurriculumScheduleV2,
  CurriculumWebState,
} from './types'

declare module '@koishijs/plugin-console' {
  interface Events {
    'curriculum-table/state'(): Promise<CurriculumWebState>
    'curriculum-table/schedule/save'(input: CurriculumScheduleInput): Promise<ApiResult<CurriculumScheduleV2>>
    'curriculum-table/schedule/delete'(id: number): Promise<ApiResult>
    'curriculum-table/course/save'(input: CurriculumCourseInput): Promise<ApiResult<CurriculumCourseV2>>
    'curriculum-table/course/delete'(id: number): Promise<ApiResult>
    'curriculum-table/push/save'(input: CurriculumPushInput): Promise<ApiResult<CurriculumPushV2>>
    'curriculum-table/push/delete'(id: number): Promise<ApiResult>
  }
}

export function registerConsoleEvents(
  ctx: Context,
  database: CurriculumDatabase,
  logger: LogInfo,
): void {
  const authority = { authority: 4 }

  ctx.console.addListener('curriculum-table/state', async () => {
    return {
      schedules: await database.listSchedules(),
      courses: await database.listCourses(),
      pushes: await database.listPushes(),
      bots: listBots(ctx),
    }
  }, authority)

  ctx.console.addListener('curriculum-table/schedule/save', async (input) => {
    try {
      const schedule = await database.saveSchedule(input)
      logger.info(`WebUI 保存课表 #${schedule.id}: ${schedule.name}`)
      return { success: true, data: schedule }
    } catch (error) {
      logger.error('WebUI 保存课表失败:', error)
      return { success: false, message: errorMessage(error) }
    }
  }, authority)

  ctx.console.addListener('curriculum-table/schedule/delete', async (id) => {
    try {
      await database.deleteSchedule(id)
      logger.info(`WebUI 删除课表 #${id}`)
      return { success: true }
    } catch (error) {
      logger.error('WebUI 删除课表失败:', error)
      return { success: false, message: errorMessage(error) }
    }
  }, authority)

  ctx.console.addListener('curriculum-table/course/save', async (input) => {
    try {
      const course = await database.saveCourse(input)
      logger.info(`WebUI 保存课程 #${course.id}: ${course.name}`)
      return { success: true, data: course }
    } catch (error) {
      logger.error('WebUI 保存课程失败:', error)
      return { success: false, message: errorMessage(error) }
    }
  }, authority)

  ctx.console.addListener('curriculum-table/course/delete', async (id) => {
    try {
      await database.deleteCourse(id)
      logger.info(`WebUI 删除课程 #${id}`)
      return { success: true }
    } catch (error) {
      logger.error('WebUI 删除课程失败:', error)
      return { success: false, message: errorMessage(error) }
    }
  }, authority)

  ctx.console.addListener('curriculum-table/push/save', async (input) => {
    try {
      const push = await database.savePush(input)
      logger.info(`WebUI 保存推送 #${push.id}: ${push.pushTime} ${push.channelId}`)
      return { success: true, data: push }
    } catch (error) {
      logger.error('WebUI 保存推送失败:', error)
      return { success: false, message: errorMessage(error) }
    }
  }, authority)

  ctx.console.addListener('curriculum-table/push/delete', async (id) => {
    try {
      await database.deletePush(id)
      logger.info(`WebUI 删除推送 #${id}`)
      return { success: true }
    } catch (error) {
      logger.error('WebUI 删除推送失败:', error)
      return { success: false, message: errorMessage(error) }
    }
  }, authority)

}

function listBots(ctx: Context): CurriculumBotInfo[] {
  return ctx.bots.map(bot => ({
    id: bot.sid,
    name: bot.user?.name || bot.selfId,
    platform: bot.platform || '',
    selfId: bot.selfId,
    status: bot.status,
  }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
