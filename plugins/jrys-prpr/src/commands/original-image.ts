import { Context, h } from 'koishi'
import type { Config } from '../types'
import { getOriginalImageURL, deleteImageRecord } from '../utils/database'

/**
 * 注册获取原图命令
 */
export function registerOriginalImageCommand(
  ctx: Context,
  config: Config,
  jsonFilePath: string,
  logInfo: (...args: any[]) => void
) {
  if (!config.GetOriginalImageCommand) {
    return
  }

  ctx.command(`${config.command2} <InputmessageId:text>`, { authority: 1 })
    .alias('获取原图')
    .action(async ({ session }, InputmessageId) => {
      try {
        const isQQPlatform = session.platform === 'qq'
        const hasReplyContent = !!session.quote?.content
        if (!hasReplyContent && !isQQPlatform && !InputmessageId) {
          return session.text(".Inputerror")
        }
        if (isQQPlatform && !InputmessageId) {
          return session.text(".QQInputerror")
        }
        const messageId = hasReplyContent ? session.quote.messageId : InputmessageId
        logInfo(`尝试获取背景图：\n${messageId}`)
        if (!messageId) {
          return session.text(".FetchIDfailed")
        }
        const originalImageURL = await getOriginalImageURL(ctx, jsonFilePath, messageId)
        logInfo(`运势背景原图链接:\n ${originalImageURL}`)
        if (originalImageURL) {
          const sendsuccess = await session.send(h.image(originalImageURL))
          if (config.autocleanjson && sendsuccess) {
            // 删除对应的JSON记录
            await deleteImageRecord(ctx, jsonFilePath, messageId, originalImageURL, logInfo)
          }
          return
        } else if (config.autocleanjson) {
          return session.text(".aleadyFetchID")
        } else {
          return session.text(".FetchIDfailed")
        }
      } catch (error) {
        ctx.logger.error("获取运势图原图时出错: ", error)
        return session.text(".Failedtogetpictures")
      }
    })
}