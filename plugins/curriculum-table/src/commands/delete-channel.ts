import type { Context } from 'koishi';
import type { Config } from '../config';
import type { LogInfoFn } from '../types';
import { TABLE_NAME } from '../types';
export function registerDeleteChannelCommand(ctx: Context, config: Config, logInfo: LogInfoFn): void {
    ctx.command(`${config.baseCommand}.${config.clearChannelCoursesCommand}`)
        .action(async ({ session }) => {
        const channelId = session.channelId;
        try {
            const courses = await ctx.database.get(TABLE_NAME, { channelId });
            if (courses.length === 0)
                return '本群还没有任何课程记录，无需删除。';
            const userIds = new Set(courses.map(c => c.userid));
            const userCount = userIds.size;
            await session.send(`即将删除本群所有用户的课程记录，共涉及 ${userCount} 位用户、${courses.length} 门课程。\n` +
                `⚠️ 此操作不可逆！请输入"确认删除"来继续，或输入任意其他内容取消：`);
            const step1 = await session.prompt(config.interactionTimeoutSeconds * 1000);
            if (!step1 || step1.trim() !== '确认删除')
                return '已取消，未删除任何数据。';
            await session.send(`请再次输入"确认删除"以执行最终删除操作：`);
            const step2 = await session.prompt(config.interactionTimeoutSeconds * 1000);
            if (!step2 || step2.trim() !== '确认删除')
                return '已取消，未删除任何数据。';
            await ctx.database.remove(TABLE_NAME, { channelId });
            logInfo(`已删除群 ${channelId} 的全部 ${courses.length} 门课程（涉及 ${userCount} 位用户）`);
            return `已成功删除本群 ${userCount} 位用户的全部 ${courses.length} 门课程记录。`;
        }
        catch (e) {
            ctx.logger.error('删除群组课程失败:', e);
            return '删除失败，请重试或检查日志。';
        }
    });
}
