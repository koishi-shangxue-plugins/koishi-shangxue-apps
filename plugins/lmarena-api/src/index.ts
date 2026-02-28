import { Context, Schema, h, Logger, Session } from "koishi"
import { } from 'koishi-plugin-monetary'

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export const name = "lmarena-api"

export const inject = {
  required: ["http", "logger", "i18n"],
  optional: ['database', 'monetary']
}

export const usage = `
---

通过配置API，调用 {{URL}}/v1/images/edits 接口实现手办化插件的功能。

推荐站点：https://api.bltcy.ai/ （柏拉图）

推荐模型：doubao-seedream-4-0-250828 （豆包-即梦AI 4.0）

这个模型效果不错，价格还可以捏（基本一毛钱一张

---

如果你使用的是柏拉图，那么使用默认配置，直接开启插件就可以使用啦。

如果你是其他API站点，请手动编辑配置项的请求参数，**尤其是模型！**

---


可选服务：monetary

---
`;

const logger = new Logger(name)

interface Command {
  name: string
  prompt: string
  enabled: boolean
}

interface Config {
  basename: string
  apiUrl: string
  apiKey: string
  waitTimeout: number
  apiParams: Record<string, string>
  customCommands: Command[]
  loggerinfo: boolean
  monetaryCommands: boolean
  currency: string
  monetaryCost: number
  commandAuthority: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    basename: Schema.string().default("imagen").description("父级指令名称"),
    waitTimeout: Schema.number().default(60).max(200).min(10).step(1).description("等待用户输入图片的最大时间（秒）"),
  }).description("基础配置"),

  Schema.object({
    apiUrl: Schema.string().default("https://api.bltcy.ai/v1/images/edits").role("link").description("API 服务器地址<br>注意是`{{URL}}/v1/images/edits`的接口"),
    apiKey: Schema.string().role("secret").required().description("API 密钥"),
    apiParams: Schema.dict(String).role('table').description("API请求参数<br>POST请求的body参数").default({
      "model": "doubao-seedream-4-0-250828",
      "image": "{{inputimage}}",
      "prompt": "{{prompt}}",
      "size": "1024x1024",
      "n": "1",
      "type": "normal",
      "response_format": "url"
    }),
  }).description("API配置"),

  Schema.object({
    commandAuthority: Schema.number().default(1).max(5).min(0).description("指令所需权限"),
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
      })).description("可以折叠的指令配置<br>超级长的配置项，慎点").default(loadDefaultCommands()),
  }).description("完整指令配置"),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式"),
  }).description("调试设置"),
]) as Schema<Config>

export function apply(ctx: Context, config: Config) {
  ctx.on("ready", () => {

    ctx.i18n.define("zh-CN", {
      commands: {
        [config.basename]: {
          description: "使用 AI 编辑图片",
          messages: {
            invalidimage: "未检测到有效的图片，请重新发送带图片的消息。",
            processing: "正在处理图片，请稍候...",
            failed: "图片生成失败，请稍后重试。",
            error: "处理过程中发生错误: {0}",
            needimages: "请发送图片：",
            insufficientCurrency: "余额不足！当前余额: {0} {1}，需要: {2} {1}",
            currencyDeducted: "成功扣除 {0} {1}，当前余额: {2} {1}",
            noImagesInPrompt: "未检测到图片，请稍后重新交互。",
            promptTimeout: "等待输入超时，请稍后重试。",
            promptError: "交互式输入发生错误，请稍后重试。"
          },
        },
      }
    });

    ctx.command(config.basename)

    for (const cmdConfig of config.customCommands) {
      if (!cmdConfig.enabled) continue;

      ctx.command(`${config.basename}.${cmdConfig.name} [...args]`, `${cmdConfig.name} 风格绘画`, { authority: config.commandAuthority })
        .usage(`${cmdConfig.name} 处理图片`)
        .userFields(["id"])
        .action(async ({ session }, ...args) => {
          if (!session) return
          const quote = h.quote(session.messageId)
          const promptText = cmdConfig.prompt
          let images: string[] = []

          // 如果启用了货币服务，先检查用户余额
          if (config.monetaryCommands && ctx.monetary) {
            try {
              const currentBalance = await getUserCurrency(session.user.id);
              const requiredAmount = Math.abs(config.monetaryCost);

              if (currentBalance < requiredAmount) {
                await session.send([
                  quote,
                  h.text(session.text(`commands.${config.basename}.messages.insufficientCurrency`, [
                    currentBalance,
                    config.currency,
                    requiredAmount
                  ]))
                ]);
                return;
              }
            } catch (error) {
              ctx.logger.error(`检查用户 ${session.user.id} 货币余额时出错:`, error);
              await session.send([quote, h.text("检查货币余额时出错，请稍后重试。")]);
              return;
            }
          }

          // 从当前消息和引用消息中提取图片
          const extractedImages = extractImagesFromSession(session)
          images.push(...extractedImages)

          // 如果没有图片，进入交互式输入模式
          if (images.length === 0) {
            const [needimagesMessageId] = await session.send(h.text(session.text(`commands.${config.basename}.messages.needimages`)))

            try {
              // 等待用户输入图片
              const promptContent = await session.prompt(config.waitTimeout * 1000)
              if (promptContent) {
                const interactiveImages = extractImagesFromMessage(promptContent)
                images.push(...interactiveImages)

                if (images.length === 0) {
                  await session.send(h.text(session.text(`commands.${config.basename}.messages.noImagesInPrompt`)))
                  return
                }
                try {
                  await session.bot.deleteMessage(session.channelId, needimagesMessageId)
                } catch (deleteError) {
                  ctx.logger.warn(`删除交互提示消息失败:`, deleteError)
                  // 忽略删除失败错误，继续执行
                }
                logInfo(`通过交互模式收集到 ${interactiveImages.length} 张图片:`, interactiveImages)
              } else {
                await session.send(h.text(session.text(`commands.${config.basename}.messages.promptTimeout`)))
                return
              }
            } catch (error) {
              if (error.message.includes('timeout')) {
                await session.send(h.text(session.text(`commands.${config.basename}.messages.promptTimeout`)))
              } else {
                ctx.logger.error(`交互式图片输入失败:`, error)
                await session.send(h.text(session.text(`commands.${config.basename}.messages.promptError`)))
              }
              return
            }
          }

          logInfo(`收集到 ${images.length} 张图片:`, images)

          try {
            const [processingMessageId] = await session.send([quote, h.text(session.text(`commands.${config.basename}.messages.processing`))])

            // 下载图片
            const files = await Promise.all(
              images.map(src => ctx.http.file(src).catch(err => {
                ctx.logger.error(`下载图片失败: ${src}`, err)
                return null
              }))
            ).then(results => results.filter(Boolean) as { data: ArrayBuffer, mime: string, filename: string }[])

            if (files.length === 0) {
              await session.send(h.text(session.text(`commands.${config.basename}.messages.invalidimage`)))
              return
            }

            // 调用 API
            const result = await callImageEditApi(files, promptText, config.apiParams)

            if (result) {
              // 成功获取图片后，如果启用了货币服务，则扣除相应费用
              if (config.monetaryCommands && ctx.monetary) {
                try {
                  await updateUserCurrency(session.user.id, config.monetaryCost);
                  // 获取扣除后的余额并发送提示
                  const newBalance = await getUserCurrency(session.user.id);
                  await session.send(h.text(session.text(`commands.${config.basename}.messages.currencyDeducted`, [
                    Math.abs(config.monetaryCost),
                    config.currency,
                    newBalance
                  ])));
                } catch (error) {
                  ctx.logger.error(`扣除用户 ${session.user.id} 货币时出错:`, error);
                  await session.send(h.text("货币扣除失败，但图片已生成。"));
                  // 即使货币扣除失败，仍然返回图片
                }
              }
              try {
                await session.bot.deleteMessage(session.channelId, processingMessageId)
              } catch (deleteError) {
                ctx.logger.warn(`删除处理中提示消息失败:`, deleteError)
                // 忽略删除失败错误，继续执行
              }

              // 处理单张图片或多张图片的情况
              if (Array.isArray(result)) {
                // 多张图片：发送所有图片
                await session.send(result.map(url => h.image(url)))
                return
              } else {
                // 单张图片：直接发送
                await session.send(h.image(result))
                return
              }
            } else {
              await session.send(h.text(session.text(`commands.${config.basename}.messages.failed`)))
              return
            }
          } catch (error) {
            ctx.logger.error(`[${cmdConfig.name}] 处理图片时发生错误:`, error)
            await session.send(h.text(session.text(`commands.${config.basename}.messages.error`, [error.message || '未知错误'])))
            return
          }
        })
    }

    // 从会话中提取图片 URL
    function extractImagesFromSession(session: Session): string[] {
      const images = extractImagesFromMessage(session.stripped.content)
      if (session.quote) {
        images.push(...extractImagesFromMessage(session.quote.content))
      }
      return images
    }

    // 从消息内容中提取图片 URL
    function extractImagesFromMessage(content: string): string[] {
      const images: string[] = []

      // 提取 img 元素的图片
      const imgElements = h.select(content, "img")
      for (const img of imgElements) {
        if (img.attrs.src) {
          images.push(img.attrs.src)
        }
      }

      // 提取 mface 元素的图片
      const mfaceElements = h.select(content, "mface")
      for (const mface of mfaceElements) {
        if (mface.attrs.url) {
          images.push(mface.attrs.url)
        }
      }

      return images
    }

    async function callImageEditApi(files: { data: ArrayBuffer, mime: string, filename: string }[], prompt: string, apiParams: Record<string, string> = config.apiParams): Promise<string[] | string | null> {
      const formData = new FormData()
      const logParams = {}
      const imageKey = Object.keys(apiParams).find(key => apiParams[key] === '{{inputimage}}');

      // 添加图片文件
      if (imageKey) {
        for (const file of files) {
          const blob = new Blob([file.data], { type: file.mime });
          formData.append(imageKey, blob, file.filename || 'image.png');
        }
      }

      // 添加其他参数
      for (const key in apiParams) {
        const value = apiParams[key];

        if (value === '{{inputimage}}') continue;

        let finalValue = value;
        if (value === '{{prompt}}') {
          finalValue = prompt;
        }

        formData.append(key, finalValue);
        logParams[key] = finalValue;
      }

      logInfo("发送 API 请求:", {
        url: config.apiUrl,
        ...logParams,
        prompt: (logParams['prompt'] || '').substring(0, 100) + ((logParams['prompt'] || '').length > 100 ? '...' : ''),
      })

      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            "Authorization": `Bearer ${config.apiKey}`
          },
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          const message = errorData.error?.message || errorData.error?.type || errorData.error?.code || `HTTP error! status: ${response.status}`
          throw new Error(message)
        }

        const contentType = response.headers.get("content-type")
        if (contentType && contentType.includes("application/json")) {
          const result = await response.json()
          if (result.data && Array.isArray(result.data)) {
            // 提取所有有效的图片 URL
            const urls = result.data
              .filter(item => item && item.url)
              .map(item => item.url)

            if (urls.length > 0) {
              logInfo(`API 成功响应 (JSON): 返回 ${urls.length} 张图片`)
              // 如果只有一张图片，返回字符串；多张图片返回数组
              return urls.length === 1 ? urls[0] : urls
            }
          }
        } else if (contentType && contentType.startsWith("image/")) {
          const buffer = await response.arrayBuffer()
          const base64 = Buffer.from(buffer).toString('base64')
          logInfo(`API 成功响应 (Image Buffer): data:${contentType};base64,[${base64.length} chars]`)
          return `data:${contentType};base64,${base64}`
        }

        throw new Error("未知的 API 响应格式")
      } catch (error) {
        const errorMsg = error.message || '请求失败'
        ctx.logger.error(`API 请求失败: ${errorMsg}`, error)
        if (errorMsg !== 'openai_error') {
          throw new Error(errorMsg)
        }
      }
    }

    function logInfo(...args: any[]) {
      if (config.loggerinfo) {
        logger.info(args);
      }
    }


    async function updateUserCurrency(uid, amount: number, currency: string = config.currency) {
      try {
        const numericUserId = Number(uid); // 将 userId 转换为数字类型

        //  通过 ctx.monetary.gain 为用户增加货币，
        //  或者使用相应的 ctx.monetary.cost 来减少货币
        if (amount > 0) {
          await ctx.monetary.gain(numericUserId, amount, currency);
          logInfo(`为用户 ${uid} 增加了 ${amount} ${currency}`);
        } else if (amount < 0) {
          await ctx.monetary.cost(numericUserId, -amount, currency);
          logInfo(`为用户 ${uid} 减少了 ${-amount} ${currency}`);
        }

        return `用户 ${uid} 成功更新了 ${Math.abs(amount)} ${currency}`;
      } catch (error) {
        ctx.logger.error(`更新用户 ${uid} 的货币时出错: ${error}`);
        return `更新用户 ${uid} 的货币时出现问题。`;
      }
    }

    async function getUserCurrency(uid, currency = config.currency) {
      try {
        const numericUserId = Number(uid);
        const [data] = await ctx.database.get('monetary', {
          uid: numericUserId,
          currency,
        }, ['value']);

        return data ? data.value : 0;
      } catch (error) {
        ctx.logger.error(`获取用户 ${uid} 的货币时出错: ${error}`);
        return 0; // Return 0
      }
    }
  })
}

function loadDefaultCommands(): Command[] {
  try {
    const configPath = resolve(__dirname, '../data/command.json')
    const configData = readFileSync(configPath, 'utf-8')
    return JSON.parse(configData)
  } catch (error) {
    logger.warn('无法加载默认配置文件，使用空配置:', error.message)
    return []
  }
}
