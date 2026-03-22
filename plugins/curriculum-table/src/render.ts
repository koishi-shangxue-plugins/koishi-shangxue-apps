import { Context, h } from 'koishi'
import fs from 'node:fs'
import path from 'node:path'
import * as url from 'node:url'
import type {} from 'koishi-plugin-glyph'
import type {} from 'koishi-plugin-puppeteer'
import { TABLE_NAME } from './types'

export interface CourseRenderItem {
  userid: string
  username: string
  useravatar: string
  courseName: string | null
  startTime: string | null
  endTime: string | null
  status: 'ongoing' | 'next' | 'finished' | 'nocourse'
  statusDetail: string
  totalMinutesToday: number
}

export interface RenderConfig {
  screenshotQuality: number
  footerText: string
  closePageAfterRender: boolean
  useGlyphService: boolean
  glyphFontFamily?: string
  enableDebugLogging: boolean
}

/** 优先使用 glyph，失败后回退本地字体。 */
export async function getFontFaceRule(ctx: Context, config: Pick<RenderConfig, 'useGlyphService' | 'glyphFontFamily'>, fontDir: string): Promise<string> {
  const fontName = '千图马克手写体lite'
  const localFontPath = path.join(fontDir, '方正像素12.ttf')

  if (config.useGlyphService && ctx.glyph && config.glyphFontFamily) {
    const fontDataUrl = ctx.glyph.getFontDataUrl(config.glyphFontFamily)
    if (fontDataUrl) {
      return `@font-face { font-family: '${fontName}'; src: url('${fontDataUrl}'); }`
    }
    ctx.logger.warn(`从 glyph 获取字体 ${config.glyphFontFamily} 失败，回退到本地字体。`)
  }

  try {
    const fontBuffer = await fs.promises.readFile(localFontPath)
    const base64Font = fontBuffer.toString('base64')
    return `@font-face { font-family: '${fontName}'; src: url('data:font/ttf;base64,${base64Font}') format('truetype'); }`
  } catch {
    ctx.logger.error('加载本地字体文件失败，使用系统字体。')
    return ''
  }
}

/** 注册本地字体到 glyph。 */
export async function registerGlyphFont(ctx: Context, fontDir: string): Promise<void> {
  if (!ctx.glyph) return

  const fontName = '千图马克手写体lite'
  const fontPath = path.join(fontDir, '方正像素12.ttf')
  const fontFileUrl = url.pathToFileURL(fontPath).href

  try {
    const ok = await ctx.glyph.checkFont(fontName, fontFileUrl)
    if (!ok) {
      ctx.logger.warn(`字体 '${fontName}' 未能通过 glyph 服务成功加载。`)
    }
  } catch (error) {
    ctx.logger.error(`通过 glyph 检查字体 '${fontName}' 时出错:`, error)
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

function renderCourseItem(item: CourseRenderItem): string {
  let badgeClass = ''
  let badgeText = ''
  let chevronColor = '#aaa'
  let courseNameHtml = ''
  let timeHtml = ''

  if (item.status === 'ongoing') {
    badgeClass = 'badge-ongoing'
    badgeText = '进行中'
    chevronColor = '#e05050'
    courseNameHtml = `<div class="course-name">${escHtml(item.courseName ?? '')}</div>`
    timeHtml = `<div class="time-info">${escHtml(item.startTime ?? '')}-${escHtml(item.endTime ?? '')} (${escHtml(item.statusDetail)})</div>`
  } else if (item.status === 'next') {
    badgeClass = 'badge-next'
    badgeText = '下一节'
    chevronColor = '#5b8fd9'
    courseNameHtml = `<div class="course-name-next">${escHtml(item.courseName ?? '')}</div>`
    timeHtml = `<div class="time-info">${escHtml(item.startTime ?? '')}-${escHtml(item.endTime ?? '')} (${escHtml(item.statusDetail)})</div>`
  } else if (item.status === 'finished') {
    badgeClass = 'badge-finished'
    badgeText = '已结束'
    chevronColor = '#7bbf7b'
    courseNameHtml = '<div class="course-name-finished">今日课程已上完</div>'
    timeHtml = `<div class="time-info">共 ${formatHours(item.totalMinutesToday)}</div>`
  } else {
    badgeClass = 'badge-nocourse'
    badgeText = '已结束'
    chevronColor = '#7bbf7b'
    courseNameHtml = '<div class="course-name-finished">今日课程已上完</div>'
    timeHtml = `<div class="time-info">共 ${formatHours(item.totalMinutesToday)}</div>`
  }

  return `
<div class="course-item">
  <div class="avatar-col">
    <img class="avatar" src="${escHtml(item.useravatar)}" alt="${escHtml(item.username)}">
  </div>
  ${chevronSvg(chevronColor)}
  <div class="info-col">
    <div class="nickname" title="${escHtml(item.username)}">${escHtml(item.username)}</div>
    <div class="status-row">
      <span class="badge ${badgeClass}">${badgeText}</span>
      ${courseNameHtml}
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

/** 等待截图相关资源加载完成。 */
async function waitForCaptureReady(page: Awaited<ReturnType<NonNullable<Context['puppeteer']>['page']>>): Promise<void> {
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready.catch(() => {})
    }

    const imageTasks = Array.from(document.images, (img) => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })
    })

    await Promise.all(imageTasks)
  })
}

export async function renderCourseTable(
  ctx: Context,
  config: RenderConfig,
  channelId: string,
  dayOffset: number,
  fontDir: string,
  templatePath: string,
  logInfo: (...args: unknown[]) => void,
): Promise<ReturnType<typeof h.image> | null> {
  if (!ctx.puppeteer) {
    ctx.logger.error('没有开启 puppeteer 服务，无法生成图片。')
    return null
  }

  let page: Awaited<ReturnType<typeof ctx.puppeteer.page>> | null = null
  let captureRoot: Awaited<ReturnType<Awaited<ReturnType<typeof ctx.puppeteer.page>>['$']>> | null = null

  try {
    page = await ctx.puppeteer.page()
    const allCourses = await ctx.database.get(TABLE_NAME, { channelId })

    if (allCourses.length === 0) {
      ctx.logger.warn(`群组 ${channelId} 没有课程数据，无法渲染。`)
      return null
    }

    const now = new Date()
    now.setDate(now.getDate() + dayOffset)
    const currentDate = now.toISOString().split('T')[0]
    const dayOfWeekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const currentDayOfWeekName = dayOfWeekNames[now.getDay()]

    const validCourses = allCourses.filter(course =>
      currentDate >= course.startDate &&
      currentDate <= course.endDate &&
      course.curriculumndate.includes(currentDayOfWeekName),
    )

    logInfo(`群组 ${channelId} 在 ${currentDayOfWeekName} 有效课程 ${validCourses.length} 门`)

    const currentTimestamp = dayOffset === 0 ? now.getHours() * 60 + now.getMinutes() : 0
    const allUserIds = [...new Set(allCourses.map(course => course.userid))]
    const renderItems: CourseRenderItem[] = []

    for (const userid of allUserIds) {
      const userInfo = allCourses.find(course => course.userid === userid)
      if (!userInfo) continue

      const userValidCourses = validCourses.filter(course => course.userid === userid)
      if (userValidCourses.length === 0) {
        const finishedToday = allCourses.filter(course =>
          course.userid === userid &&
          currentDate >= course.startDate &&
          currentDate <= course.endDate &&
          course.curriculumndate.includes(currentDayOfWeekName),
        )

        renderItems.push({
          userid,
          username: userInfo.username,
          useravatar: userInfo.useravatar,
          courseName: null,
          startTime: null,
          endTime: null,
          status: 'nocourse',
          statusDetail: '',
          totalMinutesToday: calcTotalMinutes(finishedToday),
        })
        continue
      }

      let bestItem: CourseRenderItem | null = null
      let bestPriority = Infinity

      for (const course of userValidCourses) {
        const [startTime, endTime] = course.curriculumtime.split('-')
        const startMin = timeToMinutes(startTime)
        const endMin = timeToMinutes(endTime)

        if (startMin <= currentTimestamp && currentTimestamp <= endMin) {
          const remaining = endMin - currentTimestamp
          const remainHours = Math.floor(remaining / 60)
          const remainMinutes = remaining % 60
          const detail = remainHours > 0
            ? `剩余 ${remainHours} 小时 ${remainMinutes} 分钟`
            : `剩余 ${remainMinutes} 分钟`

          bestItem = {
            userid,
            username: course.username,
            useravatar: course.useravatar,
            courseName: course.curriculumname,
            startTime,
            endTime,
            status: 'ongoing',
            statusDetail: detail,
            totalMinutesToday: 0,
          }
          bestPriority = -1
          continue
        }

        if (startMin > currentTimestamp) {
          const diff = startMin - currentTimestamp
          if (diff < bestPriority) {
            const diffHours = Math.floor(diff / 60)
            const diffMinutes = diff % 60
            const detail = diffHours > 0
              ? `${diffHours} 小时 ${diffMinutes} 分钟后`
              : `${diffMinutes} 分钟后`

            bestPriority = diff
            bestItem = {
              userid,
              username: course.username,
              useravatar: course.useravatar,
              courseName: course.curriculumname,
              startTime,
              endTime,
              status: 'next',
              statusDetail: detail,
              totalMinutesToday: 0,
            }
          }
        }
      }

      if (bestItem) {
        renderItems.push(bestItem)
        continue
      }

      renderItems.push({
        userid,
        username: userInfo.username,
        useravatar: userInfo.useravatar,
        courseName: null,
        startTime: null,
        endTime: null,
        status: 'finished',
        statusDetail: '',
        totalMinutesToday: calcTotalMinutes(userValidCourses),
      })
    }

    const statusOrder = { ongoing: 0, next: 1, finished: 2, nocourse: 3 }
    renderItems.sort((a, b) => statusOrder[a.status] - statusOrder[b.status])

    const templateHtml = await fs.promises.readFile(templatePath, 'utf-8')
    const fontFaceRule = await getFontFaceRule(ctx, config, fontDir)
    const fontStyleTag = fontFaceRule ? `<style>${fontFaceRule}</style>` : ''
    const courseItemsHtml = renderItems.map(renderCourseItem).join('\n')
    const footerTime = `${now.toLocaleDateString('zh-CN')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    const finalHtml = templateHtml
      .replace('{{FONT_FACE_STYLE_TAG}}', fontStyleTag)
      .replace('{{COURSE_ITEMS}}', courseItemsHtml)
      .replace('{{FOOTER_TIME}}', escHtml(footerTime))
      .replace('{{FOOTER_TEXT}}', config.footerText)

    await page.setContent(finalHtml, { waitUntil: 'domcontentloaded' })
    await waitForCaptureReady(page)

    captureRoot = await page.$('#capture-root')
    if (!captureRoot) {
      ctx.logger.error('无法获取截图根节点。')
      return null
    }

    const image = await captureRoot.screenshot({
      quality: config.screenshotQuality,
      type: 'jpeg',
    })

    await captureRoot.dispose()
    captureRoot = null

    if (config.closePageAfterRender) {
      await page.close()
      page = null
    }

    return h.image(image, 'image/jpeg')
  } catch (error) {
    if (captureRoot) {
      await captureRoot.dispose().catch(() => {})
    }
    if (page && config.closePageAfterRender) {
      await page.close().catch(() => {})
    }
    ctx.logger.error('生成课程表图片失败:', error)
    return null
  }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function calcTotalMinutes(courses: { curriculumtime: string }[]): number {
  let total = 0
  for (const course of courses) {
    const [startTime, endTime] = course.curriculumtime.split('-')
    total += Math.max(0, timeToMinutes(endTime) - timeToMinutes(startTime))
  }
  return total
}
