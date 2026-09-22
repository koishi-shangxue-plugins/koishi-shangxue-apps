import { Context, h, Session } from "koishi"
import type { Config } from "./config"
import type { AppLogger } from "./logger"
import { API_URL_HTML_ERROR, callImageApi } from "./api"
import { getUserCurrency, updateUserCurrency } from "./currency"
import { getAgnesConfig } from "./agnes"
import { resolveApiModeForInput } from "./mode"
import { resolveApiParamsForMode } from "./params"
import { getImageSize, resolveSizeParams } from "./image-size"
import { downloadFileWithTimeout } from "./http"
import { prepareImageForApi } from "./media"

// 货币功能开启时先检查余额，余额不足时直接返回 false
export async function checkCurrency(
  ctx: Context,
  session: Session,
  config: Config,
  log: AppLogger,
): Promise<boolean> {
  if (!config.monetaryCommands || !ctx.monetary) return true

  const quote = h.quote(session.messageId)
  try {
    const userId = session.userId ?? ""
    const currentBalance = await getUserCurrency(ctx, userId, config.currency, log)
    const requiredAmount = Math.abs(config.monetaryCost)

    if (currentBalance < requiredAmount) {
      await session.send([
        quote,
        h.text(session.text(`commands.${config.basename}.messages.insufficientCurrency`, [
          currentBalance,
          config.currency,
          requiredAmount,
        ])),
      ])
      return false
    }

    return true
  } catch (error) {
    log.error(`检查用户 ${session.userId ?? ""} 货币余额时出错:`, error)
    await session.send([quote, h.text("检查货币余额时出错，请稍后重试。")])
    return false
  }
}

// 统一处理图片下载、API 调用、货币扣除与结果发送
export async function generateImage(
  ctx: Context,
  session: Session,
  images: string[],
  prompt: string,
  config: Config,
  log: AppLogger,
  imagesNumber?: number,
): Promise<boolean> {
  const quote = h.quote(session.messageId)

  try {
    const effectiveImagesNumber = imagesNumber ?? 1
    const mode = resolveApiModeForInput(config, images.length > 0)
    const agnes = config.agnesMode
      ? getAgnesConfig(config.agnesAPIkey, config.apiParams_generations, config.agnesRegion, config.agnesModel)
      : undefined
    const apiUrl = agnes?.apiUrl ?? config.apiUrl
    const apiKey = agnes?.apiKey ?? config.apiKey
    let apiParams = agnes?.apiParams ?? resolveApiParamsForMode(config, mode)
    if (imagesNumber !== undefined) {
      apiParams = {
        ...apiParams,
        n: String(imagesNumber),
      }
    }

    let processingMessageId: string | undefined
    if (!config.disableWaitingTips) {
      const [messageId] = await session.send([
        quote,
        h.text(session.text(`commands.${config.basename}.messages.processing`)),
      ])
      processingMessageId = messageId
    }

    const files = images.length > 0
      ? await Promise.all(
        images.map(async src => {
          try {
            const file = await downloadFileWithTimeout(ctx, src, config.apiTimeout * 1000)
            return await prepareImageForApi(ctx, file, config, log)
          } catch (error) {
            log.error(`下载或处理图片失败: ${src}`, error)
            return null
          }
        }),
      ).then(results => results.filter((file): file is NonNullable<typeof file> => file !== null))
      : []

    if (files.length === 0 && images.length > 0) {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.invalidimage`)))
      await deleteProcessingMessage(session, processingMessageId, log)
      return false
    }

    if (files.length === 0 && mode === "edits") {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.editsNeedImage`)))
      await deleteProcessingMessage(session, processingMessageId, log)
      return false
    }

    if (files.length > 0 && mode === "generations" && !config.agnesMode) {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.generationsNoImage`)))
      await deleteProcessingMessage(session, processingMessageId, log)
      return false
    }

    // 尺寸决策：提示词里写明的画面比例 > 输入图片比例 > 配置值
    // 无论配置是 {{dynamic_size}} 还是 auto，都统一在这里算出一个明确的尺寸
    const imageSize = files.length > 0 ? getImageSize(Buffer.from(files[0].data)) : null
    const dynamic = resolveSizeParams({
      configuredSize: apiParams.size || "",
      prompt,
      width: imageSize?.width,
      height: imageSize?.height,
      agnesMode: config.agnesMode,
    })
    apiParams = {
      ...apiParams,
      size: dynamic.size,
      ...(dynamic.ratio ? { ratio: dynamic.ratio } : {}),
    }
    log.info("最终请求尺寸:", {
      configured: apiParams.size,
      inputWidth: imageSize?.width,
      inputHeight: imageSize?.height,
      ...dynamic,
    })

    const result = await callImageApi(ctx, files, prompt, {
      apiUrl,
      apiKey,
      apiMode: mode,
      apiParams,
      imagesNumber: effectiveImagesNumber,
      agnesMode: config.agnesMode,
      timeoutMs: config.apiTimeout * 1000,
      log,
    })

    if (!result) {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.failed`)))
      await deleteProcessingMessage(session, processingMessageId, log)
      return false
    }

    if (config.monetaryCommands && ctx.monetary) {
      try {
        const userId = session.userId ?? ""
        await updateUserCurrency(ctx, userId, config.monetaryCost, config.currency, log)
        const newBalance = await getUserCurrency(ctx, userId, config.currency, log)
        await session.send(h.text(session.text(`commands.${config.basename}.messages.currencyDeducted`, [
          Math.abs(config.monetaryCost),
          config.currency,
          newBalance,
        ])))
      } catch (error) {
        log.error(`扣除用户 ${session.userId ?? ""} 货币时出错:`, error)
        await session.send(h.text("货币扣除失败，但图片已生成。"))
      }
    }

    await deleteProcessingMessage(session, processingMessageId, log)

    if (Array.isArray(result)) {
      await session.send(result.map(url => h.image(url)))
    } else {
      await session.send(h.image(result))
    }
    return true
  } catch (error) {
    log.error("处理图片时发生错误:", error)
    const errorText = error instanceof Error ? error.message : String(error)
    if (error instanceof Error && error.name === "AbortError") {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.apiTimeout`)))
    } else if (errorText === API_URL_HTML_ERROR) {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.invalidApiUrl`)))
    } else if (isNotFoundError(errorText)) {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.apiModeHint`)))
    } else {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.error`, [errorText])))
    }
    return false
  }
}

async function deleteProcessingMessage(
  session: Session,
  messageId: string | undefined,
  log: AppLogger,
): Promise<void> {
  if (!messageId) return
  try {
    await session.bot.deleteMessage(session.channelId, messageId)
  } catch (error) {
    log.warn("删除处理中提示消息失败:", error)
  }
}

function isNotFoundError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes("not found") || /(^|\D)404(\D|$)/.test(message)
}
