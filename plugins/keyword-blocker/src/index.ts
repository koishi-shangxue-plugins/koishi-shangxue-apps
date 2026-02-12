import { Context, Schema } from 'koishi'
import { resolve } from 'path'

import { Console } from '@koishijs/console'
import { } from '@koishijs/plugin-console'

export const name = 'keyword-blocker'
export const filter = false
export const reusable = true
export const inject = {
  required: ['console'],
}
export const usage = `
---
关键词屏蔽插件 - 支持消息级和指令级过滤
`

declare module 'koishi' {
  interface Context {
    console: Console
  }
}

interface FilterRule {
  type: 'userId' | 'channelId' | 'guildId' | 'platform'
  value: string
  reason?: string
}

interface CommandRule {
  userId: string
  commands: string[]
  reason?: string
}

interface BlockLog {
  timestamp: number
  type: 'message' | 'command'
  userId: string
  channelId?: string
  guildId?: string
  platform?: string
  content: string
  reason: string
}

interface Stats {
  todayMessageCount: number
  todayCommandCount: number
  topUsers: Array<{ userId: string; count: number }>
  topCommands: Array<{ command: string; count: number }>
}

// WebUI 配置（存储在内存中，通过 WebUI 管理）
interface WebUIConfig {
  filterMode: 'blacklist' | 'whitelist'
  blacklist: FilterRule[]
  whitelist: FilterRule[]
  enableCommandFilter: boolean
  commandFilterMode: 'blacklist' | 'whitelist'
  commandBlacklist: CommandRule[]
  commandWhitelist: CommandRule[]
  replyNoPermission: boolean
}

// Koishi 配置项（仅基础配置）
export interface Config {
  reregisterInterval: number
  logBlocked: boolean
}

export const Config: Schema<Config> = Schema.object({
  reregisterInterval: Schema.number()
    .description('重新注册中间件的间隔时间（毫秒）。越小优先级越稳定，但性能开销越大。')
    .default(100).min(50).max(5000),
  logBlocked: Schema.boolean()
    .description('记录被屏蔽的消息和指令')
    .default(false),
})

// 声明 Console 事件类型
declare module '@koishijs/plugin-console' {
  interface Events {
    'keyword-blocker/config'(): WebUIConfig & { reregisterInterval: number; logBlocked: boolean }
    'keyword-blocker/update-config'(config: Partial<WebUIConfig>): { success: boolean; message: string }
    'keyword-blocker/commands'(): { commands: string[] }
    'keyword-blocker/logs'(params: { page?: number; limit?: number; type?: 'message' | 'command'; userId?: string }): { total: number; logs: BlockLog[] }
    'keyword-blocker/clear-logs'(): { success: boolean }
    'keyword-blocker/stats'(): Stats
  }
}

// 判断是否应该过滤指令
function shouldFilterCommand(userId: string, commandName: string, webConfig: WebUIConfig): boolean {
  if (!webConfig.enableCommandFilter) {
    return false
  }

  // 通配符匹配函数
  const matchPattern = (pattern: string, text: string): boolean => {
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符
      .replace(/\*/g, '.*')  // * 转换为 .*
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(text)
  }

  if (webConfig.commandFilterMode === 'blacklist') {
    // 黑名单模式：如果用户在黑名单中且指令匹配，则屏蔽
    return webConfig.commandBlacklist.some(rule => {
      if (rule.userId !== userId) {
        return false
      }
      return rule.commands.some(pattern => matchPattern(pattern, commandName))
    })
  }

  if (webConfig.commandFilterMode === 'whitelist') {
    // 白名单模式：如果用户不在白名单中或指令不匹配，则屏蔽
    const userRule = webConfig.commandWhitelist.find(rule => rule.userId === userId)

    if (!userRule) {
      // 用户不在白名单中，屏蔽所有指令
      return true
    }

    // 用户在白名单中，检查指令是否匹配
    const isAllowed = userRule.commands.some(pattern => matchPattern(pattern, commandName))
    return !isAllowed
  }

  return false
}

// 判断是否应该过滤 session
function shouldFilterSession(session: any, webConfig: WebUIConfig): boolean {
  const userId = session.userId || session.event?.user?.id
  const channelId = session.channelId || session.event?.channel?.id
  const guildId = session.guildId || session.event?.guild?.id
  const platform = session.platform

  if (webConfig.filterMode === 'blacklist') {
    // 黑名单模式：如果匹配黑名单中的任何规则，则屏蔽
    return webConfig.blacklist.some(rule => {
      switch (rule.type) {
        case 'userId':
          return userId && rule.value === userId
        case 'channelId':
          return channelId && rule.value === channelId
        case 'guildId':
          return guildId && rule.value === guildId
        case 'platform':
          return platform && rule.value === platform
        default:
          return false
      }
    })
  }

  if (webConfig.filterMode === 'whitelist') {
    // 白名单模式：如果不匹配白名单中的任何规则，则屏蔽
    // 如果白名单为空，则屏蔽所有
    if (webConfig.whitelist.length === 0) {
      return true
    }

    return !webConfig.whitelist.some(rule => {
      switch (rule.type) {
        case 'userId':
          return userId && rule.value === userId
        case 'channelId':
          return channelId && rule.value === channelId
        case 'guildId':
          return guildId && rule.value === guildId
        case 'platform':
          return platform && rule.value === platform
        default:
          return false
      }
    })
  }

  return false
}

export function apply(ctx: Context, config: Config) {
  ctx.logger.info('启用关键词屏蔽插件')
  ctx.logger.info('中间件重新注册间隔: %d ms', config.reregisterInterval)

  // WebUI 配置（存储在内存中，通过 WebUI 管理）
  let webConfig: WebUIConfig = {
    filterMode: 'blacklist',
    blacklist: [],
    whitelist: [],
    enableCommandFilter: false,
    commandFilterMode: 'blacklist',
    commandBlacklist: [],
    commandWhitelist: [],
    replyNoPermission: true
  }

  // 日志存储
  const blockLogs: BlockLog[] = []
  const MAX_LOGS = 1000

  // 添加日志
  const addLog = (log: BlockLog) => {
    blockLogs.unshift(log)
    if (blockLogs.length > MAX_LOGS) {
      blockLogs.pop()
    }
  }

  // 标记插件是否已启用
  let isActive = true
  let currentDispose: (() => void) | null = null
  let reregisterTimer: NodeJS.Timeout | null = null

  // 注册中间件的函数
  const registerMiddleware = () => {
    // 如果已经有中间件，先注销
    if (currentDispose) {
      currentDispose()
    }

    // 注册新的前置中间件
    currentDispose = ctx.root.middleware((session, next) => {
      if (!isActive) {
        return next()
      }

      // 黑白名单过滤逻辑
      if (shouldFilterSession(session, webConfig)) {
        // 根据配置决定是否输出日志
        if (config.logBlocked) {
          const messageContent = session.content || session.elements?.map(e => e.toString()).join('') || '[无内容]'
          const userId = session.userId || session.event?.user?.id || '未知'
          const channelId = session.channelId || session.event?.channel?.id || '未知'
          const guildId = session.guildId || session.event?.guild?.id || '未知'
          const platform = session.platform || '未知'
          ctx.logger.info('屏蔽消息 - 用户:%s 频道:%s 群组:%s 平台:%s 内容:"%s"',
            userId, channelId, guildId, platform, messageContent)

          // 添加到日志
          addLog({
            timestamp: Date.now(),
            type: 'message',
            userId,
            channelId,
            guildId,
            platform,
            content: messageContent,
            reason: '匹配过滤规则'
          })
        }

        // 清空消息内容，让后续插件无法获取实际内容
        session.content = ''
        session.elements = []
        if (session.event && session.event.message) {
          session.event.message = { content: '', elements: [] } as any
        }

        // 直接返回，不调用 next()，完全阻止消息传递
        return
      }

      return next()
    }, true) // prepend 确保最先执行
  }

  // 启动轮询：不断重新注册中间件
  const startReregisterLoop = () => {
    // 立即注册一次
    registerMiddleware()
    ctx.logger.info('关键词屏蔽中间件已注册，开始轮询重新注册（间隔 %d ms）', config.reregisterInterval)

    // 设置定时器，不断重新注册
    reregisterTimer = setInterval(() => {
      if (isActive) {
        registerMiddleware()
      }
    }, config.reregisterInterval)
  }

  // 启动轮询
  startReregisterLoop()

  // 注册指令级过滤
  ctx.before('command/execute', (argv) => {
    const { session, command } = argv

    if (!session || !command) {
      return
    }

    const userId = session.userId || session.event?.user?.id
    if (!userId) {
      return
    }

    const commandName = command.name
    const shouldBlock = shouldFilterCommand(userId, commandName, webConfig)

    if (shouldBlock) {
      if (config.logBlocked) {
        ctx.logger.info('屏蔽指令 - 用户:%s 指令:%s', userId, commandName)

        // 添加到日志
        addLog({
          timestamp: Date.now(),
          type: 'command',
          userId,
          channelId: session.channelId,
          guildId: session.guildId,
          platform: session.platform,
          content: commandName,
          reason: '匹配指令过滤规则'
        })
      }

      if (webConfig.replyNoPermission) {
        return '你没有权限使用此指令'
      }

      // 不回复消息，静默拦截
      return ''
    }
  })

  // HTTP API 路由
  ctx.console.addEntry({
    dev: resolve(__dirname, '../client/index.ts'),
    prod: resolve(__dirname, '../dist'),
  })

  // 获取配置
  ctx.console.addListener('keyword-blocker/config', () => {
    return {
      ...webConfig,
      reregisterInterval: config.reregisterInterval,
      logBlocked: config.logBlocked
    }
  })

  // 更新配置
  ctx.console.addListener('keyword-blocker/update-config', (newConfig) => {
    try {
      // 更新 WebUI 配置
      Object.assign(webConfig, newConfig)

      ctx.logger.info('配置已更新')
      ctx.logger.info('消息过滤模式: %s，规则数: %d', webConfig.filterMode,
        webConfig.filterMode === 'blacklist' ? webConfig.blacklist.length : webConfig.whitelist.length)

      if (webConfig.enableCommandFilter) {
        ctx.logger.info('指令过滤已启用，模式: %s，规则数: %d', webConfig.commandFilterMode,
          webConfig.commandFilterMode === 'blacklist' ? webConfig.commandBlacklist.length : webConfig.commandWhitelist.length)
      }

      return { success: true, message: '配置已更新' }
    } catch (error) {
      ctx.logger.error('更新配置失败:', error)
      return { success: false, message: error.message }
    }
  })

  // 获取已注册指令列表
  ctx.console.addListener('keyword-blocker/commands', () => {
    const commands: string[] = []
    ctx.root.$commander._commandList.forEach((cmd) => {
      commands.push(cmd.name)
    })
    return { commands }
  })

  // 获取日志
  ctx.console.addListener('keyword-blocker/logs', ({ page = 1, limit = 20, type, userId }) => {
    let filteredLogs = blockLogs

    if (type) {
      filteredLogs = filteredLogs.filter(log => log.type === type)
    }

    if (userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === userId)
    }

    const start = (page - 1) * limit
    const end = start + limit
    const paginatedLogs = filteredLogs.slice(start, end)

    return {
      total: filteredLogs.length,
      logs: paginatedLogs
    }
  })

  // 清空日志
  ctx.console.addListener('keyword-blocker/clear-logs', () => {
    blockLogs.length = 0
    return { success: true }
  })

  // 获取统计信息
  ctx.console.addListener('keyword-blocker/stats', () => {
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    const todayLogs = blockLogs.filter(log => log.timestamp >= oneDayAgo)
    const messageLogs = todayLogs.filter(log => log.type === 'message')
    const commandLogs = todayLogs.filter(log => log.type === 'command')

    // 统计最活跃的被屏蔽用户
    const userCounts = new Map<string, number>()
    todayLogs.forEach(log => {
      userCounts.set(log.userId, (userCounts.get(log.userId) || 0) + 1)
    })
    const topUsers = Array.from(userCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([userId, count]) => ({ userId, count }))

    // 统计最常被屏蔽的指令
    const commandCounts = new Map<string, number>()
    commandLogs.forEach(log => {
      commandCounts.set(log.content, (commandCounts.get(log.content) || 0) + 1)
    })
    const topCommands = Array.from(commandCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([command, count]) => ({ command, count }))

    return {
      todayMessageCount: messageLogs.length,
      todayCommandCount: commandLogs.length,
      topUsers,
      topCommands
    }
  })

  // 当插件被禁用时，停止轮询并注销中间件
  ctx.on('dispose', () => {
    isActive = false

    // 停止定时器
    if (reregisterTimer) {
      clearInterval(reregisterTimer)
      reregisterTimer = null
    }

    // 注销中间件
    if (currentDispose) {
      currentDispose()
      currentDispose = null
    }

    ctx.logger.info('关键词屏蔽插件已禁用，轮询已停止，中间件已注销')
  })
}
