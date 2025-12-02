import { Context, Schema, h, Session } from 'koishi'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { executeTemplate } from './utils'

import { } from '@koishijs/plugin-console'
import { } from '@koishijs/plugin-server'

export const name = 'dialogue-webui'

export const inject = [
  "database",
  "console",
  "server",
  "logger"
]

export const usage = readFileSync(join(__dirname, "./../data/usage.md"), 'utf-8').split('\n').map(line => line.trimStart()).join('\n');

declare module 'koishi' {
  interface Tables {
    webdialogue: Dialogue
  }
}

declare module '@koishijs/console' {
  interface Events {
    'webdialogue/list'(): Promise<Dialogue[]>
    'webdialogue/create'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'webdialogue/update'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'webdialogue/delete'(id: number): Promise<{ success: boolean; message?: string }>
  }
}

export interface Dialogue {
  id: number
  question: string
  answer: string
  type: 'keyword' | 'regexp'
  scope: 'global' | 'group' | 'private',
  contextId: string,
}

export interface Config {
  prepositionMiddleware: boolean
  useStrippedContent: boolean
}

export const Config: Schema<Config> = Schema.object({
  useStrippedContent: Schema.boolean().default(true).description('使用净化后的消息匹配输入<br>开启后，将使用 `session.stripped.content` 进行匹配，可以忽略 at 前缀。'),
  prepositionMiddleware: Schema.boolean().default(false).description('前置中间件模式<br>开启后，本插件 将优先于`其他中间件`执行。'),
})

export function apply(ctx: Context, config: Config) {
  ctx.on("ready", async () => {

    const logger = ctx.logger(name)
    // 对话缓存
    let dialogueCache: Dialogue[] = []

    ctx.model.extend('webdialogue', {
      id: 'unsigned',
      question: 'string',
      answer: 'text',
      type: 'string',
      scope: 'string',
      contextId: 'string',
    }, {
      autoInc: true,
    })

    await refreshDialogues()

    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    // 获取问答列表
    ctx.console.addListener('webdialogue/list', async () => {
      return await ctx.database.get('webdialogue', {})
    })

    // 创建问答
    ctx.console.addListener('webdialogue/create', async (dialogue) => {
      await ctx.database.create('webdialogue', dialogue)
      await refreshDialogues()
      return { success: true }
    })

    // 更新问答
    ctx.console.addListener('webdialogue/update', async (dialogue) => {
      await ctx.database.upsert('webdialogue', [dialogue])
      await refreshDialogues()
      return { success: true }
    })

    // 删除问答
    ctx.console.addListener('webdialogue/delete', async (id) => {
      await ctx.database.remove('webdialogue', { id })
      await refreshDialogues()
      return { success: true }
    })

    const middleware = async (session: Session, next: () => any) => {
      // 从缓存中过滤出当前会话适用的对话规则
      const applicableDialogues = dialogueCache.filter(d => {
        if (d.scope === 'global') return true
        if (session.isDirect && d.scope === 'private') {
          return d.contextId.split(/,|，/).map(id => id.trim()).includes(session.userId)
        }
        if (session.channelId && d.scope === 'group') {
          return d.contextId.split(/,|，/).map(id => id.trim()).includes(session.channelId)
        }
        return false
      })

      if (!applicableDialogues.length) { return next() }

      // 根据配置决定使用哪种消息内容
      const contentToMatch = config.useStrippedContent ? session.stripped.content : session.content
      if (!contentToMatch) { return next() }

      for (const dialogue of applicableDialogues) {
        const match = dialogue.type === 'regexp'
          ? new RegExp(dialogue.question).exec(contentToMatch)
          : contentToMatch === dialogue.question

        if (match) {
          // 解析并发送回复
          const result = await executeTemplate(dialogue.answer, ctx, config, session)
          await session.send(result)
          return // 匹配到第一个后即停止
        }
      }
      return next()
    }

    // 刷新对话缓存的函数
    async function refreshDialogues() {
      dialogueCache = await ctx.database.get('webdialogue', {})
      if (dialogueCache.length > 0) {
        logger.info(`插件已启动，成功加载 ${dialogueCache.length} 条对话。`)
      }
    }

    ctx.middleware(middleware, config.prepositionMiddleware)
    ctx.on('dispose', () => {
      dialogueCache = [] // 清空缓存
    })
  })
}