import { Context, Schema, Command } from 'koishi'
import { resolve } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

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
  type: 'userId' | 'channelId' | 'guildId' | 'platform'
  value: string
  commands: string[]
  reason?: string
  replyNoPermission?: boolean
}

// WebUI 配置（存储在本地文件）
interface WebUIConfig {
  filterMode: 'blacklist' | 'whitelist'
  blacklist: FilterRule[]
  whitelist: FilterRule[]
  enableCommandFilter: boolean
  commandFilterMode: 'blacklist' | 'whitelist'
  commandBlacklist: CommandRule[]
  commandWhitelist: CommandRule[]
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
    .description('调试模式：在控制台输出被屏蔽的消息和指令')
    .default(false),
})

// 声明 Console 事件类型
declare module '@koishijs/plugin-console' {
  interface Events {
    'keyword-blocker/config'(): WebUIConfig
    'keyword-blocker/update-config'(config: Partial<WebUIConfig>): void
    'keyword-blocker/commands'(): { commands: string[] }
  }
}

// 获取完整的指令列表（包括子指令）
function getAllCommands(ctx: Context): string[] {
  const commands = new Set<string>()

  // 递归获取指令及其子指令
  const addCommand = (cmd: Command) => {
    commands.add(cmd.name)
    // 遍历子指令
    if (cmd.children) {
      cmd.children.forEach(child => addCommand(child))
    }
  }

  // 遍历所有顶层指令
  ctx.root.$commander._commandList.forEach(cmd => {
    addCommand(cmd)
  })

  return Array.from(commands).sort()
}

// 判断是否应该过滤指令
function shouldFilterCommand(session: any, commandName: string, webConfig: WebUIConfig): { shouldBlock: boolean; replyNoPermission: boolean } {
  if (!webConfig.enableCommandFilter) {
    return { shouldBlock: false, replyNoPermission: false }
  }

  const userId = session.userId || session.event?.user?.id
  const channelId = session.channelId || session.event?.channel?.id
  const guildId = session.guildId || session.event?.guild?.id
  const platform = session.platform

  // 通配符匹配函数
  const matchPattern = (pattern: string, text: string): boolean => {
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符
      .replace(/\*/g, '.*')  // * 转换为 .*
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(text)
  }

  // 检查规则是否匹配
  const matchesRule = (rule: CommandRule): boolean => {
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
  }

  if (webConfig.commandFilterMode === 'blacklist') {
    // 黑名单模式：如果匹配黑名单中的规则且指令匹配，则屏蔽
    const matchedRule = webConfig.commandBlacklist.find(rule => {
      if (!matchesRule(rule)) {
        return false
      }
      return rule.commands.some(pattern => matchPattern(pattern, commandName))
    })

    if (matchedRule) {
      return {
        shouldBlock: true,
        replyNoPermission: matchedRule.replyNoPermission !== undefined ? matchedRule.replyNoPermission : true
      }
    }
  }

  if (webConfig.commandFilterMode === 'whitelist') {
    // 白名单模式：如果不匹配白名单中的规则或指令不匹配，则屏蔽
    const matchedRule = webConfig.commandWhitelist.find(rule => matchesRule(rule))

    if (!matchedRule) {
      // 不在白名单中，屏蔽所有指令
      return { shouldBlock: true, replyNoPermission: true }
    }

    // 在白名单中，检查指令是否匹配
    const isAllowed = matchedRule.commands.some(pattern => matchPattern(pattern, commandName))
    if (!isAllowed) {
      return {
        shouldBlock: true,
        replyNoPermission: matchedRule.replyNoPermission !== undefined ? matchedRule.replyNoPermission : true
      }
    }
  }

  return { shouldBlock: false, replyNoPermission: false }
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

  // 配置文件路径
  const configDir = resolve(ctx.baseDir, 'data/keyword-blocker')
  const configPath = resolve(configDir, 'config.json')

  // 默认配置
  const defaultConfig: WebUIConfig = {
    filterMode: 'blacklist',
    blacklist: [],
    whitelist: [],
    enableCommandFilter: false,
    commandFilterMode: 'blacklist',
    commandBlacklist: [],
    commandWhitelist: []
  }

  // WebUI 配置（从文件加载）
  let webConfig: WebUIConfig = { ...defaultConfig }

  // 加载配置文件
  const loadConfig = async () => {
    try {
      if (existsSync(configPath)) {
        const data = await readFile(configPath, 'utf-8')
        webConfig = { ...defaultConfig, ...JSON.parse(data) }
        ctx.logger.info('已加载配置文件')
      } else {
        ctx.logger.info('配置文件不存在，使用默认配置')
      }
    } catch (error) {
      ctx.logger.error('加载配置文件失败:', error)
      webConfig = { ...defaultConfig }
    }
  }

  // 保存配置文件
  const saveConfig = async () => {
    try {
      // 确保目录存在
      if (!existsSync(configDir)) {
        await mkdir(configDir, { recursive: true })
      }
      await writeFile(configPath, JSON.stringify(webConfig, null, 2), 'utf-8')
      ctx.logger.info('配置已保存到文件')
    } catch (error) {
      ctx.logger.error('保存配置文件失败:', error)
      throw error
    }
  }

  // 启动时加载配置
  loadConfig()

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

    const commandName = command.name
    const { shouldBlock, replyNoPermission } = shouldFilterCommand(session, commandName, webConfig)

    if (shouldBlock) {
      if (config.logBlocked) {
        const userId = session.userId || session.event?.user?.id || '未知'
        ctx.logger.info('屏蔽指令 - 用户:%s 指令:%s', userId, commandName)
      }

      if (replyNoPermission) {
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
    return webConfig
  })

  // 更新配置
  ctx.console.addListener('keyword-blocker/update-config', (newConfig) => {
    // 更新 WebUI 配置
    Object.assign(webConfig, newConfig)

    // 异步保存到文件
    saveConfig().catch(error => {
      ctx.logger.error('保存配置文件失败:', error)
    })

    ctx.logger.info('配置已更新')
    ctx.logger.info('消息过滤模式: %s，规则数: %d', webConfig.filterMode,
      webConfig.filterMode === 'blacklist' ? webConfig.blacklist.length : webConfig.whitelist.length)

    if (webConfig.enableCommandFilter) {
      ctx.logger.info('指令过滤已启用，模式: %s，规则数: %d', webConfig.commandFilterMode,
        webConfig.commandFilterMode === 'blacklist' ? webConfig.commandBlacklist.length : webConfig.commandWhitelist.length)
    }
  })

  // 获取已注册指令列表（包括子指令）
  ctx.console.addListener('keyword-blocker/commands', () => {
    const commands = getAllCommands(ctx)
    return { commands }
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
