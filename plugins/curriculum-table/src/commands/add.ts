/**
 * commands/add.ts - 手动添加课程指令
 */
import type { Context } from 'koishi'
import type { Config } from '../config'
import type { LogInfoFn } from '../types'
import { TABLE_NAME } from '../types'
import { parseWeekdays, resolveTargetUser } from '../utils'

export function registerAddCommand(ctx: Context, config: Config, logInfo: LogInfoFn): void {
  ctx.command(`${config.command}.${config.command11} <param1:string> <param2:string> <param3:string>`)
    .option('target', '-t <target:text> 指定用户（请直接@目标用户）')
    .example(`${config.command11} 周一周三 高等数学 8:00-9:30`)
    .action(async ({ session, options }, param1, param2, param3) => {
      if (!param1 || !param2 || !param3) {
        return '请提供所有必需的参数：日期、课程名称和时间。'
      }

      // 识别三个参数的类型
      const params = [param1, param2, param3]
      const timeParam = params.find(p => /[:：]/.test(p) && /-/.test(p)) ?? null
      const weekdayParam = params.find(p => /周|星期/.test(p)) ?? null
      const classnameParam = params.find(p => p !== timeParam && p !== weekdayParam) ?? null

      if (!weekdayParam || !timeParam || !classnameParam) {
        return '参数解析失败，请检查输入的参数是否符合规范。'
      }

      const normalizedTime = timeParam.replace(/[：]/g, ':').replace(/——/g, '-')
      const normalizedWeekday = parseWeekdays(weekdayParam)

      try {
        const targetUser = await resolveTargetUser(session, options.target)
        const now = new Date()
        const startDate = now.toISOString().split('T')[0]
        const endDate = new Date(now.setDate(now.getDate() + 31 * 5)).toISOString().split('T')[0]

        await ctx.database.create(TABLE_NAME, {
          channelId: session.channelId,
          userid: targetUser.userId,
          username: targetUser.username,
          useravatar: targetUser.useravatar,
          curriculumndate: normalizedWeekday,
          curriculumname: classnameParam,
          curriculumtime: normalizedTime,
          startDate,
          endDate,
        })
        logInfo(`用户 ${targetUser.userId} 添加课程: ${classnameParam} ${normalizedWeekday.join(',')} ${normalizedTime}`)

        if (config.autocommand14) {
          await session.execute(config.command14)
        }
        return `已为 ${targetUser.username} 添加课程：${classnameParam} ${normalizedWeekday.join(',')} ${normalizedTime}`
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_TARGET_USER') {
          return '指定用户参数无效，请直接@目标用户，或省略该参数为自己添加。'
        }
        ctx.logger.error('添加课程失败:', e)
        return '添加课程失败，请重试或检查日志。'
      }
    })
}
