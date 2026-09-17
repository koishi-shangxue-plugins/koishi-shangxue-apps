import { h } from 'koishi'
import type { Context } from 'koishi'
import fs from 'node:fs'
import path from 'node:path'
import * as url from 'node:url'
import type {} from 'koishi-plugin-glyph'
import type {} from 'koishi-plugin-puppeteer'
import type { CurriculumDatabase } from './database'
import type { LogInfo } from './logger'
import type { CurriculumCourseView } from './types'

type CourseStatus = 'ongoing' | 'next' | 'finished' | 'nocourse'

interface ResolvedCourseStatus {
  status: Exclude<CourseStatus, 'nocourse'>
  statusDetail: string
}

interface CourseDisplayUser {
  userid: string
  username: string
  useravatar: string
}

interface CourseRenderItem extends CourseDisplayUser {
  courseName: string | null
  startTime: string | null
  endTime: string | null
  status: CourseStatus
  statusDetail: string
  totalMinutesToday: number
  sortStartMinutes: number
  isSummary: boolean
  summaryText: string
}

export interface RenderConfig {
  screenshotQuality: number
  footerText: string
  useGlyphService: boolean
  glyphFontFamily?: string
  enableDebugLogging: boolean
}

export interface RenderOptions {
  channelId: string
  dayOffset: number
  scheduleIds?: number[]
  title?: string
  allowEmpty?: boolean
}

type PuppeteerPage = Awaited<ReturnType<NonNullable<Context['puppeteer']>['page']>>
type PuppeteerElement = Awaited<ReturnType<PuppeteerPage['$']>>

const FONT_NAME = '方正像素12'
const LOCAL_FONT_FILE = '方正像素12.ttf'
const FALLBACK_AVATAR = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='
const DAY_OF_WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const
const STATUS_ORDER: Record<CourseStatus, number> = {
  ongoing: 0,
  next: 1,
  finished: 2,
  nocourse: 3,
}

/** 优先使用 glyph，失败后回退本地字体。 */
export async function getFontFaceRule(
  ctx: Context,
  config: Pick<RenderConfig, 'useGlyphService' | 'glyphFontFamily'>,
  fontDir: string,
  logger: LogInfo,
): Promise<string> {
  const localFontPath = path.join(fontDir, LOCAL_FONT_FILE)

  if (config.useGlyphService && ctx.glyph && config.glyphFontFamily) {
    const fontDataUrl = ctx.glyph.getFontDataUrl(config.glyphFontFamily)
    if (fontDataUrl) {
      return `@font-face { font-family: '${FONT_NAME}'; src: url('${fontDataUrl}'); }`
    }
    logger.warn(`从 glyph 获取字体 ${config.glyphFontFamily} 失败，回退到本地字体。`)
  }

  try {
    const fontBuffer = await fs.promises.readFile(localFontPath)
    const base64Font = fontBuffer.toString('base64')
    return `@font-face { font-family: '${FONT_NAME}'; src: url('data:font/ttf;base64,${base64Font}') format('truetype'); }`
  } catch {
    logger.error('加载本地字体文件失败，将使用系统字体。')
    return ''
  }
}

/** 将本地字体注册到 glyph，方便控制台直接选用。 */
export async function registerGlyphFont(
  ctx: Context,
  fontDir: string,
  logger: LogInfo,
): Promise<void> {
  if (!ctx.glyph) return

  const fontPath = path.join(fontDir, LOCAL_FONT_FILE)
  const fontFileUrl = url.pathToFileURL(fontPath).href

  try {
    const ok = await ctx.glyph.checkFont(FONT_NAME, fontFileUrl)
    if (!ok) {
      logger.warn(`字体 "${FONT_NAME}" 未能通过 glyph 服务成功加载。`)
    }
  } catch (error) {
    logger.error(`通过 glyph 检查字体 "${FONT_NAME}" 时出错:`, error)
  }
}

function chevronSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <polyline points="6,8 14,18 6,28" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="16,8 24,18 16,28" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
  const encoded = Buffer.from(svg).toString('base64')
  return `<img class="chevrons" src="data:image/svg+xml;base64,${encoded}" alt=">>">`
}

function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} 小时`
}

function buildCourseTimeText(item: CourseRenderItem): string {
  if (!item.startTime || !item.endTime) {
    if (item.totalMinutesToday > 0) {
      return `共 ${formatHours(item.totalMinutesToday)}`
    }
    return ''
  }

  const courseTime = `${escHtml(item.startTime)}-${escHtml(item.endTime)}`
  if (!item.statusDetail) return courseTime
  return `${courseTime}（${escHtml(item.statusDetail)}）`
}

function renderCourseItem(item: CourseRenderItem): string {
  let badgeClass = 'badge-nocourse'
  let badgeText = '无课'
  let chevronColor = '#aaa'

  if (item.status === 'ongoing') {
    badgeClass = 'badge-ongoing'
    badgeText = '进行中'
    chevronColor = '#e05050'
  } else if (item.status === 'next') {
    badgeClass = 'badge-next'
    badgeText = '下一节'
    chevronColor = '#5b8fd9'
  } else if (item.status === 'finished') {
    badgeClass = 'badge-finished'
    badgeText = '已结束'
    chevronColor = '#7bbf7b'
  }

  const courseNameClass = item.status === 'ongoing'
    ? 'course-name'
    : item.status === 'next'
      ? 'course-name-next'
      : 'course-name-finished'
  const courseLabel = item.isSummary ? item.summaryText : (item.courseName ?? '')
  const timeText = buildCourseTimeText(item)
  const avatarSrc = item.useravatar || FALLBACK_AVATAR
  const timeHtml = timeText ? `<div class="time-info">${timeText}</div>` : ''

  return `
<div class="course-item">
  <div class="avatar-col">
    <img class="avatar" src="${escHtml(avatarSrc)}" alt="${escHtml(item.username)}">
  </div>
  ${chevronSvg(chevronColor)}
  <div class="info-col">
    <div class="nickname" title="${escHtml(item.username)}">${escHtml(item.username)}</div>
    <div class="status-row">
      <span class="badge ${badgeClass}">${badgeText}</span>
      <div class="${courseNameClass}">${escHtml(courseLabel)}</div>
    </div>
    ${timeHtml}
  </div>
</div>`
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function waitForCaptureReady(page: PuppeteerPage): Promise<void> {
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready.catch(() => {})
    }

    const imageTasks = Array.from(document.images, image => {
      if (image.complete) return Promise.resolve()
      return new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })
    })

    await Promise.all(imageTasks)
  })
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function isCourseInDate(
  course: CurriculumCourseView,
  currentDate: string,
  currentDayOfWeekName: string,
): boolean {
  return currentDate >= course.startDate
    && currentDate <= course.endDate
    && course.curriculumndate.includes(currentDayOfWeekName)
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours > 0) return `${hours} 小时 ${remainMinutes} 分钟`
  return `${remainMinutes} 分钟`
}

function resolveCourseStatus(
  startMin: number,
  endMin: number,
  currentTimestamp: number,
  dayOffset: number,
): ResolvedCourseStatus {
  if (dayOffset < 0) return { status: 'finished', statusDetail: '' }
  if (dayOffset > 0) return { status: 'next', statusDetail: '' }
  if (startMin <= currentTimestamp && currentTimestamp <= endMin) {
    return {
      status: 'ongoing',
      statusDetail: `剩余 ${formatDuration(endMin - currentTimestamp)}`,
    }
  }
  if (startMin > currentTimestamp) {
    return {
      status: 'next',
      statusDetail: `${formatDuration(startMin - currentTimestamp)}后`,
    }
  }
  return { status: 'finished', statusDetail: '' }
}

function createCourseRenderItem(
  course: CurriculumCourseView,
  currentTimestamp: number,
  dayOffset: number,
): CourseRenderItem {
  const [startTime, endTime] = course.curriculumtime.split('-')
  const startMin = timeToMinutes(startTime)
  const endMin = timeToMinutes(endTime)
  const { status, statusDetail } = resolveCourseStatus(
    startMin,
    endMin,
    currentTimestamp,
    dayOffset,
  )

  return {
    userid: course.userid,
    username: course.username,
    useravatar: course.useravatar,
    courseName: course.curriculumname,
    startTime,
    endTime,
    status,
    statusDetail,
    totalMinutesToday: 0,
    sortStartMinutes: startMin,
    isSummary: false,
    summaryText: '',
  }
}

function createSummaryRenderItem(
  user: CourseDisplayUser,
  status: CourseStatus,
  totalMinutesToday: number,
  summaryText: string,
): CourseRenderItem {
  return {
    userid: user.userid,
    username: user.username,
    useravatar: user.useravatar,
    courseName: null,
    startTime: null,
    endTime: null,
    status,
    statusDetail: '',
    totalMinutesToday,
    sortStartMinutes: Number.MAX_SAFE_INTEGER,
    isSummary: true,
    summaryText,
  }
}

function buildByTimeRenderItems(
  validCourses: CurriculumCourseView[],
  currentTimestamp: number,
  dayOffset: number,
): CourseRenderItem[] {
  return validCourses
    .map(course => createCourseRenderItem(course, currentTimestamp, dayOffset))
    .sort((a, b) => {
      const timeDiff = a.sortStartMinutes - b.sortStartMinutes
      if (timeDiff !== 0) return timeDiff
      const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (statusDiff !== 0) return statusDiff
      const userDiff = a.username.localeCompare(b.username, 'zh-CN')
      if (userDiff !== 0) return userDiff
      return (a.courseName ?? '').localeCompare(b.courseName ?? '', 'zh-CN')
    })
}

function createEmptyStateItem(dayOffset: number): CourseRenderItem {
  const summaryText = dayOffset === 0 ? '今日暂无课程安排' : '所选日期暂无课程安排'

  return createSummaryRenderItem(
    {
      userid: 'curriculum-table-empty',
      username: '群友课表',
      useravatar: FALLBACK_AVATAR,
    },
    'nocourse',
    0,
    summaryText,
  )
}

export async function renderCourseTable(
  ctx: Context,
  database: CurriculumDatabase,
  config: RenderConfig,
  options: RenderOptions,
  fontDir: string,
  templatePath: string,
  logger: LogInfo,
): Promise<ReturnType<typeof h.image> | null> {
  if (!ctx.puppeteer) {
    logger.error('没有开启 puppeteer 服务，无法生成图片。')
    return null
  }

  let page: PuppeteerPage | null = null
  let captureRoot: PuppeteerElement | null = null

  try {
    page = await ctx.puppeteer.page()
    const allCourses = await database.getCourseViews({
      channelId: options.channelId,
      scheduleIds: options.scheduleIds,
    })

    if (allCourses.length === 0 && !options.allowEmpty) {
      logger.warn(`群组 ${options.channelId} 没有课程数据，无法渲染。`)
      return null
    }

    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + options.dayOffset)
    const currentDate = formatLocalDate(targetDate)
    const currentDayOfWeekName = DAY_OF_WEEK_NAMES[targetDate.getDay()]
    const validCourses = allCourses.filter(course => (
      isCourseInDate(course, currentDate, currentDayOfWeekName)
    ))
    const currentTimestamp = new Date().getHours() * 60 + new Date().getMinutes()

    logger.info(
      `群组 ${options.channelId} 在 ${currentDayOfWeekName} 的有效课程 ${validCourses.length} 条`,
    )

    const renderItems = buildByTimeRenderItems(validCourses, currentTimestamp, options.dayOffset)
    const finalRenderItems = renderItems.length > 0
      ? renderItems
      : [createEmptyStateItem(options.dayOffset)]

    const templateHtml = await fs.promises.readFile(templatePath, 'utf-8')
    const fontFaceRule = await getFontFaceRule(ctx, config, fontDir, logger)
    const fontStyleTag = fontFaceRule ? `<style>${fontFaceRule}</style>` : ''
    const courseItemsHtml = finalRenderItems.map(renderCourseItem).join('\n')
    const footerTime = `${targetDate.toLocaleDateString('zh-CN')} ${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}:${String(targetDate.getSeconds()).padStart(2, '0')}`
    const finalHtml = templateHtml
      .replace('{{FONT_FACE_STYLE_TAG}}', fontStyleTag)
      .replace('{{COURSE_ITEMS}}', courseItemsHtml)
      .replace('{{FOOTER_TIME}}', escHtml(footerTime))
      .replace('{{FOOTER_TEXT}}', config.footerText)
      .replace('{{TITLE}}', escHtml(options.title || '群友在上什么课？'))

    await page.setContent(finalHtml, { waitUntil: 'domcontentloaded' })
    await waitForCaptureReady(page)

    captureRoot = await page.$('#capture-root')
    if (!captureRoot) {
      logger.error('无法获取截图根节点。')
      return null
    }

    const image = await captureRoot.screenshot({
      quality: config.screenshotQuality,
      type: 'jpeg',
    })

    return h.image(image, 'image/jpeg')
  } catch (error) {
    logger.error('生成课程表图片失败:', error)
    return null
  } finally {
    if (captureRoot) {
      await captureRoot.dispose().catch(() => {})
    }
    if (page) {
      await page.close().catch(() => {})
    }
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
