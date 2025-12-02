import { Context, Schema, h, Session } from 'koishi'
import { resolve } from 'path'
import { executeTemplate } from './utils'
import { } from '@koishijs/plugin-console'
import { } from '@koishijs/plugin-server'

export const name = 'dialogue-webui'

export const inject = ['database', 'console', 'server', 'logger']

declare module 'koishi' {
  interface Tables {
    dialogue: Dialogue
  }
}

declare module '@koishijs/console' {
  interface Events {
    'dialogue/list'(): Promise<Dialogue[]>
    'dialogue/create'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'dialogue/update'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'dialogue/delete'(id: number): Promise<{ success: boolean; message?: string }>
  }
}

export interface Dialogue {
  id: number
  question: string
  answer: string
  type: 'keyword' | 'regexp'
  scope: 'global' | 'group' | 'private',
  contextId: 'string', // 用于存储群组ID或用户ID
}

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  ctx.on("ready", async () => {
    ctx.model.extend('dialogue', {
      id: 'unsigned',
      question: 'string',
      answer: 'text',
      type: 'string',
      scope: 'string',
      contextId: 'string',
    }, {
      autoInc: true,
    })

    // 注册静态资源
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    // 获取问答列表
    ctx.console.addListener('dialogue/list', async () => {
      return await ctx.database.get('dialogue', {})
    })

    // 创建问答
    ctx.console.addListener('dialogue/create', async (dialogue) => {
      await ctx.database.create('dialogue', dialogue)
      return { success: true }
    })

    // 更新问答
    ctx.console.addListener('dialogue/update', async (dialogue) => {
      await ctx.database.upsert('dialogue', [dialogue])
      return { success: true }
    })

    // 删除问答
    ctx.console.addListener('dialogue/delete', async (id) => {
      await ctx.database.remove('dialogue', { id })
      return { success: true }
    })


    ctx.middleware(async (session, next) => {
      // 先获取所有全局问答
      const globalDialogues = await ctx.database.get('dialogue', { scope: 'global' })

      // 再根据上下文获取特定范围的问答
      let contextDialogues = []
      if (session.isDirect) { // 私聊
        const privateDialogues = await ctx.database.get('dialogue', { scope: 'private' })
        contextDialogues = privateDialogues.filter(d =>
          d.contextId.split(/,|，/).map(id => id.trim()).includes(session.userId)
        )
      } else if (session.channelId) { // 群聊
        const groupDialogues = await ctx.database.get('dialogue', { scope: 'group' })
        contextDialogues = groupDialogues.filter(d =>
          d.contextId.split(/,|，/).map(id => id.trim()).includes(session.channelId)
        )
      }

      // 合并并去重
      const dialogues = [...globalDialogues, ...contextDialogues]
      if (!dialogues.length) return next()

      for (const dialogue of dialogues) {
        const match = dialogue.type === 'regexp'
          ? new RegExp(dialogue.question).exec(session.content)
          : session.content === dialogue.question

        if (match) {
          // 解析并发送回复
          const result = await executeTemplate(dialogue.answer, ctx, this.config, session)
          await session.send(result)
          return // 匹配到第一个后即停止
        }
      }
      return next()
    })
  })
}