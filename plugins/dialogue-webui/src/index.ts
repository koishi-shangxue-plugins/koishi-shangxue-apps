import { Context, Schema, h } from 'koishi'
import { resolve } from 'path'
import { } from '@koishijs/plugin-console'
import { } from '@koishijs/plugin-server'

export const name = 'dialogue-webui'


export const inject = ['database', 'console', 'server']

// 定义数据库模型
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
  scope: 'global' | 'group' | 'private'
}

export interface Config { }

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  // 扩展数据库模型
  ctx.model.extend('dialogue', {
    id: 'unsigned',
    question: 'string',
    answer: 'text',
    type: 'string',
    scope: 'string',
  }, {
    autoInc: true,
  })

  // 注册静态资源
  ctx.console.addEntry({
    dev: resolve(__dirname, '../client/index.ts'),
    prod: resolve(__dirname, '../dist'),
  })

  // --- 后端 API ---

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


  // --- 消息处理中间件 ---
  ctx.middleware(async (session, next) => {
    const dialogues = await ctx.database.get('dialogue', {})
    for (const dialogue of dialogues) {
      const match = dialogue.type === 'regexp'
        ? new RegExp(dialogue.question).exec(session.content)
        : session.content === dialogue.question

      if (match) {
        // 解析并发送回复
        const elements = parseAnswer(dialogue.answer)
        await session.send(elements)
        return
      }
    }
    return next()
  })
}

/**
 * 解析包含自定义图片标签的回复字符串
 * @param answer - 数据库中存储的回复字符串
 * @returns Koishi 的消息元素数组
 */
function parseAnswer(answer: string) {
  const elements = []
  const regex = /\[imag\]\((.*?)\)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(answer)) !== null) {
    // 添加图片前的文本部分
    if (match.index > lastIndex) {
      elements.push(h.text(answer.substring(lastIndex, match.index)))
    }
    // 添加图片元素
    elements.push(h.image(match[1]))
    lastIndex = regex.lastIndex
  }

  // 添加最后一个图片标签后的文本部分
  if (lastIndex < answer.length) {
    elements.push(h.text(answer.substring(lastIndex)))
  }

  return elements
}
