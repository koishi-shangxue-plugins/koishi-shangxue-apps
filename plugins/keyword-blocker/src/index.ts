import { Context, Schema } from 'koishi'

export const name = 'isolate'
export const filter = false
export const reusable = true
export const usage = `
## 黑白名单过滤插件

### 功能介绍

这是一个基于 Koishi isolate 插件改造的黑白名单过滤插件，支持**消息级过滤**和**指令级权限控制**。

### 工作原理

#### 消息级过滤
- **轮询重新注册**：每隔一段时间（默认 100ms）重新注册前置中间件
- **优先级保证**：利用"后注册的前置中间件优先级更高"的特性，确保过滤器永远是第一个执行
- **消息拦截**：被屏蔽的消息会被清空内容并阻止传递到其他中间件
- **性能可控**：可以调整重新注册间隔来平衡优先级稳定性和性能开销

#### 指令级权限控制
- **before 钩子**：使用 \`ctx.before('command/execute')\` 在指令执行前拦截
- **精确控制**：可以针对特定用户限制特定指令的使用权限
- **通配符支持**：支持 \`*\` 通配符匹配多个指令（如 \`admin.*\` 匹配所有 admin 开头的指令）

### 过滤规则

#### 消息级过滤支持：
- **userId**：用户 ID
- **channelId**：频道 ID
- **guildId**：群组 ID
- **platform**：平台名称（如 onebot、discord 等）

#### 指令级过滤支持：
- **userId + commands**：针对特定用户限制指令列表
- **通配符**：\`*\` 匹配任意字符，\`admin.*\` 匹配所有 admin 开头的指令

### 使用方法

1. 将 isolate 插件和需要保护的插件放在同一个分组
2. 配置消息级黑白名单规则（可选）
3. 启用指令级过滤并配置指令黑白名单（可选）
4. 插件会自动拦截符合规则的消息和指令

### 黑名单模式 vs 白名单模式

- **黑名单模式**：只屏蔽黑名单中的对象，其他全部放行
- **白名单模式**：只放行白名单中的对象，其他全部屏蔽

### 已知限制

由于 Koishi 的中间件和事件系统并行触发，无法保证中间件一定在事件监听器之前执行。因此：
- ✅ 可以拦截中间件链中的消息
- ✅ 可以清空消息内容
- ✅ 可以完全阻止指令执行（通过 before 钩子）
- ⚠️ 无法完全阻止事件监听器触发（但它们会获取到空内容）

### 性能建议

- **reregisterInterval** 设置为 100ms 可以在大多数情况下保证优先级
- 如果遇到其他插件频繁注册前置中间件，可以降低到 50ms
- 如果追求性能，可以提高到 500-1000ms，但可能偶尔被其他插件抢占优先级

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

