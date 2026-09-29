import { Context } from "koishi"
import { } from "koishi-plugin-puppeteer"
import { } from "koishi-plugin-ffmpeg"
import { Config, type Config as ConfigType } from "./config"
import { createAppLogger } from "./logger"
import { registerCommands } from "./commands"

export const name = "lmarena-api"
export const reusable = true
export const filter = true
export const inject = {
  required: ["http", "logger", "i18n"],
  optional: ["database", "monetary", "puppeteer", "ffmpeg", "assets"],
}

export const usage = `
---

通过调用API实现文生图、图生图、文生视频、图生视频的功能。

推荐模型：\`gpt-image-2.5-sunburst\`

配置项里的默认站点为： https://moyuu.cc/ ，欢迎注册使用喵~~

注册后可在个人中心获取 API Key，填入配置项即可使用。

---

使用示例：

指令为【imagen】，
第一参数可以为子指令触发词 或 自定义提示语，后续参数可输入多图片。

\`[@用户]\` 相当于用户头像图片。（qq官方机器人无效）
- 【imagen 手办化 [图片]】
- 【imagen 手办化 [图片] [@用户]】
- 【imagen 把这个角色的头发变成黑色并且换成白色发饰 [图片] [图片]】
- 【imagen 手办化 -d 生成一个蜡笔小新，彩绘画风】（-d 模式：跳过图片输入，直接进行纯文本文生图）
- 【imagen 自定义 把这个角色的头发变成黑色并且换成白色发饰 [图片] [图片]】（自定义提示词，与第三行是一样的效果）
---

可选服务：monetary（用于积分系统）

---

一键配置？开启最下方 agnesMode 配置项即可~~~

如需视频功能，请在“Agnes站点设置-视频”中开启，并注册独立指令【Agent视频生成】。

---
`

export { Config }

export function apply(ctx: Context, config: ConfigType) {
  // 统一创建日志对象，调试开关只在这里读取
  const log = createAppLogger(ctx, config.loggerinfo)
  registerCommands(ctx, config, log)
}
