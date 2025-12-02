import { Context, Schema, h, Session } from 'koishi'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { executeTemplate } from './utils'

import { } from '@koishijs/plugin-console'
import { } from '@koishijs/plugin-server'

export const name = 'dialogue-webui'

export const inject = ['database', 'console', 'server', 'logger']

export const usage = readFileSync(join(__dirname, "./../data/usage.md"), 'utf-8').split('\n').map(line => line.trimStart()).join('\n');

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
  contextId: string, // 用于存储群组ID或用户ID
}

export interface Config {
  prepositionMiddleware: boolean
}

export const Config: Schema<Config> = Schema.object({
  prepositionMiddleware: Schema.boolean().default(false).description('前置中间件模式<br>开启后，本插件 将优先于`其他中间件`执行。'),
})

export function apply(ctx: Context, config: Config) {
  ctx.on("ready", async () => {

    const logger = ctx.logger(name)
    // 对话缓存
    let dialogueCache: Dialogue[] = []

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

    // 初始加载数据
    await refreshDialogues()

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
      await refreshDialogues()
      return { success: true }
    })

    // 更新问答
    ctx.console.addListener('dialogue/update', async (dialogue) => {
      await ctx.database.upsert('dialogue', [dialogue])
      await refreshDialogues()
      return { success: true }
    })

    // 删除问答
    ctx.console.addListener('dialogue/delete', async (id) => {
      await ctx.database.remove('dialogue', { id })
      await refreshDialogues()
      return { success: true }
    })

    // 核心中间件
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

      if (!applicableDialogues.length) return next()

      for (const dialogue of applicableDialogues) {
        const match = dialogue.type === 'regexp'
          ? new RegExp(dialogue.question).exec(session.content)
          : session.content === dialogue.question

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
      dialogueCache = await ctx.database.get('dialogue', {})
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