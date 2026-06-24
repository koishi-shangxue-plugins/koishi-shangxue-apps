import { Context } from 'koishi'
import { BotFinder } from '../../bot-finder'
import { encodeChannelId, encodeStringId, decodeChannelId } from '../../utils'
import { loggerError, logInfo } from '../../../src/index'
import { ActionHandler, ClientState, GroupInfo, UserInfo } from '../../types'

export function createGroupHandlers(ctx: Context, config?: { selfId: string; groupname?: string; appName?: string }, botFinder?: BotFinder): Record<string, ActionHandler> {
    // 如果没有传入 botFinder，则创建一个新的
    const finder = botFinder || new BotFinder(ctx)

    // 群组信息获取
    const getGroupInfoLogic = async (groupId: string | number, params: any, clientState: ClientState) => {
        try {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            // 先将映射的数字ID转换回真实的频道ID
            const realChannelId = await decodeChannelId(groupId, ctx)
            if (!realChannelId) {
                loggerError('Failed to decode channel ID %s', groupId)
                return {
                    id: groupId,
                    name: `群组${groupId}`,
                    member_count: 0,
                    max_member_count: 0,
                }
            }

            // 检查 bot 是否有 getGuild 方法
            if (typeof bot.getGuild === 'function') {
                const guild = await bot.getGuild(realChannelId)
                return {
                    id: groupId, // 返回原始的映射ID
                    name: guild.name || guild.id,
                    member_count: ('memberCount' in guild) ? guild.memberCount : 0,
                    max_member_count: ('maxMemberCount' in guild) ? guild.maxMemberCount : 0,
                }
            } else {
                // 如果没有 getGuild 方法，返回基本信息
                logInfo('Bot %s (platform: %s) does not have getGuild method', bot.selfId, bot.platform)
                return {
                    id: groupId, // 返回原始的映射ID
                    name: `群组${groupId}`,
                    member_count: 0,
                    max_member_count: 0,
                }
            }
        } catch (error) {
            loggerError('Failed to get group/guild info for %s: %s', groupId, error.message)

            // 如果无法获取群信息，返回基本信息
            return {
                id: groupId, // 返回原始的映射ID
                name: `群组${groupId}`,
                member_count: 0,
                max_member_count: 0,
            }
        }
    }

    return {
        // 获取群信息
        get_group_info: async (params: {
            group_id: string | number
            no_cache?: boolean
        }, clientState: ClientState) => {
            const groupInfo = await getGroupInfoLogic(params.group_id, params, clientState)
            return {
                group_id: groupInfo.id,
                group_name: groupInfo.name,
                member_count: groupInfo.member_count,
                max_member_count: groupInfo.max_member_count,
            } as GroupInfo
        },

        // 获取群列表
        get_group_list: async (params: {
            no_cache?: boolean
        }, clientState: ClientState) => {
            try {
                // 直接从数据库查询 channel 表
                if (!ctx.database || typeof ctx.database.get !== 'function') {
                    return []
                }

                // 查询 channel 表获取所有群组/频道信息
                const channels = await ctx.database.get('channel', {})

                // 去重 guildId，因为一个群可能有多个频道
                const uniqueGuildIds = new Set<string>()
                const groups: GroupInfo[] = []

                for (const channel of channels) {
                    const guildId = channel.guildId || channel.id

                    // 跳过已处理的 guildId
                    if (uniqueGuildIds.has(guildId)) {
                        continue
                    }
                    uniqueGuildIds.add(guildId)

                    const encodedId = await encodeChannelId(guildId, ctx)

                    groups.push({
                        group_id: encodedId,
                        group_name: config?.groupname || 'koishi-server-onebot',
                        member_count: 0,
                        max_member_count: 0,
                    } as GroupInfo)
                }

                logInfo('Retrieved %d groups from database for get_group_list', groups.length)
                return groups
            } catch (error) {
                loggerError('Failed to get group list: %s', error.message)
                return []
            }
        },

        // 获取频道信息 // get_group_info  这三个不一样吗
        get_guild_info: async (params: {
            guild_id: string | number
            no_cache?: boolean
        }, clientState: ClientState) => {
            const groupInfo = await getGroupInfoLogic(params.guild_id, params, clientState)
            return {
                guild_id: groupInfo.id,
                guild_name: groupInfo.name,
            }
        },

        // get_group_list 
        get_guild_channel_list: async (params: {
            no_cache?: boolean
        }, clientState: ClientState) => {
            try {
                // 直接从数据库查询 channel 表，避免依赖 bot
                if (!ctx.database || typeof ctx.database.get !== 'function') {
                    return []
                }

                // 查询 channel 表获取所有群组/频道信息
                const channels = await ctx.database.get('channel', {})

                // 去重 guildId，因为一个群可能有多个频道
                const uniqueGuildIds = new Set<string>()
                const guilds: Array<{ guild_id: string | number, guild_name: string }> = []

                for (const channel of channels) {
                    const guildId = channel.guildId || channel.id

                    // 跳过已处理的 guildId
                    if (uniqueGuildIds.has(guildId)) {
                        continue
                    }
                    uniqueGuildIds.add(guildId)

                    const encodedId = await encodeChannelId(guildId, ctx)

                    guilds.push({
                        guild_id: encodedId,
                        guild_name: config?.groupname || 'koishi-server-onebot',
                    })
                }

                logInfo('Retrieved %d guilds from database for get_guild_channel_list', guilds.length)
                return guilds
            } catch (error) {
                loggerError('Failed to get guild channel list: %s', error.message)
                return []
            }
        },

        // 获取频道列表 // get_group_list 
        get_guild_list: async (params: {
            no_cache?: boolean
        }, clientState: ClientState) => {
            try {
                // 直接从数据库查询 channel 表，避免依赖 bot
                if (!ctx.database || typeof ctx.database.get !== 'function') {
                    return []
                }

                // 查询 channel 表获取所有群组/频道信息
                const channels = await ctx.database.get('channel', {})

                // 去重 guildId，因为一个群可能有多个频道
                const uniqueGuildIds = new Set<string>()
                const guilds: Array<{ guild_id: string | number, guild_name: string }> = []

                for (const channel of channels) {
                    const guildId = channel.guildId || channel.id

                    // 跳过已处理的 guildId
                    if (uniqueGuildIds.has(guildId)) {
                        continue
                    }
                    uniqueGuildIds.add(guildId)

                    const encodedId = await encodeChannelId(guildId, ctx)

                    guilds.push({
                        guild_id: encodedId,
                        guild_name: config?.groupname || 'koishi-server-onebot',
                    })
                }

                logInfo('Retrieved %d guilds from database for get_guild_list', guilds.length)
                return guilds
            } catch (error) {
                loggerError('Failed to get guild list: %s', error.message)
                return []
            }
        },

        // 获取群成员信息
        get_group_member_info: async (params: {
            group_id: string | number
            user_id: string | number
            no_cache?: boolean
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            // 检查 bot 是否有 getGuildMember 方法
            if (typeof bot.getGuildMember !== 'function') {
                logInfo('Bot %s (platform: %s) does not have getGuildMember method, returning default member info for user %s', bot.selfId, bot.platform, params.user_id)

                const encodedUserId = await encodeStringId(params.user_id.toString(), ctx)
                return {
                    user_id: encodedUserId || params.user_id,
                    nickname: `用户${params.user_id}`,
                    card: '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo
            }

            // 先将映射的数字ID转换回真实的频道ID
            const realChannelId = await decodeChannelId(params.group_id, ctx)
            if (!realChannelId) {
                loggerError('Failed to decode channel ID %s for get_group_member_info', params.group_id)
                const encodedUserId = await encodeStringId(params.user_id.toString(), ctx)
                return {
                    user_id: encodedUserId || params.user_id,
                    nickname: `用户${params.user_id}`,
                    card: '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo
            }

            try {
                const member = await bot.getGuildMember(realChannelId, params.user_id.toString())
                const encodedUserId = await encodeStringId(member.user?.id, ctx)
                return {
                    user_id: encodedUserId || member.user?.id,
                    nickname: member.user?.name || '',
                    card: member.nick || '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: member.roles?.some(role => String(role) === 'admin') ? 'admin' :
                        member.roles?.some(role => String(role) === 'owner') ? 'owner' : 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo
            } catch (error) {
                loggerError('Failed to get member info for user %s in group %s (bot: %s): %s', params.user_id, params.group_id, bot.selfId, error.message)

                // 返回基本的成员信息
                const encodedUserId = await encodeStringId(params.user_id.toString(), ctx)
                return {
                    user_id: encodedUserId || params.user_id,
                    nickname: `用户${params.user_id}`,
                    card: '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo
            }
        },

        // 获取群成员列表
        get_group_member_list: async (params: {
            group_id: string | number
            no_cache?: boolean
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            if (typeof bot.getGuildMemberList !== 'function') {
                logInfo('Bot %s (platform: %s) does not have getGuildMemberList method, returning default member data', bot.selfId, bot.platform)

                // 返回默认的群成员数据 
                return [{
                    user_id: bot.sn,
                    nickname: bot.user?.name || `Bot${bot.selfId}`,
                    card: '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo]
            }

            // 先将映射的数字ID转换回真实的频道ID
            const realChannelId = await decodeChannelId(params.group_id, ctx)
            if (!realChannelId) {
                loggerError('Failed to decode channel ID %s for get_group_member_list', params.group_id)
                const encodedUserId = await encodeStringId(bot.selfId, ctx)
                return [{
                    user_id: encodedUserId || bot.selfId,
                    nickname: bot.user?.name || `Bot${bot.selfId}`,
                    card: '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo]
            }

            try {
                const members = await bot.getGuildMemberList(realChannelId)
                const memberList = (members.data || []).map(member => ({
                    user_id: parseInt(member.user?.id) || member.user?.id,
                    nickname: member.user?.name || '',
                    card: member.nick || '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: member.roles?.some(role => String(role) === 'admin') ? 'admin' :
                        member.roles?.some(role => String(role) === 'owner') ? 'owner' : 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo))

                logInfo('Retrieved %d members for group %s', memberList.length, params.group_id)
                return memberList
            } catch (error) {
                // 如果获取失败，也返回默认的群成员数据
                return [{
                    user_id: parseInt(bot.selfId) || bot.selfId,
                    nickname: bot.user?.name || `Bot${bot.selfId}`,
                    card: '',
                    sex: 'unknown',
                    age: 0,
                    area: '',
                    level: '0',
                    role: 'member',
                    title: '',
                    join_time: 0,
                    last_sent_time: 0,
                    unfriendly: false,
                    card_changeable: true,
                    shut_up_timestamp: 0,
                } as UserInfo]
            }
        },

        // 群组踢人
        set_group_kick: async (params: {
            group_id: string | number
            user_id: string | number
            reject_add_request?: boolean
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            try {
                await bot.kickGuildMember(params.group_id.toString(), params.user_id.toString())
                return {}
            } catch (error) {
                throw new Error('Failed to kick member')
            }
        },

        // 群组单人禁言
        set_group_ban: async (params: {
            group_id: string | number
            user_id: string | number
            duration?: number
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            try {
                await bot.muteGuildMember(params.group_id.toString(), params.user_id.toString(), params.duration || 0)
                return {}
            } catch (error) {
                throw new Error('Failed to mute member')
            }
        },

        // 群组全员禁言
        set_group_whole_ban: async (params: {
            group_id: string | number
            enable?: boolean
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            // 这个功能需要特殊的 API 支持，暂时返回成功
            return {}
        },

        // 群组设置管理员
        set_group_admin: async (params: {
            group_id: string | number
            user_id: string | number
            enable?: boolean
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            // 这个功能需要特殊的 API 支持，暂时返回成功
            return {}
        },

        // 设置群名片
        set_group_card: async (params: {
            group_id: string | number
            user_id: string | number
            card?: string
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            // 这个功能需要特殊的 API 支持，暂时返回成功
            return {}
        },

        // 退出群组
        set_group_leave: async (params: {
            group_id: string | number
            is_dismiss?: boolean
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            try { // TODO
                if ('leaveGuild' in bot && typeof bot.leaveGuild === 'function') {
                    await bot.leaveGuild(params.group_id.toString())
                } else {
                    throw new Error('leaveGuild method not available')
                }
                return {}
            } catch (error) {
                throw new Error('Failed to leave group')
            }
        },

        // 设置群组专属头衔
        set_group_special_title: async (params: {
            group_id: string | number
            user_id: string | number
            special_title?: string
            duration?: number
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            // 这个功能需要特殊的 API 支持，暂时返回成功
            return {}
        },

        // 处理加群请求
        set_group_add_request: async (params: {
            flag: string
            sub_type: 'add' | 'invite'
            approve: boolean
            reason?: string
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            // 这需要根据具体的 bot 实现来处理群请求
            return {}
        },

        // 获取群荣誉信息
        get_group_honor_info: async (params: {
            group_id: string | number
            type: string
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            // 这个功能需要特殊的 API 支持，返回空数据
            return {
                group_id: params.group_id,
                current_talkative: null,
                talkative_list: [],
                performer_list: [],
                legend_list: [],
                strong_newbie_list: [],
                emotion_list: [],
            }
        },

        // 获取群系统消息
        get_group_system_msg: async (params: {}, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            // 返回空的系统消息列表
            return {
                invited_requests: [],
                join_requests: [],
            }
        },

        // 获取群 @全体成员 剩余次数
        get_group_at_all_remain: async (params: {
            group_id: string | number
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // 返回默认值
            return {
                can_at_all: true,
                remain_at_all_count_for_group: 10,
                remain_at_all_count_for_uin: 5,
            }
        },
    }
}
