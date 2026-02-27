/**
 * freeluna 插件类型定义
 */

/** API Key 配置条目 */
export interface ApiKeyEntry {
  /** API Key 令牌 */
  token: string
}

/** 插件配置类型 */
export interface Config {
  /** 基础路由前缀 */
  basePath: string
  /** 远程提供商注册表 URL（JSON 格式） */
  remoteIndexUrl: string
  /** API Key 列表，只有携带有效 Key 的请求才会被处理 */
  apiKeys: ApiKeyEntry[]
  /** 本地调试模式：使用本地 public/ 目录而非远程 URL */
  localDebug: boolean
  /** 详细日志输出 */
  loggerInfo: boolean
  /** 调试日志模式 */
  loggerDebug: boolean
}

/** 提供商注册表中的单条记录 */
export interface ProviderEntry {
  /** 提供商唯一名称，也作为模型 ID */
  name: string
  /** 提供商描述 */
  description?: string
  /** 提供商 JS 文件的远程 URL（生产环境使用） */
  jsUrl: string
  /** 本地调试时使用的相对路径（相对于 public/ 目录），不填则使用 jsUrl */
  localJsPath?: string
}

/** 提供商注册表（index.json）结构 */
export interface ProviderIndex {
  /** 版本号 */
  version?: string
  /** 更新时间 */
  updatedAt?: string
  /** 提供商列表 */
  providers: ProviderEntry[]
}

/**
 * 提供商 JS 模块必须导出的标准接口
 * 每个 JS 文件通过 vm 沙箱执行后，module.exports 应符合此接口
 */
export interface ProviderModule {
  /** 提供商名称 */
  name: string
  /** 提供商描述 */
  description?: string
  /**
   * 发送对话请求，返回 AI 回复文本
   * @param messages OpenAI 格式的消息数组
   * @param options 可选参数（如 model、temperature 等）
   * @returns AI 回复的纯文本内容
   */
  chat: (
    messages: ChatMessage[],
    options?: ChatOptions,
  ) => Promise<string>
}

/** OpenAI 兼容的聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 传给提供商 chat() 的可选参数 */
export interface ChatOptions {
  model?: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
  [key: string]: unknown
}

/** OpenAI 兼容的聊天请求体 */
export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  [key: string]: unknown
}

/** 已加载并缓存的提供商模块 */
export interface LoadedProvider {
  entry: ProviderEntry
  module: ProviderModule
}

/** 缓存条目 */
export interface CacheEntry<T> {
  data: T
  expireAt: number
}
