

export interface ApiKeyEntry {

  token: string
}

export interface Config {

  basePath: string

  remoteIndexUrl: string

  apiKeys: ApiKeyEntry[]

  localDebug: boolean

  loggerInfo: boolean

  loggerDebug: boolean
}

export interface ProviderEntry {

  name: string

  description?: string

  jsUrl: string

  localJsPath?: string
}

export interface ProviderIndex {

  version?: string

  updatedAt?: string

  providers: ProviderEntry[]
}

export interface ProviderModule {

  name: string

  description?: string

  chat: (
    messages: ChatMessage[],
    options?: ChatOptions,
  ) => Promise<string>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model?: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
  [key: string]: unknown
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  [key: string]: unknown
}

export interface LoadedProvider {
  entry: ProviderEntry
  module: ProviderModule
}

export interface CacheEntry<T> {
  data: T
  expireAt: number
}
