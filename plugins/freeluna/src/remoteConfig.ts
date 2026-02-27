import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import type { Config, ProviderIndex, ProviderEntry, ProviderModule, LoadedProvider } from './types'
import { logInfo, logDebug, loggerError } from './logger'

// 提供商注册表（启动时加载一次，永久缓存）
let indexCache: ProviderIndex | null = null

// 已加载的提供商模块（启动时加载一次，永久缓存，key: provider name）
const moduleCache = new Map<string, ProviderModule>()

/**
 * 清除所有缓存（插件卸载/重启时调用）
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
 * 插件启动时调用一次，结果永久缓存直到插件卸载
 */
export async function loadProviderIndex(config: Config): Promise<ProviderIndex | null> {
  // 已有缓存直接返回
  if (indexCache) {
    logDebug('[freeluna] 使用缓存的注册表')
    return indexCache
  }

  try {
    const text = config.localDebug
      ? readLocalFile('index.json')
      : await fetchRemoteText(config.remoteIndexUrl)

    const parsed = JSON.parse(text) as ProviderIndex
    logInfo('[freeluna] 注册表加载成功，提供商数量:', parsed.providers?.length ?? 0)

    indexCache = parsed
    return parsed
  } catch (err) {
    loggerError('[freeluna] 加载注册表失败:', err instanceof Error ? err.message : err)
    loggerError('[freeluna] 如遇问题请重启插件重新加载配置')
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
 * 结果永久缓存直到插件卸载
 */
async function loadProviderModule(entry: ProviderEntry, config: Config): Promise<ProviderModule> {
  // 已有缓存直接返回
  const cached = moduleCache.get(entry.name)
  if (cached) {
    logDebug('[freeluna] 使用缓存的提供商模块:', entry.name)
    return cached
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

  moduleCache.set(entry.name, mod)
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
 * 通常在插件启动时调用，预热缓存
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
