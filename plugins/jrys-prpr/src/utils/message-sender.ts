import { h } from 'koishi'
import type { Context, Session } from 'koishi'
import type { } from '@koishijs/assets'
import type { Config, JrysData } from '../types'
import { recordOriginalImage } from './database'
import { markdown, plainTextImageMarkdown, sendmarkdownMessage } from './markdown'
import { bufferToDataUrl, encodeTimestamp, isHttpUrl } from './image'
import { renderFortuneCardImage } from './render-card'

function getPublicImageUrl(rawUrl: string): string {
  if (/response-content-type=image%2Fjpeg/i.test(rawUrl)) {
    return rawUrl
  }
  return `${rawUrl}&response-content-type=image%2Fjpeg`
}

function extractImageUrl(transformed: string): string {
  const source = h.parse(transformed)[0]?.attrs.src
  if (typeof source !== 'string' || !source) {
    throw new Error(`assets.transform did not return an image url: ${transformed}`)
  }
  return source
}

async function resolveAssetsPublicUrl(ctx: Context, imageDataUrl: string): Promise<string> {
  if (!ctx.assets) throw new Error('assets service not available')

  // 使用 Data URL 让 assets 直接读取 Buffer，避免 HTTP 适配器 fetch 本地路径
  const transformed = await ctx.assets.transform(String(h.image(imageDataUrl, { file: 'jrys-prpr-background.png' })))
  return extractImageUrl(transformed)
}

function getSimpleFortuneText(dJson: JrysData): string {
  return [
    '今日运势',
    `您今天的运势是：${dJson.fortuneSummary}`,
    dJson.signText,
    dJson.unsignText,
  ].join('\n\n')
}

/**
 * 发送图片消息并处理响应
 */
export async function sendImageMessage(
  ctx: Context,
  session: Session,
  config: Config,
  dJson: JrysData,
  imageBuffer: Buffer,
  imageMimeType: string,
  BackgroundURL: string,
  hasSignedInToday: boolean,
  jsonFilePath: string,
  logInfo: (...args: any[]) => void
): Promise<void> {
  const messageTime = encodeTimestamp(new Date().toISOString())
  const isSimpleOriginalMode = config.GetOriginalImage_Command_HintText === '0'

  if (isSimpleOriginalMode) {
    const simpleText = getSimpleFortuneText(dJson)

    if (config.markdown_button_mode === 'raw' && session.platform === 'qq') {
      const backgroundDataUrl = bufferToDataUrl(imageBuffer, imageMimeType)
      const publicUrl = isHttpUrl(BackgroundURL)
        ? BackgroundURL
        : await resolveAssetsPublicUrl(ctx, backgroundDataUrl)
      const qqmarkdownmessage = await plainTextImageMarkdown(ctx, session, publicUrl, backgroundDataUrl, dJson, logInfo)
      const sentMessage = await sendmarkdownMessage(ctx, session, qqmarkdownmessage, logInfo)

      await recordOriginalImage(ctx, jsonFilePath, {
        messageId: sentMessage,
        messageTime,
        backgroundURL: BackgroundURL,
      }, logInfo)
      return
    }

    const imageMessage = h.image(imageBuffer, imageMimeType)
    const sentMessage = await session.send(`${simpleText}\n${imageMessage}`)
    await recordOriginalImage(ctx, jsonFilePath, {
      messageId: sentMessage,
      messageTime,
      backgroundURL: BackgroundURL,
    }, logInfo)
    return
  }

  const renderBuffer = await renderFortuneCardImage(ctx, session, config, dJson, imageBuffer, imageMimeType, logInfo)
  const imageMessage = h.image(renderBuffer, 'image/png')

  if (config.markdown_button_mode === 'raw' && session.platform === 'qq') {
    const renderDataUrl = bufferToDataUrl(renderBuffer, 'image/png')
    const transformed = await ctx.assets.transform(String(h.image(renderDataUrl, { file: 'jrys-prpr-card.png' })))

    const publicUrl = getPublicImageUrl(extractImageUrl(transformed))
    const qqmarkdownmessage = await markdown(ctx, session, messageTime, publicUrl, renderDataUrl, dJson, config, logInfo)
    const sentMessage = await sendmarkdownMessage(ctx, session, qqmarkdownmessage, logInfo)

    await recordOriginalImage(ctx, jsonFilePath, {
      messageId: sentMessage,
      messageTime,
      backgroundURL: BackgroundURL,
    }, logInfo)
    return
  }

  switch (config.GetOriginalImage_Command_HintText) {
    case '2': {
      const hintText2_encodedMessageTime = `${config.command2} ${messageTime}`
      let hintText2: string
      if (config.enablecurrency) {
        if (!hasSignedInToday) {
          hintText2 = session.text('.CurrencyGetbackgroundimage', [config.maintenanceCostPerUnit, hintText2_encodedMessageTime])
        } else {
          hintText2 = session.text('.hasSignedInToday', [hintText2_encodedMessageTime])
        }
      } else {
        hintText2 = session.text('.Getbackgroundimage', [hintText2_encodedMessageTime])
      }
      const combinedMessage2 = `${imageMessage}\n${hintText2}`
      const sentMessage = await session.send(combinedMessage2)
      await recordOriginalImage(ctx, jsonFilePath, {
        messageId: sentMessage,
        messageTime,
        backgroundURL: BackgroundURL,
      }, logInfo)
      return
    }
    case '3': {
      const hintText3_encodedMessageTime = `${config.command2} ${messageTime}`
      let hintText3: string
      if (config.enablecurrency) {
        if (!hasSignedInToday) {
          hintText3 = session.text('.CurrencyGetbackgroundimage', [config.maintenanceCostPerUnit, hintText3_encodedMessageTime])
        } else {
          hintText3 = session.text('.hasSignedInToday', [hintText3_encodedMessageTime])
        }
      } else {
        hintText3 = session.text('.Getbackgroundimage', [hintText3_encodedMessageTime])
      }
      const sentMessage = await session.send(imageMessage)
      await recordOriginalImage(ctx, jsonFilePath, {
        messageId: sentMessage,
        messageTime,
        backgroundURL: BackgroundURL,
      }, logInfo)
      await session.send(hintText3)
      return
    }
    default: {
      const sentMessage = await session.send(imageMessage)
      await recordOriginalImage(ctx, jsonFilePath, {
        messageId: sentMessage,
        messageTime,
        backgroundURL: BackgroundURL,
      }, logInfo)
    }
  }
}
