import { Schema } from 'koishi'

export interface Config {
  screenshotQuality: number
  footerText: string
  glyphFontFamily?: string
  enableDebugLogging: boolean
  hideFinishedCourses: boolean
}

export const name = 'curriculum-table'

export const inject = {
  required: ['puppeteer', 'database', 'console'],
  optional: ['glyph'],
}

export const Config: Schema<Config> = Schema.object({
  screenshotQuality: Schema.number().role('slider').min(0).max(100).step(1).default(80).description('图片压缩质量（0-100）'),
  footerText: Schema.string().role('textarea', { rows: [2, 4] }).default('群友课程表\nkoishi-plugin-curriculum-table').description('图片页脚文字，直接使用回车换行'),
  glyphFontFamily: Schema.dynamic('glyph.fonts').default('方正像素12').description('选择 glyph 字体；未安装 glyph 时使用内置字体'),
  enableDebugLogging: Schema.boolean().default(false).description('开启后输出调试日志'),
  hideFinishedCourses: Schema.boolean().default(true).description('已结束的课程不显示在推送图片中'),
})
