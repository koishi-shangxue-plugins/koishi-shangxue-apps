import { ActionHandler, ClientState, UserInfo, FriendInfo } from '../../types'
import { logInfo, loggerError, loggerInfo } from '../../../src/index'
import { BotFinder } from '../../bot-finder'
import { Context, Universal } from 'koishi'

export function createUserHandlers(ctx: Context, config?: { selfId: string, selfname?: string, appName?: string }, botFinder?: BotFinder): Record<string, ActionHandler> {
    // 如果没有传入 botFinder，则创建一个新的
    const finder = botFinder || new BotFinder(ctx)
    const defaultUserId = config?.selfId || parseInt(config.selfId)
    const defaultNickname = config?.selfname

    return {
        // 获取登录号信息
        get_login_info: async (params: {}, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                // 如果没有找到 bot，返回默认信息
                return {
                    user_id: defaultUserId,
                    nickname: defaultNickname,
                }
            }

            try {
                const self = await bot.getSelf()
                return {
                    user_id: parseInt(self.userId) || defaultUserId,
                    nickname: defaultNickname,
                }
            } catch (error) {
                // 如果获取失败，返回默认信息
                return {
                    user_id: parseInt(bot.selfId) || defaultUserId,
                    nickname: defaultNickname,
                }
            }
        },

        // 获取陌生人信息
        get_stranger_info: async (params: {
            user_id: string | number
            no_cache?: boolean
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            try {
                const user = await bot.getUser(params.user_id.toString())
                return {
                    user_id: parseInt(user.id) || user.id,
                    nickname: user.name || user.nick || '',
                    sex: 'unknown',
                    age: 0,
                } as UserInfo
            } catch (error) {
                throw new Error('User not found')
            }
        },

        // 获取好友列表
        get_friend_list: async (params: {}, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }

            try {
                const friends = await bot.getFriendList()
                return (friends.data || []).map(friend => {
                    const friendId = 'id' in friend ? friend.id : ('userId' in friend ? friend.userId : '')
                    const friendName = 'name' in friend ? friend.name : ''
                    const friendNick = 'nick' in friend ? friend.nick : ''
                    return {
                        user_id: parseInt(String(friendId)) || friendId,
                        nickname: friendName || friendNick || '',
                        remark: friendName || friendNick || '',
                    } as FriendInfo
                })
            } catch (error) {
                return []
            }
        },

        // 删除好友
        delete_friend: async (params: {
            user_id: string | number
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            return {}
        },

        // 处理加好友请求
        set_friend_add_request: async (params: {
            flag: string
            approve: boolean
            remark?: string
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            return {}
        },

        // 发送好友赞
        send_like: async (params: {
            user_id: string | number
            times?: number
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            return {}
        },

        // 获取单向好友列表
        get_unidirectional_friend_list: async (params: {}, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            return []
        },

        // 删除单向好友
        delete_unidirectional_friend: async (params: {
            user_id: string | number
        }, clientState: ClientState) => {
            const bot = await finder.findBot(params, clientState)
            if (!bot) {
                throw new Error('Bot not found')
            }
            // TODO
            return {}
        },
    }
}
