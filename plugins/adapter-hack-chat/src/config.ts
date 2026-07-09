import { Schema } from 'koishi'

export interface RoomConfig {
  channel: string
}

export interface Config {
  nick: string
  baseUrl: string
  rooms: RoomConfig[]
  autoAcceptGuildRequest: boolean
  loggerinfo: boolean
  reconnectDelay: number
  historyLimit: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    nick: Schema.string().pattern(/^[A-Za-z0-9_]{1,24}$/).default('Bot_of_Koishi').description('默认昵称'),
    baseUrl: Schema.string().default('https://hack.chat').role('link').description('hack.chat 服务地址'),
    rooms: Schema.array(Schema.object({
      channel: Schema.string().required().description('房间ID').pattern(/^[A-Za-z0-9_]{1,24}$/),
      channelName: Schema.string().required().description('备注名称'),
    })).role('table').default([
      {
        "channel": "koishi_bots",
        "channelName": "Koishi 机器人大厅"
      }
    ]).description('要加入的房间列表<br>房间ID为网址中 `?` 后面的部分，默认房间地址为 `https://hack.chat/?koishi_bots`'),
  }).description('基础配置'),
  Schema.object({
    historyLimit: Schema.number().min(1).step(1).default(100).description('每个房间缓存的历史消息条数'),
    autoAcceptGuildRequest: Schema.boolean().default(false).description('是否自动同意所有入群邀请<br>开启后自动同意，关闭后不自动处理（不自动拒绝）'),
  }).description('进阶配置'),
  Schema.object({
    reconnectDelay: Schema.number().min(1).step(1).default(5).description('断线重连间隔（秒）'),
    loggerinfo: Schema.boolean().default(false).description('调试日志开关').experimental(),
  }).description('调试配置'),
])
