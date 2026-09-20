import type { Context, Session } from 'koishi'
import type { Config, JrysData } from '../types'
import { bufferToDataUrl } from './image'
import { generateFortuneHTML } from './render'

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

export async function renderFortuneCardImage(
  ctx: Context,
  session: Session,
  config: Config,
  dJson: JrysData,
  backgroundBuffer: Buffer,
  backgroundMimeType: string,
  logInfo: (...args: any[]) => void,
): Promise<Buffer> {
  if (!ctx.puppeteer) {
    throw new Error('puppeteer service not available')
  }

  const backgroundDataUrl = bufferToDataUrl(backgroundBuffer, backgroundMimeType)
  const html = await generateFortuneHTML(ctx, session, config, dJson, backgroundDataUrl, logInfo)

  const page = await ctx.puppeteer.page()
  try {
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    await waitForCaptureReady(page)
    return await page.screenshot({ type: 'png' })
  } finally {
    await page.close().catch(() => {})
  }
}
