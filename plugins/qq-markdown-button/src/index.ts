import path from 'node:path'
import { Context, Session } from 'koishi'
import { Config, usage } from './config'
import { ensureTemplateFiles, resolveBaseDir } from './files'
import { createLogger } from './logger'
import { getButtonData, getInteractionId, isSupportedPlatform } from './session'
import { sendMenuSequence } from './sender'
import type { Config as PluginConfig } from './types'

export const name = 'qq-markdown-button'
export const reusable = true
export const inject = {
  optional: ['database'],
}

export { Config, usage }

export function apply(ctx: Context, config: PluginConfig) {
  const logger = createLogger(ctx, config.consoleinfo)
  const baseDir = resolveBaseDir(ctx.baseDir, config.file_name)
  const templateRoot = path.resolve(__dirname, '..', 'qq')

  ctx.on('ready', () => {
    try {
      ensureTemplateFiles(baseDir, templateRoot)
      logger.debug(`模板目录：${baseDir}`)
    } catch (error) {
      logger.error('初始化模板文件时出错', error)
    }
  })

  if (config.Allow_INTERACTION_CREATE) {
    ctx.on('interaction/button', async (session: Session) => {
      const buttonData = getButtonData(session)
      if (!buttonData) return

      logger.debug(`接收到回调按钮内容：${buttonData}`)

      const interactionId = getInteractionId(session)
      if (session.qq && interactionId) {
        void session.qq.acknowledgeInteraction(interactionId, { code: 0 }).catch((error) => {
          logger.error('执行 acknowledgeInteraction 时出错', error)
        })
      }

      try {
        await session.execute(buttonData)
      } catch (error) {
        logger.error('执行回调按钮内容时出错', error)
      }
    })
  }

  ctx.command(`${config.command_name} [...args]`, '发送按钮菜单', { strictOptions: true })
    .action(async ({ session }, ...args: string[]) => {
      if (!session) return

      if (!isSupportedPlatform(session)) {
        await session.send('仅支持QQ官方平台使用本指令。')
        return
      }

      if (!config.send_sequence.length) {
        await session.send('当前未配置发送步骤。')
        return
      }

      try {
        await sendMenuSequence({
          baseDir,
          session,
          config,
          args,
          interactionId: getInteractionId(session),
        }, logger)
      } catch (error) {
        logger.error('处理指令时出错', error)
      }
    })
}
