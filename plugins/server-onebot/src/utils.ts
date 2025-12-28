import { OneBotMessage, OneBotNoticeEvent, OneBotRequestEvent, CQCode } from './types'
import { logInfo, loggerError, loggerInfo } from './index'
import { h, Session } from 'koishi'

// 存储最近的 session 的全局变量
const recentSessionsMap = new Map<string, {
    session: any,
    timestamp: number,
    channelId: string,
    userId: string | null,
    isPrivate: boolean,
    platform: string,
    selfId: string
}>()

/**
 * 生成唯一 ID
 */
export function generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

/**
 * 将 Koishi Session 转换为 OneBot 事件
 */
export async function sessionToOneBotEvent(session: Session, ctx: any, configSelfId?: string): Promise<any | null> {
    const baseEvent = {
        time: Math.floor((session.timestamp || Date.now()) / 1000),
        self_id: configSelfId ? (parseInt(configSelfId) || configSelfId) : (parseInt(session.selfId) || session.selfId),
    }

    switch (session.type) {
        case 'message':
        case 'message-created':
            return await createMessageEvent(session, baseEvent, ctx, configSelfId)

        case 'friend-request':
            return createFriendRequestEvent(session, baseEvent, configSelfId)

        case 'guild-member-request':
            return createGroupRequestEvent(session, baseEvent, configSelfId)

        case 'message-deleted':
            return createMessageDeleteEvent(session, baseEvent, configSelfId)

        case 'guild-member-added':
        case 'guild-member-deleted':
            return createMemberChangeEvent(session, baseEvent, configSelfId)

        default:
            return null
    }
}

/**
 * 创建消息事件
 */
async function createMessageEvent(session: Session, baseEvent: any, ctx: any, configSelfId?: string): Promise<any> {
    // 确定消息类型
    const isGroupMessage = !session.isDirect && (session.guildId || session.channelId)

    const userId = await encodeStringId(session.userId, ctx)

    // 根据平台决定使用哪个内容和元素
    const useStripped = session.platform === 'qq' || session.platform === 'qqguild'
    const rawMessage = useStripped
        ? (session.stripped?.content || session.content || '')
        : (session.content || '')

    const event: any = {
        post_type: 'message',
        message_type: isGroupMessage ? 'group' : 'private',
        sub_type: isGroupMessage ? 'normal' : 'friend',
        message_id: parseInt(session.messageId) || session.messageId || generateId(),
        user_id: userId, // 转换为数字类型
        message: await elementsToOneBotMessage(session.elements || [], ctx, session.platform),
        raw_message: rawMessage,
        font: 0,
        sender: {
            user_id: userId, // 转换为数字类型
            nickname: session.author?.nick || session.author?.name || session.userId,
            card: session.author?.nick || '',
            sex: 'unknown',
            age: 0,
            area: '',
            level: '0',
            role: getMemberRole(session),
            title: '',
        },
        time: Math.floor((session.timestamp || Date.now()) / 1000),
        self_id: configSelfId ? (parseInt(configSelfId) || configSelfId) : (parseInt(session.selfId) || session.selfId),
    }

    // 如果是群消息，添加群组信息
    if (isGroupMessage) {
        const groupId = session.guildId || session.channelId
        event.group_id = await encodeChannelId(groupId, ctx) // 使用频道ID编码逻辑
    }

    return event
}

/**
 * 创建好友请求事件
 */
function createFriendRequestEvent(session: Session, baseEvent: any, configSelfId?: string): any {
    return {
        ...baseEvent,
        post_type: 'request',
        request_type: 'friend',
        sub_type: '',
        user_id: parseInt(session.userId) || session.userId,
        comment: session.content || '',
        flag: session.messageId || generateId(),
    }
}

/**
 * 创建群请求事件
 */
function createGroupRequestEvent(session: Session, baseEvent: any, configSelfId?: string): any {
    return {
        ...baseEvent,
        post_type: 'request',
        request_type: 'group',
        sub_type: 'add',
        user_id: parseInt(session.userId) || session.userId,
        group_id: parseInt(session.guildId) || session.guildId,
        comment: session.content || '',
        flag: session.messageId || generateId(),
    }
}

/**
 * 创建消息删除事件
 */
function createMessageDeleteEvent(session: Session, baseEvent: any, configSelfId?: string): any {
    return {
        ...baseEvent,
        post_type: 'notice',
        notice_type: session.isDirect ? 'friend_recall' : 'group_recall',
        sub_type: '',
        user_id: parseInt(session.userId) || session.userId,
        operator_id: parseInt(session.operatorId || session.userId) || (session.operatorId || session.userId),
        message_id: parseInt(session.messageId) || session.messageId,
        ...(session.guildId && !session.isDirect ? {
            group_id: parseInt(session.guildId) || session.guildId,
        } : {}),
    }
}

/**
 * 创建成员变动事件
 */
function createMemberChangeEvent(session: Session, baseEvent: any, configSelfId?: string): any {
    return {
        ...baseEvent,
        post_type: 'notice',
        notice_type: session.type === 'guild-member-added' ? 'group_increase' : 'group_decrease',
        sub_type: session.subtype || '',
        user_id: parseInt(session.userId) || session.userId,
        operator_id: parseInt(session.operatorId || session.userId) || (session.operatorId || session.userId),
        group_id: parseInt(session.guildId) || session.guildId,
    }
}

/**
 * 获取成员角色
 */
function getMemberRole(session: Session): 'owner' | 'admin' | 'member' {
    if (session.author?.roles?.includes('owner')) return 'owner'
    if (session.author?.roles?.includes('admin')) return 'admin'
    return 'member'
}

/**
 * 将 Koishi 元素转换为 OneBot 消息段
 */
export async function elementsToOneBotMessage(elements: h[], ctx: any, platform?: string): Promise<OneBotMessage[]> {
    const result: OneBotMessage[] = []

    for (const element of elements) {
        // 对于 qq 和 qqguild 平台，过滤掉 at 元素（除了 @all）
        if ((platform === 'qq' || platform === 'qqguild') && element.type === 'at' && element.attrs.type !== 'all') {
            continue // 跳过这个 at 元素
        }

        const segment = await elementToSegment(element, ctx)
        if (segment) {
            result.push(segment)
        }
    }

    return result
}

/**
 * 将单个 Koishi 元素转换为 OneBot 消息段
 */
async function elementToSegment(element: h, ctx: any): Promise<OneBotMessage | null> {
    switch (element.type) {
        case 'text':
            return {
                type: 'text',
                data: { text: element.attrs.content || element.children?.join('') || '' }
            }

        case 'at':
            if (element.attrs.type === 'all') {
                return { type: 'at', data: { qq: 'all' } }
            } else {
                const encodedId = await encodeStringId(element.attrs.id, ctx)
                return {
                    type: 'at',
                    data: {
                        qq: encodedId || element.attrs.id,
                        name: element.attrs.name || ''
                    }
                }
            }

        case 'img':
        case 'image':
            return {
                type: 'image',
                data: {
                    file: element.attrs.src || element.attrs.url,
                    url: element.attrs.src || element.attrs.url
                }
            }

        case 'audio':
            return {
                type: 'record',
                data: {
                    file: element.attrs.src || element.attrs.url,
                    url: element.attrs.src || element.attrs.url
                }
            }

        case 'video':
            return {
                type: 'video',
                data: {
                    file: element.attrs.src || element.attrs.url,
                    url: element.attrs.src || element.attrs.url
                }
            }

        case 'face':
            return {
                type: 'face',
                data: { id: element.attrs.id || '0' }
            }

        case 'reply':
            return {
                type: 'reply',
                data: { id: element.attrs.id }
            }

        default:
            // 对于不支持的元素类型，转换为文本
            return {
                type: 'text',
                data: { text: `[${element.type}]` }
            }
    }
}

/**
 * 将 OneBot 消息段转换为 Koishi 元素
 */
export async function oneBotMessageToElements(message: string | OneBotMessage[], ctx: any): Promise<h[]> {
    if (typeof message === 'string') {
        return [h.text(message)]
    }

    // 检查是否包含 node 类型（合并转发消息）
    const hasForwardNodes = message.some(seg => seg.type === 'node')
    
    if (hasForwardNodes) {
        // 如果包含合并转发节点，创建 figure 元素包装所有 message
        const messageElements: h[] = []
        
        for (const segment of message) {
            if (segment.type === 'node') {
                const nodeElements = await processForwardNode(segment, ctx)
                messageElements.push(...nodeElements)
            } else {
                // 非 node 类型的消息段也转换后添加
                const element = await segmentToElement(segment, ctx)
                if (element) {
                    messageElements.push(element)
                }
            }
        }
        
        // 使用 figure 元素包装所有消息，实现合并转发效果
        return [h('figure', messageElements)]
    }

    // 普通消息处理
    const elements: h[] = []
    for (const segment of message) {
        const element = await segmentToElement(segment, ctx)
        if (element) {
            elements.push(element)
        }
    }

    return elements
}

/**
 * 处理合并转发消息的 node 节点
 * OneBot v11 合并转发格式：
 * { type: 'node', data: { name: '发送者', uin: '10001', content: [...] } }
 * 或者
 * { type: 'node', data: { id: '消息ID' } }
 */
async function processForwardNode(segment: OneBotMessage, ctx: any): Promise<h[]> {
    const nodeData = segment.data

    if (!nodeData) {
        return []
    }

    // 如果有 content，创建 message 元素
    if (nodeData.content) {
        // 递归转换消息内容
        const contentElements = await oneBotMessageToElements(nodeData.content, ctx)
        
        // 构建 message 元素的属性
        const attrs: Record<string, any> = {}
        
        // 添加用户ID（如果有）
        if (nodeData.uin || nodeData.user_id) {
            const userId = nodeData.uin || nodeData.user_id
            // 尝试解码用户ID
            const decodedUserId = await decodeStringId(userId, ctx)
            attrs.userId = decodedUserId || userId
        }
        
        // 添加昵称（如果有）
        if (nodeData.name || nodeData.nickname) {
            attrs.nickname = nodeData.name || nodeData.nickname
        }
        
        // 创建 message 元素
        return [h('message', attrs, contentElements)]
    }
    // 如果只有 id，表示引用已有消息（暂不支持，记录日志）
    else if (nodeData.id) {
        logInfo('Forward node with message id is not fully supported: %s', nodeData.id)
        return [h.text(`[转发消息 ID: ${nodeData.id}]`)]
    }

    return []
}

/**
 * 兼容处理旧的 base64:// 协议，转换为 data: 格式
 */
function convertBase64Url(url: string, mimeType: string): string {
    if (url && url.startsWith('base64://')) {
        const base64Data = url.slice(9) // 移除 'base64://' 前缀
        return `data:${mimeType};base64,${base64Data}`
    }
    return url
}

/**
 * 将字符串ID编码为数字ID（binding表 - 用于用户ID）
 */
export async function encodeStringId(stringId: string, ctx: any): Promise<number> {
    try {
        // 在binding表中查找对应的记录
        const bindings = await ctx.database.get('binding', {
            pid: stringId,
        })

        if (bindings.length > 0) {
            // 找到了对应的记录，返回aid作为数字ID
            return bindings[0].aid
        } else {
            return null
        }
    } catch (error) {
        loggerError('Error in encodeStringId:', error)
        return null
    }
}

/**
 * 将数字ID解码为字符串ID（binding表 - 用于用户ID）
 */
export async function decodeStringId(id: number | string, ctx: any): Promise<string> {
    let aid: number

    // 统一转换为数字进行处理
    if (typeof id === 'string') {
        // 尝试将字符串转换为数字
        aid = parseInt(id, 10)
        // 如果转换失败或不是纯数字字符串，直接返回原字符串
        if (isNaN(aid) || aid.toString() !== id) {
            return id
        }
    } else {
        aid = id
        // 处理 NaN 的情况
        if (isNaN(aid)) {
            return 'unknown'
        }
    }

    try {
        // 在binding表中查找对应的记录
        const bindings = await ctx.database.get('binding', {
            aid: aid
        })

        if (bindings.length > 0) {
            // 找到了对应的记录，返回pid作为字符串ID
            return bindings[0].pid
        } else {
            return null
        }
    } catch (error) {
        loggerError('Error in decodeStringId:', error)
        // 如果数据库操作失败，返回数字字符串作为fallback
        return aid.toString()
    }
}

/**
 * 将频道字符串ID编码为数字ID（bindingchannel表 - 用于频道ID）
 */
export async function encodeChannelId(channelId: string, ctx: any): Promise<number> {
    try {
        // 在bindingchannel表中查找对应的记录
        const bindings = await ctx.database.get('bindingchannel', {
            channelId: channelId,
        })

        if (bindings.length > 0) {
            // 找到了对应的记录，返回aid作为数字ID
            return bindings[0].aid
        } else {
            // 如果没有找到，创建新的映射
            const existingChannels = await ctx.database.get('bindingchannel', {})
            const maxId = existingChannels.length > 0
                ? Math.max(...existingChannels.map(row => row.aid || 0))
                : 0
            const newaid = maxId + 1

            await ctx.database.create('bindingchannel', {
                channelId: channelId,
                aid: newaid,
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            return newaid
        }
    } catch (error) {
        loggerError('Error in encodeChannelId:', error)
        return null
    }
}

/**
 * 将数字ID解码为频道字符串ID（bindingchannel表 - 用于频道ID）
 */
export async function decodeChannelId(id: number | string, ctx: any): Promise<string> {
    let aid: number

    // 统一转换为数字进行处理
    if (typeof id === 'string') {
        // 尝试将字符串转换为数字
        aid = parseInt(id, 10)
        // 如果转换失败或不是纯数字字符串，直接返回原字符串
        if (isNaN(aid) || aid.toString() !== id) {
            return id
        }
    } else {
        aid = id
        // 处理 NaN 的情况
        if (isNaN(aid)) {
            return 'unknown'
        }
    }

    try {
        // 在bindingchannel表中查找对应的记录
        const bindings = await ctx.database.get('bindingchannel', {
            aid: aid
        })

        if (bindings.length > 0) {
            // 找到了对应的记录，返回channelId作为字符串ID
            return bindings[0].channelId
        } else {
            return null
        }
    } catch (error) {
        loggerError('Error in decodeChannelId:', error)
        // 如果数据库操作失败，返回数字字符串作为fallback
        return aid.toString()
    }
}

/**
 * 将单个 OneBot 消息段转换为 Koishi 元素
 */
async function segmentToElement(segment: OneBotMessage, ctx: any): Promise<h | null> {
    switch (segment.type) {
        case 'text':
            return h.text(segment.data.text || '')

        case 'at':
            if (segment.data.qq === 'all') {
                return h('at', { type: 'all' })
            } else {
                // 解码加密的用户 ID
                const originalUserId = await decodeStringId(segment.data.qq as number, ctx)
                return h.at(originalUserId || segment.data.qq, { name: segment.data.name })
            }

        case 'image':
            const imageUrl = convertBase64Url(segment.data.file || segment.data.url, 'image/jpeg')
            return h.image(imageUrl)

        case 'record':
            const audioUrl = convertBase64Url(segment.data.file || segment.data.url, 'audio/mpeg')
            return h.audio(audioUrl)

        case 'video':
            const videoUrl = convertBase64Url(segment.data.file || segment.data.url, 'video/mp4')
            return h.video(videoUrl)

        case 'face':
            return h('face', { id: segment.data.id })

        case 'reply':
            return h('reply', { id: segment.data.id })

        default:
            // 对于不支持的类型，转换为文本
            return h.text(`[${segment.type}]`)
    }
}

/**
 * 创建心跳事件
 */
export function createHeartbeatEvent(selfId: string, platform: string, interval: number): any {
    return {
        post_type: 'meta_event',
        meta_event_type: 'heartbeat',
        time: Math.floor(Date.now() / 1000),
        self_id: parseInt(selfId) || selfId,
        status: {
            app_initialized: true,
            app_enabled: true,
            app_good: true,
            online: true,
            good: true,
        },
        interval,
    }
}

/**
 * 使用 session 发送消息
 * 优先使用 session.send ，失败时回退到主动消息发送
 */
export async function sendWithSession(
    ctx: any,
    targetChannelId: string,
    targetUserId: string | null,
    elements: any[],
    isPrivate: boolean = false,
    selfId?: string
): Promise<string | string[]> {
    logInfo("=== sendWithSession called ===")
    logInfo(`targetChannelId: ${targetChannelId}`)
    logInfo(`targetUserId: ${targetUserId}`)
    logInfo(`isPrivate: ${isPrivate}`)
    logInfo(`selfId: ${selfId}`)
    logInfo("===============================")

    // 存储最近的 session，用于被动消息发送
    const recentSessions = getRecentSessions()

    // 查找匹配的 session（1分钟内的消息）
    const matchingSessions = findAllMatchingSessions(recentSessions, targetChannelId, targetUserId, isPrivate)

    let matchingSession = null
    if (matchingSessions.length > 0) {
        // 优先选择被 @ 的消息
        const atSelfSessions = matchingSessions.filter(session => session.isAtSelf)
        if (atSelfSessions.length > 0) {
            // 按时间倒序排列，最新的在前面
            atSelfSessions.sort((a, b) => b.timestamp - a.timestamp)
            matchingSession = atSelfSessions[0]
        } else {
            // 如果没有被 @ 的消息，选择最新的消息
            matchingSessions.sort((a, b) => b.timestamp - a.timestamp)
            matchingSession = matchingSessions[0]
        }
    }

    if (matchingSession) {
        try {
            // 检查 session 是否还在有效期内
            const sessionAge = Date.now() - matchingSession.timestamp
            const maxAge = 2 * 60 * 1000  //  120秒

            if (sessionAge < maxAge) {
                // 尝试使用 session.send 发送被动消息
                const result = await matchingSession.session.send(elements)
                if (result && (Array.isArray(result) ? result.length > 0 : true)) {
                    logInfo('Successfully sent message using session.send (passive message)')
                    return result
                }
            } else {
                logInfo(`Session expired (age: ${sessionAge}ms, max: ${maxAge}ms), falling back to active message`)
            }
        } catch (error) {
            // session.send 失败，继续尝试主动发送
            loggerError('Session.send failed, falling back to active message sending:', error.message)
        }

        // 如果被动消息发送失败，使用匹配 session 的 selfId 进行主动发送
        selfId = matchingSession.selfId
        logInfo(`Using selfId from matching session: ${selfId}`)
    } else {
        logInfo('No matching session found, using active message sending')
    }

    // 回退到主动消息发送
    return await sendActiveMessage(ctx, targetChannelId, targetUserId, elements, isPrivate, selfId)
}

/**
 * 主动发送消息
 */
async function sendActiveMessage(
    ctx: any,
    targetChannelId: string,
    targetUserId: string | null,
    elements: any[],
    isPrivate: boolean,
    selfId?: string
): Promise<string | string[]> {
    logInfo("=== sendActiveMessage called ===")
    logInfo(`selfId: ${selfId}`)
    logInfo(`Available bots: ${Object.values(ctx.bots).map((b: any) => `${b.selfId}(${b.platform})`).join(', ')}`)

    let targetBot = null

    // 如果提供了 selfId，优先使用这个 selfId 查找 bot
    if (selfId) {
        targetBot = Object.values(ctx.bots).find((b: any) => b.selfId === selfId)
    }

    // 如果没有提供 selfId 或者 根据 selfId 没有找到 bot
    if (!targetBot && targetChannelId && ctx.database) {
        try {
            // 查询 channel 表获取 assignee
            const channels = await ctx.database.get('channel', {
                id: targetChannelId
            })

            if (channels.length > 0) {
                const assignee = channels[0].assignee
                if (assignee) {
                    targetBot = Object.values(ctx.bots).find((b: any) => b.selfId === assignee)
                    if (targetBot) {
                        logInfo(`Found bot by channel assignee: ${targetBot.selfId}(${targetBot.platform})`)
                    }
                }
            }

            // 如果 channel 表没找到，查询 channelprivate 表
            if (!targetBot) {
                const channelprivates = await ctx.database.get('channelprivate', {
                    channelId: targetChannelId
                })

                if (channelprivates.length > 0) {
                    const botSelfId = channelprivates[0].botSelfId
                    targetBot = Object.values(ctx.bots).find((b: any) => b.selfId === botSelfId)
                    if (targetBot) {
                        logInfo(`Found bot by channelprivate: ${targetBot.selfId}(${targetBot.platform})`)
                    }
                }
            }
        } catch (error) {
            loggerError(`Error querying database: ${error.message}`)
        }
    }

    if (!targetBot) {
        throw new Error(`No suitable bot found for sending message${selfId ? ` (requested selfId: ${selfId})` : ''}`)
    }

    logInfo(`Using bot: ${targetBot.selfId} (platform: ${targetBot.platform}) for ${isPrivate ? 'private' : 'group'} message`)
    // 根据平台特性发送消息
    if (isPrivate && targetUserId) {
        return await sendPrivateMessageWithPlatformAdaptation(targetBot, targetUserId, elements)
    } else {
        return await sendGroupMessageWithPlatformAdaptation(targetBot, targetChannelId, elements)
    }
}

/**
 * 针对不同平台适配的私聊消息发送
 */
async function sendPrivateMessageWithPlatformAdaptation(
    bot: any,
    userId: string,
    elements: any[]
): Promise<string | string[]> {
    // QQ 官方平台特殊处理
    if (bot.platform === 'qq') {
        try {
            // 对于 QQ 平台，优先使用 sendPrivateMessage
            if (bot.sendPrivateMessage) {
                return await bot.sendPrivateMessage(userId, elements)
            }
        } catch (error) {
            // QQ 平台发送失败，记录错误但继续尝试其他方式
            loggerError('QQ platform sendPrivateMessage failed:', error.message)
            // 对于 QQ 平台，如果私聊发送失败，可能是因为缺少 msg_id
            throw new Error(`QQ platform private messaging failed (may require msg_id from recent session): ${error.message}`)
        }
    }

    // 通用发送方式，尝试多种频道 ID 格式
    const channelFormats = [
        `private:${userId}`,
        userId,
        // `user:${userId}`
    ]

    for (const channelId of channelFormats) {
        try {
            const result = await bot.sendMessage(channelId, elements)
            if (result && (Array.isArray(result) ? result.length > 0 : true)) {
                return result
            }
        } catch (error) {
            // 继续尝试下一种格式
            continue
        }
    }

    throw new Error('Failed to send private message with all methods')
}

/**
 * 针对不同平台适配的群消息发送
 */
async function sendGroupMessageWithPlatformAdaptation(
    bot: any,
    channelId: string,
    elements: any[]
): Promise<string | string[]> {
    // QQ 官方平台特殊处理
    if (bot.platform === 'qq') {
        try {
            // 对于 QQ 平台，直接使用 sendMessage
            if (bot.sendMessage) {
                return await bot.sendMessage(channelId, elements)
            }
        } catch (error) {
            loggerError('QQ platform group message failed:', error.message)
            // 对于 QQ 平台，如果直接发送失败，可能是因为缺少 msg_id
            throw new Error(`QQ platform active messaging failed (may require msg_id from recent session): ${error.message}`)
        }
    }

    // 通用发送方式，尝试多种频道 ID 格式
    const channelFormats = [
        channelId,
        `public:${channelId}`,
        `group:${channelId}`,
        `channel:${channelId}`,
        //  `guild:${channelId}`
    ]

    for (const format of channelFormats) {
        try {
            const result = await bot.sendMessage(format, elements)
            if (result && (Array.isArray(result) ? result.length > 0 : true)) {
                return result
            }
        } catch (error) {
            continue
        }
    }

    throw new Error('Failed to send group message with all channel formats')
}

/**
 * 存储最近的 session
 */
export function storeRecentSession(session: any) {
    const key = `${session.platform}-${session.selfId}-${session.channelId || session.userId}-${session.messageId || Date.now()}-${Math.random()}`
    const sessionData = {
        session,
        timestamp: Date.now(),
        channelId: session.channelId,
        userId: session.userId,
        isPrivate: session.isDirect || false,
        platform: session.platform,
        selfId: session.selfId,
        isAtSelf: session.stripped?.atSelf || false
    }

    recentSessionsMap.set(key, sessionData)

    // 清理超过2分钟的 session
    const fiveMinutesAgo = Date.now() - (2 * 60 * 1000)
    for (const [k, v] of recentSessionsMap.entries()) {
        if (v.timestamp < fiveMinutesAgo) {
            recentSessionsMap.delete(k)
        }
    }
}

/**
 * 获取最近的 sessions
 */
export function getRecentSessions() {
    const fiveMinutesAgo = Date.now() - (2 * 60 * 1000)
    const recentSessions = []

    for (const [key, sessionData] of recentSessionsMap.entries()) {
        if (sessionData.timestamp >= fiveMinutesAgo) {
            recentSessions.push(sessionData)
        }
    }

    return recentSessions
}

/**
 * 查找所有匹配的 sessions
 */
function findAllMatchingSessions(
    recentSessions: any[],
    targetChannelId: string,
    targetUserId: string | null,
    isPrivate: boolean
) {
    const matchingSessions = []

    for (const sessionData of recentSessions) {
        if (isPrivate) {
            // 私聊消息匹配
            if (sessionData.isPrivate && sessionData.userId === targetUserId) {
                matchingSessions.push(sessionData)
            }
        } else {
            // 群消息匹配
            if (!sessionData.isPrivate && sessionData.channelId === targetChannelId) {
                matchingSessions.push(sessionData)
            }
        }
    }

    return matchingSessions
}

export function createLifecycleEvent(selfId: string, platform: string, subType: 'enable' | 'disable' | 'connect'): any {
    return {
        post_type: 'meta_event',
        meta_event_type: 'lifecycle',
        sub_type: subType,
        time: Math.floor(Date.now() / 1000),
        self_id: parseInt(selfId) || selfId,
    }
}

/**
 * 解析 CQ 码
 */
export function parseCQCode(message: string): CQCode[] {
    const segments: CQCode[] = []
    const regex = /\[CQ:([^,\]]+)(?:,([^\]]*))?\]/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(message)) !== null) {
        // 添加前面的文本
        if (match.index > lastIndex) {
            const text = message.slice(lastIndex, match.index)
            if (text) {
                segments.push({ type: 'text', data: { text } })
            }
        }

        // 解析 CQ 码参数
        const type = match[1]
        const paramStr = match[2] || ''
        const data: Record<string, any> = {}

        if (paramStr) {
            const params = paramStr.split(',')
            for (const param of params) {
                const [key, value] = param.split('=', 2)
                if (key && value !== undefined) {
                    data[key] = decodeURIComponent(value)
                }
            }
        }

        segments.push({ type, data })
        lastIndex = regex.lastIndex
    }

    // 添加剩余的文本
    if (lastIndex < message.length) {
        const text = message.slice(lastIndex)
        if (text) {
            segments.push({ type: 'text', data: { text } })
        }
    }

    return segments
}

/**
 * 将 CQ 码转换为 OneBot 消息段
 */
export function cqCodeToOneBotMessage(cqCodes: CQCode[]): OneBotMessage[] {
    return cqCodes.map(cq => ({
        type: cq.type,
        data: cq.data
    }))
}