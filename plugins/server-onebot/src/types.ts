import { h } from 'koishi'

// OneBot v11 基础类型
export interface OneBotEvent {
    id: string
    time: number
    type: 'meta' | 'message' | 'notice' | 'request'
    detail_type: string
    sub_type: string
    self?: {
        platform: string
        user_id: string
    }
    [key: string]: any
}

export interface OneBotActionRequest {
    action: string
    params?: Record<string, any>
    echo?: string
    self?: {
        platform: string
        user_id: string
    }
}

export interface OneBotActionResponse {
    status: 'ok' | 'failed'
    retcode: number
    data?: any
    message?: string
    echo?: string
}

// 消息相关类型
export interface OneBotMessage {
    type: string
    data: Record<string, any>
}

export interface OneBotMessageEvent extends OneBotEvent {
    type: 'message'
    message_id: string
    user_id: string
    message: OneBotMessage[]
    alt_message: string
    sender: {
        user_id: string
        nickname: string
        card?: string
        role?: 'owner' | 'admin' | 'member'
    }
    group_id?: string
}

// 通知事件类型
export interface OneBotNoticeEvent extends OneBotEvent {
    type: 'notice'
    user_id: string
    group_id?: string
    operator_id?: string
}

// 请求事件类型
export interface OneBotRequestEvent extends OneBotEvent {
    type: 'request'
    user_id: string
    comment: string
    flag: string
    group_id?: string
}

// 元事件类型
export interface OneBotMetaEvent extends OneBotEvent {
    type: 'meta'
    meta_event_type: 'lifecycle' | 'heartbeat'
    status?: {
        online: boolean
        good: boolean
    }
    interval?: number
}

// WebSocket 客户端状态
export interface ClientState {
    authorized: boolean
    platform?: string
    selfId?: string
    lastHeartbeat?: number
    lastMessageId?: string
}

// 动作处理器类型
export type ActionHandler = (params: any, clientState: ClientState) => Promise<any>

// CQ 码相关类型
export interface CQCode {
    type: string
    data: Record<string, any>
}

// 用户信息类型
export interface UserInfo {
    user_id: string | number
    nickname: string
    sex?: 'male' | 'female' | 'unknown'
    age?: number
    card?: string
    area?: string
    level?: string
    role?: 'owner' | 'admin' | 'member'
    title?: string
}

// 群组信息类型
export interface GroupInfo {
    group_id: string | number
    group_name: string
    member_count?: number
    max_member_count?: number
}

// 好友信息类型
export interface FriendInfo {
    user_id: string | number
    nickname: string
    remark: string
}

// 版本信息类型
export interface VersionInfo {
    app_name: string
    app_version: string
    protocol_version: string
    [key: string]: any
}

// 状态信息类型
export interface StatusInfo {
    online: boolean
    good: boolean
    [key: string]: any
}

// 消息段类型映射
export type MessageSegmentType =
    | 'text'
    | 'face'
    | 'image'
    | 'record'
    | 'video'
    | 'at'
    | 'rps'
    | 'dice'
    | 'shake'
    | 'poke'
    | 'anonymous'
    | 'share'
    | 'contact'
    | 'location'
    | 'music'
    | 'reply'
    | 'forward'
    | 'node'
    | 'xml'
    | 'json'

// Koishi 元素到 OneBot 消息段的映射
export interface ElementToSegmentMap {
    text: { text: string }
    at: { qq: string | 'all', name?: string }
    image: { file: string, type?: string, url?: string }
    audio: { file: string, url?: string }
    video: { file: string, url?: string }
    face: { id: string }
    reply: { id: string }
    [key: string]: Record<string, any>
}
