/**
 * commands/remove.ts - 移除单门课程指令
 */
import { h } from 'koishi'
import type { Context } from 'koishi'
import type { Config } from '../config'
import type { LogInfoFn } from '../types'
import { TABLE_NAME } from '../types'
import { resolveTargetUser } from '../utils'

export function registerRemoveCommand(ctx: Context, config: Config, _logInfo: LogInfoFn): void {
  ctx.command(`${config.command}.${config.command12}`)
    .option('target', '-t <target:text> 指定用户（请直接@目标用户）')
    .action(async ({ session, options }) => {
      try {
        const targetUser = await resolveTargetUser(session, options.target)
        const courses = await ctx.database.get(TABLE_NAME, { userid: targetUser.userId, channelId: session.channelId })
        if (courses.length === 0) {
          return targetUser.specified
            ? `${targetUser.username}在本群还没有添加任何课程。`
            : '您在本群还没有添加任何课程。'
        }

        let list = targetUser.specified
          ? `${targetUser.username}目前在本群的课程有：\n`
          : '你目前在本群的课程有：\n'
        courses.forEach((c, i) => {
          list += `${i + 1}. ${c.curriculumname} ${c.curriculumndate?.join(',')} ${c.curriculumtime}\n`
        })
        list += '请选择要移除的课程序号 (输入数字):'
        await session.send(h.text(list))

        const input = await session.prompt(config.waittimeout * 1000)
        const idx = parseInt(input) - 1
        if (isNaN(idx) || idx < 0 || idx >= courses.length) return '无效的课程序号。'

        const selected = courses[idx]
        await ctx.database.remove(TABLE_NAME, { id: selected.id })
        await session.send(`已删除课程：${selected.curriculumname} ${selected.curriculumndate?.join(',')} ${selected.curriculumtime}`)
        return session.execute(config.command21)
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_TARGET_USER') {
          return '指定用户参数无效，请直接@目标用户，或省略该参数删除自己的课程。'
        }
        ctx.logger.error('移除课程失败:', e)
        return '移除课程失败，请重试或检查日志。'
      }
    })
}
