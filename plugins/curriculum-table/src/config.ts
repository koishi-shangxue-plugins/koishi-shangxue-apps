import { Schema } from 'koishi';
export interface CommandNamesConfig {
    baseCommand: string;
    addCourseCommand: string;
    removeCourseCommand: string;
    clearUserCoursesCommand: string;
    clearChannelCoursesCommand: string;
    importWakeupCommand: string;
    deduplicateCoursesCommand: string;
    viewScheduleCommand: string;
}
export interface InteractionConfig {
    interactionTimeoutSeconds: number;
    autoDeduplicateOnImport: boolean;
}
export interface PushSubscriptionConfig {
    botId: string;
    channelId: string;
    pushTime: string;
}
export interface ScheduledPushConfig {
    enableScheduledPush: boolean;
    subscriptions?: PushSubscriptionConfig[];
}
export interface RenderSettingsConfig {
    screenshotQuality: number;
    footerText: string;
}
export interface FontSettingsConfig {
    useGlyphService: boolean;
    glyphFontFamily?: string;
}
export interface DebugConfig {
    enableDebugLogging: boolean;
    closePageAfterRender: boolean;
}
export interface Config extends CommandNamesConfig, InteractionConfig, ScheduledPushConfig, RenderSettingsConfig, FontSettingsConfig, DebugConfig {
}
export const name = 'curriculum-table';
export const inject = {
    required: ['puppeteer', 'database'],
    optional: ['glyph'],
};
export const usage = `
<p>群组课表插件，允许用户添加、移除和查看课程表，并支持从 WakeUp 课程表应用导入课程。</p>
<p>输入 <code>群友课表.看看 1</code> 查看明日课程，<code>群友课表.看看 -1</code> 查看昨天课程。</p>
`;
export const Config = Schema.intersect([
    Schema.object({
        baseCommand: Schema.string().default('群友课表').description('注册的父级指令名称'),
        addCourseCommand: Schema.string().default('添加').description('添加课程指令名称'),
        removeCourseCommand: Schema.string().default('移除').description('移除单门课程指令名称'),
        clearUserCoursesCommand: Schema.string().default('删除个人').description('删除个人课表指令名称（清除自己在本群的所有课程）'),
        clearChannelCoursesCommand: Schema.string().default('删除群组').description('删除群组课表指令名称（清除本群所有人的所有课程，需二次确认）'),
        importWakeupCommand: Schema.string().default('wakeup').description('WakeUp 快速导入指令名称'),
        deduplicateCoursesCommand: Schema.string().default('去重').description('课程去重指令名称'),
        viewScheduleCommand: Schema.string().default('看看').description('查看当前群组课表指令名称'),
    }).description('基础设置'),
    Schema.object({
        interactionTimeoutSeconds: Schema.number().description('等待用户交互的超时时间（秒）').default(30),
        autoDeduplicateOnImport: Schema.boolean().default(true).description('添加或导入课程后自动执行课程去重'),
    }).description('进阶设置'),
    Schema.object({
        enableScheduledPush: Schema.boolean().default(false).description('是否开启定时主动推送功能。需要 cron 服务，并指定机器人与频道。'),
    }).description('定时推送'),
    Schema.union([
        Schema.object({
            enableScheduledPush: Schema.const(true).required(),
            subscriptions: Schema.array(Schema.object({
                botId: Schema.string().description('机器人 ID'),
                channelId: Schema.string().description('群组ID'),
                pushTime: Schema.string().role('time').description('每日推送时间').default('07:30:00'),
            })).role('table').description('在指定群组订阅课表 定时主动推送'),
        }),
        Schema.object({
            enableScheduledPush: Schema.const(false),
        }),
    ]),
    Schema.object({
        screenshotQuality: Schema.number().role('slider').min(0).max(100).step(1).default(80).description('设置图片压缩保留质量（%）'),
        footerText: Schema.string().role('textarea', { rows: [2, 4] }).description('页脚描述文字。换行请用 &lt;br&gt;').default('使用 "群友课表.添加" 指令设置课程表'),
    }).description('渲染设置'),
    Schema.object({
        useGlyphService: Schema.boolean().default(false).description('是否启用 glyph 字体服务。启用后优先使用 glyph 提供的字体。'),
    }).description('字体设置'),
    Schema.union([
        Schema.object({
            useGlyphService: Schema.const(true).required(),
            glyphFontFamily: Schema.dynamic('glyph.fonts').description('选择 glyph 字体'),
        }),
        Schema.object({}),
    ]),
    Schema.object({
        enableDebugLogging: Schema.boolean().default(false).description('日志调试模式，非必要不开启'),
        closePageAfterRender: Schema.boolean().default(true).description('渲染完成后自动关闭 puppeteer page，非开发者请勿改动'),
    }).description('开发者选项'),
]) as Schema<Config>;
