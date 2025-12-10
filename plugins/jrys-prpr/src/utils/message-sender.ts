import fs from 'node:fs'
import { h } from 'koishi'
import type { Context, Session } from 'koishi'
import type { Config } from '../types'
import { markdown, sendmarkdownMessage, uploadImageToChannel } from './markdown'
import { encodeTimestamp } from './image'

/**
 * 发送图片消息并处理响应
 */
export async function sendImageMessage(
  ctx: Context,
  session: Session,
  config: Config,
  imageBuffer: Buffer,
  BackgroundURL: string,
  hasSignedInToday: boolean,
  jsonFilePath: string,
  logInfo: (...args: any[]) => void
): Promise<void> {
  let sentMessage: any
  const messageTime = new Date().toISOString() // 获取当前时间的ISO格式
  const encodedMessageTime = encodeTimestamp(messageTime) // 对时间戳进行简单编码

  if ((config.markdown_button_mode === "markdown" || config.markdown_button_mode === "raw" || config.markdown_button_mode === "markdown_raw_json" || config.markdown_button_mode === "raw_jrys") && session.platform === 'qq') {
    const uploadedImageURL = await uploadImageToChannel(ctx, imageBuffer, session.bot.config.id, session.bot.config.secret, session.bot.config.token, config.QQchannelId, config)

    const qqmarkdownmessage = await markdown(ctx, session, encodedMessageTime, uploadedImageURL.url, `data:image/pngbase64,${imageBuffer.toString('base64')}`, config, logInfo)
    await sendmarkdownMessage(ctx, session, qqmarkdownmessage, logInfo)

  } else {
    // 根据不同的配置发送不同类型的消息
    const imageMessage = h.image(imageBuffer, "image/png")
    switch (config.GetOriginalImage_Command_HintText) {
      case '2': // 返回文字提示，且为图文消息
        const hintText2_encodedMessageTime = `${config.command2} ${encodedMessageTime}`
        let hintText2: string
        if (config.enablecurrency) {
          if (!hasSignedInToday) {
            hintText2 = session.text(".CurrencyGetbackgroundimage", [config.maintenanceCostPerUnit, hintText2_encodedMessageTime])
          } else {
            hintText2 = session.text(".hasSignedInToday", [hintText2_encodedMessageTime])
          }
        } else {
          hintText2 = session.text(".Getbackgroundimage", [hintText2_encodedMessageTime])
        }
        const combinedMessage2 = `${imageMessage}\n${hintText2}`
        logInfo(`获取原图：\n${encodedMessageTime}`)
        sentMessage = await session.send(combinedMessage2)
        break
      case '3': // 返回文字提示，且为单独发送的文字消息
        const hintText3_encodedMessageTime = `${config.command2} ${encodedMessageTime}`
        let hintText3: string
        if (config.enablecurrency) {
          if (!hasSignedInToday) {
            hintText3 = session.text(".CurrencyGetbackgroundimage", [config.maintenanceCostPerUnit, hintText3_encodedMessageTime])
          } else {
            hintText3 = session.text(".hasSignedInToday", [hintText3_encodedMessageTime])
          }
        } else {
          hintText3 = session.text(".Getbackgroundimage", [hintText3_encodedMessageTime])
        }
        logInfo(`获取原图：\n${encodedMessageTime}`)
        sentMessage = await session.send(imageMessage) // 先发送图片消息
        await session.send(hintText3) // 再单独发送提示
        break
      default: '1'//不返回文字提示，只发送图片
        sentMessage = await session.send(imageMessage)
        break
    }
  }

  if (config.markdown_button_mode === "json" && session.platform === 'qq') {
    let markdownMessage = {
      msg_id: session.event.message.id,
      msg_type: 2,
      keyboard: {
        id: config.nested.json_button_template_id
      },
    }
    await sendmarkdownMessage(ctx, session, markdownMessage, logInfo)
  }

  if (config.markdown_button_mode !== "raw_jrys") {
    // 记录日志
    if (config.consoleinfo && session.platform !== 'qq') {
      if (Array.isArray(sentMessage)) {
        sentMessage.forEach((messageId, index) => {
          ctx.logger.info(`发送图片消息ID [${index}]: ${messageId}`)
        })
      } else {
        ctx.logger.info(`发送的消息对象: ${JSON.stringify(sentMessage, null, 2)}`)
      }
    }
    // 记录消息ID和背景图URL到JSON文件
    if (config.GetOriginalImageCommand) {
      const imageData = {
        // 使用 encodedMessageTime 作为唯一标识符的一部分
        messageId: session.platform === 'qq' ? [encodedMessageTime] : (Array.isArray(sentMessage) ? sentMessage : [sentMessage]),
        messageTime: encodedMessageTime, // 使用预先获取的时间戳
        backgroundURL: BackgroundURL
      }
      try {
        let data = []
        if (fs.existsSync(jsonFilePath)) {
          // 读取JSON文件内容
          const fileContent = fs.readFileSync(jsonFilePath, 'utf8')
          if (fileContent.trim()) {
            data = JSON.parse(fileContent)
          }
        }
        // 检查数据是否已存在
        const exists = data.some(item => item.messageId.includes(imageData.messageId))
        if (!exists) {
          // 添加新数据
          data.push(imageData)
          fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2))
        }
      } catch (error) {
        ctx.logger.error(`处理JSON文件时出错 [${encodedMessageTime}]: `, error) // 记录错误信息并包含时间戳
      }
    }
  }
}