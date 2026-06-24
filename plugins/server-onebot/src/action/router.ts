import { OneBotActionRequest, OneBotActionResponse, ClientState, ActionHandler } from '../types'
import { logInfo, loggerError, loggerInfo } from '../index'
import { createActionHandlers } from './handlers'
import { Context } from 'koishi'

export class ActionRouter {
    private handlers: Map<string, ActionHandler> = new Map()

    constructor(private ctx: Context, private config?: { selfId: string, selfname?: string, groupname?: string, appName?: string }) {
        this.setupHandlers()
    }

    private setupHandlers() {
        const handlers = createActionHandlers(this.ctx, this.config)

        for (const [action, handler] of Object.entries(handlers)) {
            this.handlers.set(action, handler)
        }
    }

    async handle(request: OneBotActionRequest, clientState: ClientState): Promise<OneBotActionResponse> {
        const { action, echo } = request
        const params = request.params ?? {}

        // 检查 action 是否存在
        if (!action) {
            loggerError('[onebot:unimplemented-api] Action is missing or undefined in request: %o', request)
            return {
                status: 'failed',
                retcode: 1400,
                message: 'Missing action field',
                echo,
            }
        }

        // 查找处理器
        const handler = this.handlers.get(action)
        if (!handler) {
            // 记录未实现的 API
            // loggerError('[onebot:unimplemented-api] Action: %s not implemented. Available actions: %o',
            //     action, Array.from(this.handlers.keys()).sort())
            loggerError('[onebot:unimplemented-api] Action: %s not implemented.', action)
            return {
                status: 'failed',
                retcode: 1404,
                message: `Unknown action: ${action}`,
                echo,
            }
        }

        try {
            logInfo('[onebot:handler-call] Calling handler for action: %s', action)
            const data = await handler(params, clientState)
            return {
                status: 'ok',
                retcode: 0,
                data,
                echo,
            }
        } catch (error) {
            // 检查是否是未知动作错误，返回 404
            if (error.message.includes('Unknown action:')) {
                return {
                    status: 'failed',
                    retcode: 404,
                    data: null,
                    message: error.message,
                    echo,
                }
            }

            return {
                status: 'failed',
                retcode: 1400,
                message: error.message,
                echo,
            }
        }
    }

    /**
     * 注册新的动作处理器
     */
    register(action: string, handler: ActionHandler) {
        this.handlers.set(action, handler)
    }

    /**
     * 获取所有已注册的动作
     */
    getActions(): string[] {
        return Array.from(this.handlers.keys())
    }
}
