import type { Context } from 'koishi'
import { Console } from '@koishijs/console'
import {} from '@koishijs/plugin-console'
import path from 'node:path'
import { Config, inject, name } from './config'
import type { Config as CurriculumTableConfig } from './config'
import { CurriculumDatabase } from './database'
import { registerConsoleEvents } from './events'
import { createPluginLogger } from './logger'
import { registerGlyphFont, type RenderConfig } from './render'
import { PushScheduler } from './scheduler'
import { resolveTemplatePath } from './template'

export { name, inject, Config }
export {
  COURSE_TABLE,
  PUSH_TABLE,
  SCHEDULE_TABLE,
} from './types'
export type {
  ApiResult,
  CurriculumBotInfo,
  CurriculumCourseInput,
  CurriculumCourseV2,
  CurriculumCourseView,
  CurriculumPushInput,
  CurriculumPushV2,
  CurriculumScheduleInput,
  CurriculumScheduleV2,
  CurriculumWebState,
} from './types'

declare module 'koishi' {
  interface Context {
    console: Console
  }
}

export function apply(ctx: Context, config: CurriculumTableConfig): void {
  const logger = createPluginLogger(ctx, config.enableDebugLogging)
  const database = new CurriculumDatabase(ctx)
  database.initialize()

  const fontDir = path.join(__dirname, '../font')
  const templatePath = resolveTemplatePath()
  const renderConfig: RenderConfig = {
    screenshotQuality: config.screenshotQuality,
    footerText: config.footerText,
    useGlyphService: config.useGlyphService,
    glyphFontFamily: config.glyphFontFamily,
    enableDebugLogging: config.enableDebugLogging,
  }
  const scheduler = new PushScheduler(
    ctx,
    database,
    renderConfig,
    fontDir,
    templatePath,
    logger,
  )

  ctx.console.addEntry({
    dev: path.resolve(__dirname, '../client/entry.ts'),
    prod: path.resolve(__dirname, '../dist'),
  })

  registerConsoleEvents(ctx, database, logger)

  ctx.on('ready', async () => {
    await registerGlyphFont(ctx, fontDir, logger)
    scheduler.start()
  })

  ctx.on('dispose', () => {
    scheduler.dispose()
  })
}
