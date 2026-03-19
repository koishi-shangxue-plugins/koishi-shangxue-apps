import type { Context } from 'koishi';
import type { Config } from '../config';
import type { LogInfoFn } from '../types';
import type { RenderConfig } from '../render';
import { renderCourseTable } from '../render';
export function registerViewCommand(ctx: Context, config: Config, renderConfig: RenderConfig, fontDir: string, templatePath: string, logInfo: LogInfoFn): void {
    ctx.command(`${config.baseCommand}.${config.viewScheduleCommand} [day:string]`)
        .action(async ({ session }, day) => {
        let dayOffset = 0;
        if (day) {
            const num = Number(day);
            if (!isNaN(num)) {
                dayOffset = num;
            }
            else {
                const dayMap: Record<string, number> = {
                    '今天': 0, '明天': 1, '后天': 2, '大后天': 3,
                    '昨天': -1, '前天': -2, '大前天': -3,
                };
                if (day in dayMap) {
                    dayOffset = dayMap[day];
                }
                else {
                    const fut = day.match(/^(大+)(后天)$/);
                    const past = day.match(/^(大+)(前天)$/);
                    if (fut)
                        dayOffset = fut[1].length + 2;
                    else if (past)
                        dayOffset = -(past[1].length + 2);
                    else
                        return `无法识别的日期描述: "${day}"。请输入数字或 "今天"、"明天"、"昨天" 等。`;
                }
            }
        }
        const img = await renderCourseTable(ctx, renderConfig, session.channelId, dayOffset, fontDir, templatePath, logInfo);
        return img ?? '当前群组没有课程数据，或渲染失败。';
    });
}
