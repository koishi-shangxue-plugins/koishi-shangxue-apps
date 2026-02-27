import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import type { Config, ProviderIndex, ProviderEntry, ProviderModule, LoadedProvider, CacheEntry } from './types'
import { logInfo, logDebug, loggerError } from './logger'

// 提供商注册表缓存
let indexCache: CacheEntry<ProviderIndex> | null = null

// 已加载的提供商模块缓存（key: provider name）
const moduleCache = new Map<string, CacheEntry<ProviderModule>>()

/**
 * 清除所有缓存（插件卸载时调用）
 */
export function clearConfigCache() {
  indexCache = null
  moduleCache.clear()
  logInfo('[freeluna] 所有缓存已清除')
}

/**
 * 从远程 URL 拉取文本内容
 */
async function fetchRemoteText(url: string): Promise<string> {
  logInfo('[freeluna] 远程拉取:', url)
  const res = await fetch(url, {
    headers: { 'Accept': '*/*' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.text()
}

/**
 * 从本地 public/ 目录读取文件（相对路径）
 */
function readLocalFile(relPath: string): string {
  const localPath = resolve(__dirname, '../public', relPath)
  logInfo('[freeluna] 本地调试，读取:', localPath)
  return readFileSync(localPath, 'utf-8')
}

/**
 * 加载提供商注册表（index.json）
 */
export async function loadProviderIndex(config: Config): Promise<ProviderIndex | null> {
  // 检查缓存
  if (indexCache && config.cacheTtl > 0 && Date.now() < indexCache.expireAt) {
    logDebug('[freeluna] 使用缓存的注册表')
    return indexCache.data
  }

  try {
    // 本地调试模式读本地文件，否则拉取远程
    const text = config.localDebug
      ? readLocalFile('index.json')
      : await fetchRemoteText(config.remoteIndexUrl)

    const parsed = JSON.parse(text) as ProviderIndex
    logInfo('[freeluna] 注册表加载成功，提供商数量:', parsed.providers?.length ?? 0)

    if (config.cacheTtl > 0) {
      indexCache = { data: parsed, expireAt: Date.now() + config.cacheTtl * 1000 }
    }
    return parsed
  } catch (err) {
    loggerError('[freeluna] 加载注册表失败:', err instanceof Error ? err.message : err)
    // 降级使用过期缓存
    if (indexCache) {
      logInfo('[freeluna] 降级使用过期注册表缓存')
      return indexCache.data
    }
    return null
  }
}

/**
 * 在 vm 沙箱中执行提供商 JS，返回其 module.exports
 * JS 文件应使用 CommonJS 风格：module.exports = { name, chat }
 */
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

/**
 * 加载单个提供商的 JS 模块
 * 本地调试时优先使用 entry.localJsPath（相对于 public/），否则使用 entry.jsUrl
 */
async function loadProviderModule(entry: ProviderEntry, config: Config): Promise<ProviderModule> {
  // 检查模块缓存
  const cached = moduleCache.get(entry.name)
  if (cached && config.cacheTtl > 0 && Date.now() < cached.expireAt) {
    logDebug('[freeluna] 使用缓存的提供商模块:', entry.name)
    return cached.data
  }

  let jsCode: string

  if (config.localDebug) {
    // 本地调试：优先用 localJsPath，没有则报错提示
    const localPath = entry.localJsPath
    if (!localPath) {
      throw new Error(
        `提供商 "${entry.name}" 未配置 localJsPath，本地调试模式下无法加载。` +
        `请在 index.json 中为该提供商添加 localJsPath 字段（相对于 public/ 目录）`
      )
    }
    jsCode = readLocalFile(localPath)
  } else {
    // 生产模式：使用远程 jsUrl
    jsCode = await fetchRemoteText(entry.jsUrl)
  }

  logDebug('[freeluna] 执行提供商 JS:', entry.name, '代码长度:', jsCode.length)
  const mod = executeProviderJs(jsCode, entry.name)

  if (config.cacheTtl > 0) {
    moduleCache.set(entry.name, { data: mod, expireAt: Date.now() + config.cacheTtl * 1000 })
  }
  return mod
}

/**
 * 按名称查找并加载单个提供商模块
 */
export async function findProvider(name: string, config: Config): Promise<LoadedProvider | null> {
  const index = await loadProviderIndex(config)
  if (!index) return null

  const entry = index.providers.find(p => p.name === name)
  if (!entry) return null

  try {
    const mod = await loadProviderModule(entry, config)
    return { entry, module: mod }
  } catch (err) {
    loggerError(`[freeluna] 提供商 "${name}" 加载失败:`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 加载所有提供商模块（注册表 + 各 JS）
 */
export async function loadAllProviders(config: Config): Promise<LoadedProvider[]> {
  const index = await loadProviderIndex(config)
  if (!index || index.providers.length === 0) return []

  const results: LoadedProvider[] = []
  for (const entry of index.providers) {
    try {
      const mod = await loadProviderModule(entry, config)
      results.push({ entry, module: mod })
      logInfo('[freeluna] 提供商加载成功:', entry.name)
    } catch (err) {
      loggerError(`[freeluna] 提供商 "${entry.name}" 加载失败:`, err instanceof Error ? err.message : err)
    }
  }
  return results
}
