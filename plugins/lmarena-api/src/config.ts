import { Schema } from "koishi"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { AGNES_VIDEO_MODELS, type AgnesVideoModel } from "./agnes"
import { DEFAULT_EDITS_PARAMS, DEFAULT_GENERATIONS_PARAMS } from "./params"

export interface Command {
  name: string
  prompt: string
  enabled: boolean
}

export interface Config {
  basename: string
  parentCommandEnabled: boolean
  apiUrl: string
  apiKey: string
  waitTimeout: number
  apiTimeout: number
  apiParams_generations: Record<string, string>
  apiParams_edits: Record<string, string>
  customCommands: Command[]
  loggerinfo: boolean
  monetaryCommands: boolean
  currency: string
  monetaryCost: number
  commandAuthority: number
  agnesMode: boolean
  agnesRegion: "cn" | "intl"
  agnesModel: "agnes-image-2.0-flash" | "agnes-image-2.1-flash"
  agnesAPIkey: string | null
  agnesVideoEnabled: boolean
  agnesVideoModel: AgnesVideoModel
  disableWaitingTips: boolean
  gifUpscaleEnabled: boolean
  gifUpscaleMinSize: number
  gifUpscaleMaxSize: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    basename: Schema.string().default("imagen").description("父级指令名称"),
    parentCommandEnabled: Schema.boolean().default(true).description("启用父级指令交互绘图：可交互输入图片和自定义提示词"),
    waitTimeout: Schema.number().default(60).max(200).min(10).step(1).description("等待用户输入图片的最大时间（秒）"),
  }).description("基础配置"),

  Schema.object({
    apiUrl: Schema.string().default("https://moyuu.cc/v1").role("link").description("API 服务器地址<br>填入地址：`https://域名/v1`，需要兼容openai协议。"),
    apiKey: Schema.string().role("secret").default(null).description("API 密钥"),
    apiTimeout: Schema.number().default(180).max(600).min(10).step(1).description("API 请求超时时间（秒）"),
    apiParams_generations: Schema.dict(String).role('table').description("文生图接口请求参数<br>POST请求的参数<br>size 支持 `{{dynamic_size}}`（按提示词或输入图片比例自动决定）和 `auto`（同样会按上面两种比例算出真实尺寸，因为 OpenAI 兼容接口的 auto 只按参考图比例出图，会让提示词里写明的画面比例失效）").default(DEFAULT_GENERATIONS_PARAMS),
    apiParams_edits: Schema.dict(String).role('table').description("图生图接口请求参数<br>POST请求的参数<br>OpenAI 兼容图生图默认使用 `images: {{inputimage}}`；size 与文生图一致，支持 `{{dynamic_size}}` 和 `auto`").default(DEFAULT_EDITS_PARAMS),
  }).description("API配置"),

  Schema.object({
    commandAuthority: Schema.number().default(1).max(5).min(0).description("指令所需权限"),
    disableWaitingTips: Schema.boolean().default(false).description("关闭等待提示语<br>开启后不再发送“正在处理图片，请稍候...”等等待提示，报错提示仍然保留"),
    monetaryCommands: Schema.boolean().default(false).description("调用指令时，消耗货币（需要monetary服务）"),
  }).description("进阶指令功能配置"),
  Schema.union([
    Schema.object({
      monetaryCommands: Schema.const(true).required(),
      currency: Schema.string().default('default').description('monetary 数据库的 currency 字段名称（货币种类）<br>一般保持默认即可'),
      monetaryCost: Schema.number().default(-1000).max(0).description("每次调用指令的货币变化数量==**（负数）**（-1000代表消耗1000个货币）"),
    }),
    Schema.object({
      monetaryCommands: Schema.const(false),
    }),
  ]),

  Schema.object({
    customCommands: Schema.array(
      Schema.object({
        enabled: Schema.boolean().default(true).description("<hr><hr><hr><hr><hr><br>是否启用该指令"),
        name: Schema.string().required().description("指令名称"),
        prompt: Schema.string().role("textarea", { rows: [6, 4] }).description("该指令对应的提示词"),
      })).collapse().description("快捷画图 指令配置<br>**超级长的配置项，慎点！**").default(loadDefaultCommands()),
  }).description("完整指令配置"),

  Schema.object({
    agnesMode: Schema.boolean().default(false).description("是否一键开启 agnes 站点模式<br>开启后忽略上方 API 地址和 Key，固定使用 agnes 接口"),
    agnesAPIkey: Schema.string().role("secret").default(null).description("API Key（留空使用所选地区的内置 Key）"),
    agnesRegion: Schema.union([
      Schema.const('cn').description('api.agnes-ai.cn（国内站）'),
      Schema.const('intl').description('apihub.agnes-ai.com（国外站）'),
    ]).default("intl").role("radio").description("agnes 站点地区"),
    agnesModel: Schema.union(["agnes-image-2.0-flash", "agnes-image-2.1-flash"] as const).default("agnes-image-2.1-flash").role("radio").description("agnes 模型版本"),
  }).description("Agnes站点设置"),

  Schema.object({
    agnesVideoEnabled: Schema.boolean().default(false).description("是否注册这个站点的视频功能"),
    agnesVideoModel: Schema.union([...AGNES_VIDEO_MODELS]).default("agnes-video-2.5-flash").role("radio").description("agnes 视频模型版本"),
  }).description("Agnes站点设置-视频"),

  Schema.object({
    gifUpscaleEnabled: Schema.boolean().default(true).description("GIF 首帧分辨率不足时，使用 puppeteer 放大后再上传"),
    gifUpscaleMinSize: Schema.number().default(1024).min(64).max(8192).step(64).description("GIF 首帧短边目标最小分辨率（像素）"),
    gifUpscaleMaxSize: Schema.number().default(4096).min(64).max(16384).step(64).description("放大后长边上限（像素），避免极端比例图片过大"),
  }).description("GIF 图片处理"),


  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式"),
  }).description("调试设置"),
]) as Schema<Config>

function loadDefaultCommands(): Command[] {
  try {
    const configPath = resolve(__dirname, '../data/command.json')
    const configData = readFileSync(configPath, 'utf-8')
    return JSON.parse(configData)
  } catch {
    return []
  }
}
