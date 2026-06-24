import { Context, Bot, Session } from 'koishi'
import { logInfo, loggerError, loggerInfo } from './index'
import { decodeStringId, decodeChannelId } from './utils'

// 私聊频道表结构
declare module 'koishi' {
    interface Tables {
        channelprivate: channelprivate
        bindingchannel: BindingChannel
    }
}

// 扩展 Binding 接口
declare module 'koishi' {
    interface Binding {
        botselfid?: string
    }
}

export interface channelprivate {
    id: number
    userId: string
    channelId: string
    botSelfId: string
    platform: string
    createdAt: Date
    updatedAt: Date
}

export interface BindingChannel {
    id: number
    channelId: string
    aid: number
    createdAt: Date
    updatedAt: Date
}

/**
 * Bot 查找工具类
 */
export class BotFinder {
    private recordingLocks: Set<string> = new Set() // 防止并发写入
    private recordingDebounce: Map<string, NodeJS.Timeout> = new Map() // 防抖
    private bindingUpdateLocks: Set<string> = new Set() // 防止并发更新 binding

    constructor(private ctx: Context) {
        this.initializeDatabase()
        this.setupEventListeners()
        // 延迟清理重复记录，等待数据库准备好
        this.ctx.on('ready', () => {
            this.cleanupDuplicateRecords()
        })
    }

    /**
     * 初始化数据库表
     */
    private initializeDatabase() {
        this.ctx.model.extend('channelprivate', {
            id: 'unsigned',
            userId: 'string',
            channelId: 'string',
            botSelfId: 'string',
            platform: 'string',
            createdAt: 'timestamp',
            updatedAt: 'timestamp',
        }, {
            primary: 'id',
            autoInc: true,
            unique: [['userId', 'channelId']],
        })

        this.ctx.model.extend('bindingchannel', {
            id: 'unsigned',
            channelId: 'string',
            aid: 'unsigned',
            createdAt: 'timestamp',
            updatedAt: 'timestamp',
        }, {
            primary: 'id',
            autoInc: true,
            unique: [['channelId'], ['aid']],
        })
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners() {
        this.ctx.on('ready', () => {
            this.ctx.middleware(async (session, next) => {
                this.updateBindingBotSelfId(session)
                this.handleMessageForchannelprivate(session)
                return next()
            })

            logInfo('Private channel event listeners set up')
        })
    }

    /**
     * 处理消息事件，记录私聊频道信息
     */
    private async handleMessageForchannelprivate(session: Session) {
        // // 不处理有【at别人的前缀】消息
        // if (session.stripped.hasAt && !session.stripped.atSelf) return
        // 只处理私聊消息
        if (!session.isDirect) {
            return
        }

        try {
            // 查找对应的 bot
            const bot = this.ctx.bots.find(b =>
                b.platform === session.platform &&
                b.selfId === session.selfId
            )

            if (!bot) {
                logInfo('No bot found for session: %s/%s', session.platform, session.selfId)
                return
            }

            // 记录私聊频道信息
            await this.recordchannelprivate(
                session.userId,
                session.channelId || `private:${session.userId}`,
                bot.selfId,
                session.platform
            )
        } catch (error) {
            loggerError('Error handling private channel message: %s', error.message)
        }
    }

    /**
     * 更新 binding 表中的 botselfid 字段
     */
    private async updateBindingBotSelfId(session: Session) {
        if (!this.isDatabaseAvailable()) {
            return
        }

        const lockKey = `${session.userId}:${session.platform}`

        // 检查是否已经在处理中
        if (this.bindingUpdateLocks.has(lockKey)) {
            return
        }

        // 加锁
        this.bindingUpdateLocks.add(lockKey)

        try {
            // 查找对应的 binding 记录
            const bindings = await this.ctx.database.get('binding', {
                pid: `${session.userId}`,
                platform: session.platform
            })

            if (bindings.length > 0) {
                const binding = bindings[0]
                // 如果 botselfid 不存在或者与当前 session 的 selfId 不同，则更新
                if (!binding.botselfid || binding.botselfid !== session.selfId) {
                    await this.ctx.database.set('binding', {
                        pid: `${session.userId}`,
                        platform: session.platform
                    }, {
                        botselfid: session.selfId
                    })

                    logInfo('Updated binding botselfid for user %s: %s', session.userId, session.selfId)
                }
            }
        } catch (error) {
            loggerError('Error updating binding botselfid: %s', error.message)
        } finally {
            // 释放锁
            this.bindingUpdateLocks.delete(lockKey)
        }
    }

    /**
     * 记录私聊频道信息到数据库 
     */
    private recordchannelprivate(userId: string, channelId: string, botSelfId: string, platform: string) {
        // 确保 userId 作为字符串处理
        const userIdStr = String(userId)
        const key = `${userIdStr}|${channelId}`

        // 清除之前的防抖定时器
        const existingTimer = this.recordingDebounce.get(key)
        if (existingTimer) {
            clearTimeout(existingTimer)
        }

        // 设置新的防抖定时器
        const timer = setTimeout(async () => {
            await this.doRecordchannelprivate(userIdStr, channelId, botSelfId, platform)
            this.recordingDebounce.delete(key)
        }, 100) // 100ms 防抖

        this.recordingDebounce.set(key, timer)
    }

    /**
     * 实际执行数据库记录操作
     */
    private async doRecordchannelprivate(userId: string, channelId: string, botSelfId: string, platform: string) {
        if (!this.isDatabaseAvailable()) {
            logInfo('Database not available, skipping private channel record')
            return
        }

        const key = `${userId}|${channelId}`

        // 检查是否已经在处理中
        if (this.recordingLocks.has(key)) {
            logInfo('Already recording for %s, skipping', key)
            return
        }

        // 加锁
        this.recordingLocks.add(key)

        try {
            // 确保 userId 作为字符串处理
            const userIdStr = String(userId)

            // 使用 upsert 操作，如果存在就更新，不存在就创建
            const existing = await this.ctx.database.get('channelprivate', {
                userId: userIdStr,
                channelId,
            })

            if (existing.length > 0) {
                // 更新现有记录
                await this.ctx.database.set('channelprivate', {
                    userId: userIdStr,
                    channelId,
                }, {
                    botSelfId,
                    platform,
                    updatedAt: new Date(),
                })

                logInfo('Updated private channel record: %s -> %s', channelId, botSelfId)
            } else {
                // 创建新记录
                await this.ctx.database.create('channelprivate', {
                    userId: userIdStr,
                    channelId,
                    botSelfId,
                    platform,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })

                logInfo('Created private channel record: %s -> %s', channelId, botSelfId)
            }
        } catch (error) {
            loggerError('Error recording private channel: %s', error.message)
        } finally {
            // 释放锁
            this.recordingLocks.delete(key)
        }
    }

    /**
     * 检查数据库是否可用
     */
    private isDatabaseAvailable(): boolean {
        return !!(this.ctx.database && typeof this.ctx.database.get === 'function')
    }

    /**
     * 清理重复的私聊频道记录
     */
    private async cleanupDuplicateRecords() {
        if (!this.isDatabaseAvailable()) {
            return
        }

        try {
            // 获取所有记录
            const allRecords = await this.ctx.database.get('channelprivate', {})

            // 按 userId + channelId 分组
            const groups = new Map<string, typeof allRecords>()

            for (const record of allRecords) {
                const key = `${record.userId}|${record.channelId}`
                if (!groups.has(key)) {
                    groups.set(key, [])
                }
                groups.get(key)!.push(record)
            }

            // 清理重复记录
            let cleanedCount = 0
            for (const [key, records] of groups) {
                if (records.length > 1) {
                    // 保留最新的记录，删除其他的
                    const latest = records.sort((a, b) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                    )[0]

                    const toDelete = records.filter(r => r.id !== latest.id)

                    for (const record of toDelete) {
                        await this.ctx.database.remove('channelprivate', { id: record.id })
                        cleanedCount++
                    }
                }
            }

            if (cleanedCount > 0) {
                logInfo('Cleaned up %d duplicate private channel records', cleanedCount)
            }
        } catch (error) {
            loggerError('Error cleaning up duplicate records: %s', error.message)
        }
    }


    /**
     * 根据频道 ID 查找对应的 bot
     * @param channelId 频道 ID
     * @returns 对应的 bot 实例，如果没找到返回 null
     */
    async findBotByChannelId(channelId: string): Promise<Bot | null> {
        try {
            // 检查数据库是否可用
            if (!this.isDatabaseAvailable()) {
                throw new Error('Database not available')
            }

            // 查询 channelprivate 表
            const channelprivates = await this.ctx.database.get('channelprivate', {
                channelId: channelId
            })

            if (channelprivates.length > 0) {
                const channelprivate = channelprivates[0]
                const bot = this.ctx.bots.find(bot => bot.selfId === channelprivate.botSelfId)

                if (bot) {
                    return bot
                } else {
                    logInfo('Bot with selfId %s not found for private channel, trying fallback', channelprivate.botSelfId)
                }
            }

            // 私聊频道只在 channelprivate 表中查找，找不到直接返回 null
            if (channelId.startsWith('private:')) {
                return null
            }

            // 私聊表中没有找到 
            // 查询 channel 表
            const channels = await this.ctx.database.get('channel', {
                guildId: channelId
            })

            if (channels.length === 0) {
                throw new Error(`No channel found for channelId: ${channelId}`)
            }

            // 取第一个匹配的频道
            const channel = channels[0]
            const assignee = channel.assignee

            if (!assignee) {
                logInfo('No assignee found for channel: %s', channelId)
                return null
            }

            // 根据 assignee 查找对应的 bot
            const bot = this.ctx.bots.find(bot => bot.selfId === assignee)

            if (bot) {
                return bot
            } else {
                logInfo('Bot with selfId %s not found in active bots', assignee)
                return null
            }
        } catch (error) {
            loggerError('Error finding bot for channel %s: %s', channelId, error.message)
            return null
        }
    }

    /**
     * 根据用户 ID 查找对应的 bot
     * @param userId 用户 ID
     * @returns 对应的 bot 实例，如果没找到返回 null
     */
    async findBotByUserId(userId: string): Promise<Bot | null> {
        try {
            if (!this.isDatabaseAvailable()) {
                throw new Error('Database not available')
            }

            // 查询 binding 表，寻找匹配的 pid（用户ID）
            const bindings = await this.ctx.database.get('binding', {
                pid: String(userId)
            })

            if (bindings.length > 0) {
                const binding = bindings[0]
                if (binding.botselfid) {
                    const bot = this.ctx.bots.find(bot => bot.selfId === binding.botselfid)
                    if (bot) {
                        return bot
                    } else {
                        logInfo('Bot with selfId %s not found for user, bot may be offline', binding.botselfid)
                    }
                }
            }

            // 如果没有找到对应的 bot，抛出错误
            throw new Error(`No bot found for user: ${userId}`)
        } catch (error) {
            loggerError('Error finding bot for user %s: %s', userId, error.message)
            throw new Error(`Failed to find bot for user ${userId}: ${error.message}`)
        }
    }

    /**
     * 通用的 bot 查找方法
     * @param params API 参数
     * @param clientState 客户端状态
     * @returns 对应的 bot 实例
     */
    async findBot(params: any = {}, clientState: any): Promise<Bot | null> {
        // 如果是群组相关操作，根据群组 ID 查找
        if (params.group_id) {
            // 解码数字ID为原始频道字符串ID
            const originalGroupId = await decodeChannelId(params.group_id, this.ctx)
            logInfo('Decoded group_id %s to %s', params.group_id, originalGroupId)
            const bot = await this.findBotByChannelId(originalGroupId)
            if (bot) {
                return bot
            }
        }

        // 如果是用户相关操作，根据用户 ID 查找
        if (params.user_id) {
            // 解码数字ID为原始字符串ID
            const originalUserId = await decodeStringId(params.user_id, this.ctx)
            logInfo('Decoded user_id %s to %s', params.user_id, originalUserId)
            const bot = await this.findBotByUserId(originalUserId)
            if (bot) {
                return bot
            }
        }

        // 如果没有特定的参数，尝试根据 clientState.selfId 查找
        if (clientState?.selfId) {
            const bot = this.ctx.bots.find(bot => bot.selfId === clientState.selfId)
            if (bot) {
                logInfo('Found bot by clientState.selfId: %s', clientState.selfId)
                return bot
            }
        }

        // 如果还是没有找到，返回第一个可用的 bot（作为后备方案）
        const availableBots = this.ctx.bots
        if (availableBots.length > 0) {
            logInfo('Using first available bot as fallback: %s', availableBots[0].selfId)
            return availableBots[0]
        }

        // 没有找到合适的bot，抛出错误
        throw new Error('No suitable bot found for the request')
    }

    /**
     * 获取所有可用的 bot 列表
     */
    getAvailableBots(): Bot[] {
        return this.ctx.bots
    }

    /**
     * 根据用户ID获取私聊channel ID
     */
    async getchannelprivateId(userId: string): Promise<string | null> {
        try {
            if (!this.isDatabaseAvailable()) {
                return null
            }

            const channelprivates = await this.ctx.database.get('channelprivate', {
                userId: String(userId)
            })

            if (channelprivates.length > 0) {
                const channelId = channelprivates[0].channelId
                logInfo('Found private channel %s for user %s', channelId, userId)
                return channelId
            }

            return null
        } catch (error) {
            loggerError('Error finding private channel for user %s: %s', userId, error.message)
            return null
        }
    }

    /**
     * 根据平台和 selfId 查找 bot
     */
    findBotByPlatformAndId(platform: string, selfId: string): Bot | null {
        return this.ctx.bots.find(bot =>
            bot.platform === platform && bot.selfId === selfId
        ) || null
    }
}
