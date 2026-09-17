import { Schema } from 'koishi'

export interface Config {
  screenshotQuality: number
  footerText: string
  useGlyphService: boolean
  glyphFontFamily?: string
  enableDebugLogging: boolean
}

export const name = 'curriculum-table'

export const inject = {
  required: ['puppeteer', 'database', 'console'],
  optional: ['glyph'],
}

export const Config: Schema<Config> = Schema.object({
  screenshotQuality: Schema.number().role('slider').min(0).max(100).step(1).default(80).description('图片压缩质量（0-100）'),
  footerText: Schema.string().role('textarea', { rows: [2, 4] }).default('').description('图片页脚文字，换行请使用 <br>'),
  useGlyphService: Schema.boolean().default(false).description('启用 glyph 字体服务后优先使用其字体'),
  glyphFontFamily: Schema.string().description('glyph 字体名称'),
  enableDebugLogging: Schema.boolean().default(false).description('开启后输出调试日志'),
})
