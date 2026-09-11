import jp from 'jsonpath'
import app from '../../main'
import anime from 'animejs'
import option from '../../function/option'

import { Logger, PopInfo, PopType } from '../../function/base'
import { useSettingsStore } from '../../state/settings'
import { v4 as uuid } from 'uuid'
import { Connector } from '../../function/connect'
import { getBootstrap, getLogins } from '../../function/satori'
import {
    BotMsgType,
    MsgItemElem,
    UserFriendElem,
    UserGroupElem,
} from '../elements/information'
import { sendStatEvent } from './appUtil'
import { backend } from '../../runtime/backend'
import { useContactStore } from '../../state/contact'
import { useUIStore } from '../../state/ui'
import { useAuthStore } from '../../state/auth'
import { useChatStore } from '../../state/chat'
import {
    findSessionContact,
    getSessionAliases,
    getSessionDedupKey,
    getSessionId,
    mergeSessionState,
    normalizeSessionId,
    upsertSessionContact,
} from './sessionUtil'

const logger = new Logger()

/**
 * 根据 JSON Path 映射数据返回需要的内容体
 * @param msg
 * @param map
 * @returns
 */
export function getMsgData(
    name: string,
    msg: { [key: string]: any },
    map: string | { [key: string]: any },
) {
    let back = undefined as any
    // 解析数据
    if (map != undefined) {
        if (typeof map == 'string' || map.source != undefined) {
            try {
                if (msg == null || typeof msg != 'object' || Array.isArray(msg)) {
                    return back
                }
                back = jp.query(
                    msg,
                    replaceJPValue(typeof map == 'string' ? map : map.source),
                )
                if (back && typeof map != 'string' && map.list != undefined) {
                    const backList = [] as any[]
                    back.forEach((item) => {
                        if (item == null || typeof item != 'object') return
                        const itemObj = {} as any
                        Object.keys(map.list).forEach((key: string) => {
                            if (typeof map.list[key] == 'string' && map.list[key] != '') {
                                if (map.list[key].startsWith('/'))
                                    itemObj[key] =
                                        item[map.list[key].substring(1)]
                                else {
                                    let nameKey = map.list[key]
                                    let regexKey = null
                                    if (nameKey.indexOf('@') > -1) {
                                        const [name, key] = nameKey.split('@')
                                        nameKey = name
                                        regexKey = key
                                    }
                                    itemObj[key] = jp.query(
                                        item,
                                        replaceJPValue(nameKey),
                                    )
                                    if (regexKey != null) {
                                        const regex = new RegExp(regexKey)
                                        const match = itemObj[key].match(regex)
                                        if (match != null) {
                                            itemObj[key] = match[0]
                                        }
                                    }
                                }
                            }
                        })
                        backList.push(itemObj)
                    })
                    back = backList
                }
            } catch (ex) {
                logger.error(
                    ex as Error,
                    `解析消息 JSON 错误：${name} -> ${map}`,
                )
            }
        } else {
            const data = {} as { [key: string]: any }
            Object.keys(map).forEach((key) => {
                if (
                    map[key] != undefined &&
                    map[key] !== '' &&
                    !key.startsWith('_')
                ) {
                    if (msg == null || typeof msg != 'object' || Array.isArray(msg)) {
                        return
                    }
                    try {
                        data[key] = jp.query(msg, replaceJPValue(map[key]))[0]
                    } catch (ex) {
                        logger.error(
                            ex as Error,
                            `解析 JSON 错误：${name} -> ${map}`,
                        )
                    }
                }
            })
            back = [data]
        }
    }
    return back
}
function replaceJPValue(jpStr: string) {
    const authStore = useAuthStore()
    return jpStr.replaceAll('<uin>', authStore.loginInfo.uin)
}

/**
 * 将一个消息体列表组装为基础消息列表便于解析（message 消息体可能不正确）
 * @param msgList
 * @param map
 * @returns
 */
export function buildMsgList(msgList: { [key: string]: any }): {
    [key: string]: any
} {
    const authStore = useAuthStore()
    const path = jp.parse(authStore.jsonMap.message_list.source)
    const keys = [] as string[]
    path.forEach((item) => {
        if (item.expression.value != '*' && item.expression.value != '$') {
            keys.push(item.expression.value)
        }
    })
    const result = {} as any
    let acc = result
    keys.forEach((key, index) => {
        if (index === keys.length - 1) {
            acc[key] = msgList
        } else {
            acc[key] = {}
        }
        acc = acc[key]
    })
    return result
}

export function parseMsgList(
    list: any,
    map: string,
    valueMap: { [key: string]: any },
): any[] {
    const uiStore = useUIStore()
    const authStore = useAuthStore()
    if (!Array.isArray(list) || list.length === 0 || !list[0]) {
        return []
    }
    // 判断消息类型
    if (typeof list[0].message == 'string') {
        uiStore.msgType = BotMsgType.CQCode
    } else {
        uiStore.msgType = BotMsgType.Array
    }
    // 消息类型的特殊处理
    switch (uiStore.msgType) {
        case BotMsgType.CQCode: {
            // 这儿会默认处理成 oicq2 的格式，所以 CQCode 消息请使用 oicq2 配置文件修改
            for (let i = 0; i < list.length; i++) {
                list[i] = parseCQ(list[i])
            }
            break
        }
        case BotMsgType.Array: {
            // 非扁平化消息体，这儿会取 _type 后半段的 JSON Path 将结果并入 message
            for (let i = 0; i < list.length; i++) {
                let msgList = list[i].message
                if (msgList == undefined) {
                    msgList = list[i].content
                }
                if (!Array.isArray(msgList)) {
                    continue
                }
                for (let j = 0; j < msgList.length; j++) {
                    const data = getMsgData(
                        'message_list_message',
                        msgList[j],
                        map,
                    )
                    // 如果 data 里有 type 字段，改成 type_item
                    if (data[0] && data[0]['type'] != undefined) {
                        data[0]['type_item'] = data[0]['type']
                        delete data[0]['type']
                    }
                    if (data != undefined && data.length == 1) {
                        msgList[j] = Object.assign(msgList[j], data[0])
                    }
                }
            }
        }
    }
    // 消息字段的标准化特殊处理
    if (valueMap != undefined) {
        for (let i = 0; i < list.length; i++) {
            Object.entries(valueMap).forEach(([type, values]) => {
                Object.entries(values).forEach(([key, value]) => {
                    let content = list[i].message
                    if (content == undefined) {
                        content = list[i].content
                    }
                    if (!Array.isArray(content)) {
                        return
                    }
                    content.forEach((item: any) => {
                        if (item.type == type) {
                            item[key] = jp.query(item, value as string)[0]
                        }
                        // 顺便把没用的 data 删了，这边要注意 item.data 必须是个对象
                        // 因为有些消息类型的 data 就叫 data
                        if (typeof item.data == 'object') {
                            delete item.data
                        }
                    })
                    // 其他处理
                    if (list[i].content != undefined) {
                        // 把 content 改成 message
                        list[i].message = content
                        delete list[i].content
                        // 添加一个 sender.user_id 为 user_id
                        list[i].sender = {
                            user_id: list[i].user_id,
                            nickname: list[i].nickname,
                        }
                    }
                })
            })
            // 补充 infoList
            const infoList = getMsgData('message_info', list[i], authStore.jsonMap.message_info)
            if (infoList != undefined) {
                list[i].infoList = infoList[0]
            }
        }
    }
    return list
}

/**
 * 将消息对象处理为扁平字符串
 * @param message 待处理的消息对象
 * @returns 字符串
 */
export function getMsgRawTxt(data: any): string {
    const { $t } = app.config.globalProperties
    const chatStore = useChatStore()
    const authStore = useAuthStore()

    const message = data.message as [{ [key: string]: any }]
    if (!Array.isArray(message)) {
        return data.raw_message ?? ''
    }
    const fromId = data.group_id ?? data.user_id
    let back = ''
    for (let i = 0; i < message.length; i++) {
        try {
            switch (message[i].type) {
                case 'at':
                    if (message[i].text == undefined) {
                        // 群内才可以 at，如果 at 消息中没有 text 字段
                        // 尝试去群成员列表中找到对应的昵称，群成员列表只在当前打开的群才有
                        if (
                            chatStore.chatInfo.show.id == fromId &&
                            chatStore.chatInfo.info.group_members
                        ) {
                            const user =
                                chatStore.chatInfo.info.group_members.find(
                                    (item) => item.user_id == message[i].qq,
                                )
                            if (user) {
                                back +=
                                    '@' +
                                    (user.card && user.card != '' ? user.card : user.nickname)
                                break
                            }
                        }
                        break
                    }
                    const atText = String(message[i].text)
                    back += atText.startsWith('@') ? atText : '@' + atText
                    break
                case 'text':
                    back += message[i].text
                        .replaceAll('\n', ' ')
                        .replaceAll('\r', ' ')
                    break
                case 'i18n':
                    back += message[i].path || '[i18n]'
                    break
                case 'forward':
                    back += '[' + $t('聊天记录') + ']'
                    break
                case 'face':
                    back += '[' + $t('表情') + ']'
                    break
                case 'bface':
                    back += message[i].text
                    break
                case 'image':
                    back += '[' + $t('图片') + ']'
                    break
                case 'record':
                    back += '[' + $t('语音') + ']'
                    break
                case 'video':
                    back += '[' + $t('视频') + ']'
                    break
                case 'file':
                    back += '[' + $t('文件') + ']'
                    break
                case 'json': {
                    try {
                        back += JSON.parse(message[i].data).prompt
                    } catch (error) {
                        back += '[' + $t('卡片消息') + ']'
                    }
                    break
                }
                case 'xml': {
                    let name = message[i].data.substring(
                        message[i].data.indexOf('<source name="') + 14,
                    )
                    name = name.substring(0, name.indexOf('"'))
                    back += '[' + name + ']'
                    break
                }
            }
        } catch (error) {
            logger.error(
                error as Error,
                '解析消息短格式错误：' + JSON.stringify(message[i]),
            )
        }
    }
    return back
}

export function hasAtMe(data: any): boolean {
    const message = data?.message
    if (!Array.isArray(message)) return false
    const authStore = useAuthStore()
    const selfId = String(authStore.loginInfo.uin ?? '')
    if (!selfId) return false
    return message.some((item) => item?.type === 'at' && String(item.qq) === selfId)
}

/**
 * 将消息对象转换为 CQCode
 * @param data
 * @returns CQCode 字符串
 */
export function parseJSONCQCode(data: any) {
    let back = ''
    data.forEach((item: any) => {
        if (item.type != 'text') {
            let body = '[CQ:' + item.type + ','
            Object.keys(item).forEach((key: any) => {
                body += `${key}=${item[key]},`
            })
            body = body.substring(0, body.length - 1) + ']'
            back += body
        } else {
            back += item.text
        }
    })
    return back
}

/**
 * 将扁平的 CQCode 消息处理成消息对象
 * @param msg CQCode 消息
 * @returns 消息对象
 */
export function parseCQ(data: any) {
    let msg = data.message as string
    // 将纯文本也处理为 CQCode 格式
    // PS：这儿不用担心方括号本身，go-cqhttp 会把它转义掉
    let reg = /^[^\]]+?\[|\].+\[|\][^[]+$|^[^[\]]+$/g
    const textList = msg.match(reg)
    if (textList !== null) {
        textList.forEach((item) => {
            item = item.replace(']', '').replace('[', '')
            msg = msg.replace(item, `[CQ:text,text=${item}]`)
        })
    }
    // 拆分 CQCode
    reg = /\[.+?\]/g
    msg = msg.replaceAll('\n', '\\n')
    const list = msg.match(reg)
    // 处理为 object
    const back: { [ket: string]: any }[] = []
    reg = /\[CQ:([^,]+),(.*)\]/g
    if (list !== null) {
        list.forEach((item) => {
            if (item.match(reg) !== null) {
                const info: { [key: string]: any } = { type: RegExp.$1 }
                RegExp.$2.split(',').forEach((key: string) => {
                    const kv = [] as string[]
                    kv.push(key.substring(0, key.indexOf('=')))
                    // 对 html 转义字符进行反转义
                    const a = document.createElement('a')
                    a.innerHTML = key.substring(key.indexOf('=') + 1)
                    kv.push(a.innerText)
                    info[kv[0]] = kv[1]
                })
                // 对文本消息特殊处理
                if (info.type == 'text') {
                    info.text = RegExp.$2
                        .substring(RegExp.$2.lastIndexOf('=') + 1)
                        .replaceAll('\\n', '\n')
                    // 对 html 转义字符进行反转义
                    const a = document.createElement('a')
                    a.innerHTML = info.text
                    info.text = a.innerText
                }
                // 对回复消息进行特殊处理
                if (info.type == 'reply') {
                    data.source = {
                        user_id: info.user_id,
                        seq: info.seq,
                        message: info.message,
                    }
                } else {
                    back.push(info)
                }
            }
        })
    }
    logger.debug('解析 CQ 消息结果: ' + JSON.stringify(back))
    data.message = back
    return data
}

/**
* 发送消息
* @param id 发送对象的 id
* @param type 发送对象的类型
* @param msg 消息体
* @param preShow 是否消息预显
* @param echo 回显的事件名
*/
function parsePreviewMarkup(source: string): MsgItemElem[] {
    const result: MsgItemElem[] = []
    const tagPattern = /<([a-z][\w:-]*)\s+([^>]*?)\/?>/gi
    let last = 0
    let match: RegExpExecArray | null
    while ((match = tagPattern.exec(source)) !== null) {
        if (match.index > last) {
            result.push({ type: 'text', text: source.slice(last, match.index) })
        }
        const attrs = match[2] ?? ''
        const src = attrs.match(/src\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1]
            ?? attrs.match(/src\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[2]
            ?? ''
        const name = attrs.match(/name\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1]
            ?? attrs.match(/name\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[2]
            ?? ''
        const id = attrs.match(/id\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1]
            ?? attrs.match(/id\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[2]
            ?? ''
        const content = attrs.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1]
            ?? attrs.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[2]
            ?? ''
        const data = attrs.match(/data\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[1]
            ?? attrs.match(/data\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.[2]
            ?? ''
        const tag = String(match[1] ?? '').toLowerCase()
        if (tag === 'at') {
            result.push({ type: 'at', qq: id, text: name || id })
        } else if (tag === 'quote') {
            result.push({ type: 'reply', id })
        } else if (tag === 'sharp') {
            result.push({ type: 'text', text: name ? `#${name}` : `#${id}` })
        } else if (tag === 'text') {
            result.push({ type: 'text', text: content })
        } else if (['img', 'image', 'face', 'mface', 'file', 'audio', 'video'].includes(tag)) {
            const type = tag === 'file'
                ? 'file'
                : tag === 'audio'
                    ? 'record'
                    : tag === 'video'
                        ? 'video'
                        : 'image'
            result.push({
                type,
                file: src,
                url: src,
                ...(name ? { name } : {}),
            })
        } else {
            result.push({
                type: tag,
                ...(src ? { src, file: src, url: src } : {}),
                ...(name ? { name } : {}),
                ...(content ? { content } : {}),
                ...(data ? { data } : {}),
            })
        }
        last = match.index + match[0].length
    }
    if (last < source.length) {
        result.push({ type: 'text', text: source.slice(last) })
    }
    return result.length > 0 ? result : [{ type: 'text', text: source }]
}

function getBase64Source(item: any): string {
    const file = String(item?.file ?? '')
    const url = String(item?.url ?? '')
    if (file.startsWith('base64://')) return file.slice(9)
    if (file.startsWith('data:')) return file
    if (url.startsWith('data:')) return url
    if (url.startsWith('base64://')) return url.slice(9)
    return ''
}

function isBase64Source(source: string): boolean {
    return source.startsWith('base64://') || source.startsWith('data:')
}

function toPreviewImageSrc(item: any): string {
    const source = String(item?.url ?? item?.file ?? '')
    if (source.startsWith('base64://')) {
        return `data:image/png;base64,${source.slice(9)}`
    }
    if (source.startsWith('data:') || source.startsWith('http:') || source.startsWith('https:')) {
        return source
    }
    return getLocalMediaUrl(source)
}

export function getLocalMediaUrl(value: string): string {
    if (!value) return value
    const isLocalPath = value.startsWith('file:') ||
        /^[a-z]:[\\/]/i.test(value) ||
        value.startsWith('\\\\')
    if (!isLocalPath) return value
    const fileName = value
        .replace(/^file:\/\//i, '')
        .split(/[\\/]/)
        .pop() || value
    return `${location.origin}/chat-patch/api/media?file=${encodeURIComponent(fileName)}`
}

function escapeMarkupAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

async function uploadBase64Source(source: string, name = ''): Promise<string> {
    try {
        const info = await getBootstrap()
        const basePath = info.basePath || '/chat-patch'
        const normalized = source.startsWith('base64://') ? source.slice(9) : source
        const base64 = normalized.includes('base64,')
            ? normalized.slice(normalized.indexOf('base64,') + 7)
            : normalized
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const mime = normalized.startsWith('data:')
            ? normalized.slice(5, normalized.indexOf(';')).toLowerCase()
            : 'application/octet-stream'
        const query = name ? `?name=${encodeURIComponent(name)}` : ''
        const response = await fetch(`${location.origin}${basePath}/api/upload-media${query}`, {
            method: 'POST',
            headers: { 'Content-Type': mime || 'application/octet-stream' },
            body: bytes,
        })
        if (!response.ok) return ''
        const result = await response.json() as Record<string, unknown>
        return typeof result.path === 'string' ? result.path : ''
    } catch {
        return ''
    }
}

async function persistBase64Markup(markup: string): Promise<string> {
    const pattern = /<(img|audio|video|file)\b([^>]*)>/gi
    let output = ''
    let last = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(markup)) !== null) {
        const tag = match[1]
        let attrs = match[2]
        const selfClosing = /\/\s*$/.test(attrs)
        if (selfClosing) attrs = attrs.replace(/\/\s*$/, '')
        const srcMatch = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(attrs)
        const nameMatch = /\bname\s*=\s*(["'])(.*?)\1/i.exec(attrs)
        if (srcMatch && isBase64Source(srcMatch[2])) {
            const localUrl = await uploadBase64Source(srcMatch[2], nameMatch?.[2] ?? '')
            if (!localUrl) throw new Error('媒体上传失败，未发送原始 Base64')
            attrs = attrs.replace(srcMatch[0], `src="${escapeMarkupAttr(localUrl)}"`)
        }
        output += markup.slice(last, match.index)
        output += `<${tag}${attrs}${selfClosing ? '/>' : '>'}`
        last = match.index + match[0].length
    }
    return output + markup.slice(last)
}

async function persistBase64Media(msg: string | any[] | undefined): Promise<string | any[] | undefined> {
    if (typeof msg === 'string') return persistBase64Markup(msg)
    if (!Array.isArray(msg)) return msg
    return Promise.all(msg.map(async (item) => {
        const source = getBase64Source(item)
        if (!source) return item
        const localUrl = await uploadBase64Source(source, item?.fileName ?? item?.name ?? '')
        if (!localUrl) throw new Error('媒体上传失败，未发送原始 Base64')
        return {
            ...item,
            file: localUrl,
            url: localUrl,
            localPath: localUrl,
        }
    }))
}

export async function sendMsgRaw(
    id: string,
    type: string,
    msg: string | any[] | undefined,
    preShow = false,
    echo = 'sendMsgBack',
    targetChannelId?: string,
    targetGuildId?: string,
) {
    const chatStore = useChatStore()
    const authStore = useAuthStore()
    const contactStore = useContactStore()
    const uiStore = useUIStore()
    if (id === undefined || id === null || String(id) === '' || String(id) === '0') return
    // 如果消息为空则不发送
    if (msg == undefined || msg == '' || (Array.isArray(msg) && msg.length == 0)) {
        return
    }
    // 预发送消息
    // 将消息构建为完整消息体先显示出去
    const msgUUID = uuid()
    if (preShow) {
        const botLogin = getLogins().find((item) => {
            return item.platform === String(authStore.loginInfo.platform ?? '') &&
                item.selfId === String(authStore.loginInfo.uin ?? '')
        })
        const preShowMsg = typeof msg === 'string'
            ? parsePreviewMarkup(msg)
            : JSON.parse(JSON.stringify(msg));
        preShowMsg.forEach((item: any) => {
            // 对 base64 图片做特殊处理
            if (item.type == 'image') {
                item.url = toPreviewImageSrc(item)
            }
            if (item.type == 'record' && String(item?.file ?? '').startsWith('base64://')) {
                const b64Str = (item.file as string).substring(9)
                item.url = 'data:audio/webm;base64,' + b64Str
            }
        })
        const showMsg = {
            revoke: true,
            fake_msg: true,
            message_id: msgUUID,
            fake_message_id: msgUUID,       // 用来作为这条消息的唯一标识，防止 message_id 刷新导致的闪烁
            message_type: chatStore.chatInfo.show.type,
            time: parseInt(String(new Date().getTime() / 1000)),
            local_time: Date.now(),
            timestamp_ms: Date.now(),
            time_ms: Date.now(),
            post_type: 'message',
            sender: {
                user_id: authStore.loginInfo.uin,
                nickname: authStore.loginInfo.nickname,
                avatar: authStore.loginInfo.avatar || botLogin?.avatar,
            },
            message: preShowMsg,
        } as { [key: string]: any }
        showMsg.raw_message = getMsgRawTxt(showMsg)

        const isGroupChat = chatStore.chatInfo.show.type === 'group'
        showMsg.channel_type = isGroupChat ? 0 : 1
        if (isGroupChat) {
            showMsg.group_id = chatStore.chatInfo.show.id
        } else {
            showMsg.user_id = chatStore.chatInfo.show.id
        }
        chatStore.messageList = chatStore.messageList.concat([showMsg])

        // 发送方不一定会上报自身消息事件，先用预发送消息同步会话预览。
        const sessionId = normalizeSessionId(
            targetChannelId
            || chatStore.chatInfo.show.channel_id
            || String(id).split('/')[0],
        )
        const session = contactStore.baseOnMsgList.get(sessionId) ??
            findSessionContact(contactStore.userList, sessionId)
        if (session) {
            const raw = getMsgRawTxt(showMsg)
            const senderName = authStore.loginInfo.nickname
            Object.assign(session, {
                message_id: showMsg.message_id,
                raw_msg: type === 'group' && senderName ? `${senderName}: ${raw}` : raw,
                raw_msg_base: raw,
                time: showMsg.time * 1000,
            })
            if (type === 'group') {
                // 群发送预览同步到联系人列表，同时进入群会话列表
                contactStore.userList = upsertSessionContact(contactStore.userList, session)
            } else if (session._groupMember) {
                session._groupMember = false
            }
            contactStore.baseOnMsgList.set(normalizeSessionId(sessionId), session)
            updateBaseOnMsgList()
        }
    }
    // 预发送保留 Base64 用于本地预览；真正发送前先写入后端临时目录
    try {
        msg = await persistBase64Media(msg)
    } catch (error) {
        logger.error(error as Error, '媒体上传失败，已阻止发送原始 Base64')
        return
    }
    const fakeMessage = chatStore.messageList.find((item) => {
        return String(item.fake_message_id ?? '') === msgUUID
    })
    if (fakeMessage) {
        if (typeof msg === 'string') {
            fakeMessage.message = parsePreviewMarkup(msg)
        } else if (Array.isArray(msg)) {
            fakeMessage.message = msg
        }
        fakeMessage.raw_message = getMsgRawTxt(fakeMessage)
    }
    // 检查消息体是否需要处理
    if (uiStore.msgType == BotMsgType.Array) {
        if (msg && typeof msg != 'string') {
            const newMsg = [] as any
            msg.forEach((item) => {
                const newResult = {} as { [key: string]: any }
                newResult.type = item.type
                newResult.data = item
                delete newResult.data.type
                // 特殊处理，如果 newResult.data 里有 _type 字段，给它改成 type
                if (newResult.data._type != undefined) {
                    newResult.data.type = newResult.data._type
                    delete newResult.data._type
                }
                newMsg.push(newResult)
            })
            msg = newMsg
        }
    }
    if (msg !== undefined && msg.length > 0) {
        if (authStore.jsonMap.name === 'Lagrange.OneBot') {
            lgrSendMsg(id, msg, type, echo + '_uuid_' + msgUUID)
            sendStatEvent('send_msg', { type: type })
            return
        }
        switch (type) {
            case 'group':
                Connector.send(
                    authStore.jsonMap.message_list.name_group_send ??
                    'send_msg',
                    {
                        group_id: id,
                        guild_id: String(targetGuildId ?? chatStore.chatInfo.show.guild_id ?? id),
                        channel_id: String(targetChannelId ?? chatStore.chatInfo.show.channel_id ?? id),
                        message: msg,
                    },
                    echo + '_uuid_' + msgUUID,
                )
                break
            case 'user': {
                if (String(id).indexOf('/') > 1) {
                    Connector.send(
                        authStore.jsonMap.message_list.name_temp_send ??
                        'send_temp_msg',
                        {
                            user_id: id.split('/')[0],
                            group_id: id.split('/')[1],
                            channel_id: String(targetChannelId ?? chatStore.chatInfo.show.channel_id ?? String(id).split('/')[0]),
                            message: msg,
                        },
                        echo + '_uuid_' + msgUUID,
                    )
                } else {
                    Connector.send(
                        authStore.jsonMap.message_list.name_user_send ??
                        'send_msg',
                        {
                            user_id: id,
                            channel_id: String(targetChannelId ?? chatStore.chatInfo.show.channel_id ?? String(id)),
                            message: msg,
                        },
                        echo + '_uuid_' + msgUUID,
                    )
                }
                break
            }
        }
        sendStatEvent('send_msg', { type: type })
    }
}

export function updateLastestHistory(item: UserFriendElem & UserGroupElem) {
    const authStore = useAuthStore()
    // 发起获取历史消息请求
    const type = item.user_id ? 'user' : 'group'
    const id = item.user_id ? item.user_id : item.group_id
    const sessionId = normalizeSessionId(getSessionId(item))
    let name
    if (authStore.jsonMap.message_list && type != 'group') {
        name = authStore.jsonMap.message_list.private_name
    } else {
        name = authStore.jsonMap.message_list.name
    }
    Connector.send(
        name ?? 'get_chat_history',
        {
            message_type: authStore.jsonMap.message_list.message_type[type],
            group_id: id,
            user_id: id,
            message_seq: 0,
            message_id: 0,
            count: 1,
        },
        'getChatHistoryOnMsg_' + sessionId,
    )
}

function getSessionTime(item: UserFriendElem & UserGroupElem) {
    const time = Number(item.time ?? 0)
    return Number.isFinite(time) ? time : 0
}

function getSessionSortName(item: UserFriendElem & UserGroupElem) {
    return item.py_start ?? getShowName(item.group_name ?? item.nickname ?? '', item.remark ?? '')
}

function normalizeBaseSessionMap() {
    const contactStore = useContactStore()
    let needNormalize = false
    const seen = new Map<string, UserFriendElem & UserGroupElem>()
    for (const [rawKey, item] of contactStore.baseOnMsgList) {
        const id = getSessionDedupKey(item)
        if (id === '0' || id === '') continue
        const existing = seen.get(id)
        if (existing && existing !== item) {
            needNormalize = true
            continue
        }
        seen.set(id, item)
        if (
            typeof rawKey !== 'string' ||
            !getSessionAliases(item).includes(normalizeSessionId(rawKey))
        ) {
            needNormalize = true
        }
    }
    if (!needNormalize) return

    const canonical = new Map<string, UserFriendElem & UserGroupElem>()
    contactStore.baseOnMsgList.forEach((item) => {
        const id = getSessionDedupKey(item)
        if (id === '0' || id === '') return
        const existing = canonical.get(id)
        if (existing && existing !== item) {
            canonical.set(id, mergeSessionState(existing, item))
        } else if (!existing) {
            canonical.set(id, item)
        }
    })
    contactStore.baseOnMsgList.clear()
    for (const [id, item] of canonical) {
        for (const alias of getSessionAliases(item)) {
            contactStore.baseOnMsgList.set(alias, item)
        }
    }
}

function getSessionList() {
    const contactStore = useContactStore()
    const settingsStore = useSettingsStore()
    const sessionMap = new Map<string, UserFriendElem & UserGroupElem>()

    const addSession = (item: UserFriendElem & UserGroupElem) => {
        const id = getSessionDedupKey(item)
        if (id === '0' || id === '') return
        const existing = sessionMap.get(id)
        if (existing && existing !== item) {
            sessionMap.set(id, mergeSessionState(existing, item))
        } else if (!existing) {
            sessionMap.set(id, item)
        }
    }

    if (settingsStore.sysConfig.session_display_mode === 'all') {
        contactStore.userList.forEach((item) => {
            if (!item._groupMember) addSession(item)
        })
    }

    contactStore.baseOnMsgList.forEach((item) => {
        addSession(item)
    })

    return [...sessionMap.values()]
}

/**
 * 刷新消息列表排序
 */
export function updateBaseOnMsgList() {
    const contactStore = useContactStore()
    const settingsStore = useSettingsStore()
    normalizeBaseSessionMap()
    const allList = getSessionList()
    // 先更具 item.always_top 是不是 true 拆为两个数组
    const topList = allList.filter((item) => item.always_top)
    const normalList = allList.filter((item) => !item.always_top)
    // 将两个数组按照 item.time 降序排序
    // item.time 不存在或者相同时按照 item.py_start 降序排序

    const sortFun = (
        a: UserFriendElem & UserGroupElem,
        b: UserFriendElem & UserGroupElem,
    ) => {
        const timeA = getSessionTime(a)
        const timeB = getSessionTime(b)
        if (timeA !== timeB) return timeB - timeA

        return getSessionSortName(b).localeCompare(getSessionSortName(a))
    }
    topList.sort(sortFun)
    normalList.sort(sortFun)

    let onMsgList = [] as any[]
    let groupAssistList = [] as any[]
    if (settingsStore.sysConfig.bubble_sort_user) {
        // 将 normalList 进行拆分
        const shouldShowInMainList = (item: UserFriendElem & UserGroupElem) => {
            return item.group_id
                ? item.always_top
                : Boolean(item.user_id) || item.always_top
        }
        onMsgList = topList.concat(normalList.filter((item) => {
            return shouldShowInMainList(item)
        }))
        groupAssistList = normalList.filter((item) => {
            return item.group_id && !shouldShowInMainList(item)
        })
    } else {
        onMsgList = topList.concat(normalList)
    }

    contactStore.onMsgList = onMsgList
    contactStore.groupAssistList = groupAssistList
}

/**
 * 判断当前消息是否可以通知
 * @param id 群号
 * @returns 是否可以通知
 */
export function canGroupNotice(id: number | string) {
    const authStore = useAuthStore()
    const noticeInfo = option.get('notice_group') ?? {}
    const list = noticeInfo[authStore.loginInfo.uin]
    if (list) {
        return list.indexOf(id) >= 0
    }
    return false
}

/**
 * 戳一戳触发动画
 * @param animeBody 动画作用的元素
 * @param windowInfo 窗口信息，在 electron 中使用
 */
export function pokeAnime(animeBody: HTMLElement | null, windowInfo = null as {
    x: number
    y: number
    width: number
    height: number
} | null) {
    if (animeBody) {
        const timeLine = anime.timeline({ targets: animeBody })
        // 如果窗口小于 500px 播放完整的动画（手机端样式）
        if (
            (document.getElementById('app')?.offsetWidth ?? 500) <
            500
        ) {
            navigator.vibrate([10, 740, 10])
            timeLine.add({ translateX: 30, duration: 600, easing: 'cubicBezier(.44,.09,.53,1)' })
                .add({ translateX: 0, duration: 150, easing: 'cubicBezier(.44,.09,.53,1)' })
                .add({ translateX: [0, 25, 0], duration: 500, easing: 'cubicBezier(.21,.27,.82,.67)' })
                .add({ targets: {}, duration: 1000 })
                .add({ translateX: 70, duration: 1300, easing: 'cubicBezier(.89,.72,.72,1.13)' })
                .add({ translateX: 0, duration: 100, easing: 'easeOutSine' })
        }
        timeLine.add({ translateX: [-10, 10, -5, 5, 0], duration: 500, easing: 'cubicBezier(.44,.09,.53,1)' })
        timeLine.change = async () => {
            if (animeBody) {
                animeBody.parentElement?.parentElement?.classList.add('poking')
                const teansformX = animeBody.style.transform
                // teansformX 的数字可能是科学计数法，需要转换为普通数字
                let num = Number((teansformX.match(/-?\d+\.?\d*/g) ?? [0])[0])
                // 取整
                num = Math.round(num)
                // 输出 translateX
                if (backend.isDesktop() && windowInfo) {
                    await backend.call(undefined, 'win:move', false, {
                        x: windowInfo.x + num,
                        y: windowInfo.y,
                    })
                }
            }
        }
        timeLine.changeComplete = () => {
            if (animeBody) {
                animeBody.parentElement?.parentElement?.classList.remove('poking')
            }
        }
    }
}

export function sendMsgAppendInfo(msg: any) {
    if (msg.message) {
        msg.message.forEach(() => {
            // TODO: 消息附加功能，暂时没用到
        })
    }
}

/**
 *
 * @param base group_name 或者 nickname
 * @param remark remark
 * @returns 显示的名称
 */
export function getShowName(base: string, remark: string) {
    if (!remark || remark == '' || remark == base) {
        return base.replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    } else {
        return (remark + '（' + base + '）').replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
    }
}

/**
 * 判断是否需要显示时间戳（上下超过五分钟的消息）
 * @param timePrv 上条消息的时间戳（10 位）
 * @param timeNow 当前消息的时间戳（10 位）
 */
export function isShowTime(
    timePrv: number | undefined,
    timeNow: number,
    alwaysShow = false,
): boolean {
    if (alwaysShow) return true
    if (timePrv == undefined) return false
    // 五分钟 10 位时间戳相差 300
    return timeNow - timePrv >= 300
}

/**
 * 计算 QQ 等级图标
 * @param level QQ 等级
 * @returns 图标数量
 */
export function qqLevelIcons(level) {
    const result = {
        crown: 0,  // 皇冠
        sun: 0,    // 太阳
        moon: 0,   // 月亮
        star: 0    // 星星
    };

    result.crown = Math.floor(level / 64);
    level %= 64;

    result.sun = Math.floor(level / 16);
    level %= 16;

    result.moon = Math.floor(level / 4);
    level %= 4;

    result.star = level;

    return result;
}

/**
 * 计算 QQ 等级表情
 * @param level QQ 等级
 * @returns 表情字符串
 */
export function qqLevelToEmoji(level) {
    const rawLevel = level
    if (level <= 0) return level

    const crown = Math.floor(level / 64);
    level %= 64;

    const sun = Math.floor(level / 16);
    level %= 16;

    const moon = Math.floor(level / 4);
    level %= 4;

    const star = level;

    return '👑'.repeat(crown) + '☀️'.repeat(sun) + '🌙'.repeat(moon) + '⭐️'.repeat(star) + '（' + rawLevel + '）';
}

/**
 * 将图片 URL 转换为 PNG 格式的 Uint8Array
 * 支持 base64 和 HTTP URL 格式的图片
 * @param imageUrl 图片 URL
 */
export async function getImageUrlData(imageUrl: string): Promise<{ buffer: Uint8Array, blob: Blob }> {
    return new Promise((resolve, reject) => {
        const img = new Image()

        img.onload = () => {
            try {
                // 创建 canvas 并设置尺寸
                const canvas = document.createElement('canvas')
                canvas.width = img.width
                canvas.height = img.height

                // 获取 2D 上下文并绘制图片
                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    reject(new Error('无法获取 Canvas 上下文'))
                    return
                }

                ctx.drawImage(img, 0, 0)

                // 将 canvas 转换为 PNG 格式的 blob
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('图片转换失败'))
                        return
                    }

                    // 读取 blob 为 ArrayBuffer，然后转换为 Uint8Array
                    const reader = new FileReader()
                    reader.onload = () => {
                        const arrayBuffer = reader.result as ArrayBuffer
                        resolve({
                            buffer: new Uint8Array(arrayBuffer),
                            blob: blob
                        }
                        )
                    }
                    reader.onerror = () => {
                        reject(new Error('读取图片数据失败'))
                    }
                    reader.readAsArrayBuffer(blob)
                }, 'image/png') // 强制转换为 PNG 格式
            } catch (error) {
                reject(error)
            }
        }

        img.onerror = () => {
            reject(new Error('图片加载失败'))
        }

        // 处理跨域问题
        img.crossOrigin = 'anonymous'
        img.src = imageUrl
    })
}

/**
 * 判断这个消息是不是[已删除]
 * @param msg
 */
export function isDeleteMsg(msg: any): boolean {
    const authStore = useAuthStore()
    if (!['message', 'message_sent'].includes(msg.post_type)) return false
    if (msg.sender.user_id !== authStore.loginInfo.uin) return false
    if (msg.raw_message !== '&#91;已删除&#93;') return false
    return true
}

/**
 * 获取两个字符串之间的差异
 * @param a 原字符串
 * @param b 新字符串
 * @returns 差异列表，包含差异的起始位置、结束位置和差异内容
 */
export function getDifferencesWithRanges(a: string, b: string) {
    let i = 0; // a 的指针
    let j = 0; // b 的指针
    const diffs = [] as { start: number; end: number; str: string }[]
    let currentDiffStart = null as number | null
    let currentDiffStr = ''

    while (j < b.length) {
        if (i < a.length && a[i] === b[j]) {
            // 遇到匹配字符，先保存上一个差异块
            if (currentDiffStr) {
                diffs.push({
                    start: currentDiffStart!,
                    end: j - 1,
                    str: currentDiffStr
                })
                currentDiffStr = ''
                currentDiffStart = null
            }
            i++;
        } else {
            // 遇到差异字符，记录
            if (currentDiffStart === null) currentDiffStart = j;
            currentDiffStr += b[j];
        }
        j++;
    }

    // 遍历结束，如果还有未保存的差异块
    if (currentDiffStr) {
        diffs.push({
            start: currentDiffStart!,
            end: j - 1,
            str: currentDiffStr
        });
    }

    return diffs;
}

/**
 * lgr专用发送消息，懒得写了，不做通用适配，胡乱应付下吧
 * @param msg 消息内容
 */
function lgrSendMsg(id: string, msg: any, type: string, cb: string) {
    if (msg[0].type === 'node') {
        const sendMsgs = [] as any[]
        msg.forEach((item) => {
            const msg = {
                type: item.type,
                data: {
                    user_id: item.data.user_id.toString(),
                    nickname: item.data.nickname,
                    content: item.data.content.map((item) => {
                        const copy = { ...item }
                        delete copy.type
                        return {
                            type: item.type,
                            data: { ...copy }
                        }
                    }),
                },
            }
            sendMsgs.push(msg)
        })
        if (type === 'group') {
            Connector.send(
                'send_group_forward_msg',
                { group_id: id, messages: sendMsgs },
                cb,
            )
        } else if (type === 'user') {
            Connector.send(
                'send_private_forward_msg',
                { user_id: id, messages: sendMsgs },
                cb,
            )
        } else {
            new PopInfo().add(PopType.ERR, 'lgr不支持匿名聊天')
        }
    } else {
        if (type === 'group') {
            Connector.send(
                'send_group_msg',
                { group_id: id, message: msg },
                cb,
            )
        } else if (type === 'user') {
            Connector.send(
                'send_private_msg',
                { user_id: id, message: msg },
                cb,
            )
        } else {
            new PopInfo().add(PopType.ERR, 'lgr不支持匿名聊天')
        }
    }
}
