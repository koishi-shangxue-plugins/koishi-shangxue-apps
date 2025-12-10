import crypto from 'node:crypto'
import type { Context, Session } from 'koishi'
import type { Config, JrysData } from '../types'
import { getJrys } from './jrys'

/**
 * 发送 Markdown 消息
 */
export async function sendmarkdownMessage(
  ctx: Context,
  session: Session,
  message: any,
  logInfo: (...args: any[]) => void
): Promise<void> {
  logInfo(message)
  try {
    const { guild, user } = session.event
    const { qq, qqguild, channelId } = session as any
    if (guild?.id) {
      if (qq) {
        await qq.sendMessage(channelId, message)
      } else if (qqguild) {
        await qqguild.sendMessage(channelId, message)
      }
    } else if (user?.id && qq) {
      await qq.sendPrivateMessage(user.id, message)
    }
  } catch (error) {
    ctx.logger.error(`发送markdown消息时出错:`, error)
  }
}

/**
 * 上传图片到 QQ 频道
 */
export async function uploadImageToChannel(
  ctx: Context,
  imageBuffer: Buffer,
  appId: string,
  secret: string,
  token: string,
  channelId: string,
  config: Config
): Promise<{ url: string }> {
  async function refreshToken(bot: any) {
    const { access_token: accessToken, expires_in: expiresIn } = await ctx.http.post('https://bots.qq.com/app/getAppAccessToken', {
      appId: bot.appId,
      clientSecret: bot.secret
    })
    bot.token = accessToken
    ctx.setTimeout(() => refreshToken(bot), (expiresIn - 30) * 1000)
  }
  // 临时的bot对象
  const bot = { appId, secret, token, channelId }
  // 刷新令牌
  await refreshToken(bot)
  const payload = new FormData()
  payload.append('msg_id', '0')
  payload.append('file_image', new Blob([imageBuffer as any], { type: 'image/png' }), 'image.jpg')
  await ctx.http.post(`https://api.sgroup.qq.com/channels/${bot.channelId}/messages`, payload, {
    headers: {
      Authorization: `QQBot ${bot.token}`,
      'X-Union-Appid': bot.appId
    }
  })
  // 计算MD5并返回图片URL
  const md5 = crypto.createHash('md5').update(imageBuffer).digest('hex').toUpperCase()
  if (channelId !== undefined && config.consoleinfo) {
    ctx.logger.info(`使用本地图片*QQ频道  发送URL为： https://gchat.qpic.cn/qmeetpic/0/0-0-${md5}/0`)
  }
  return { url: `https://gchat.qpic.cn/qmeetpic/0/0-0-${md5}/0` }
}

/**
 * 构建 Markdown 消息
 */
export async function markdown(
  ctx: Context,
  session: Session,
  encodedMessageTime: string,
  imageUrl: string,
  imageToload: string,
  config: Config,
  logInfo: (...args: any[]) => void
): Promise<any> {
  const markdownMessage: any = {
    msg_type: 2,
    markdown: {},
    keyboard: {},
  }

  // 只有在非主动模式下才添加 msg_id
  if (!config.markdown_button_mode_initiative) {
    markdownMessage.msg_id = session.messageId
  }
  let originalWidth: number
  let originalHeight: number
  // 尝试从 URL 中解析尺寸
  const sizeMatch = imageUrl.match(/\?px=(\d+)x(\d+)$/)
  if (sizeMatch) {
    originalWidth = parseInt(sizeMatch[1], 10)
    originalHeight = parseInt(sizeMatch[2], 10)
  } else {
    const canvasimage = await ctx.canvas.loadImage(imageToload || imageUrl)
    // @ts-ignore
    originalWidth = canvasimage.naturalWidth || canvasimage.width
    // @ts-ignore
    originalHeight = canvasimage.naturalHeight || canvasimage.height
  }

  // 获取 dJson
  const dJson = await getJrys(session, config, logInfo)

  if (config.markdown_button_mode === "markdown") {
    const templateId = config.nested.markdown_button_template_id
    const keyboardId = config.nested.markdown_button_keyboard_id
    const contentTable = config.nested.markdown_button_content_table

    const params = contentTable.map(item => ({
      key: item.raw_parameters,
      values: replacePlaceholders(item.replace_parameters, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }),
    }))

    markdownMessage.markdown = {
      custom_template_id: templateId,
      params: params,
    }
    if (config.markdown_button_mode_keyboard) {
      markdownMessage.keyboard = {
        id: keyboardId,
      }
    }
  } else if (config.markdown_button_mode === "markdown_raw_json") {
    const templateId = config.nested.markdown_raw_json_button_template_id
    const contentTable = config.nested.markdown_raw_json_button_content_table
    let keyboard = JSON.parse(config.nested.markdown_raw_json_button_keyboard)

    keyboard = replacePlaceholders(keyboard, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }, true)

    const params = contentTable.map(item => ({
      key: item.raw_parameters,
      values: replacePlaceholders(item.replace_parameters, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }),
    }))

    markdownMessage.markdown = {
      custom_template_id: templateId,
      params: params,
    }
    if (config.markdown_button_mode_keyboard) {
      markdownMessage.keyboard = {
        content: keyboard,
      }
    }
  } else if (config.markdown_button_mode === "raw") {
    try {
      const rawMarkdownContent = config.nested.raw_markdown_button_content
      const rawMarkdownKeyboard = config.nested.raw_markdown_button_keyboard
      // 将 atUserString 插入到原始字符串中
      const qqbotatuser = session.isDirect ? "\n" : `<qqbot-at-user id="${session.userId}" />`
      const replacedMarkdownContent = replacePlaceholders(rawMarkdownContent, { session, qqbotatuser, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }, true)
      const replacedMarkdownKeyboard = replacePlaceholders(rawMarkdownKeyboard, { session, qqbotatuser, config, encodedMessageTime, dJson }, true)
        .replace(/^[\s\S]*?"keyboard":\s*/, '')
        .replace(/\\n/g, '')
        .replace(/\\"/g, '"')
        .trim()

      const keyboard = JSON.parse(replacedMarkdownKeyboard)

      markdownMessage.markdown = {
        content: replacedMarkdownContent,
      }
      if (config.markdown_button_mode_keyboard) {
        markdownMessage.keyboard = {
          content: keyboard,
        }
      }
    } catch (error) {
      ctx.logger.error(`解析原生 Markdown 出错: ${error}`)
      return null
    }
  } else if (config.markdown_button_mode === "raw_jrys") {
    try {
      const raw_jrysMarkdownContent = config.nested.raw_jrys_markdown_button_content
      const raw_jrysMarkdownKeyboard = config.nested.raw_jrys_markdown_button_keyboard

      // 将 atUserString 插入到原始字符串中
      const qqbotatuser = session.isDirect ? "\n" : `<qqbot-at-user id="${session.userId}" />`

      const replacedMarkdownContent = replacePlaceholders(raw_jrysMarkdownContent, { session, qqbotatuser, dJson, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime }, true)
      const replacedMarkdownKeyboard = replacePlaceholders(raw_jrysMarkdownKeyboard, { session, qqbotatuser, config, encodedMessageTime, dJson }, true)
        .replace(/^[\s\S]*?"keyboard":\s*/, '')
        .replace(/\\n/g, '')
        .replace(/\\"/g, '"')
        .trim()

      const keyboard = JSON.parse(replacedMarkdownKeyboard)

      markdownMessage.markdown = {
        content: replacedMarkdownContent,
      }
      if (config.markdown_button_mode_keyboard) {
        markdownMessage.keyboard = {
          content: keyboard,
        }
      }
    } catch (error) {
      ctx.logger.error(`解析原生 Markdown 出错: ${error}`)
      return null
    }
  }

  logInfo(`Markdown 模板参数: ${JSON.stringify(markdownMessage, null, 2)}`)
  return markdownMessage
}

/**
 * 替换占位符
 */
export function replacePlaceholders(content: any, context: any, isRawMode = false): any {
  // 如果 content 是字符串，直接替换占位符
  if (typeof content === 'string') {
    if (!/\{\{\.([^}]+)\}\}|\$\{([^}]+)\}/.test(content)) {
      return isRawMode ? content : [content]
    }

    const value = content.replace(/\{\{\.([^}]+)\}\}|\$\{([^}]+)\}/g, (match, p1, p2) => {
      const key = p1 || p2
      // 从 context 中查找占位符对应的值
      const replacement = key.split('.').reduce((obj, k) => obj?.[k], context) || match
      return replacement
    })

    return isRawMode ? value : [value]
  }

  // 如果 content 是对象或数组，递归处理
  if (typeof content === 'object' && content !== null) {
    if (Array.isArray(content)) {
      return content.map(item => replacePlaceholders(item, context, isRawMode))
    } else {
      const result = {}
      for (const key in content) {
        result[key] = replacePlaceholders(content[key], context, isRawMode)
      }
      return result
    }
  }

  // 其他情况直接返回
  return content
}