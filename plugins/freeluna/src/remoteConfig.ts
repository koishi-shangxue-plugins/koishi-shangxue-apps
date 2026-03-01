import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import type { Context } from 'koishi'
import type { } from '@koishijs/plugin-notifier'
import type { Config, ProviderIndex, ProviderEntry, ProviderModule, LoadedProvider } from './types'
import { logInfo, logDebug, loggerError } from './logger'

declare module 'koishi' {
  interface Context {
    notifier: any
  }
}

let indexCache: ProviderIndex | null = null

const moduleCache = new Map<string, ProviderModule>()

export function clearConfigCache() {
  indexCache = null
  moduleCache.clear()
  logInfo('所有缓存已清除')
}

async function fetchRemoteText(url: string): Promise<string> {
  logInfo('远程拉取:', url)
  const res = await fetch(url, {
    headers: { 'Accept': '*/*' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.text()
}

function readLocalFile(relPath: string): string {
  const localPath = resolve(__dirname, '../public', relPath)
  return readFileSync(localPath, 'utf-8')
}

export async function loadProviderIndex(ctx: Context, config: Config): Promise<ProviderIndex | null> {

  if (indexCache) {
    logDebug('使用缓存的注册表')
    return indexCache
  }

  try {
    const text = config.localDebug
      ? readLocalFile('index.json')
      : await fetchRemoteText(config.remoteIndexUrl)

    const parsed = JSON.parse(text) as ProviderIndex
    const providerCount = parsed.providers?.length ?? 0

    const notifier = ctx.notifier.create()
    notifier.update(`FreeLuna 注册表加载成功，共 ${providerCount} 个提供商`)

    indexCache = parsed
    return parsed
  } catch (err) {
    loggerError('加载注册表失败:', err instanceof Error ? err.message : err)
    loggerError('如遇问题请重启插件重新加载配置')
    return null
  }
}

function executeProviderJs(jsCode: string, providerName: string): ProviderModule {
  const moduleObj = { exports: {} as ProviderModule }
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    fetch,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    AbortSignal,
    JSON,
    Error,
    URL,
    Buffer,
  }
  vm.createContext(sandbox)

  const script = new vm.Script(jsCode, { filename: `${providerName}.js` })
  script.runInContext(sandbox)

  const mod = moduleObj.exports
  if (typeof mod.chat !== 'function') {
    throw new Error(`提供商 JS "${providerName}" 未导出 chat 函数`)
  }
  return mod
}

async function loadProviderModule(entry: ProviderEntry, config: Config): Promise<ProviderModule> {

  const cached = moduleCache.get(entry.name)
  if (cached) {
    logDebug('使用缓存的提供商模块:', entry.name)
    return cached
  }

  let jsCode: string

  if (config.localDebug) {

    const localPath = entry.localJsPath
    if (!localPath) {
      throw new Error(
        `提供商 "${entry.name}" 未配置 localJsPath，本地调试模式下无法加载。` +
        `请在 index.json 中为该提供商添加 localJsPath 字段（相对于 public/ 目录）`
      )
    }
    jsCode = readLocalFile(localPath)
  } else {

    jsCode = await fetchRemoteText(entry.jsUrl)
  }

  const mod = executeProviderJs(jsCode, entry.name)

  moduleCache.set(entry.name, mod)
  return mod
}

export async function findProvider(ctx: Context, name: string, config: Config): Promise<LoadedProvider | null> {
  const index = await loadProviderIndex(ctx, config)
  if (!index) return null

  const entry = index.providers.find(p => p.name === name)
  if (!entry) return null

  try {
    const mod = await loadProviderModule(entry, config)
    return { entry, module: mod }
  } catch (err) {
    loggerError(`提供商 "${name}" 加载失败:`, err instanceof Error ? err.message : err)
    return null
  }
}

export async function loadAllProviders(ctx: Context, config: Config): Promise<LoadedProvider[]> {
  const index = await loadProviderIndex(ctx, config)
  if (!index || index.providers.length === 0) return []

  const results: LoadedProvider[] = []
  for (const entry of index.providers) {
    try {
      const mod = await loadProviderModule(entry, config)
      results.push({ entry, module: mod })
    } catch (err) {
      loggerError(`提供商 "${entry.name}" 加载失败:`, err instanceof Error ? err.message : err)
    }
  }
  return results
}
