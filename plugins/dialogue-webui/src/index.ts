import { Context, Schema, h, Session, User } from 'koishi'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { executeTemplate } from './utils'
import { registerImageUploadRoute } from './upload'

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


export interface FilterCondition {
  field: FilterField
  operator: FilterOperator
  value: string | number | boolean
  connector?: 'and' | 'or'  
}


export interface FilterGroup {
  connector?: 'and' | 'or'  
  conditions: FilterCondition[]
}

export interface Dialogue {
  id: number
  question: string
  answer: string
  type: 'keyword' | 'regexp'
  
  filterGroups?: FilterGroup[]
  
  scope?: 'global' | 'group' | 'private'
  contextId?: string
}

export interface Config {
  prepositionMiddleware: boolean
  useStrippedContent: boolean
  debug: boolean
  imagePasteSubdir: string
}

export const Config: Schema<Config> = Schema.object({
  useStrippedContent: Schema.boolean().default(true).description('使用净化后的消息匹配输入<br>开启后，将使用 `session.stripped.content` 进行匹配，可以忽略 at 前缀。'),
  prepositionMiddleware: Schema.boolean().default(false).description('前置中间件模式<br>开启后，本插件 将优先于`其他中间件`执行。'),
  debug: Schema.boolean().default(false).description('开启调试日志（仅用于排查问题）。'),
  imagePasteSubdir: Schema.string().default('default').description('粘贴图片存储子目录<br>实际路径：`data/dialogue-webui/对话/<子目录>/<问答id>/`'),
})

export function apply(ctx: Context, config: Config) {
  ctx.on("ready", async () => {

    const logger = ctx.logger(name)
    
    const disposeUpload = registerImageUploadRoute(ctx, config, {
      debug: (message) => {
        if (config.debug) logger.info(message)
      },
      warn: (message) => logger.warn(message),
    })
    ctx.on('dispose', () => disposeUpload())
    
    let dialogueCache: Dialogue[] = []

    ctx.model.extend('webdialogue', {
      id: 'unsigned',
      question: 'string',
      answer: 'text',
      type: 'string',
      filterGroups: 'json',
      
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

    
    ctx.console.addListener('webdialogue/list', async () => {
      return await ctx.database.get('webdialogue', {})
    })

    
    ctx.console.addListener('webdialogue/create', async (dialogue) => {
      await ctx.database.create('webdialogue', dialogue)
      await refreshDialogues()
      return { success: true }
    })

    
    ctx.console.addListener('webdialogue/update', async (dialogue) => {
      await ctx.database.upsert('webdialogue', [dialogue])
      await refreshDialogues()
      return { success: true }
    })

    
    ctx.console.addListener('webdialogue/delete', async (id) => {
      await ctx.database.remove('webdialogue', { id })
      await refreshDialogues()
      return { success: true }
    })

    const middleware = async (session: Session, next: () => any) => {
      
      const contentToMatch = config.useStrippedContent ? session.stripped.content : session.content
      if (!contentToMatch) { return next() }

      
      for (const dialogue of dialogueCache) {
        
        const passesFilter = await checkFilterConditions(dialogue, session)
        if (!passesFilter) continue

        
        const match = dialogue.type === 'regexp'
          ? new RegExp(dialogue.question).exec(contentToMatch)
          : contentToMatch === dialogue.question

        if (match) {
          
          const result = await executeTemplate(dialogue.answer, ctx, config, session, {
            warn: (message) => logger.warn(message),
          })
          await session.send(result)
          return 
        }
      }
      return next()
    }

    
    async function checkFilterConditions(dialogue: Dialogue, session: Session): Promise<boolean> {
      
      if (dialogue.filterGroups && dialogue.filterGroups.length > 0) {
        
        let result = await checkFilterGroup(dialogue.filterGroups[0], session)

        
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

      
      return true
    }

    
    async function checkFilterGroup(group: FilterGroup, session: Session): Promise<boolean> {
      if (group.conditions.length === 0) return true

      
      let result = await checkCondition(group.conditions[0], session)

      
      for (let i = 1; i < group.conditions.length; i++) {
        const condition = group.conditions[i]
        const conditionResult = await checkCondition(condition, session)

        if (condition.connector === 'or') {
          result = result || conditionResult
        } else {
          result = result && conditionResult
        }
      }

      return result
    }

    
    async function checkCondition(condition: FilterCondition, session: Session): Promise<boolean> {
      let fieldValue: any

      
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
          
          try {
            await session.observeUser(['authority'] as Iterable<User.Field>)
            
            
            const user = session.user as unknown
            if (user && typeof user === 'object' && 'authority' in user) {
              const authority = (user as { authority?: unknown }).authority
              fieldValue = typeof authority === 'number' ? authority : Number(authority)
            } else {
              fieldValue = undefined
            }
          } catch (e) {
            fieldValue = undefined
          }
          break
        case 'nickname':
          
          try {
            await session.observeUser(['name'] as Iterable<User.Field>)
            const user = session.user as unknown
            if (user && typeof user === 'object' && 'name' in user) {
              const name = (user as { name?: unknown }).name
              fieldValue = typeof name === 'string' ? name : name == null ? undefined : String(name)
            } else {
              fieldValue = undefined
            }
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

      
      return compareValues(fieldValue, condition.operator, condition.value)
    }

    
    function compareValues(fieldValue: any, operator: FilterOperator, conditionValue: string | number | boolean): boolean {
      switch (operator) {
        case 'equals':
          
          if (typeof fieldValue === 'boolean') {
            const boolValue = String(conditionValue).toLowerCase() === 'true'
            return fieldValue === boolValue
          }
          return fieldValue == conditionValue
        case 'notEquals':
          
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
          
          const inList = String(conditionValue).split(/[,，]/).map(v => v.trim()).filter(v => v)
          return inList.includes(String(fieldValue))
        case 'notIn':
          
          const notInList = String(conditionValue).split(/[,，]/).map(v => v.trim()).filter(v => v)
          return !notInList.includes(String(fieldValue))
        default:
          return false
      }
    }

    
    async function refreshDialogues() {
      dialogueCache = await ctx.database.get('webdialogue', {})
      if (dialogueCache.length > 0) {
        logger.info(`插件已启动，成功加载 ${dialogueCache.length} 条对话。`)
      }
    }

    ctx.middleware(middleware, config.prepositionMiddleware)
    ctx.on('dispose', () => {
      dialogueCache = [] 
    })
  })
}
