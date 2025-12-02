import { Context, Schema, h, Logger, Session } from 'koishi'
import { resolve } from 'node:path'
import '@koishijs/plugin-server'
import { Console } from '@koishijs/plugin-console'

export const name = 'dialogue-webui'

export const inject = {
  required: ['database', 'server', 'console'],
  optional: [],
}

const logger = new Logger(name)

declare module 'koishi' {
  interface Tables {
    dialogue: Dialogue
  }
  interface Context {
    console: Console
  }
}

// 单条问答的数据结构
export interface Dialogue {
  id: number
  keyword: string // 关键词
  answer: string  // 回复
  isRegex: boolean // 是否为正则表达式
  channelId: string // 所属频道 ID
  isGlobal: boolean // 是否为全局问答
}

export const usage = `
  # dialogue-webui
  一个允许通过 Web UI 自定义问答的插件。
  您可以在 Koishi 控制台的“插件配置”页面中找到 dialogue-webui 的管理界面。
`

export interface Config {
  prepositionMiddleware: boolean
}

export const Config: Schema<Config> = Schema.object({
  prepositionMiddleware: Schema.boolean().default(false).description('开启前置中间件模式后，关键词匹配将优先于其他指令执行。'),
})

export function apply(ctx: Context, config: Config) {
  // 扩展数据库表
  ctx.model.extend('dialogue', {
    id: 'unsigned',
    keyword: 'string',
    answer: 'text',
    isRegex: 'boolean',
    channelId: 'string',
    isGlobal: 'boolean',
  }, {
    autoInc: true,
  })

  ctx.console.addEntry({
    dev: resolve(__dirname, '../client/index.ts'),
    prod: resolve(__dirname, '../dist'),
  })

  // 获取所有问答
  ctx.server.get('/dialogue/list', async (koaCtx) => {
    try {
      const dialogues = await ctx.database.get('dialogue', {})
      koaCtx.body = { success: true, data: dialogues }
    } catch (error) {
      logger.error(error)
      koaCtx.body = { success: false, message: 'Failed to fetch dialogues.' }
      koaCtx.status = 500
    }
  })

  // 创建新问答
  ctx.server.post('/dialogue/create', async (koaCtx) => {
    try {
      const { keyword, answer, isRegex, channelId, isGlobal } = (koaCtx.request as any).body as Partial<Dialogue>
      if (!keyword || !answer) {
        koaCtx.body = { success: false, message: 'Keyword and answer are required.' }
        koaCtx.status = 400
        return
      }
      const newDialogue = await ctx.database.create('dialogue', {
        keyword,
        answer,
        isRegex: !!isRegex,
        channelId: isGlobal ? '' : channelId,
        isGlobal: !!isGlobal,
      })
      koaCtx.body = { success: true, data: newDialogue }
    } catch (error) {
      logger.error(error)
      koaCtx.body = { success: false, message: 'Failed to create dialogue.' }
      koaCtx.status = 500
    }
  })

  // 更新问答
  ctx.server.post('/dialogue/update', async (koaCtx) => {
    try {
      const { id, ...updates } = (koaCtx.request as any).body as Partial<Dialogue>
      if (!id) {
        koaCtx.body = { success: false, message: 'ID is required.' }
        koaCtx.status = 400
        return
      }
      await ctx.database.set('dialogue', id, updates)
      koaCtx.body = { success: true }
    } catch (error) {
      logger.error(error)
      koaCtx.body = { success: false, message: 'Failed to update dialogue.' }
      koaCtx.status = 500
    }
  })

  // 删除问答
  ctx.server.post('/dialogue/delete', async (koaCtx) => {
    try {
      const { id } = (koaCtx.request as any).body as { id: number }
      if (!id) {
        koaCtx.body = { success: false, message: 'ID is required.' }
        koaCtx.status = 400
        return
      }
      await ctx.database.remove('dialogue', [id])
      koaCtx.body = { success: true }
    } catch (error) {
      logger.error(error)
      koaCtx.body = { success: false, message: 'Failed to delete dialogue.' }
      koaCtx.status = 500
    }
  })


  const middleware = async (session: Session, next: () => Promise<void>) => {
    const dialogues = await ctx.database.get('dialogue', {
      $or: [
        { channelId: session.channelId, isGlobal: false },
        { isGlobal: true },
      ],
    })

    if (!dialogues.length) return next()

    const content = session.content.trim()

    for (const dialogue of dialogues) {
      const isMatch = dialogue.isRegex
        ? new RegExp(dialogue.keyword).test(content)
        : content === dialogue.keyword

      if (isMatch) {
        await sendAnswer(session, dialogue.answer)
        // 如果是前置中间件，匹配成功后不再继续执行
        if (config.prepositionMiddleware) return
      }
    }

    return next()
  }

  ctx.middleware(middleware, config.prepositionMiddleware)

  /**
   * 解析并发送回复
   * @param session 当前会话
   * @param answer 待发送的回复内容
   */
  async function sendAnswer(session: Session, answer: string) {
    // 正则匹配 [imag](...) 语法
    const imgRegex = /\[imag\]\((.*?)\)/g
    const elements: h[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = imgRegex.exec(answer)) !== null) {
      // 添加图片前的文本部分
      if (match.index > lastIndex) {
        elements.push(h.text(answer.slice(lastIndex, match.index)))
      }
      // 添加图片
      const imageUrl = match[1]
      elements.push(h.image(imageUrl))
      lastIndex = match.index + match[0].length
    }

    // 添加最后剩余的文本部分
    if (lastIndex < answer.length) {
      elements.push(h.text(answer.slice(lastIndex)))
    }

    // 发送解析后的消息
    await session.send(h('message', elements))
  }
}
