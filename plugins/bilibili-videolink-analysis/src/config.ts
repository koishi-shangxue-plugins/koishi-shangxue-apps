import { Schema } from 'koishi'

export type VideoParseMode = 'link' | 'card'

const DEFAULT_VIDEO_MESSAGE_TEMPLATE = "${标题} ${tab} ${UP主}\n${简介}\n点赞：${点赞} ${tab} 投币：${投币}\n收藏：${收藏} ${tab} 转发：${转发}\n观看：${观看} ${tab} 弹幕：${弹幕}\n播放链接：${播放链接}\n${封面}\n${视频}"
const DEFAULT_VIDEO_MESSAGE_TEMPLATE_CARD = "${标题}\n${简介}\n投币：${投币} ${tab} 收藏：${收藏} ${tab} 转发：${转发}\n播放链接：${播放链接}\n视频地址：${视频地址}\n${封面}\n${视频}"

export interface Config {
  demand: boolean
  timeout?: number
  point?: [number, number]
  enable?: boolean

  enablebilianalysis: boolean
  waitTip_Switch: string | null
  videoParseMode: VideoParseMode[]
  middleware: boolean
  MinimumTimeInterval: number
  preventSingleUserListAttack: boolean
  parseLimit: number

  bVideo_area: string
  bVideoCard_area?: string
  bVideoShowIntroductionTofixed: number
  useNumeral: boolean
  bVideoIDPreference: 'bv' | 'av'

  userAgent: string
  showError: boolean
  loggerinfo: boolean
  loggerinfofulljson: boolean
  pageclose: boolean
}

export const Config = Schema.intersect([
  Schema.object({
    demand: Schema.boolean().default(false).description('开启 B 站点播指令'),
  }).description('B 站点播功能'),
  Schema.union([
    Schema.object({
      demand: Schema.const(true).required(),
      timeout: Schema.number().default(60).description('点播等待用户输入的超时时间（秒）'),
      point: Schema.tuple([Number, Number]).default([50, 50]).description('搜索结果序号位置'),
      enable: Schema.boolean().default(true).description('点播选择后是否自动解析'),
      pageclose: Schema.boolean().default(true).description('点播截图后自动关闭页面'),
    }),
    Schema.object({
      demand: Schema.const(false),
    }),
  ]),

  Schema.object({
    enablebilianalysis: Schema.boolean().default(true).description('开启 B 站链接解析<br>关闭后将不再解析 B 站链接，点播功能仍可使用'),
  }).description('解析功能开关'),

  Schema.object({
    waitTip_Switch: Schema.union([
      Schema.const(null).description('不发送等待提示'),
      Schema.string().description('发送自定义等待提示'),
    ]).default(null).description('解析前是否先发送等待文字'),
    videoParseMode: Schema.array(Schema.union([
      Schema.const('link').description('解析文本链接'),
      Schema.const('card').description('解析 QQ 分享卡片'),
    ])).default(['link', 'card']).role('checkbox').description('允许触发的来源'),
    middleware: Schema.boolean().default(false).description('作为前置中间件注册'),
    parseLimit: Schema.number().default(3).min(1).hidden().description('单条消息最多解析链接数'),
  }).description('触发设置'),

  Schema.object({
    bVideoShowIntroductionTofixed: Schema.number().default(50).description('简介最大字符长度'),
    bVideo_area: Schema.string().role('textarea', { rows: [10, 16] })
      .default(DEFAULT_VIDEO_MESSAGE_TEMPLATE)
      .description('链接 / 独立 BV / AV / 点播结果的消息模板。`${~~~}` 会把模板拆成多条消息；`${视频}` 会下载并发送视频，删除该变量后不会下载视频；`${播放链接}` 是网页播放器，`${视频地址}` 是普通视频页'),
    bVideoCard_area: Schema.string().role('textarea', { rows: [10, 16] })
      .default(DEFAULT_VIDEO_MESSAGE_TEMPLATE_CARD)
      .description('QQ 分享卡片消息模板。`${视频}` 会下载并发送视频，删除该变量后不会下载视频，可单独编辑'),
    useNumeral: Schema.boolean().default(true).hidden().description('大数字是否缩写'),
    bVideoIDPreference: Schema.union([
      Schema.const('bv').description('BV 号'),
      Schema.const('av').description('AV 号'),
    ]).default('bv').hidden().description('${视频地址} 使用的视频号'),
  }).description('消息模板'),

  Schema.object({
    MinimumTimeInterval: Schema.number().default(180).min(1).description('同一链接最小处理间隔（秒）'),
    preventSingleUserListAttack: Schema.boolean().default(true).description('单用户解析频率限制'),
  }).description('频率限制'),

  Schema.object({
    userAgent: Schema.string().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
      .description('请求 B 站 API 时使用的 User-Agent'),
    showError: Schema.boolean().default(false).hidden().description('解析失败时是否提示'),
    loggerinfo: Schema.boolean().default(false).description('开启调试日志'),
    loggerinfofulljson: Schema.boolean().default(false).description('输出完整消息结构日志'),
  }).description('网络与调试'),
])
