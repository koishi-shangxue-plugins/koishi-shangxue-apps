import { send } from '@koishijs/client'

export interface FilterRule {
  type: 'userId' | 'channelId' | 'guildId' | 'platform'
  value: string
  reason?: string
}

export interface CommandRule {
  type: 'userId' | 'channelId' | 'guildId' | 'platform'
  value: string
  commands: string[]
  reason?: string
  replyNoPermission?: boolean
  replyMessage?: string
}

export interface WebUIConfig {
  filterMode: 'blacklist' | 'whitelist'
  blacklist: FilterRule[]
  whitelist: FilterRule[]
  enableCommandFilter: boolean
  commandFilterMode: 'blacklist' | 'whitelist'
  commandBlacklist: CommandRule[]
  commandWhitelist: CommandRule[]
}

// 获取配置
export const getConfig = (): Promise<WebUIConfig> => (send as any)('keyword-blocker/config')

// 更新配置
export const updateConfig = (config: Partial<WebUIConfig>): Promise<void> =>
  (send as any)('keyword-blocker/update-config', config)

// 获取指令列表
export const getCommands = (): Promise<{ commands: string[] }> => (send as any)('keyword-blocker/commands')
