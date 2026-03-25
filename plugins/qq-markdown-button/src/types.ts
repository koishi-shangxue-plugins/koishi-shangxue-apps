import { Session } from 'koishi'

export type MenuType = 'json' | 'markdown' | 'raw'

export interface Config {
  command_name: string
  file_name: string[]
  send_sequence: string[]
  Allow_INTERACTION_CREATE: boolean
  consoleinfo: boolean
}

export interface QQMessageApi {
  sendMessage(channelId: string, content: unknown): Promise<unknown>
  sendPrivateMessage(userId: string, content: unknown): Promise<unknown>
  acknowledgeInteraction(interactionId: string, data: { code: number }): Promise<unknown>
}

export interface QQGuildMessageApi {
  sendMessage(channelId: string, content: unknown): Promise<unknown>
}

export interface SendSequenceOptions {
  baseDir: string
  session: Session
  config: Config
  args: string[]
  interactionId: string
}

export interface TemplateCandidate {
  type: MenuType
  name: string
  value: string
  label: string
}

declare module 'koishi' {
  interface Session {
    qq?: QQMessageApi
    qqguild?: QQGuildMessageApi
  }
}
