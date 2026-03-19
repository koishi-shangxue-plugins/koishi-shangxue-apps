/**
 * commands/delete-user.ts - 删除个人课表指令（清除指定用户在本群的所有课程）
 */
import type { Context } from 'koishi'
import type { Config } from '../config'
import type { LogInfoFn } from '../types'
import { TABLE_NAME } from '../types'
import { resolveTargetUser } from '../utils'

export function registerDeleteUserCommand(ctx: Context, config: Config, logInfo: LogInfoFn): void {
  ctx.command(`${config.baseCommand}.${config.clearUserCoursesCommand}`)
    .option('target', '-t <target:text> 指定用户（请直接@目标用户）')
    .action(async ({ session, options }) => {
      try {
        const targetUser = await resolveTargetUser(session, options.target)
        const targetLabel = targetUser.specified ? targetUser.username : '您'
        const courses = await ctx.database.get(TABLE_NAME, { userid: targetUser.userId, channelId: session.channelId })
        if (courses.length === 0) return `${targetLabel}在本群还没有任何课程记录，无需删除。`

        await session.send(`即将删除${targetLabel}在本群的全部 ${courses.length} 门课程，请输入 Y 确认，N 取消：`)
        const confirm = await session.prompt(config.interactionTimeoutSeconds * 1000)
        if (!confirm || confirm.trim().toUpperCase() !== 'Y') return '已取消删除操作。'

        await ctx.database.remove(TABLE_NAME, { userid: targetUser.userId, channelId: session.channelId })
        logInfo(`已删除用户 ${targetUser.userId} 在群 ${session.channelId} 的所有课程`)
        return `已成功删除${targetLabel}在本群的全部 ${courses.length} 门课程记录。`
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_TARGET_USER') {
          return '指定用户参数无效，请直接@目标用户，或省略该参数删除自己的课表。'
        }
        ctx.logger.error('删除个人课程失败:', e)
        return '删除失败，请重试或检查日志。'
      }
    })
}
