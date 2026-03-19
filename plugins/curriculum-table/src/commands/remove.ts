import { h } from 'koishi';
import type { Context } from 'koishi';
import type { Config } from '../config';
import type { LogInfoFn } from '../types';
import { TABLE_NAME } from '../types';
import { resolveTargetUser } from '../utils';
export function registerRemoveCommand(ctx: Context, config: Config, logInfo: LogInfoFn): void {
    ctx.command(`${config.baseCommand}.${config.removeCourseCommand}`)
        .option('target', '-t <target:text> 指定用户（请直接@目标用户）')
        .action(async ({ session, options }) => {
        try {
            const targetUser = await resolveTargetUser(session, options.target);
            const courses = await ctx.database.get(TABLE_NAME, { userid: targetUser.userId, channelId: session.channelId });
            if (courses.length === 0) {
                return targetUser.specified
                    ? `${targetUser.username}在本群还没有添加任何课程。`
                    : '您在本群还没有添加任何课程。';
            }
            let list = targetUser.specified
                ? `${targetUser.username}目前在本群的课程有：\n`
                : '你目前在本群的课程有：\n';
            courses.forEach((c, i) => {
                list += `${i + 1}. ${c.curriculumname} ${c.curriculumndate?.join(',')} ${c.curriculumtime}\n`;
            });
            list += '请选择要移除的课程序号（可输入多个，用空格分隔，例如：1 2 3）:';
            await session.send(h.text(list));
            const input = await session.prompt(config.interactionTimeoutSeconds * 1000);
            const rawTokens = (input || '').trim().split(/[\s，,、]+/).filter(Boolean);
            if (!rawTokens.length)
                return '未输入有效的课程序号。';
            const indices = [...new Set(rawTokens.map(token => Number.parseInt(token, 10) - 1))];
            const hasInvalidIndex = indices.some(index => Number.isNaN(index) || index < 0 || index >= courses.length);
            if (hasInvalidIndex) {
                return '存在无效的课程序号，请输入有效数字，并用空格分隔多个序号。';
            }
            const selectedCourses = indices.map(index => courses[index]);
            for (const selectedCourse of selectedCourses) {
                await ctx.database.remove(TABLE_NAME, { id: selectedCourse.id });
            }
            const summary = selectedCourses
                .map(course => `${course.curriculumname} ${course.curriculumndate?.join(',')} ${course.curriculumtime}`)
                .join('\n');
            logInfo(`用户 ${targetUser.userId} 批量删除课程，共 ${selectedCourses.length} 门`);
            await session.send(`已删除以下课程：\n${summary}`);
            return session.execute(config.viewScheduleCommand);
        }
        catch (e) {
            if (e instanceof Error && e.message === 'INVALID_TARGET_USER') {
                return '指定用户参数无效，请直接@目标用户，或省略该参数删除自己的课程。';
            }
            ctx.logger.error('移除课程失败:', e);
            return '移除课程失败，请重试或检查日志。';
        }
    });
}
