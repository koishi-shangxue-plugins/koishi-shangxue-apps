import { send } from '@koishijs/client'

export interface FilterRule {
  type: 'userId' | 'channelId' | 'guildId' | 'platform'
  value: string
  reason?: string
}

export interface CommandRule {
  userId: string
  commands: string[]
  reason?: string
}

export interface Config {
  filterMode: 'blacklist' | 'whitelist'
  blacklist: FilterRule[]
  whitelist: FilterRule[]
  enableCommandFilter: boolean
  commandFilterMode?: 'blacklist' | 'whitelist'
  commandBlacklist: CommandRule[]
  commandWhitelist: CommandRule[]
  reregisterInterval: number
  logBlocked: boolean
  replyNoPermission?: boolean
}

export interface BlockLog {
  timestamp: number
  type: 'message' | 'command'
  userId: string
  channelId?: string
  guildId?: string
  platform?: string
  content: string
  reason: string
}

export interface Stats {
  todayMessageCount: number
  todayCommandCount: number
  topUsers: Array<{ userId: string; count: number }>
  topCommands: Array<{ command: string; count: number }>
}

export async function getConfig(): Promise<Config> {
  return await send('keyword-blocker/config')
}

export async function updateConfig(config: Partial<Config>): Promise<{ success: boolean; message: string }> {
  return await send('keyword-blocker/update-config', config)
}

export async function getCommands(): Promise<{ commands: string[] }> {
  return await send('keyword-blocker/commands')
}

export async function getLogs(params: {
  page?: number
  limit?: number
  type?: 'message' | 'command'
  userId?: string
}): Promise<{ total: number; logs: BlockLog[] }> {
  return await send('keyword-blocker/logs', params)
}

export async function clearLogs(): Promise<{ success: boolean }> {
  return await send('keyword-blocker/clear-logs')
}

export async function getStats(): Promise<Stats> {
  return await send('keyword-blocker/stats')
}
