import { Context, Schema } from 'koishi'

export const name = 'isolate'
export const filter = false
export const reusable = true
export const usage = `
---
`

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

export interface Config {
  filterMode: 'blacklist' | 'whitelist'
  blacklist?: FilterRule[]
  whitelist?: FilterRule[]
  logBlocked: boolean
  reregisterInterval: number
  enableCommandFilter: boolean
  commandFilterMode?: 'blacklist' | 'whitelist'
  commandBlacklist?: CommandRule[]
  commandWhitelist?: CommandRule[]
  replyNoPermission?: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    reregisterInterval: Schema.number().description('重新注册中间件的间隔时间（毫秒）。越小优先级越稳定，但性能开销越大。')
      .default(100).min(50).max(5000),
  }).description('基础配置'),

  Schema.object({
    filterMode: Schema.union(['blacklist', 'whitelist']).description('消息过滤模式').default('blacklist'),
  }).description('消息级过滤'),
  Schema.union([
    Schema.object({
      filterMode: Schema.const('blacklist'),
      blacklist: Schema.array(Schema.object({
        type: Schema.union([
          Schema.const('userId').description('用户 ID'),
          Schema.const('channelId').description('频道 ID'),
          Schema.const('guildId').description('群组 ID'),
          Schema.const('platform').description('平台名称'),
        ]).description('过滤类型').role('radio').default('userId'),
        value: Schema.string().description('过滤值').required(),
        reason: Schema.string().description('过滤原因（备注）'),
      })).role('table').description('消息黑名单规则').default([]),
    }),
    Schema.object({
      filterMode: Schema.const('whitelist').required(),
      whitelist: Schema.array(Schema.object({
        type: Schema.union([
          Schema.const('userId').description('用户 ID'),
          Schema.const('channelId').description('频道 ID'),
          Schema.const('guildId').description('群组 ID'),
          Schema.const('platform').description('平台名称'),
        ]).description('过滤类型').role('radio').default('userId'),
        value: Schema.string().description('过滤值').required(),
        reason: Schema.string().description('过滤原因（备注）'),
      })).role('table').description('消息白名单规则').default([]),
    }),
  ]),

  Schema.object({
    enableCommandFilter: Schema.boolean().description('启用指令级权限控制').default(false),
  }).description('指令级过滤'),
  Schema.union([
    Schema.object({
      enableCommandFilter: Schema.const(false).required(),
    }),
    Schema.intersect([
      Schema.object({
        enableCommandFilter: Schema.const(true).required(),
        commandFilterMode: Schema.union(['blacklist', 'whitelist']).description('指令过滤模式').default('blacklist'),
        replyNoPermission: Schema.boolean().description('回复"你没有权限使用此指令"').default(true),
      }),
      Schema.union([
        Schema.object({
          commandFilterMode: Schema.const('blacklist'),
          commandBlacklist: Schema.array(Schema.object({
            userId: Schema.string().description('用户 ID').required(),
            commands: Schema.array(Schema.string()).description('禁止使用的指令列表（支持通配符 *）').role('table').default([]),
            reason: Schema.string().description('限制原因（备注）'),
          })).role('table').description('指令黑名单规则').default([]),
        }),
        Schema.object({
          commandFilterMode: Schema.const('whitelist'),
          commandWhitelist: Schema.array(Schema.object({
            userId: Schema.string().description('用户 ID').required(),
            commands: Schema.array(Schema.string()).description('允许使用的指令列表（支持通配符 *）').role('table').default([]),
            reason: Schema.string().description('限制原因（备注）'),
          })).role('table').description('指令白名单规则').default([]),
        }),
      ]),
    ]),
  ]),

  Schema.object({
    logBlocked: Schema.boolean().description('记录被屏蔽的消息和指令').default(false),
  }).description('调试设置'),
])



const kRecord = Symbol.for('koishi.loader.record')

// 判断是否应该过滤指令
function shouldFilterCommand(userId: string, commandName: string, config: Config): boolean {
  if (!config.enableCommandFilter) {
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

  if (config.commandFilterMode === 'blacklist') {
    // 黑名单模式：如果用户在黑名单中且指令匹配，则屏蔽
    return (config.commandBlacklist || []).some(rule => {
      if (rule.userId !== userId) {
        return false
      }
      return rule.commands.some(pattern => matchPattern(pattern, commandName))
    })
  }

  if (config.commandFilterMode === 'whitelist') {
    // 白名单模式：如果用户不在白名单中或指令不匹配，则屏蔽
    const userRule = (config.commandWhitelist || []).find(rule => rule.userId === userId)

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

export function apply(ctx: Context, config: Config) {
  ctx.logger.info('启用黑白名单过滤插件')
  ctx.logger.info('消息过滤模式: %s，规则数: %d', config.filterMode,
    config.filterMode === 'blacklist' ? (config.blacklist?.length ?? 0) : (config.whitelist?.length ?? 0))
  ctx.logger.info('中间件重新注册间隔: %d ms', config.reregisterInterval)

  if (config.enableCommandFilter) {
    ctx.logger.info('指令过滤已启用，模式: %s，规则数: %d', config.commandFilterMode,
      config.commandFilterMode === 'blacklist' ? (config.commandBlacklist?.length ?? 0) : (config.commandWhitelist?.length ?? 0))
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
      if (shouldFilterSession(session, config)) {
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
    ctx.logger.info('黑白名单过滤中间件已注册，开始轮询重新注册（间隔 %d ms）', config.reregisterInterval)

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
  if (config.enableCommandFilter) {
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
      const shouldBlock = shouldFilterCommand(userId, commandName, config)

      if (shouldBlock) {
        if (config.logBlocked) {
          ctx.logger.info('屏蔽指令 - 用户:%s 指令:%s', userId, commandName)
        }

        if (config.replyNoPermission) {
          return '你没有权限使用此指令'
        }

        // 不回复消息，静默拦截
        return ''
      }
    })

    ctx.logger.info('指令级过滤钩子已注册')
  }

  // 加载插件组内的插件（如果有的话）
  const parentConfig = ctx.scope.parent.config
  const disabled = Object.keys(parentConfig).filter(key => key.startsWith('~') && !key.startsWith('~isolate:'))

  if (disabled.length > 0) {
    ctx.logger.info('检测到 %d 个插件组内的插件', disabled.length)

    // 创建隔离上下文用于加载插件
    const isolateCtx = ctx.isolate('blacklist-isolate')
    isolateCtx.scope[kRecord] = Object.create(null)

    // 在隔离上下文中加载插件
    disabled.forEach(key => {
      ctx.logger.info('加载插件: %c', key.slice(1))
      const reload = () => isolateCtx.loader.reload(isolateCtx, key.slice(1), isolateCtx.scope.parent.config[key]).then(fork => {
        return ctx.scope.parent.scope[kRecord][key.slice(1)] = new Proxy(fork, {
          get(target, prop) {
            if (prop === 'dispose') {
              return async () => {
                await Promise.resolve()
                return reload()
              }
            }
            return Reflect.get(target, prop)
          },
        })
      })
      reload()
    })
  }

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

    ctx.logger.info('黑白名单过滤插件已禁用，轮询已停止，中间件已注销')
  })
}

// 判断是否应该过滤 session
function shouldFilterSession(session: any, config: Config): boolean {
  const userId = session.userId || session.event?.user?.id
  const channelId = session.channelId || session.event?.channel?.id
  const guildId = session.guildId || session.event?.guild?.id
  const platform = session.platform

  if (config.filterMode === 'blacklist') {
    // 黑名单模式：如果匹配黑名单中的任何规则，则屏蔽
    return (config.blacklist || []).some(rule => {
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

  if (config.filterMode === 'whitelist') {
    // 白名单模式：如果不匹配白名单中的任何规则，则屏蔽
    // 如果白名单为空，则屏蔽所有
    if (config.whitelist.length === 0) {
      return true
    }

    return !(config.whitelist || []).some(rule => {
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

