
import { Schema, h, Random, Context, sleep } from "koishi"
import { } from "koishi-plugin-puppeteer"
import { } from "koishi-plugin-monetary"
import { } from "koishi-plugin-canvas"

import jrys_json from "./../data/jrys.json"

import fs from 'node:fs'
import path from "node:path"
import crypto from "node:crypto"
import { pathToFileURL, fileURLToPath } from 'node:url'

// 运势数据
interface JrysData {
    fortuneSummary: string
    luckyStar: string
    signText: string
    unsignText: string
    luckValue: number
}

export const name = 'jrys-prpr'

export const inject = {
    required: ['i18n', 'logger', 'http', 'puppeteer'],
    optional: ['canvas', "monetary", "database"]
}

export const usage = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>运势卡片说明</title>
</head>
<body>
<div>
<h1>获取运势卡片 🧧</h1>
<p>发送指令 <code>jrysprpr</code> 即可获取一张个性化的运势卡片。</p>
<p>您还可以使用 <code>--split</code> 选项来获取图文模式的运势，只需发送 <code>jrysprpr -s</code> 即可。</p>
<h3>如果您想获取运势卡的背景图，需要启用<code>原图</code>指令</h3>
<h3>可以直接回复一张已发送的运势卡图片并输入指令 <code>获取原图</code>。</h3>
<p>或者使用 <code>获取原图 ********</code> 来获取对应标识码的背景图。</p>
<p>如果您使用的是QQ官方bot，也可以通过点击markdown运势卡上的“查看原图”按钮来获取。</p>
<hr>
</div>
</body>
</html>
`

const defaultFortuneProbability =
    [
        { "Fortune": "☆☆☆☆☆☆☆", "luckValue": 0, "Probability": 5 },
        { "Fortune": "★☆☆☆☆☆☆", "luckValue": 14, "Probability": 10 },
        { "Fortune": "★★☆☆☆☆☆", "luckValue": 28, "Probability": 12 },
        { "Fortune": "★★★☆☆☆☆", "luckValue": 42, "Probability": 15 },
        { "Fortune": "★★★★☆☆☆", "luckValue": 56, "Probability": 30 },
        { "Fortune": "★★★★★☆☆", "luckValue": 70, "Probability": 35 },
        { "Fortune": "★★★★★★☆", "luckValue": 84, "Probability": 45 },
        { "Fortune": "★★★★★★★", "luckValue": 98, "Probability": 25 }
    ]

export const Config =
    Schema.intersect([
        Schema.object({
            command: Schema.string().default('jrysprpr').description("`签到`指令自定义"),
            command2: Schema.string().default('查看运势背景图').description("`原图`指令自定义"),
            //authority: Schema.number().default(1).description("指令权限设置"),
            GetOriginalImageCommand: Schema.boolean().description("开启后启用`原图`指令，可以获取运势背景原图").default(true),
            autocleanjson: Schema.boolean().description("自动获取原图后，删除对应的json记录信息").default(true),
            Checkin_HintText: Schema.union([
                Schema.const('unset').description('unset').description("不返回提示语"),
                Schema.string().description('string').description("请在右侧修改提示语").default("正在分析你的运势哦~请稍等~~"),
            ]).description("`签到渲染中`提示语"),
            recallCheckin_HintText: Schema.boolean().description("jrys结果发送后，自动撤回`Checkin_HintText`提示语").default(true),
            GetOriginalImage_Command_HintText: Schema.union([
                Schema.const('1').description('不返回文字提示'),
                Schema.const('2').description('返回文字提示，且为图文消息'),
                Schema.const('3').description('返回文字提示，且为单独发送的文字消息'),
            ]).role('radio').default('2').description("是否返回获取原图的文字提示。开启后，会发送`获取原图，请发送「原图  ******」`这样的文字提示"),
            FortuneProbabilityAdjustmentTable: Schema.array(Schema.object({
                Fortune: Schema.string().description('运势种类'),//.disabled()  // disabled时，Probability拉条拉到0 ，会偶现点不下去的情况，反正就是难交互
                luckValue: Schema.number().description('种类数值').hidden(),
                Probability: Schema.number().role('slider').min(0).max(100).step(1).description('抽取权重'),
            })).role('table').description('运势抽取概率调节表`权重均为0时使用默认配置项`').default(defaultFortuneProbability),

            BackgroundURL: Schema.array(String).description("背景图片，可以写`txt路径（网络图片URL写进txt里）` 或者 `文件夹路径` 或者 `网络图片URL` <br> 建议参考 [emojihub-bili](/market?keyword=emojihub-bili)的图片方法  <br>推荐使用本地图片 以加快渲染速度").role('table')
                .default([
                    path.join(__dirname, './../data/backgroundFolder/miao.jpg'),
                    path.join(__dirname, './../data/backgroundFolder'),
                    path.join(__dirname, './../data/backgroundFolder/魔卡.txt'),
                    path.join(__dirname, './../data/backgroundFolder/ba.txt'),
                    path.join(__dirname, './../data/backgroundFolder/猫羽雫.txt'),
                    path.join(__dirname, './../data/backgroundFolder/miku.txt'),
                    path.join(__dirname, './../data/backgroundFolder/白圣女.txt'),
                    //path.join(__dirname, './../data/backgroundFolder/.txt'),   
                ]),
        }).description('基础设置'),

        Schema.object({
            screenshotquality: Schema.number().role('slider').min(0).max(100).step(1).default(50).description('设置图片压缩质量（%）'),
            HTML_setting: Schema.object({
                UserNameColor: Schema.string().default("rgba(255,255,255,1)").role('color').description('用户名称的颜色').hidden(),    //.hidden(),  暂时用不到了
                MaskColor: Schema.string().default("rgba(0,0,0,0.5)").role('color').description('`蒙版`的颜色'),
                Maskblurs: Schema.number().role('slider').min(0).max(100).step(1).default(10).description('模版模糊半径'),
                HoroscopeTextColor: Schema.string().default("rgba(255,255,255,1)").role('color').description('`运势文字`颜色'),
                luckyStarGradientColor: Schema.boolean().description("开启后`运势星星`使用彩色渐变").default(true),
                HoroscopeDescriptionTextColor: Schema.string().default("rgba(255,255,255,1)").role('color').description('`运势说明文字`颜色'),
                DashedboxThickn: Schema.number().role('slider').min(0).max(20).step(1).default(5).description('`虚线框`的粗细'),
                Dashedboxcolor: Schema.string().default("rgba(255, 255, 255, 0.5)").role('color').description('`虚线框`的颜色'),
                fontPath: Schema.string().description("`请填写.ttf 字体文件的绝对路径`").default(path.join(__dirname, './../data/千图马克手写体lite.ttf')),
            }).collapse().description('可自定义各种颜色搭配和字体'),
        }).description('面板调节'),

        Schema.object({
            markdown_button_mode: Schema.union([
                Schema.const('unset').description('取消应用此配置项'),
                Schema.const('json').description('json按钮-----------20 群（频道不可用）'),
                Schema.const('markdown').description('被动md模板--------2000 DAU / 私域'),
                Schema.const('markdown_raw_json').description('被动md模板--------2000 DAU - 原生按钮'),
                Schema.const('raw').description('原生md------------10000 DAU'),
                Schema.const('raw_jrys').description('原生md-不渲染jrys-----------10000 DAU'),
            ]).role('radio').description('markdown/按钮模式选择').default("unset"),
        }).description('QQ官方按钮设置'),
        Schema.union([
            Schema.object({
                markdown_button_mode: Schema.const("json").required(),
                markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项<br>`单独发送按钮功能` 已经不能被新建的官方机器人使用").default(false),
                markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental().hidden(),

                nested: Schema.object({
                    json_button_template_id: Schema.string().description("模板ID<br>形如 `123456789_1234567890` 的ID编号<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)").pattern(/^\d+_\d+$/),
                }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red"><hr style="border: 2px solid red">'),

            }),
            Schema.object({
                markdown_button_mode: Schema.const("markdown").required(),
                markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").default(false),
                markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
                QQchannelId: Schema.string().description('`填入QQ频道的频道ID`，将该ID的频道作为中转频道 <br> 频道ID可以用[inspect插件来查看](/market?keyword=inspect) `频道ID应为纯数字`').experimental().pattern(/^\S+$/),

                nested: Schema.object({
                    markdown_button_template_id: Schema.string().description("md模板ID<br>形如 `123456789_1234567890` 的ID编号，发送markdown").pattern(/^\d+_\d+$/),
                    markdown_button_keyboard_id: Schema.string().description("按钮模板ID<br>形如 `123456789_1234567890` 的ID编号，发送按钮").pattern(/^\d+_\d+$/),
                    markdown_button_content_table: Schema.array(Schema.object({
                        raw_parameters: Schema.string().description("原始参数名称"),
                        replace_parameters: Schema.string().description("替换参数名称"),
                    })).role('table').default([
                        {
                            "raw_parameters": "your_markdown_text_1",
                            "replace_parameters": "表情包来啦！"
                        },
                        {
                            "raw_parameters": "your_markdown_text_2",
                            "replace_parameters": "这是你的表情包哦😽"
                        },
                        {
                            "raw_parameters": "your_markdown_img",
                            "replace_parameters": "${img_pxpx}"
                        },
                        {
                            "raw_parameters": "your_markdown_url",
                            "replace_parameters": "${img_url}"
                        }
                    ]).description("替换参数映射表<br>本插件会替换模板变量，请在左侧填入模板变量，右侧填入真实变量值。<br>本插件提供的参数有`encodedMessageTime`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`，其中img_pxpx参数需要使用`canvas`服务<br>▶比如你可以使用`{{.session.userId}}`，这会被本插件替换为`真实的userId值`，若无匹配变量，则视为文本<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)"),

                }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red"><hr style="border: 2px solid red">'),

            }),

            Schema.object({
                markdown_button_mode: Schema.const("markdown_raw_json").required(),
                markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").hidden().default(false),
                markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
                QQchannelId: Schema.string().description('`填入QQ频道的频道ID`，将该ID的频道作为中转频道 <br> 频道ID可以用[inspect插件来查看](/market?keyword=inspect) `频道ID应为纯数字`').experimental().pattern(/^\S+$/),

                nested: Schema.object({
                    markdown_raw_json_button_template_id: Schema.string().description("md模板ID<br>形如 `123456789_1234567890` 的ID编号，发送markdown").pattern(/^\d+_\d+$/),
                    markdown_raw_json_button_content_table: Schema.array(Schema.object({
                        raw_parameters: Schema.string().description("原始参数名称"),
                        replace_parameters: Schema.string().description("替换参数名称"),
                    })).role('table').default([
                        {
                            "raw_parameters": "your_markdown_text_1",
                            "replace_parameters": "表情包来啦！"
                        },
                        {
                            "raw_parameters": "your_markdown_text_2",
                            "replace_parameters": "这是你的表情包哦😽"
                        },
                        {
                            "raw_parameters": "your_markdown_img",
                            "replace_parameters": "${img_pxpx}"
                        },
                        {
                            "raw_parameters": "your_markdown_url",
                            "replace_parameters": "${img_url}"
                        }
                    ]).description("替换参数映射表<br>本插件会替换模板变量，请在左侧填入模板变量，右侧填入真实变量值。<br>本插件提供的参数有`encodedMessageTime`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`，其中img_pxpx参数需要使用`canvas`服务<br>▶比如你可以使用`{{.session.userId}}`，这会被本插件替换为`真实的userId值`，若无匹配变量，则视为文本<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)"),
                    markdown_raw_json_button_keyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse()
                        .default("{\n    \"rows\": [\n        {\n            \"buttons\": [\n                {\n                    \"render_data\": {\n                        \"label\": \"再来一张😺\",\n                        \"style\": 2\n                    },\n                    \"action\": {\n                        \"type\": 2,\n                        \"permission\": {\n                            \"type\": 2\n                        },\n                        \"data\": \"/${config.command}\",\n                        \"enter\": true\n                    }\n                },\n                {\n                    \"render_data\": {\n                        \"label\": \"查看原图😽\",\n                        \"style\": 2\n                    },\n                    \"action\": {\n                        \"type\": 2,\n                        \"permission\": {\n                            \"type\": 2\n                        },\n                        \"data\": \"/获取原图 ${encodedMessageTime}\",\n                        \"enter\": true\n                    }\n                }\n            ]\n        }\n    ]\n}")
                        .description('实现QQ官方bot的按钮效果<br>在这里填入你的按钮内容，注意保持json格式，推荐在编辑器中编辑好后粘贴进来'),
                }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red"><hr style="border: 2px solid red">'),

            }),

            Schema.object({
                markdown_button_mode: Schema.const("raw").required(),
                markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").hidden().default(false),
                markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
                QQchannelId: Schema.string().description('`填入QQ频道的频道ID`，将该ID的频道作为中转频道 <br> 频道ID可以用[inspect插件来查看](/market?keyword=inspect) `频道ID应为纯数字`').experimental().pattern(/^\S+$/),

                nested: Schema.object({
                    raw_markdown_button_content: Schema.string().role('textarea', { rows: [6, 6] }).collapse().default("## **今日运势😺**\n### 😽您今天的运势是：\n![${img_pxpx}](${img_url})")
                        .description('实现QQ官方bot的按钮效果，需要`canvas`服务。<br>在这里填入你的markdown内容。本插件会替换形如`{{.xxx}}`或`${xxx}`的参数为`xxx`。<br>本插件提供的参数有`encodedMessageTime`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)'),
                    raw_markdown_button_keyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse()
                        .default("{\n    \"rows\": [\n        {\n            \"buttons\": [\n                {\n                    \"render_data\": {\n                        \"label\": \"再来一张😺\",\n                        \"style\": 2\n                    },\n                    \"action\": {\n                        \"type\": 2,\n                        \"permission\": {\n                            \"type\": 2\n                        },\n                        \"data\": \"/${config.command}\",\n                        \"enter\": true\n                    }\n                },\n                {\n                    \"render_data\": {\n                        \"label\": \"查看原图😽\",\n                        \"style\": 2\n                    },\n                    \"action\": {\n                        \"type\": 2,\n                        \"permission\": {\n                            \"type\": 2\n                        },\n                        \"data\": \"/获取原图 ${encodedMessageTime}\",\n                        \"enter\": true\n                    }\n                }\n            ]\n        }\n    ]\n}")
                        .description('实现QQ官方bot的按钮效果<br>在这里填入你的按钮内容，注意保持json格式，推荐在编辑器中编辑好后粘贴进来'),
                }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red"><hr style="border: 2px solid red">'),

            }),

            Schema.object({
                markdown_button_mode: Schema.const("raw_jrys").required(),
                markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").hidden().default(false),
                markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
                QQchannelId: Schema.string().description('`填入QQ频道的频道ID`，将该ID的频道作为中转频道 <br> 频道ID可以用[inspect插件来查看](/market?keyword=inspect) `频道ID应为纯数字`').experimental().pattern(/^\S+$/),

                nested: Schema.object({
                    raw_jrys_markdown_button_content: Schema.string().role('textarea', { rows: [6, 6] }).collapse().default("${qqbotatuser}\n您的今日运势为：\n**${dJson.fortuneSummary}**\n${dJson.luckyStar}\n\n> ${dJson.unsignText}\n![${img_pxpx}](${img_url})\n\n> 仅供娱乐|相信科学|请勿迷信")
                        .description('实现QQ官方bot的按钮效果，需要`canvas`服务。<br>在这里填入你的markdown内容。本插件会替换形如`{{.xxx}}`或`${xxx}`的参数为`xxx`。<br>本插件提供的参数有`dJson`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)'),
                    raw_jrys_markdown_button_keyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse()
                        .default("{\n  \"rows\": [\n      {\n          \"buttons\": [\n              {\n                  \"render_data\": {\n                      \"label\": \"再来一张😺\",\n                      \"style\": 2\n                  },\n                  \"action\": {\n                      \"type\": 2,\n                      \"permission\": {\n                          \"type\": 2\n                      },\n                      \"data\": \"/${config.command}\",\n                      \"enter\": true\n                  }\n              }\n          ]\n      }\n  ]\n}")
                        .description('实现QQ官方bot的按钮效果<br>在这里填入你的按钮内容，注意保持json格式，推荐在编辑器中编辑好后粘贴进来'),
                }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red"><hr style="border: 2px solid red">'),

            }),
            Schema.object({}),
        ]),

        Schema.object({
            enablecurrency: Schema.boolean().description("开启后，签到获取货币").default(false),
            currency: Schema.string().default('jrysprpr').description('monetary 数据库的 currency 字段名称'),
            maintenanceCostPerUnit: Schema.number().role('slider').min(0).max(1000).step(1).default(100).description("签到获得的货币数量"),
        }).description('monetary·通用货币设置'),

        Schema.object({
            retryexecute: Schema.boolean().default(false).description(" `重试机制`。触发`渲染失败`时，是否自动重新执行"),
        }).description('进阶功能'),
        Schema.union([
            Schema.object({
                retryexecute: Schema.const(true).required(),
                maxretrytimes: Schema.number().role('slider').min(0).max(10).step(1).default(1).description("最大的重试次数<br>`0`代表`不重试`"),
            }),
            Schema.object({}),
        ]),

        Schema.object({
            Repeated_signin_for_different_groups: Schema.boolean().default(false).description("允许同一个用户从不同群组签到"),
            consoleinfo: Schema.boolean().default(false).description("日志调试模式`日常使用无需开启`"),
        }).description('调试功能'),
    ])


export function apply(ctx: Context, config) {
    ctx.on('ready', async () => {

        const root = path.join(ctx.baseDir, 'data', 'jrys-prpr')
        const jsonFilePath = path.join(root, 'OriginalImageURL_data.json')

        // 在全局作用域中定义字体 Base64 缓存
        let cachedFontBase64 = null
        const retryCounts = {} // 使用一个对象来存储每个用户的重试次数

        if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true })
        }

        // 检查并创建 JSON 文件
        if (!fs.existsSync(jsonFilePath)) {
            fs.writeFileSync(jsonFilePath, JSON.stringify([]))
        }

        ctx.model.extend("jrysprprdata" as any, {
            userid: "string",
            // 用户ID唯一标识
            channelId: "string",
            // 频道ID
            lastSignIn: "string"
            // 最后签到日期
        }, {
            primary: ["userid", "channelId"]
        })

        ctx.i18n.define("zh-CN", {
            commands: {
                [config.command]: {
                    description: "查看今日运势",
                    messages: {
                        Getbackgroundimage: "获取原图，请发送：{0}",
                        CurrencyGetbackgroundimage: "签到成功！获得点数: {0}\n获取原图，请发送：{1}",
                        CurrencyGetbackgroundimagesplit: "签到成功！获得点数: {0}",
                        hasSignedInTodaysplit: "今天已经签到过了，不再获得货币。",
                        hasSignedInToday: "今天已经签到过了，不再获得货币。\n获取原图，请发送：{0}",
                    }
                },
                [config.command2]: {
                    description: "获取运势原图",
                    messages: {
                        Inputerror: "请回复一张运势图，或者输入运势图的消息ID 以获取原图哦\~",
                        QQInputerror: "请输入运势图的消息ID以获取原图哦\~",
                        FetchIDfailed: "未能提取到消息ID，请确认回复的消息是否正确。",
                        aleadyFetchID: "该消息背景已被获取过啦~ 我已经忘掉了~找不到咯",
                        Failedtogetpictures: "获取运势图原图失败，请稍后再试"
                    }
                }
            }
        })

        if (config.GetOriginalImageCommand) {
            ctx.command(`${config.command2} <InputmessageId:text>`, { authority: 1 })
                .alias('获取原图')
                .action(async ({ session }, InputmessageId) => {
                    try {
                        const isQQPlatform = session.platform === 'qq'
                        const hasReplyContent = !!session.quote?.content
                        if (!hasReplyContent && !isQQPlatform && !InputmessageId) {
                            return session.text(".Inputerror")
                        }
                        if (isQQPlatform && !InputmessageId) {
                            return session.text(".QQInputerror")
                        }
                        const messageId = hasReplyContent ? session.quote.messageId : InputmessageId
                        logInfo(`尝试获取背景图：\n${messageId}`)
                        if (!messageId) {
                            return session.text(".FetchIDfailed")
                        }
                        const originalImageURL = await getOriginalImageURL(messageId)
                        logInfo(`运势背景原图链接:\n ${originalImageURL}`)
                        if (originalImageURL) {
                            const sendsuccess = await session.send(h.image(originalImageURL))
                            if (config.autocleanjson && sendsuccess) {
                                // 删除对应的JSON记录
                                await deleteImageRecord(messageId, originalImageURL)
                            }
                            return
                        } else if (config.autocleanjson) {
                            return session.text(".aleadyFetchID")
                        } else {
                            return session.text(".FetchIDfailed")
                        }
                    } catch (error) {
                        ctx.logger.error("获取运势图原图时出错: ", error)
                        return session.text(".Failedtogetpictures")
                    }
                })
        }

        ctx.command(`${config.command}`, { authority: 1 })
            .userFields(["id"])
            .option('split', '-s 以图文输出今日运势')
            .action(async ({ session, options }) => {
                let hasSignedInToday = await alreadySignedInToday(ctx, session.userId, session.channelId)
                retryCounts[session.userId] = retryCounts[session.userId] || 0 // 初始化重试次数
                let Checkin_HintText_messageid
                let backgroundImage = getRandomBackground(config)
                let BackgroundURL = backgroundImage.replace(/\\/g, '/')
                let imageBuffer
                const dJson = await getJrys(session)
                if (options.split) {
                    // 如果开启了分离模式，那就只返回图文消息内容。即文字运势内容与背景图片
                    if (config.Checkin_HintText && config.Checkin_HintText !== 'unset') {
                        Checkin_HintText_messageid = await session.send(config.Checkin_HintText)
                    }

                    let textjrys = `
${dJson.fortuneSummary}
${dJson.luckyStar}\n
${dJson.signText}\n
${dJson.unsignText}\n
`
                    let enablecurrencymessage

                    if (config.enablecurrency) {
                        if (hasSignedInToday) {
                            enablecurrencymessage = h.text(session.text(".hasSignedInTodaysplit"))
                        } else {
                            enablecurrencymessage = h.text(session.text(".CurrencyGetbackgroundimagesplit", [config.maintenanceCostPerUnit]))
                        }
                    }
                    let backgroundImage = getRandomBackground(config)
                    let BackgroundURL = backgroundImage.replace(/\\/g, '/')
                    let BackgroundURL_base64 = await convertToBase64image(BackgroundURL)
                    let message = [
                        h.image(BackgroundURL_base64),
                        h.text(textjrys),
                        enablecurrencymessage
                    ]
                    if (config.enablecurrency && !hasSignedInToday) {
                        await updateUserCurrency(session.user.id, config.maintenanceCostPerUnit)
                    }
                    await recordSignIn(ctx, session.userId, session.channelId)
                    await session.send(message)
                    if (Checkin_HintText_messageid && config.recallCheckin_HintText) {
                        await session.bot.deleteMessage(session.channelId, Checkin_HintText_messageid)
                    }
                    return
                }

                if (config.Checkin_HintText && config.Checkin_HintText !== 'unset') {
                    Checkin_HintText_messageid = await session.send(config.Checkin_HintText)
                }

                let page
                try {
                    if (config.markdown_button_mode !== "raw_jrys") {
                        page = await ctx.puppeteer.page()
                        await page.setViewport({ width: 1080, height: 1920 })

                        let BackgroundURL_base64 = await convertToBase64image(BackgroundURL)
                        // 读取 Base64 字体字符串
                        logInfo(config.HTML_setting.fontPath)
                        // 如果字体 Base64 未缓存，则读取并缓存
                        if (!cachedFontBase64) {
                            cachedFontBase64 = await getFontBase64(config.HTML_setting.fontPath)
                        }
                        // 使用缓存的字体 Base64
                        const fontBase64 = cachedFontBase64

                        let insertHTMLuseravatar = session.event.user.avatar
                        let luckyStarHTML = `
.lucky-star {
font-size: 60px;
margin-bottom: 10px;
}
`
                        if (config.HTML_setting.luckyStarGradientColor) {
                            luckyStarHTML = `
.lucky-star {
font-size: 60px;
margin-bottom: 10px;
background: linear-gradient(to right, 
#fcb5b5, 
#fcd6ae, 
#fde8a6,
#c3f7b1, 
#aed6fa, 
#c4aff5, 
#f1afcc);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
}
`
                        }
                        const formattedDate = await getFormattedDate()
                        let HTMLsource = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>运势卡片</title>
<style>
@font-face {
font-family: "千图马克手写体lite";
src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
}
body, html {
height: 100%;
margin: 0;
overflow: hidden;
font-family: "千图马克手写体lite";
}
.background {
background-image: url('${BackgroundURL_base64}');
background-size: cover;
background-position: center;
position: relative;
width: 1080px;
height: 1920px;
}
.overlay {
position: absolute;
bottom: 0;
left: 0;
width: 100%;
min-height: 1%;
background-color: ${config.HTML_setting.MaskColor};
backdrop-filter: blur(${config.HTML_setting.Maskblurs}px);
border-radius: 20px 20px 0 0;
overflow: visible;
}
.user-info {
display: flex;
align-items: center;
padding: 10px 20px;
position: relative;
}
.user-avatar {
width: 120px;
height: 120px;
border-radius: 60px;
background-image: url('${insertHTMLuseravatar}');
background-size: cover;
background-position: center;
margin-left: 20px;
position: absolute;
top: 40px;
}
.username {
margin-left: 10px;
color: ${config.HTML_setting.UserNameColor};
font-size: 50px;
padding-top: 28px;
}
.fortune-info1 {
display: flex;
color: ${config.HTML_setting.HoroscopeTextColor};
flex-direction: column;
align-items: center;
position: relative;
width: 100%;
justify-content: center; /* 居中 */
margin-top: 0px; /* 上边距 */
}
.fortune-info1 > * {
margin: 10px; /* 元素之间的间距 */
}
.fortune-info2 {
color: ${config.HTML_setting.HoroscopeDescriptionTextColor};
padding: 0 20px;
margin-top: 40px;
}
.lucky-star, .sign-text, .unsign-text {
margin-bottom: 12px;
font-size: 42px;
}
.fortune-summary {
font-size: 60px;
}
${luckyStarHTML}
.sign-text, .unsign-text {
font-size: 32px;
line-height: 1.6;
padding: 10px;
border: ${config.HTML_setting.DashedboxThickn}px dashed ${config.HTML_setting.Dashedboxcolor};
border-radius: 15px;
margin-top: 10px;
}
.today-text {
font-size: 45px;
margin-bottom: 10px;
background: linear-gradient(to right, 
#fcb5b5, 
#fcd6ae, 
#fde8a6,
#c3f7b1, 
#aed6fa, 
#c4aff5, 
#f1afcc);
-webkit-background-clip: text;
background-clip: text;
color: transparent;
}
</style>
</head>
<body>
<div class="background">
<div class="overlay">
<div class="user-info">
<div class="user-avatar"></div>
<!--span class="username">上学大人</span-->
</div>
<div class="fortune-info1">
<div class="today-text">${formattedDate}</div>
<div class="fortune-summary">${dJson.fortuneSummary}</div>
<div class="lucky-star">${dJson.luckyStar}</div>
</div>
<div class="fortune-info2">           
<div class="sign-text">${dJson.signText}</div>
<div class="unsign-text">
${dJson.unsignText}
</div>
<!-- 不要迷信哦 -->
<div style="text-align: center; font-size: 24px; margin-bottom: 15px;">
仅供娱乐 | 相信科学 | 请勿迷信
</div>
</div>
</div>
</div>
</body>
</html>
`
                        logInfo(`触发用户: ${session.event.user?.id}`)
                        logInfo(`使用的格式化时间: ${formattedDate}`)
                        if (session.platform === 'qq') {
                            logInfo(`QQ官方：bot: ${session.bot.config.id}`)
                            logInfo(`QQ官方：用户头像: http://q.qlogo.cn/qqapp/${session.bot.config.id}/${session.event.user?.id}/640`)
                        }
                        logInfo(`使用背景URL: ${BackgroundURL}`)
                        logInfo(`蒙版颜色: ${config.HTML_setting.MaskColor}`)
                        logInfo(`虚线框粗细: ${config.HTML_setting.DashedboxThickn}`)
                        logInfo(`虚线框颜色: ${config.HTML_setting.Dashedboxcolor}`)
                        await page.setContent(HTMLsource)
                        // 等待网络空闲
                        await page.waitForNetworkIdle()
                        const element = await page.$('body')

                        imageBuffer = await element.screenshot({
                            type: "jpeg",  // 使用 JPEG 格式
                            encoding: "binary",
                            quality: config.screenshotquality  // 设置图片质量
                        })
                    } else {
                        if (BackgroundURL.startsWith('data:image/')) {
                            // Base64 图片数据
                            const base64Data = BackgroundURL.split(',')[1]
                            imageBuffer = Buffer.from(base64Data, 'base64')
                        } else if (BackgroundURL.startsWith('http://') || BackgroundURL.startsWith('https://')) {
                            // 网络 URL
                            imageBuffer = await ctx.http.get(BackgroundURL, { responseType: 'arraybuffer' })
                            imageBuffer = Buffer.from(imageBuffer)
                        } else if (BackgroundURL.startsWith('file:///')) {
                            // 本地文件路径（file:/// 格式）
                            const localPath = fileURLToPath(BackgroundURL)
                            imageBuffer = fs.readFileSync(localPath)
                        } else if (fs.existsSync(BackgroundURL)) {
                            // 本地文件路径
                            imageBuffer = fs.readFileSync(BackgroundURL)
                        } else {
                            throw new Error('不支持的背景图格式')
                        }
                    }
                    const encodeTimestamp = (timestamp) => {
                        // 将日期和时间部分分开
                        let [date, time] = timestamp.split('T')
                        // 替换一些字符
                        date = date.replace(/-/g, '')
                        time = time.replace(/:/g, '').replace(/\..*/, '') // 去掉毫秒部分
                        // 加入随机数
                        const randomNum = Math.floor(Math.random() * 10000) // 生成一个0到9999的随机数
                        // 重排字符顺序
                        return `${time}${date}${randomNum}`
                    }

                    if (config.enablecurrency && !hasSignedInToday) {
                        await updateUserCurrency(session.user.id, config.maintenanceCostPerUnit)
                    }
                    // 发送图片消息并处理响应
                    const sendImageMessage = async (imageBuffer) => {
                        let sentMessage
                        //let markdownmessageId
                        const messageTime = new Date().toISOString() // 获取当前时间的ISO格式 // 这里就不考虑时区了 只是标记ID而已 确保唯一即可
                        const encodedMessageTime = encodeTimestamp(messageTime) // 对时间戳进行简单编码

                        if ((config.markdown_button_mode === "markdown" || config.markdown_button_mode === "raw" || config.markdown_button_mode === "markdown_raw_json" || config.markdown_button_mode === "raw_jrys") && session.platform === 'qq') {
                            const uploadedImageURL = await uploadImageToChannel(imageBuffer, session.bot.config.id, session.bot.config.secret, session.bot.config.token, config.QQchannelId)

                            const qqmarkdownmessage = await markdown(session, encodedMessageTime, uploadedImageURL.url, `data:image/pngbase64,${imageBuffer.toString('base64')}`)
                            await sendmarkdownMessage(session, qqmarkdownmessage)

                        } else {
                            // 根据不同的配置发送不同类型的消息
                            const imageMessage = h.image(imageBuffer, "image/png")
                            switch (config.GetOriginalImage_Command_HintText) {
                                case '2': // 返回文字提示，且为图文消息
                                    const hintText2_encodedMessageTime = `${config.command2} ${encodedMessageTime}`
                                    let hintText2
                                    if (config.enablecurrency) {
                                        if (!hasSignedInToday) {
                                            hintText2 = session.text(".CurrencyGetbackgroundimage", [config.maintenanceCostPerUnit, hintText2_encodedMessageTime])
                                        } else {
                                            hintText2 = session.text(".hasSignedInToday", [hintText2_encodedMessageTime])
                                        }
                                    } else {
                                        hintText2 = session.text(".Getbackgroundimage", [hintText2_encodedMessageTime])
                                    }
                                    const combinedMessage2 = `${imageMessage}\n${hintText2}`
                                    logInfo(`获取原图：\n${encodedMessageTime}`)
                                    sentMessage = await session.send(combinedMessage2)
                                    break
                                case '3': // 返回文字提示，且为单独发送的文字消息
                                    const hintText3_encodedMessageTime = `${config.command2} ${encodedMessageTime}`
                                    let hintText3: string
                                    if (config.enablecurrency) {
                                        if (!hasSignedInToday) {
                                            hintText3 = session.text(".CurrencyGetbackgroundimage", [config.maintenanceCostPerUnit, hintText3_encodedMessageTime])
                                        } else {
                                            hintText3 = session.text(".hasSignedInToday", [hintText3_encodedMessageTime])
                                        }
                                    } else {
                                        hintText3 = session.text(".Getbackgroundimage", [hintText3_encodedMessageTime])
                                    }
                                    logInfo(`获取原图：\n${encodedMessageTime}`)
                                    sentMessage = await session.send(imageMessage) // 先发送图片消息
                                    await session.send(hintText3) // 再单独发送提示
                                    break
                                default: '1'//不返回文字提示，只发送图片
                                    sentMessage = await session.send(imageMessage)
                                    break
                            }
                        }
                        if (config.markdown_button_mode === "json" && session.platform === 'qq') {
                            let markdownMessage = {
                                msg_id: session.event.message.id,
                                msg_type: 2,
                                keyboard: {
                                    id: config.nested.json_button_template_id
                                },
                            }
                            await sendmarkdownMessage(session, markdownMessage)
                        }
                        if (config.markdown_button_mode !== "raw_jrys") {
                            // 记录日志
                            if (config.consoleinfo && session.platform !== 'qq') {
                                if (Array.isArray(sentMessage)) {
                                    sentMessage.forEach((messageId, index) => {
                                        ctx.logger.info(`发送图片消息ID [${index}]: ${messageId}`)
                                    })
                                } else {
                                    ctx.logger.info(`发送的消息对象: ${JSON.stringify(sentMessage, null, 2)}`)
                                }
                            }
                            // 记录消息ID和背景图URL到JSON文件
                            if (config.GetOriginalImageCommand) {
                                const imageData = {
                                    // 使用 encodedMessageTime 作为唯一标识符的一部分
                                    messageId: session.platform === 'qq' ? [encodedMessageTime] : (Array.isArray(sentMessage) ? sentMessage : [sentMessage]),
                                    messageTime: encodedMessageTime, // 使用预先获取的时间戳
                                    backgroundURL: BackgroundURL
                                }
                                try {
                                    let data = []
                                    if (fs.existsSync(jsonFilePath)) {
                                        // 读取JSON文件内容
                                        const fileContent = fs.readFileSync(jsonFilePath, 'utf8')
                                        if (fileContent.trim()) {
                                            data = JSON.parse(fileContent)
                                        }
                                    }
                                    // 检查数据是否已存在
                                    const exists = data.some(item => item.messageId.includes(imageData.messageId))
                                    if (!exists) {
                                        // 添加新数据
                                        data.push(imageData)
                                        fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2))
                                    }
                                } catch (error) {
                                    ctx.logger.error(`处理JSON文件时出错 [${encodedMessageTime}]: `, error) // 记录错误信息并包含时间戳
                                }
                            }
                            return sentMessage
                        }
                        await recordSignIn(ctx, session.userId, session.channelId)
                    }
                    // 调用函数发送消息
                    await sendImageMessage(imageBuffer)
                    if (Checkin_HintText_messageid && config.recallCheckin_HintText) {
                        await session.bot.deleteMessage(session.channelId, Checkin_HintText_messageid)
                    }
                } catch (e) {
                    const errorTime = new Date().toISOString() // 获取错误发生时间的ISO格式
                    ctx.logger.error(`状态渲染失败 [${errorTime}]: `, e) // 记录错误信息并包含时间戳

                    if (config.retryexecute && retryCounts[session.userId] < config.maxretrytimes) {
                        retryCounts[session.userId]++
                        ctx.logger.warn(`用户 ${session.userId} 尝试第 ${retryCounts[session.userId]} 次重试...`)
                        try {
                            await session.execute(config.command) // 使用 session.execute 重试
                            delete retryCounts[session.userId] // 执行成功，删除重试次数
                            return // 阻止发送错误消息，因为我们正在重试
                        } catch (retryError) {
                            ctx.logger.error(`重试失败 [${errorTime}]: `, retryError)
                            // 重试失败，继续执行错误处理
                        }
                    }
                    // 如果达到最大重试次数或未启用重试，则发送错误消息
                    delete retryCounts[session.userId] // 清理重试次数
                    return "渲染失败 " + e.message + '\n' + e.stack

                } finally {
                    if (page && !page.isClosed()) {
                        page.close()
                    }
                    // 仅在成功或达到最大重试后清理
                    if (!config.retryexecute || retryCounts[session.userId] >= config.maxretrytimes) {
                        delete retryCounts[session.userId]
                    }
                }

            })

        function logInfo(...args: any[]) {
            if (config.consoleinfo) {
                (ctx.logger.info as (...args: any[]) => void)(...args)
            }
        }

        // 读取 TTF 字体文件并转换为 Base64 编码
        function getFontBase64(fontPath: fs.PathOrFileDescriptor) {
            const fontBuffer = fs.readFileSync(fontPath)
            return fontBuffer.toString('base64')
        }

        // 删除记录的函数
        async function deleteImageRecord(messageId, imageURL) {
            try {
                const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'))
                const index = data.findIndex(record => record.messageId.includes(messageId) && record.backgroundURL === imageURL)
                if (index !== -1) {
                    data.splice(index, 1)
                    fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf-8')
                    logInfo(`已删除消息ID ${messageId} 的记录`)
                }
            } catch (error) {
                ctx.logger.error("删除记录时出错: ", error)
            }
        }

        // 提取消息发送逻辑为函数
        async function sendmarkdownMessage(session, message) {
            logInfo(message)
            try {
                const { guild, user } = session.event
                const { qq, qqguild, channelId } = session
                if (guild?.id) {
                    if (qq) {
                        await qq.sendMessage(channelId, message)
                    } else if (qqguild) {
                        await qqguild.sendMessage(channelId, message)
                    }
                } else if (user?.id && qq) {
                    await qq.sendPrivateMessage(user.id, message)
                }
            } catch (error) {
                ctx.logger.error(`发送markdown消息时出错:`, error)
            }
        }

        async function uploadImageToChannel(imageBuffer, appId, secret, token, channelId) {
            async function refreshToken(bot) {
                const { access_token: accessToken, expires_in: expiresIn } = await ctx.http.post('https://bots.qq.com/app/getAppAccessToken', {
                    appId: bot.appId,
                    clientSecret: bot.secret
                })
                bot.token = accessToken
                ctx.setTimeout(() => refreshToken(bot), (expiresIn - 30) * 1000)
            }
            // 临时的bot对象
            const bot = { appId, secret, token, channelId }
            // 刷新令牌
            await refreshToken(bot)
            const payload = new FormData()
            payload.append('msg_id', '0')
            payload.append('file_image', new Blob([imageBuffer], { type: 'image/png' }), 'image.jpg')
            await ctx.http.post(`https://api.sgroup.qq.com/channels/${bot.channelId}/messages`, payload, {
                headers: {
                    Authorization: `QQBot ${bot.token}`,
                    'X-Union-Appid': bot.appId
                }
            })
            // 计算MD5并返回图片URL
            const md5 = crypto.createHash('md5').update(imageBuffer).digest('hex').toUpperCase()
            if (channelId !== undefined && config.consoleinfo) {
                ctx.logger.info(`使用本地图片*QQ频道  发送URL为： https://gchat.qpic.cn/qmeetpic/0/0-0-${md5}/0`)
            }
            return { url: `https://gchat.qpic.cn/qmeetpic/0/0-0-${md5}/0` }
        }

        async function markdown(session, encodedMessageTime, imageUrl, imageToload) {
            const markdownMessage: any = {
                msg_type: 2,
                markdown: {},
                keyboard: {},
            }

            // 只有在非主动模式下才添加 msg_id
            if (!config.markdown_button_mode_initiative) {
                markdownMessage.msg_id = session.messageId
            }
            let originalWidth
            let originalHeight
            // 尝试从 URL 中解析尺寸
            const sizeMatch = imageUrl.match(/\?px=(\d+)x(\d+)$/)
            if (sizeMatch) {
                originalWidth = parseInt(sizeMatch[1], 10)
                originalHeight = parseInt(sizeMatch[2], 10)
            } else {
                const canvasimage = await ctx.canvas.loadImage(imageToload || imageUrl)
                // @ts-ignore
                originalWidth = canvasimage.naturalWidth || canvasimage.width
                // @ts-ignore
                originalHeight = canvasimage.naturalHeight || canvasimage.height
            }


            // 获取 dJson
            const dJson = await getJrys(session)

            if (config.markdown_button_mode === "markdown") {
                const templateId = config.nested.markdown_button_template_id
                const keyboardId = config.nested.markdown_button_keyboard_id
                const contentTable = config.nested.markdown_button_content_table

                const params = contentTable.map(item => ({
                    key: item.raw_parameters,
                    values: replacePlaceholders(item.replace_parameters, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }),
                }))

                markdownMessage.markdown = {
                    custom_template_id: templateId,
                    params: params,
                }
                if (config.markdown_button_mode_keyboard) {
                    markdownMessage.keyboard = {
                        id: keyboardId,
                    }
                }
            } else if (config.markdown_button_mode === "markdown_raw_json") {
                const templateId = config.nested.markdown_raw_json_button_template_id
                const contentTable = config.nested.markdown_raw_json_button_content_table
                let keyboard = JSON.parse(config.nested.markdown_raw_json_button_keyboard)

                keyboard = replacePlaceholders(keyboard, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }, true)

                const params = contentTable.map(item => ({
                    key: item.raw_parameters,
                    values: replacePlaceholders(item.replace_parameters, { session, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }),
                }))

                markdownMessage.markdown = {
                    custom_template_id: templateId,
                    params: params,
                }
                if (config.markdown_button_mode_keyboard) {
                    markdownMessage.keyboard = {
                        content: keyboard,
                    }
                }
            } else if (config.markdown_button_mode === "raw") {
                try {
                    const rawMarkdownContent = config.nested.raw_markdown_button_content
                    const rawMarkdownKeyboard = config.nested.raw_markdown_button_keyboard
                    // 将 atUserString 插入到原始字符串中
                    const qqbotatuser = session.isDirect ? "\n" : `<qqbot-at-user id="${session.userId}" />`
                    const replacedMarkdownContent = replacePlaceholders(rawMarkdownContent, { session, qqbotatuser, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime, dJson }, true)
                    const replacedMarkdownKeyboard = replacePlaceholders(rawMarkdownKeyboard, { session, qqbotatuser, config, encodedMessageTime, dJson }, true)
                        .replace(/^[\s\S]*?"keyboard":\s*/, '')
                        .replace(/\\n/g, '')
                        .replace(/\\"/g, '"')
                        .trim()

                    const keyboard = JSON.parse(replacedMarkdownKeyboard)

                    markdownMessage.markdown = {
                        content: replacedMarkdownContent,
                    }
                    if (config.markdown_button_mode_keyboard) {
                        markdownMessage.keyboard = {
                            content: keyboard,
                        }
                    }
                } catch (error) {
                    ctx.logger.error(`解析原生 Markdown 出错: ${error}`)
                    return null
                }
            } else if (config.markdown_button_mode === "raw_jrys") {
                try {
                    const raw_jrysMarkdownContent = config.nested.raw_jrys_markdown_button_content
                    const raw_jrysMarkdownKeyboard = config.nested.raw_jrys_markdown_button_keyboard

                    // 将 atUserString 插入到原始字符串中
                    const qqbotatuser = session.isDirect ? "\n" : `<qqbot-at-user id="${session.userId}" />`

                    const replacedMarkdownContent = replacePlaceholders(raw_jrysMarkdownContent, { session, qqbotatuser, dJson, config, img_pxpx: `img#${originalWidth}px #${originalHeight}px`, img_url: imageUrl, encodedMessageTime }, true)
                    const replacedMarkdownKeyboard = replacePlaceholders(raw_jrysMarkdownKeyboard, { session, qqbotatuser, config, encodedMessageTime, dJson }, true)
                        .replace(/^[\s\S]*?"keyboard":\s*/, '')
                        .replace(/\\n/g, '')
                        .replace(/\\"/g, '"')
                        .trim()

                    const keyboard = JSON.parse(replacedMarkdownKeyboard)

                    markdownMessage.markdown = {
                        content: replacedMarkdownContent,
                    }
                    if (config.markdown_button_mode_keyboard) {
                        markdownMessage.keyboard = {
                            content: keyboard,
                        }
                    }
                } catch (error) {
                    ctx.logger.error(`解析原生 Markdown 出错: ${error}`)
                    return null
                }
            }

            logInfo(`Markdown 模板参数: ${JSON.stringify(markdownMessage, null, 2)}`)
            return markdownMessage
        }

        function replacePlaceholders(content, context, isRawMode = false) {
            // 如果 content 是字符串，直接替换占位符
            if (typeof content === 'string') {
                if (!/\{\{\.([^}]+)\}\}|\$\{([^}]+)\}/.test(content)) {
                    return isRawMode ? content : [content]
                }

                const value = content.replace(/\{\{\.([^}]+)\}\}|\$\{([^}]+)\}/g, (match, p1, p2) => {
                    const key = p1 || p2
                    // 从 context 中查找占位符对应的值
                    const replacement = key.split('.').reduce((obj, k) => obj?.[k], context) || match
                    return replacement
                })

                return isRawMode ? value : [value]
            }

            // 如果 content 是对象或数组，递归处理
            if (typeof content === 'object' && content !== null) {
                if (Array.isArray(content)) {
                    return content.map(item => replacePlaceholders(item, context, isRawMode))
                } else {
                    const result = {}
                    for (const key in content) {
                        result[key] = replacePlaceholders(content[key], context, isRawMode)
                    }
                    return result
                }
            }

            // 其他情况直接返回
            return content
        }

        async function convertToBase64image(url: string) {
            logInfo("转换base64：", url)
            try {
                const fileresponse = await ctx.http.file(url)
                const imageBuffer = Buffer.from(fileresponse.data)
                const base64Image = imageBuffer.toString('base64')
                const mimeType = fileresponse.type || fileresponse.mime
                return `data:${mimeType};base64,${base64Image}`
            } catch (error) {
                throw new Error(`转换本地图片为 Base64 失败: ${url}, 错误: ${error.message}`)
            }
        }

        function getRandomBackground(config) {
            // 随机选择一个背景路径
            let backgroundPath = config.BackgroundURL[Math.floor(Math.random() * config.BackgroundURL.length)]

            // 如果是 file:/// 开头的 URL
            if (backgroundPath.startsWith('file:///')) {
                try {
                    // 将 file:/// URL 转换为本地文件路径
                    const localPath = fileURLToPath(backgroundPath)

                    // 如果是 txt 文件
                    if (localPath.endsWith('.txt')) {
                        let lines = fs.readFileSync(localPath, 'utf-8').split('\n').filter(Boolean)
                        let randomLine = lines[Math.floor(Math.random() * lines.length)].trim().replace(/\\/g, '/')
                        return randomLine
                    }

                    // 如果是图片文件
                    if (/\.(jpg|png|gif|bmp|webp)$/i.test(localPath)) {
                        return backgroundPath // 直接返回 file:/// URL
                    }

                    // 如果是文件夹路径
                    if (fs.existsSync(localPath) && fs.lstatSync(localPath).isDirectory()) {
                        const files = fs.readdirSync(localPath)
                            .filter(file => /\.(jpg|png|gif|bmp|webp)$/i.test(file))
                        if (files.length === 0) {
                            throw new Error("文件夹中未找到有效图片文件")
                        }
                        let randomFile = files[Math.floor(Math.random() * files.length)]
                        let fullPath = path.join(localPath, randomFile).replace(/\\/g, '/')
                        return pathToFileURL(fullPath).href // 转换为 file:/// URL
                    }

                    // 如果既不是 txt 文件，也不是图片文件或文件夹
                    throw new Error(`file:/// URL 指向的文件类型无效: ${backgroundPath}`)
                } catch (error) {
                    throw new Error(`处理 file:/// URL 失败: ${backgroundPath}, 错误: ${error.message}`)
                }
            }

            // 如果是网络 URL（http:// 或 https://），直接返回
            if (backgroundPath.startsWith('http://') || backgroundPath.startsWith('https://')) {
                return backgroundPath
            }

            // 如果是 txt 文件路径
            if (backgroundPath.endsWith('.txt')) {
                try {
                    let lines = fs.readFileSync(backgroundPath, 'utf-8').split('\n').filter(Boolean)
                    let randomLine = lines[Math.floor(Math.random() * lines.length)].trim().replace(/\\/g, '/')
                    return randomLine
                } catch (error) {
                    throw new Error(`读取 txt 文件失败: ${backgroundPath}, 错误: ${error.message}`)
                }
            }

            // 如果是文件夹路径
            if (fs.existsSync(backgroundPath) && fs.lstatSync(backgroundPath).isDirectory()) {
                try {
                    const files = fs.readdirSync(backgroundPath)
                        .filter(file => /\.(jpg|png|gif|bmp|webp)$/i.test(file))
                    if (files.length === 0) {
                        throw new Error("文件夹中未找到有效图片文件")
                    }
                    let randomFile = files[Math.floor(Math.random() * files.length)]
                    let fullPath = path.join(backgroundPath, randomFile).replace(/\\/g, '/')
                    return pathToFileURL(fullPath).href // 转换为 file:/// URL
                } catch (error) {
                    throw new Error(`读取文件夹失败: ${backgroundPath}, 错误: ${error.message}`)
                }
            }

            // 如果是图片文件绝对路径
            if (fs.existsSync(backgroundPath) && fs.lstatSync(backgroundPath).isFile()) {
                try {
                    if (/\.(jpg|png|gif|bmp|webp)$/i.test(backgroundPath)) {
                        return pathToFileURL(backgroundPath).href // 转换为 file:/// URL
                    } else {
                        throw new Error("文件不是有效的图片格式")
                    }
                } catch (error) {
                    throw new Error(`读取图片文件失败: ${backgroundPath}, 错误: ${error.message}`)
                }
            }

            // 如果以上条件都不满足，抛出错误
            throw new Error(`无效的背景路径: ${backgroundPath}`)
        }
        // 定义获取原图URL的函数
        async function getOriginalImageURL(messageIdOrTime) {
            try {
                // 使用 fs.promises 读取JSON文件内容      
                //const jsonFilePath = path.join(root, 'OriginalImageURL_data.json')
                const data = await fs.promises.readFile(jsonFilePath, { encoding: 'utf-8' })
                const images = JSON.parse(data)
                // 确保输入参数为字符串
                const input = messageIdOrTime.toString()
                // 检查输入参数是消息ID还是时间戳
                const isTimestamp = /^\d{15,}$/.test(input)
                // 定义变量来存储匹配结果
                let matchedImage = null
                // 查找对应的背景图URL
                for (const image of images) {
                    if (isTimestamp) {
                        // 匹配时间戳
                        if (image.messageTime === input) {
                            matchedImage = image
                            break
                        }
                    } else {
                        // 匹配消息ID
                        if (Array.isArray(image.messageId) && image.messageId.includes(input)) {
                            matchedImage = image
                            break
                        }
                        // 处理 messageId 是空字符串的情况
                        if (image.messageId.length === 0 && image.messageTime === input) {
                            matchedImage = image
                            break
                        }
                    }
                }
                // 返回匹配的背景图URL
                if (matchedImage) {
                    return matchedImage.backgroundURL
                } else {
                    // 如果未找到对应的URL，返回null
                    return null
                }
            } catch (error) {
                ctx.logger.error('读取或解析JSON文件时出错: ', error)
                throw error
            }
        }

        async function getJrys(session): Promise<JrysData> {
            const md5 = crypto.createHash('md5')
            const hash = crypto.createHash('sha256')
            // 获取当前时间
            let now = new Date() // 使用时区转换函数
            let etime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() // 使用当天的0点时间戳
            let userId
            // 获取用户ID
            if (!isNaN(Number(session.event.user.id))) {
                userId = session.event.user.id
            } else if (session.event.user.id) {
                hash.update(session.event.user.id + String(etime))
                const hashHexDigest = hash.digest('hex')
                userId = Number(parseInt(hashHexDigest, 16)) % 1000000001
            } else {
                md5.update(session.username + String(etime))
                const hexDigest = md5.digest('hex')
                userId = parseInt(hexDigest, 16) % 1000000001
            }
            // 获取运势概率表
            let fortuneProbabilityTable = config.FortuneProbabilityAdjustmentTable || defaultFortuneProbability
            // 检查所有概率是否都为0，如果是则使用默认配置
            const allProbabilitiesZero = fortuneProbabilityTable.every(entry => entry.Probability === 0)
            if (allProbabilitiesZero) {
                fortuneProbabilityTable = defaultFortuneProbability
            }
            // 使用种子来确保随机结果的一致性
            const seedInput = String(userId) + String(etime) + now.toDateString() // 加入当前日期字符串
            const seed = parseInt(md5.update(seedInput).digest('hex').slice(0, 8), 16)
            const random = new Random(() => (seed / 0xffffffff))
            // 使用 Random.weightedPick 选择运势
            const weights = {}
            fortuneProbabilityTable.forEach(entry => {
                if (entry.Probability > 0) {
                    weights[entry.luckValue] = entry.Probability
                }
            })
            const fortuneCategory = random.weightedPick(weights)
            const todayJrys = (jrys_json as Record<string, JrysData[]>)[fortuneCategory]
            // 随机选择当前幸运值类别下的一个文案
            const randomIndex = (((etime / 100000) * userId % 1000001) * 2333) % todayJrys.length
            logInfo(`今日运势文案:\n ${JSON.stringify(todayJrys[randomIndex], null, 2)}`)
            return new Promise(resolve => {
                resolve(todayJrys[randomIndex])
            })
        }

        async function getFormattedDate() {
            // 获取当前时间
            const today = new Date() // 使用时区转换函数

            logInfo(`使用时区日期: ${today}`)
            let year = today.getFullYear()  // 获取年份
            let month = today.getMonth() + 1  // 获取月份，月份是从0开始的，所以需要加1
            let day = today.getDate()  // 获取日
            logInfo(year)
            logInfo(month)
            logInfo(day)
            // 格式化日期
            const monthStr = month < 10 ? '0' + month : month.toString()
            const dayStr = day < 10 ? '0' + day : day.toString()
            let formattedDate = `${year}/${monthStr}/${dayStr}`
            logInfo(formattedDate)
            return formattedDate
        }

        async function updateUserCurrency(uid, amount, currency = config.currency) {
            try {
                const numericUserId = Number(uid) // 将 userId 转换为数字类型

                //  通过 ctx.monetary.gain 为用户增加货币，
                //  或者使用相应的 ctx.monetary.cost 来减少货币
                if (amount > 0) {
                    await ctx.monetary.gain(numericUserId, amount, currency)
                    logInfo(`为用户 ${uid} 增加了 ${amount} ${currency}`)
                } else if (amount < 0) {
                    await ctx.monetary.cost(numericUserId, -amount, currency)
                    logInfo(`为用户 ${uid} 减少了 ${-amount} ${currency}`)
                }

                return `用户 ${uid} 成功更新了 ${Math.abs(amount)} ${currency}`
            } catch (error) {
                ctx.logger.error(`更新用户 ${uid} 的货币时出错: ${error}`)
                return `更新用户 ${uid} 的货币时出现问题。`
            }
        }

        async function getUserCurrency(uid, currency = config.currency) {
            try {
                const numericUserId = Number(uid)
                const [data] = await ctx.database.get('monetary', {
                    uid: numericUserId,
                    currency,
                }, ['value'])

                return data ? data.value : 0
            } catch (error) {
                ctx.logger.error(`获取用户 ${uid} 的货币时出错: ${error}`)
                return 0 // Return 0 
            }
        }

        async function updateIDbyuserId(userId, platform) {
            // 查询数据库的 binding 表
            const [bindingRecord] = await ctx.database.get('binding', {
                pid: userId,
                platform: platform,
            })

            // 检查是否找到了匹配的记录
            if (!bindingRecord) {
                throw new Error('未找到对应的用户记录。')
            }

            // 返回 aid 字段作为对应的 id
            return bindingRecord.aid
        }

        // 记录用户签到时间
        async function recordSignIn(ctx, userId, channelId) {
            const currentTime = new Date() // 使用时区转换函数
            const dateString = currentTime.toISOString().split('T')[0] // 获取当前日期字符串

            const [record] = await ctx.database.get('jrysprprdata', { userid: userId, channelId })

            if (record) {
                // 更新用户签到时间
                await ctx.database.set('jrysprprdata', { userid: userId, channelId }, { lastSignIn: dateString })
            } else {
                // 创建新的签到记录
                await ctx.database.create('jrysprprdata', { userid: userId, channelId, lastSignIn: dateString })
            }
        }

        // 检查用户是否已签到
        async function alreadySignedInToday(ctx, userId, channelId) {
            const currentTime = new Date() // 使用时区转换函数
            const dateString = currentTime.toISOString().split('T')[0] // 获取当前日期字符串

            if (!config.Repeated_signin_for_different_groups) {
                // 如果不允许从不同群组签到，检查所有群组
                const records = await ctx.database.get('jrysprprdata', { userid: userId })

                // 检查是否有任何记录的签到日期是今天
                return records.some(record => record.lastSignIn === dateString)
            } else {
                // 仅检查当前群组
                const [record] = await ctx.database.get('jrysprprdata', { userid: userId, channelId })

                if (record) {
                    // 检查最后签到日期是否是今天
                    return record.lastSignIn === dateString
                }
            }

            // 如果没有记录，表示未签到
            return false
        }
    })
}