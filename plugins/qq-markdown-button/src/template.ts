import fs from 'node:fs'
import path from 'node:path'
import { Session } from 'koishi'
import { Config, MenuType } from './types'

interface TemplatePaths {
  jsonFilePath: string
  markdownFilePath: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseTemplateRef(templateRef: string): { type: MenuType, name: string } {
  const separatorIndex = templateRef.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex >= templateRef.length - 1) {
    throw new Error(`模板引用格式无效：${templateRef}`)
  }

  const type = templateRef.slice(0, separatorIndex)
  const name = templateRef.slice(separatorIndex + 1)
  if (type !== 'json' && type !== 'markdown' && type !== 'raw') {
    throw new Error(`模板类型无效：${templateRef}`)
  }

  return { type, name }
}

function getTemplatePaths(baseDir: string, templateRef: string): TemplatePaths {
  const { type, name } = parseTemplateRef(templateRef)
  if (type === 'json') {
    return {
      jsonFilePath: path.join(baseDir, 'json', `${name}.json`),
      markdownFilePath: null,
    }
  }

  if (type === 'markdown') {
    return {
      jsonFilePath: path.join(baseDir, 'markdown', `${name}.json`),
      markdownFilePath: null,
    }
  }

  return {
    jsonFilePath: path.join(baseDir, 'raw', `${name}.json`),
    markdownFilePath: path.join(baseDir, 'raw', `${name}.md`),
  }
}

function getPlaceholderValue(
  key: string,
  variables: Record<string, unknown>,
  args: string[],
): string | undefined {
  if (/^\d+$/.test(key)) {
    const index = Number.parseInt(key, 10)
    return args[index] ?? 'undefined'
  }

  const paths = key.split('.')
  let current: unknown = variables

  for (const pathKey of paths) {
    if (!isRecord(current) || !(pathKey in current)) {
      return undefined
    }
    current = current[pathKey]
  }

  return current === undefined ? undefined : String(current)
}

function replacePlaceholders(
  data: unknown,
  variables: Record<string, unknown>,
  args: string[],
): unknown {
  if (typeof data === 'string') {
    return data.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
      const value = getPlaceholderValue(key, variables, args)
      return value === undefined ? `\${${key}}` : value
    })
  }

  if (Array.isArray(data)) {
    return data.map((item) => replacePlaceholders(item, variables, args))
  }

  if (isRecord(data)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      result[key] = replacePlaceholders(value, variables, args)
    }
    return result
  }

  return data
}

export function buildMenuMessage(
  baseDir: string,
  templateRef: string,
  session: Session,
  config: Config,
  interactionId: string,
  args: string[],
): unknown {
  const { jsonFilePath, markdownFilePath } = getTemplatePaths(baseDir, templateRef)
  const rawJsonData = fs.readFileSync(jsonFilePath, 'utf-8')
  const variables: Record<string, unknown> = {
    INTERACTION_CREATE: interactionId,
    session,
    config,
    args,
  }

  if (markdownFilePath) {
    // 原生 markdown 先替换 md 文件中的占位符。
    const markdownContent = fs.readFileSync(markdownFilePath, 'utf-8')
    variables.markdown = replacePlaceholders(markdownContent, variables, args)
  }

  const rawJsonObject: unknown = JSON.parse(rawJsonData)
  const replacedJsonObject = replacePlaceholders(rawJsonObject, variables, args)

  if (isRecord(replacedJsonObject)) {
    // 根据会话类型清理互斥字段。
    if (session.messageId) {
      delete replacedJsonObject.event_id
    } else {
      delete replacedJsonObject.msg_id
    }
  }

  return replacedJsonObject
}
