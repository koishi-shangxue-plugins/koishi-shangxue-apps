import { Context, Universal, Bot } from 'koishi';
import type {} from 'koishi-plugin-glyph';
import path from 'node:path';
import { name, inject, usage, Config } from './config';
import type { Config as CurriculumTableConfig } from './config';
import { TABLE_NAME } from './types';
import { renderCourseTable, registerGlyphFont, type RenderConfig } from './render';
import { resolveTemplatePath } from './template';
import { registerAddCommand } from './commands/add';
import { registerWakeupCommand } from './commands/wakeup';
import { registerRemoveCommand } from './commands/remove';
import { registerDeleteUserCommand } from './commands/delete-user';
import { registerDeleteChannelCommand } from './commands/delete-channel';
import { registerDedupCommand } from './commands/dedup';
import { registerViewCommand } from './commands/view';
export { name, inject, usage, Config };
export type { CurriculumTable } from './types';
declare module 'koishi' {
    interface Context {
        cron?: (expression: string, callback: () => void) => void;
    }
}
export async function apply(ctx: Context, config: CurriculumTableConfig) {
    function logInfo(msg: string, ...rest: unknown[]): void {
        if (config.enableDebugLogging) {
            ctx.logger.info(msg, ...rest);
        }
    }
    const fontDir = path.join(__dirname, '../font');
    const templatePath = resolveTemplatePath();
    const renderConfig: RenderConfig = {
        screenshotQuality: config.screenshotQuality,
        footerText: config.footerText,
        closePageAfterRender: config.closePageAfterRender,
        useGlyphService: config.useGlyphService,
        glyphFontFamily: config.glyphFontFamily,
        enableDebugLogging: config.enableDebugLogging,
    };
    ctx.on('ready', async () => {
        await registerGlyphFont(ctx, fontDir);
        ctx.model.extend(TABLE_NAME, {
            id: 'unsigned',
            channelId: 'string',
            userid: 'string',
            username: 'string',
            useravatar: 'string',
            curriculumndate: { type: 'json', nullable: true },
            curriculumname: 'string',
            curriculumtime: 'string',
            startDate: 'string',
            endDate: 'string',
        }, {
            primary: 'id',
            autoInc: true,
        });
        ctx.command(config.baseCommand);
        registerAddCommand(ctx, config, logInfo);
        registerWakeupCommand(ctx, config, logInfo);
        registerRemoveCommand(ctx, config, logInfo);
        registerDeleteUserCommand(ctx, config, logInfo);
        registerDeleteChannelCommand(ctx, config, logInfo);
        registerDedupCommand(ctx, config, logInfo);
        registerViewCommand(ctx, config, renderConfig, fontDir, templatePath, logInfo);
    });
    ctx.on('ready', () => {
        if (!config.enableScheduledPush || !config.subscriptions || config.subscriptions.length === 0)
            return;
        ctx.inject(['cron'], (childCtx) => {
            for (const sub of config.subscriptions) {
                const { botId, channelId, pushTime } = sub;
                if (!pushTime)
                    continue;
                const [hour, minute] = pushTime.split(':');
                const cronExpr = `${minute} ${hour} * * *`;
                try {
                    childCtx.cron(cronExpr, async () => {
                        const bot = (Object.values(childCtx.bots) as Bot[]).find(b => b.selfId === botId || b.user?.id === botId);
                        if (!bot || bot.status !== Universal.Status.ONLINE) {
                            childCtx.logger.warn(`定时任务：未找到bot ${botId} 或bot不在线`);
                            return;
                        }
                        const allCourses = await childCtx.database.get(TABLE_NAME, { channelId });
                        if (allCourses.length === 0)
                            return;
                        const today = new Date().toISOString().split('T')[0];
                        const hasValid = allCourses.some(course => today >= course.startDate && today <= course.endDate);
                        if (!hasValid)
                            return;
                        try {
                            const img = await renderCourseTable(childCtx, renderConfig, channelId, 0, fontDir, templatePath, logInfo);
                            if (img)
                                await bot.sendMessage(channelId, String(img));
                        }
                        catch (e) {
                            childCtx.logger.error(`定时推送群组 ${channelId} 失败:`, e);
                        }
                    });
                    logInfo(`已为群组 ${channelId} 设置定时推送，cron: ${cronExpr}`);
                }
                catch (e) {
                    ctx.logger.error(`设置定时任务失败 (${cronExpr}):`, e);
                }
            }
        });
    });
}
