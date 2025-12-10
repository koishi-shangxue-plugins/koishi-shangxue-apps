import { Context } from "koishi"
import { } from "koishi-plugin-puppeteer"
import { } from "koishi-plugin-monetary"
import { } from "koishi-plugin-canvas"
import type { } from "koishi-plugin-glyph"
import fs from 'node:fs'
import path from "node:path"

import { Config } from './config'
import { usage } from './constants'
import type { Config as ConfigType } from './types'
import { initializeFont } from './utils/font'
import { registerOriginalImageCommand } from './commands/original-image'
import { registerJrysCommand } from './commands/jrys'

export const name = 'jrys-prpr'

export const inject = {
  required: ['i18n', 'logger', 'http', 'puppeteer'],
  optional: ['canvas', "monetary", "database", 'glyph']
}

export { usage, Config }

export function apply(ctx: Context, config: ConfigType) {
  ctx.on('ready', async () => {

    const root = path.join(ctx.baseDir, 'data', 'jrys-prpr')
    const jsonFilePath = path.join(root, 'OriginalImageURL_data.json')

    const retryCounts: Record<string, number> = {} // 使用一个对象来存储每个用户的重试次数

    // 初始化字体
    await initializeFont(ctx, config)

    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true })
    }

    // 检查并创建 JSON 文件
    if (!fs.existsSync(jsonFilePath)) {
      fs.writeFileSync(jsonFilePath, JSON.stringify([]))
    }

    // 扩展数据库模型
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

    // 定义国际化文本
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

    // 日志输出函数
    function logInfo(...args: any[]) {
      if (config.consoleinfo) {
        (ctx.logger.info as (...args: any[]) => void)(...args)
      }
    }

    // 注册获取原图命令
    registerOriginalImageCommand(ctx, config, jsonFilePath, logInfo)

    // 注册今日运势主命令
    registerJrysCommand(ctx, config, jsonFilePath, retryCounts, logInfo)
  })
}