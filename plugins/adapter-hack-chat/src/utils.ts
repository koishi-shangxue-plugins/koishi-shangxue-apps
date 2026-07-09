import { Fragment, h } from 'koishi'

export function fragmentToText(content: Fragment): string {
  return typeof content === 'string' ? content : h.normalize(content).join('')
}

export function parseJson(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) return 'https://hack.chat'
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function createHackChatAvatarUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/favicon.ico`
}

export function createHackChatWebSocketUrl(baseUrl: string): string {
  const origin = normalizeBaseUrl(baseUrl)
  if (origin.startsWith('https://')) {
    return `wss://${origin.slice('https://'.length)}/chat-ws`
  }
  if (origin.startsWith('http://')) {
    return `ws://${origin.slice('http://'.length)}/chat-ws`
  }
  return `${origin}/chat-ws`
}
