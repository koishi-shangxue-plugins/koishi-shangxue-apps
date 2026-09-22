import { h, Session } from "koishi"
import type { Config } from "./config"
import type { AppLogger } from "./logger"
import { resolveApiModeForInput, shouldAskOptionalImage } from "./mode"
import {
  extractImagesFromMessage,
  extractImagesFromSession,
  extractTextFromMessage,
  resolveAvatarImages,
} from "./session"

export interface ImageCollection {
  images: string[]
  text: string
}

export interface ParentInput {
  images: string[]
  prompt: string
}

// 合并消息里的图片、avatar 图片与调用方传入的预收集图片
async function collectSessionImages(
  session: Session,
  extraContent: string,
  presetImages: string[] = [],
): Promise<string[]> {
  const images = [...presetImages]
  images.push(...extractImagesFromSession(session))
  images.push(...await resolveAvatarImages(session, session.stripped.content))
  if (session.quote) {
    images.push(...await resolveAvatarImages(session, session.quote.content))
  }
  if (extraContent) {
    images.push(...extractImagesFromMessage(extraContent))
    images.push(...await resolveAvatarImages(session, extraContent))
  }
  return [...new Set(images)]
}

// 先收集当前消息或交互回复中的图片；text 用于子命令固定提示词场景
export async function collectImages(
  session: Session,
  extraContent: string,
  config: Config,
  log: AppLogger,
  presetImages: string[] = [],
): Promise<ImageCollection | null> {
  const images = await collectSessionImages(session, extraContent, presetImages)
  const textParts: string[] = []
  if (extraContent) {
    textParts.push(extractTextFromMessage(extraContent))
  }
  let text = textParts.filter(Boolean).join(" ").trim()

  const mode = resolveApiModeForInput(config, images.length > 0)

  if (images.length > 0 && mode === "generations" && !config.agnesMode) {
    await session.send(h.text(session.text(`commands.${config.basename}.messages.generationsNoImage`)))
    return null
  }

  if (images.length === 0) {
    const useOptionalImage = shouldAskOptionalImage(config)
    if (mode === "generations" && !useOptionalImage) {
      log.info("未检测到参考图片，将按提示词直接文生图")
      return { images: [], text }
    }

    const [needImagesMessageId] = await session.send(
      h.text(session.text(`commands.${config.basename}.messages.${useOptionalImage ? "needimagesOptional" : "needimages"}`)),
    )

    try {
      const reply = await session.prompt(config.waitTimeout * 1000)
      if (!reply) {
        await session.send(h.text(session.text(`commands.${config.basename}.messages.promptTimeout`)))
        return null
      }

      const replyImages = [
        ...extractImagesFromMessage(reply),
        ...await resolveAvatarImages(session, reply),
      ]
      const replyText = extractTextFromMessage(reply)

      if (replyImages.length === 0) {
        await deleteHintMessage(session, needImagesMessageId, log, "图片交互提示")
        if (useOptionalImage && replyText) {
          if (!text) text = replyText
          log.info("未检测到参考图片，将按提示词直接文生图")
          return { images: [...new Set(images)], text }
        }
        if (useOptionalImage) {
          await session.send(h.text(session.text(`commands.${config.basename}.messages.noImagesInPrompt`)))
        } else {
          await session.send(h.text(session.text(`commands.${config.basename}.messages.editsNeedImage`)))
        }
        return null
      }

      images.push(...replyImages)
      if (!text) text = replyText
      await deleteHintMessage(session, needImagesMessageId, log, "图片交互提示")
      log.info(`通过交互模式收集到 ${images.length} 张图片:`, images)
    } catch (error) {
      if (isTimeoutError(error)) {
        await session.send(h.text(session.text(`commands.${config.basename}.messages.promptTimeout`)))
      } else {
        log.error("交互式图片输入失败:", error)
        await session.send(h.text(session.text(`commands.${config.basename}.messages.promptError`)))
      }
      return null
    }
  }

  const uniqueImages = [...new Set(images)]
  log.info(`收集到 ${uniqueImages.length} 张图片:`, uniqueImages)
  return { images: uniqueImages, text }
}

// -d 模式只收集提示词，不询问参考图片
export async function collectDirectPrompt(
  session: Session,
  extraContent: string,
  config: Config,
  log: AppLogger,
): Promise<string | null> {
  const prompt = extractTextFromMessage(extraContent).trim()
  if (prompt) return prompt

  const [needPromptMessageId] = await session.send(
    h.text(session.text(`commands.${config.basename}.messages.needPrompt`)),
  )
  const reply = await waitForInput(session, config, log)
  if (!reply) return null

  const replyText = extractTextFromMessage(reply)
  if (!replyText) {
    await deleteHintMessage(session, needPromptMessageId, log, "提示词交互提示")
    await session.send(h.text(session.text(`commands.${config.basename}.messages.noPrompt`)))
    return null
  }

  await deleteHintMessage(session, needPromptMessageId, log, "提示词交互提示")
  log.info("-d 模式收集到直接生成提示词")
  return replyText
}

// 父级指令固定顺序：先收集提示词，再收集图片，避免用户误解流程
export async function collectParentInput(
  session: Session,
  extraContent: string,
  config: Config,
  log: AppLogger,
  presetImages: string[] = [],
): Promise<ParentInput | null> {
  const images = await collectSessionImages(session, extraContent, presetImages)
  let prompt = extractTextFromMessage(extraContent).trim()

  if (!prompt) {
    const [needPromptMessageId] = await session.send(
      h.text(session.text(`commands.${config.basename}.messages.needPrompt`)),
    )
    const reply = await waitForInput(session, config, log)
    if (!reply) return null

    const replyText = extractTextFromMessage(reply)
    if (!replyText) {
      await deleteHintMessage(session, needPromptMessageId, log, "提示词交互提示")
      await session.send(h.text(session.text(`commands.${config.basename}.messages.noPrompt`)))
      return null
    }

    prompt = replyText
    images.push(
      ...extractImagesFromMessage(reply),
      ...await resolveAvatarImages(session, reply),
    )
    await deleteHintMessage(session, needPromptMessageId, log, "提示词交互提示")
  }

  if (images.length === 0) {
    const mode = resolveApiModeForInput(config, false)
    if (mode === "edits" || shouldAskOptionalImage(config)) {
      const collection = await collectImages(session, "", config, log)
      if (!collection) return null
      images.push(...collection.images)
    } else {
      log.info("未检测到参考图片，将按提示词直接文生图")
    }
  }

  const finalMode = resolveApiModeForInput(config, images.length > 0)
  if (images.length > 0 && finalMode === "generations" && !config.agnesMode) {
    await session.send(h.text(session.text(`commands.${config.basename}.messages.generationsNoImage`)))
    return null
  }

  const uniqueImages = [...new Set(images)]
  log.info(`父级交互收集到 ${uniqueImages.length} 张图片和提示词:`, {
    prompt: prompt.substring(0, 100),
  })
  return { images: uniqueImages, prompt }
}

async function waitForInput(
  session: Session,
  config: Config,
  log: AppLogger,
): Promise<string | null> {
  try {
    const reply = await session.prompt(config.waitTimeout * 1000)
    if (!reply) {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.promptTimeout`)))
      return null
    }
    return reply
  } catch (error) {
    if (isTimeoutError(error)) {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.promptTimeout`)))
    } else {
      log.error("交互式输入失败:", error)
      await session.send(h.text(session.text(`commands.${config.basename}.messages.promptError`)))
    }
    return null
  }
}

async function deleteHintMessage(
  session: Session,
  messageId: string | undefined,
  log: AppLogger,
  label: string,
): Promise<void> {
  if (!messageId) return
  try {
    await session.bot.deleteMessage(session.channelId, messageId)
  } catch (error) {
    log.warn(`删除${label}失败:`, error)
  }
}

function isTimeoutError(error: unknown): boolean {
  return String(error).toLowerCase().includes("timeout")
}
