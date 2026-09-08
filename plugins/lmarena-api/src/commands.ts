import { Context, h, type Session } from "koishi"
import type { Config } from "./config"
import type { AppLogger } from "./logger"
import { collectDirectPrompt, collectImages, collectParentInput } from "./interaction"
import { checkCurrency, generateImage } from "./generator"
import { resolveApiModeForInput } from "./mode"
import { AGENT_VIDEO_COMMAND, generateVideo } from "./video"

// 父级自定义绘图与“自定义”子指令共用的流程
async function runCustomDrawing(
  ctx: Context,
  session: Session,
  options: { d?: boolean; n?: string | number },
  promptArgs: string[],
  config: Config,
  log: AppLogger,
): Promise<void> {
  if (!(await checkCurrency(ctx, session, config, log))) return

  const extraContent = promptArgs.join(" ")
  const imagesNumber = resolveImagesNumber(options.n)

  // -d 模式：跳过图片输入，直接进行纯文本文生图
  if (options.d) {
    if (resolveApiModeForInput(config, false) !== "generations") {
      await session.send(h.text(session.text(`commands.${config.basename}.messages.directOnlyGenerations`)))
      return
    }
    const prompt = await collectDirectPrompt(session, extraContent, config, log)
    if (!prompt) return
    await generateImage(ctx, session, [], prompt, config, log, imagesNumber)
    return
  }

  const input = await collectParentInput(session, extraContent, config, log)
  if (!input) return

  await generateImage(ctx, session, input.images, input.prompt, config, log, imagesNumber)
}

function resolveImagesNumber(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

// 注册父级交互绘图、预设子命令与 i18n
export function registerCommands(ctx: Context, config: Config, log: AppLogger): void {
  ctx.on("ready", () => {
    const imageMessages = {
      invalidimage: "未检测到有效的图片，请重新发送带图片的消息。",
      processing: "正在处理图片，请稍候...",
      failed: "图片生成失败，请稍后重试。",
      error: "处理过程中发生错误: {0}",
      needimages: "请发送图片：",
      needimagesOptional: "请发送图片（输入纯文本则直接文生图）：",
      editsNeedImage: "当前接口为 edits 图片编辑模式，必须发送参考图片才能生成。",
      generationsNoImage: "当前配置为 generations 文生图节点，不能传入参考图片；如需图生图，请把 apiUrl 改为基础地址并使用 auto 模式。",
      needPrompt: "请发送画图提示词：",
      noPrompt: "未检测到有效提示词，请重新输入。",
      apiModeHint: "接口地址或接口协议可能配置错误，请检查 apiUrl 是否为完整 API 地址，或改为基础地址自动选择图生图/文生图。",
      invalidApiUrl: "apiUrl 可能填成了网页地址，请填写 API 接口地址（例如 https://.../v1/images/edits 或 https://.../v1/images/generations）。",
      apiTimeout: "API 请求超时，请稍后重试或调大 apiTimeout 配置。",
      directOnlyGenerations: "当前接口不是 generations 文生图模式，不能使用 -d 直接生成。",
      insufficientCurrency: "余额不足！当前余额: {0} {1}，需要: {2} {1}",
      currencyDeducted: "成功扣除 {0} {1}，当前余额: {2} {1}",
      noImagesInPrompt: "未检测到图片，请稍后重新交互。",
      promptTimeout: "等待输入超时，请稍后重试。",
      promptError: "交互式输入发生错误，请稍后重试。",
    }

    const videoMessages = {
      ...imageMessages,
      invalidimage: "参考图片处理失败，请重新发送图片。",
      processing: "正在生成视频，请稍候...",
      failed: "视频生成失败，请稍后重试。",
      error: "视频生成过程中发生错误: {0}",
      needimagesOptional: "请发送图片（输入纯文本则直接文生视频）：",
      editsNeedImage: "当前视频模型需要参考图片。",
      generationsNoImage: "当前视频功能不需要传入图片。",
      needPrompt: "请发送视频提示词：",
      noPrompt: "未检测到有效视频提示词，请重新输入。",
      apiTimeout: "视频生成请求超时，请稍后重试或调大 apiTimeout 配置。",
      directOnlyGenerations: "当前视频模式不能直接生成。",
      noImagesInPrompt: "未检测到图片或文字，请稍后重新交互。",
      videoTaskIdMissing: "未能获取到视频任务 ID，请稍后重试。",
      videoNoUrl: "视频任务未返回有效结果地址，请稍后重试。",
      videoTooManyImages: "当前视频模型最多支持 5 张参考图片。",
    }

    const commandLocales: Record<string, {
      description: string
      messages: Record<string, string>
    }> = {
      [config.basename]: {
        description: "AI 交互绘图",
        messages: imageMessages,
      },
    }

    if (config.agnesVideoEnabled) {
      commandLocales[AGENT_VIDEO_COMMAND] = {
        description: "AI 视频生成",
        messages: videoMessages,
      }
    }

    ctx.i18n.define("zh-CN", {
      commands: commandLocales,
    })

    const parent = ctx.command(config.basename, "AI 交互绘图", {
      authority: config.commandAuthority,
    })

    // 父级指令：交互收集图片和自定义提示词后绘图
    if (config.parentCommandEnabled) {
      parent
        .option("d", "-d 直接按文字提示词生成，跳过图片输入（仅文生图模式）")
        .option("n", "-n <count> 指定返回图片数量，默认 1")
        .userFields(["id"])
        .action(async ({ session, options }, ...promptArgs: string[]) => {
          if (!session) return
          await runCustomDrawing(ctx, session, options, promptArgs, config, log)
        })

      // 自定义子指令：与直接调用父级指令的自定义提示词流程保持一致
      ctx.command(`${config.basename}.自定义 [...args]`, "自定义提示词绘画", {
        authority: config.commandAuthority,
      })
        .usage("自定义提示词绘画")
        .option("d", "-d 直接按文字提示词生成，跳过图片输入（仅文生图模式）")
        .option("n", "-n <count> 指定返回图片数量，默认 1")
        .userFields(["id"])
        .action(async ({ session, options }, ...args: string[]) => {
          if (!session) return
          await runCustomDrawing(ctx, session, options, args, config, log)
        })
    }

    for (const cmdConfig of config.customCommands) {
      if (!cmdConfig.enabled) continue

      ctx.command(`${config.basename}.${cmdConfig.name} [...args]`, `${cmdConfig.name} 风格绘画`, {
        authority: config.commandAuthority,
      })
        .usage(`${cmdConfig.name} 处理图片`)
        .option("n", "-n <count> 指定返回图片数量，默认 1")
        .userFields(["id"])
        .action(async ({ session, options }, ...args: string[]) => {
          if (!session) return
          if (!(await checkCurrency(ctx, session, config, log))) return

          const extraContent = args.join(" ")
          const imagesNumber = resolveImagesNumber(options.n)
          const images = await collectImages(session, extraContent, config, log)
          if (!images) return

          // 子命令固定使用配置里的预设提示词
          await generateImage(ctx, session, images.images, cmdConfig.prompt, config, log, imagesNumber)
        })
    }

    if (config.agnesVideoEnabled) {
      // 复用绘图指令的提示词/图片收集流程，只替换文案和 Agnes 图片模式开关
      const videoConfig = {
        ...config,
        agnesMode: true,
        basename: AGENT_VIDEO_COMMAND,
      }

      const videoCommand = ctx.command(`${AGENT_VIDEO_COMMAND} [...args]`, "AI 视频生成", {
        authority: config.commandAuthority,
      })
        .usage("生成视频：使用 -d 可直接输入提示词，-s 指定目标秒数（自动按当前模型可用时长取档）；也可以附带参考图片后输入动作提示词")
        .option("d", "-d 直接按文字提示词生成，跳过图片输入")
        .option("s", "-s <seconds> 指定目标秒数（自动按当前模型可用时长取档）")
      videoCommand.removeOption("n")
      videoCommand.userFields(["id"])
        .action(async ({ session, options }, ...args: string[]) => {
          if (!session) return
          if (!(await checkCurrency(ctx, session, config, log))) return

          const extraContent = args.join(" ")
          if (options.d) {
            const prompt = await collectDirectPrompt(session, extraContent, videoConfig, log)
            if (!prompt) return
            await generateVideo(ctx, session, [], prompt, config, log, options.s)
            return
          }

          const input = await collectParentInput(session, extraContent, videoConfig, log)
          if (!input) return
          await generateVideo(ctx, session, input.images, input.prompt, config, log, options.s)
        })
    }
  })
}
