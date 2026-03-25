import fs, { FSWatcher } from 'node:fs'
import path from 'node:path'
import { Context, Schema } from 'koishi'
import { ensureTemplateDirs } from './files'
import type { PluginLogger } from './logger'
import type { MenuType, TemplateCandidate } from './types'

export const TEMPLATE_SCHEMA_KEY = 'qq-markdown-button.templates'
export const SEND_SEQUENCE_SCHEMA_KEY = 'qq-markdown-button.send-sequence'

function listJsonTemplates(baseDir: string, type: 'json' | 'markdown'): TemplateCandidate[] {
  const dirPath = path.join(baseDir, type)
  if (!fs.existsSync(dirPath)) return []

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
    .map((entry) => {
      const name = path.basename(entry.name, '.json')
      return {
        type,
        name,
        value: `${type}/${name}`,
        label: `${type}/${name}`,
      }
    })
}

function listRawTemplates(baseDir: string): TemplateCandidate[] {
  const dirPath = path.join(baseDir, 'raw')
  if (!fs.existsSync(dirPath)) return []

  const jsonNames = new Set<string>()
  const markdownNames = new Set<string>()

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const extName = path.extname(entry.name).toLowerCase()
    const baseName = path.basename(entry.name, extName)
    if (extName === '.json') {
      jsonNames.add(baseName)
    } else if (extName === '.md') {
      markdownNames.add(baseName)
    }
  }

  const candidates: TemplateCandidate[] = []
  for (const name of Array.from(jsonNames).sort((left, right) => left.localeCompare(right))) {
    if (!markdownNames.has(name)) continue
    candidates.push({
      type: 'raw',
      name,
      value: `raw/${name}`,
      label: `raw/${name}`,
    })
  }

  return candidates
}

function createTemplateSchema(candidates: TemplateCandidate[]): Schema<string> {
  if (!candidates.length) {
    return Schema.union([
      Schema.const('').description('当前目录下没有可用模板'),
    ])
  }

  return Schema.union(
    candidates.map((candidate) => Schema.const(candidate.value).description(candidate.label)),
  )
}

function createSendSequenceSchema(candidates: TemplateCandidate[]): Schema<string[]> {
  return Schema.array(createTemplateSchema(candidates))
    .role('table')
    .description('按顺序发送多个模板，支持排序和混合类型')
    .default([candidates[0]?.value ?? ''])
}

function scanTemplateCandidates(baseDir: string): TemplateCandidate[] {
  return [
    ...listJsonTemplates(baseDir, 'json'),
    ...listJsonTemplates(baseDir, 'markdown'),
    ...listRawTemplates(baseDir),
  ]
}

export function setupTemplateCatalog(
  ctx: Context,
  baseDir: string,
  logger: PluginLogger,
): () => void {
  ensureTemplateDirs(baseDir)

  const watcherList: FSWatcher[] = []
  let disposeDebounceTimer: (() => void) | undefined

  const refreshSchema = () => {
    const candidates = scanTemplateCandidates(baseDir)
    logger.debug('刷新模板候选项：', candidates.map((candidate) => candidate.value))
    ctx.schema.set(TEMPLATE_SCHEMA_KEY, createTemplateSchema(candidates))
    ctx.schema.set(SEND_SEQUENCE_SCHEMA_KEY, createSendSequenceSchema(candidates))
  }

  const scheduleRefresh = () => {
    if (disposeDebounceTimer) {
      disposeDebounceTimer()
    }
    disposeDebounceTimer = ctx.setTimeout(() => {
      disposeDebounceTimer = undefined
      refreshSchema()
    }, 150)
  }

  const watchDir = (type: MenuType) => {
    const dirPath = path.join(baseDir, type)
    try {
      const watcher = fs.watch(dirPath, () => {
        scheduleRefresh()
      })
      watcherList.push(watcher)
    } catch (error) {
      logger.error(`监听 ${dirPath} 目录时出错`, error)
    }
  }

  refreshSchema()
  watchDir('json')
  watchDir('markdown')
  watchDir('raw')

  return () => {
    for (const watcher of watcherList) {
      watcher.close()
    }
    if (disposeDebounceTimer) {
      disposeDebounceTimer()
    }
  }
}
