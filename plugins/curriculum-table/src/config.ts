/**
 * config.ts - 插件配置项 Schema 定义
 */
import { Schema } from 'koishi'

export const name = 'curriculum-table'
export const inject = {
  required: ['puppeteer', 'database'],
  optional: ['glyph'],
}
export const usage = `
<p>群组课表插件，允许用户添加、移除和查看课程表，并支持从 WakeUp 课程表应用导入课程。</p>
<p>输入 <code>群友课表.看看 1</code> 查看明日课程，<code>群友课表.看看 -1</code> 查看昨天课程。</p>
`

export const Config = Schema.intersect([
  Schema.object({
    command: Schema.string().default('群友课表').description('注册的`父级指令`的名称'),
    command11: Schema.string().default('添加').description('实现 `添加课程` 的指令名称'),
    command12: Schema.string().default('移除').description('实现 `移除单门课程` 的指令名称'),
    command12b: Schema.string().default('删除个人').description('实现 `删除个人课表（清除自己在本群的所有课程）` 的指令名称'),
    command12c: Schema.string().default('删除群组').description('实现 `删除群组课表（清除本群所有人的所有课程，需二次确认）` 的指令名称'),
    command13: Schema.string().default('wakeup').description('实现 `wakeup快速导入课表` 的指令名称'),
    command14: Schema.string().default('去重').description('实现 `课程去重` 的指令名称'),
    command21: Schema.string().default('看看').description('实现 `查看当前群组的课表` 的指令名称'),
  }).description('基础设置'),

  Schema.object({
    waittimeout: Schema.number().description('等待用户交互的超时时间。（单位：秒）').default(30),
    autocommand14: Schema.boolean().default(true).description('添加课程时，自动执行`课程去重`'),
  }).description('进阶设置'),

  Schema.object({
    cronPush: Schema.boolean().default(false).description('是否开启自动推送功能。**需要cron服务！**<br>指定机器人，并定时推送到指定频道'),
  }).description('定时推送'),
  Schema.union([
    Schema.object({
      cronPush: Schema.const(true).required(),
      subscribe: Schema.array(Schema.object({
        bot: Schema.string().description('机器人ID'),
        channelId: Schema.string().description('群组ID'),
        time: Schema.string().role('time').description('每日推送时间').default('07:30:00'),
      })).role('table').description('在指定群组订阅课表 定时主动推送'),
    }),
    Schema.object({
      cronPush: Schema.const(false),
    }),
  ]),

  Schema.object({
    screenshotquality: Schema.number().role('slider').min(0).max(100).step(1).default(80).description('设置图片压缩 保留质量（%）'),
    backgroundcolor: Schema.string().role('color').description('渲染的课表底色背景色（新UI模板不使用此项）').default('rgba(234, 228, 225, 1)'),
    footertext: Schema.string().role('textarea', { rows: [2, 4] }).description('页脚描述文字。换行请用`<br>`').default('使用 /schedule.set 指令设置课程表'),
  }).description('渲染设置'),

  Schema.object({
    useGlyph: Schema.boolean().default(false).description('是否启用 `glyph` 字体服务。<br>启用后，将优先使用 `glyph` 服务提供的字体。'),
  }).description('字体设置'),
  Schema.union([
    Schema.object({
      useGlyph: Schema.const(true).required(),
      fontFamily: Schema.dynamic('glyph.fonts').description('选择字体'),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description('日志调试模式 `非必要不开启`'),
    pageclose: Schema.boolean().default(true).description('puppeteer 自动 page.close<br>非开发者请勿改动'),
  }).description('开发者选项'),
])

export type Config = typeof Config extends Schema<infer T> ? T : never
