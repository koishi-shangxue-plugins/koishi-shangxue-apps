import { Context, h } from 'koishi'
import type { Config } from '../types'
import { getRandomBackground } from '../utils/background'
import { getJrys } from '../utils/jrys'
import { alreadySignedInToday, recordSignIn, updateUserCurrency } from '../utils/database'
import { convertToBase64image } from '../utils/image'
import { generateFortuneHTML, getImageBuffer } from '../utils/render'
import { sendImageMessage } from '../utils/message-sender'

/**
 * 注册今日运势主命令
 */
export function registerJrysCommand(
  ctx: Context,
  config: Config,
  jsonFilePath: string,
  retryCounts: Record<string, number>,
  logInfo: (...args: any[]) => void
) {
  ctx.command(`${config.command}`, { authority: 1 })
    .userFields(["id"])
    .option('split', '-s 以图文输出今日运势')
    .action(async ({ session, options }) => {
      let hasSignedInToday = await alreadySignedInToday(ctx, session.userId, session.channelId, config)
      retryCounts[session.userId] = retryCounts[session.userId] || 0 // 初始化重试次数
      let Checkin_HintText_messageid: any
      let backgroundImage = getRandomBackground(config)
      let BackgroundURL = backgroundImage.replace(/\\/g, '/')
      let imageBuffer: Buffer
      const dJson = await getJrys(session, config, logInfo)

      if (options.split) {
        // 如果开启了分离模式，那就只返回图文消息内容。即文字运势内容与背景图片
        if (config.Checkin_HintText && config.Checkin_HintText !== 'unset') {
          Checkin_HintText_messageid = await session.send(config.Checkin_HintText)
        }

        let textjrys = `
${dJson.fortuneSummary}
${dJson.luckyStar}\n
${dJson.signText}\n
${dJson.unsignText}\n
`
        let enablecurrencymessage: any

        if (config.enablecurrency) {
          if (hasSignedInToday) {
            enablecurrencymessage = h.text(session.text(".hasSignedInTodaysplit"))
          } else {
            enablecurrencymessage = h.text(session.text(".CurrencyGetbackgroundimagesplit", [config.maintenanceCostPerUnit]))
          }
        }
        let backgroundImage = getRandomBackground(config)
        let BackgroundURL = backgroundImage.replace(/\\/g, '/')
        let BackgroundURL_base64 = await convertToBase64image(ctx, BackgroundURL, logInfo)
        let message = [
          h.image(BackgroundURL_base64),
          h.text(textjrys),
          enablecurrencymessage
        ]
        if (config.enablecurrency && !hasSignedInToday) {
          await updateUserCurrency(ctx, String(session.user.id), config.maintenanceCostPerUnit, config.currency, logInfo)
        }
        await recordSignIn(ctx, session.userId, session.channelId)
        await session.send(message)
        if (Checkin_HintText_messageid && config.recallCheckin_HintText) {
          await session.bot.deleteMessage(session.channelId, Checkin_HintText_messageid)
        }
        return
      }

      if (config.Checkin_HintText && config.Checkin_HintText !== 'unset') {
        Checkin_HintText_messageid = await session.send(config.Checkin_HintText)
      }

      let page: any
      try {
        if (config.markdown_button_mode !== "raw_jrys") {
          page = await ctx.puppeteer.page()
          await page.setViewport({ width: 1080, height: 1920 })

          let BackgroundURL_base64 = await convertToBase64image(ctx, BackgroundURL, logInfo)

          // 生成 HTML
          const HTMLsource = await generateFortuneHTML(ctx, session, config, dJson, BackgroundURL_base64, logInfo)

          logInfo(`使用背景URL: ${BackgroundURL}`)
          await page.setContent(HTMLsource)
          // 等待网络空闲
          await page.waitForNetworkIdle()
          const element = await page.$('body')

          imageBuffer = await element.screenshot({
            type: "jpeg",  // 使用 JPEG 格式
            encoding: "binary",
            quality: config.screenshotquality  // 设置图片质量
          })
        } else {
          imageBuffer = await getImageBuffer(ctx, BackgroundURL)
        }

        if (config.enablecurrency && !hasSignedInToday) {
          await updateUserCurrency(ctx, String(session.user.id), config.maintenanceCostPerUnit, config.currency, logInfo)
        }

        // 发送图片消息
        await sendImageMessage(ctx, session, config, imageBuffer, BackgroundURL, hasSignedInToday, jsonFilePath, logInfo)

        if (config.markdown_button_mode !== "raw_jrys") {
          await recordSignIn(ctx, session.userId, session.channelId)
        }

        if (Checkin_HintText_messageid && config.recallCheckin_HintText) {
          await session.bot.deleteMessage(session.channelId, Checkin_HintText_messageid)
        }
      } catch (e) {
        const errorTime = new Date().toISOString() // 获取错误发生时间的ISO格式
        ctx.logger.error(`状态渲染失败 [${errorTime}]: `, e) // 记录错误信息并包含时间戳

        if (config.retryexecute && retryCounts[session.userId] < config.maxretrytimes) {
          retryCounts[session.userId]++
          ctx.logger.warn(`用户 ${session.userId} 尝试第 ${retryCounts[session.userId]} 次重试...`)
          try {
            await session.execute(config.command) // 使用 session.execute 重试
            delete retryCounts[session.userId] // 执行成功，删除重试次数
            return // 阻止发送错误消息，因为我们正在重试
          } catch (retryError) {
            ctx.logger.error(`重试失败 [${errorTime}]: `, retryError)
            // 重试失败，继续执行错误处理
          }
        }
        // 如果达到最大重试次数或未启用重试，则发送错误消息
        delete retryCounts[session.userId] // 清理重试次数
        return "渲染失败 " + e.message + '\n' + e.stack

      } finally {
        if (page && !page.isClosed()) {
          page.close()
        }
        // 仅在成功或达到最大重试后清理
        if (!config.retryexecute || retryCounts[session.userId] >= config.maxretrytimes) {
          delete retryCounts[session.userId]
        }
      }

    })
}