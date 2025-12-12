import { Context, Schema, h, Session, User } from 'koishi'
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

declare module '@koishijs/plugin-console' {
  interface Events {
    'webdialogue/list'(): Promise<Dialogue[]>
    'webdialogue/create'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'webdialogue/update'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'webdialogue/delete'(id: number): Promise<{ success: boolean; message?: string }>
  }
}

// 过滤器操作符类型
export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'in'
  | 'notIn'

// 过滤器字段类型
export type FilterField =
  | 'userId'
  | 'channelId'
  | 'guildId'
  | 'selfId'
  | 'platform'
  | 'isDirect'
  | 'authority'
  | 'nickname'
  | 'username'
  | 'roles'

// 单个过滤条件
export interface FilterCondition {
  field: FilterField
  operator: FilterOperator
  value: string | number | boolean
}

// 过滤器组
export interface FilterGroup {
  logic: 'and' | 'or'
  connector?: 'and' | 'or'  // 与上一组的连接关系
  conditions: FilterCondition[]
}

export interface Dialogue {
  id: number
  question: string
  answer: string
  type: 'keyword' | 'regexp'
  // 新的过滤器系统
  filterGroups?: FilterGroup[]
  // 保留旧字段以兼容
  scope?: 'global' | 'group' | 'private'
  contextId?: string
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
      filterGroups: 'json',
      // 保留旧字段以兼容
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
      // 根据配置决定使用哪种消息内容
      const contentToMatch = config.useStrippedContent ? session.stripped.content : session.content
      if (!contentToMatch) { return next() }

      // 遍历所有对话规则
      for (const dialogue of dialogueCache) {
        // 检查过滤器条件
        const passesFilter = await checkFilterConditions(dialogue, session)
        if (!passesFilter) continue

        // 检查关键词匹配
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

    // 检查过滤器条件
    async function checkFilterConditions(dialogue: Dialogue, session: Session): Promise<boolean> {
      // 如果有新的过滤器系统
      if (dialogue.filterGroups && dialogue.filterGroups.length > 0) {
        // 第一个组的结果
        let result = await checkFilterGroup(dialogue.filterGroups[0], session)

        // 根据每个组的 connector 与前面的结果组合
        for (let i = 1; i < dialogue.filterGroups.length; i++) {
          const group = dialogue.filterGroups[i]
          const groupResult = await checkFilterGroup(group, session)

          if (group.connector === 'or') {
            result = result || groupResult
          } else {
            result = result && groupResult
          }
        }

        return result
      }

      // 兼容旧的 scope 系统
      if (dialogue.scope) {
        if (dialogue.scope === 'global') return true
        if (session.isDirect && dialogue.scope === 'private') {
          return dialogue.contextId?.split(/,|，/).map(id => id.trim()).includes(session.userId) || false
        }
        if (session.channelId && dialogue.scope === 'group') {
          return dialogue.contextId?.split(/,|，/).map(id => id.trim()).includes(session.channelId) || false
        }
        return false
      }

      // 没有任何过滤条件，默认通过
      return true
    }

    // 检查单个过滤器组
    async function checkFilterGroup(group: FilterGroup, session: Session): Promise<boolean> {
      if (group.conditions.length === 0) return true

      const results: boolean[] = []

      for (const condition of group.conditions) {
        const result = await checkCondition(condition, session)
        results.push(result)
      }

      // 根据逻辑关系返回结果
      return group.logic === 'and'
        ? results.every(r => r)
        : results.some(r => r)
    }

    // 检查单个条件
    async function checkCondition(condition: FilterCondition, session: Session): Promise<boolean> {
      let fieldValue: any

      // 获取字段值
      switch (condition.field) {
        case 'userId':
          fieldValue = session.userId
          break
        case 'channelId':
          fieldValue = session.channelId
          break
        case 'guildId':
          fieldValue = session.guildId
          break
        case 'selfId':
          fieldValue = session.selfId
          break
        case 'platform':
          fieldValue = session.platform
          break
        case 'isDirect':
          fieldValue = session.isDirect
          break
        case 'authority':
          // 需要观测用户字段
          try {
            await session.observeUser(['authority'] as Iterable<User.Field>)
            fieldValue = (session.user as any)?.authority
          } catch (e) {
            fieldValue = undefined
          }
          break
        case 'nickname':
          // 需要观测用户字段
          try {
            await session.observeUser(['name'] as Iterable<User.Field>)
            fieldValue = (session.user as any)?.name
          } catch (e) {
            fieldValue = undefined
          }
          break
        case 'username':
          fieldValue = session.username
          break
        case 'roles':
          fieldValue = session.event.member?.roles
          break
        default:
          return false
      }

      // 执行操作符比较
      return compareValues(fieldValue, condition.operator, condition.value)
    }

    // 比较值
    function compareValues(fieldValue: any, operator: FilterOperator, conditionValue: string | number | boolean): boolean {
      switch (operator) {
        case 'equals':
          // 特殊处理布尔值比较
          if (typeof fieldValue === 'boolean') {
            const boolValue = String(conditionValue).toLowerCase() === 'true'
            return fieldValue === boolValue
          }
          return fieldValue == conditionValue
        case 'notEquals':
          // 特殊处理布尔值比较
          if (typeof fieldValue === 'boolean') {
            const boolValue = String(conditionValue).toLowerCase() === 'true'
            return fieldValue !== boolValue
          }
          return fieldValue != conditionValue
        case 'contains':
          if (Array.isArray(fieldValue)) {
            return fieldValue.includes(conditionValue)
          }
          return String(fieldValue || '').includes(String(conditionValue))
        case 'notContains':
          if (Array.isArray(fieldValue)) {
            return !fieldValue.includes(conditionValue)
          }
          return !String(fieldValue || '').includes(String(conditionValue))
        case 'greaterThan':
          return Number(fieldValue) > Number(conditionValue)
        case 'lessThan':
          return Number(fieldValue) < Number(conditionValue)
        case 'greaterOrEqual':
          return Number(fieldValue) >= Number(conditionValue)
        case 'lessOrEqual':
          return Number(fieldValue) <= Number(conditionValue)
        case 'in':
          // conditionValue 应该是逗号分隔的字符串，支持全角、半角逗号
          const inList = String(conditionValue).split(/[,，]/).map(v => v.trim()).filter(v => v)
          return inList.includes(String(fieldValue))
        case 'notIn':
          // 支持全角、半角逗号
          const notInList = String(conditionValue).split(/[,，]/).map(v => v.trim()).filter(v => v)
          return !notInList.includes(String(fieldValue))
        default:
          return false
      }
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