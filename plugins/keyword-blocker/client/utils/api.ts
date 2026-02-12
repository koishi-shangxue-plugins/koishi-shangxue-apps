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

export interface WebUIConfig {
  filterMode: 'blacklist' | 'whitelist'
  blacklist: FilterRule[]
  whitelist: FilterRule[]
  enableCommandFilter: boolean
  commandFilterMode: 'blacklist' | 'whitelist'
  commandBlacklist: CommandRule[]
  commandWhitelist: CommandRule[]
  replyNoPermission: boolean
}

// 获取配置
export const getConfig = () => send<WebUIConfig>('keyword-blocker/config')

// 更新配置
export const updateConfig = (config: Partial<WebUIConfig>) =>
  send<void>('keyword-blocker/update-config', config)

// 获取指令列表
export const getCommands = () => send<{ commands: string[] }>('keyword-blocker/commands')
