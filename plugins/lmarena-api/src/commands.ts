import { Context, h, type Session, type Argv } from "koishi"
import type { Config } from "./config"
import type { AppLogger } from "./logger"
import { collectDirectPrompt, collectImages, collectParentInput } from "./interaction"
import {
  CUSTOM_SUBCOMMAND_DECL,
  INPUT_OPTION_DESC,
  INPUT_OPTION_SPEC,
  PRESET_SUBCOMMAND_DECL,
  collectCommandInput,
  fallbackPrompt,
} from "./args"
import { checkCurrency, generateImage } from "./generator"
import { resolveApiModeForInput } from "./mode"
import { AGENT_VIDEO_COMMAND, generateVideo } from "./video"

// -d 模式跳过图片输入，直接进行纯文本文生图
async function runDirectDrawing(
  ctx: Context,
  session: Session,
  extraContent: string,
  config: Config,
  log: AppLogger,
  imagesNumber: number | undefined,
): Promise<void> {
  if (resolveApiModeForInput(config, false) !== "generations") {
    await session.send(h.text(session.text(`commands.${config.basename}.messages.directOnlyGenerations`)))
    return
  }

  const prompt = await collectDirectPrompt(session, extraContent, config, log)
  if (!prompt) return
  await generateImage(ctx, session, [], prompt, config, log, imagesNumber)
}

// 父级自定义绘图与“自定义”子指令共用的流程
async function runCustomDrawing(
  ctx: Context,
  session: Session,
  argv: Argv,
  inputOption: unknown,
  promptArgs: string[],
  commandNames: string[],
  config: Config,
  log: AppLogger,
): Promise<void> {
  if (!(await checkCurrency(ctx, session, config, log))) return

  const options = readOptions(argv)
  // 贪婪参数与 session.content 会重复覆盖同一段提示词，这里统一去重还原
  const input = collectCommandInput(session, inputOption, promptArgs, commandNames)
  input.promptArgs = normalizePromptArgs(input.promptArgs)
  const extraContent = input.promptArgs.join("\n").trim()
  const imagesNumber = resolveImagesNumber(options.n)

  if (options.d) {
    await runDirectDrawing(ctx, session, extraContent, config, log, imagesNumber)
    return
  }

  const parentInput = await collectParentInput(session, extraContent, config, log, input.images)
  if (!parentInput) return

  await generateImage(ctx, session, parentInput.images, parentInput.prompt, config, log, imagesNumber)
}

// 视频指令：与父级绘图共用提示词/图片收集流程，只替换文案与时长档位
async function runVideoGeneration(
  ctx: Context,
  session: Session,
  argv: Argv,
  inputOption: unknown,
  promptArgs: string[],
  commandNames: string[],
  config: Config,
  log: AppLogger,
): Promise<void> {
  if (!(await checkCurrency(ctx, session, config, log))) return

  // 复用绘图指令的提示词/图片收集流程，只替换文案和 Agnes 图片模式开关
  const videoConfig: Config = {
    ...config,
    agnesMode: true,
    basename: AGENT_VIDEO_COMMAND,
  }

  const options = readOptions(argv)
  const input = collectCommandInput(session, inputOption, promptArgs, commandNames)
  input.promptArgs = normalizePromptArgs(input.promptArgs)
  const extraContent = input.promptArgs.join("\n").trim()

  if (options.d) {
    const prompt = await collectDirectPrompt(session, extraContent, videoConfig, log)
    if (!prompt) return
    await generateVideo(ctx, session, [], prompt, config, log, options.s)
    return
  }

  const parentInput = await collectParentInput(session, extraContent, videoConfig, log, input.images)
  if (!parentInput) return
  await generateVideo(ctx, session, parentInput.images, parentInput.prompt, config, log, options.s)
}

// 指令选项的可读类型：d 为布尔开关，其余为贪婪文本
interface ParsedOptions {
  d?: boolean
  n?: string | number
  s?: string | number
  input?: string | string[]
}

// koishi 解析失败时会跳过 action 直接提示，这里兜底把原始内容当成提示词，避免丢失输入
function isParseFailed(argv: Argv): boolean {
  return !argv.command || argv.error === "internal.redunant-arguments"
}

// 贪婪参数有时会把 -d / -n 这类选项一起吞进提示词里，这里做一次清理
function normalizePromptArgs(promptArgs: string[]): string[] {
  return promptArgs
    .map(line => line.trim())
    .filter(Boolean)
}

// 选项在指令链上会退化成 unknown，这里做一次显式断言，避免 as any
function readOptions(argv: Argv): ParsedOptions {
  return (argv.options ?? {}) as ParsedOptions
}

function resolveImagesNumber(value: unknown): number | undefined {
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
      // input 选项使用贪婪文本，可承接“父级指令没有匹配到子指令”时的整段提示词
      parent
        .option(INPUT_OPTION_SPEC, INPUT_OPTION_DESC, { type: "text" })
        .option("d", "-d 直接按文字提示词生成，跳过图片输入（仅文生图模式）")
        .option("n", "-n <count> 指定返回图片数量，默认 1")
        .userFields(["id"])
        .action(async (argv, ...promptArgs: string[]) => {
          const { session } = argv
          if (!session) return
          // 参数解析失败（提示词里的空格被当成多余参数）时，直接用原始消息兜底
          if (isParseFailed(argv) && !promptArgs.length) {
            promptArgs = [fallbackPrompt(session)]
          }
          await runCustomDrawing(ctx, session, argv, readOptions(argv).input, promptArgs, [config.basename], config, log)
        })

      // 自定义子指令：与直接调用父级指令的自定义提示词流程保持一致
      ctx.command(`${config.basename}.${CUSTOM_SUBCOMMAND_DECL}`, "自定义提示词绘画", {
        authority: config.commandAuthority,
      })
        .usage("自定义提示词绘画")
        .option(INPUT_OPTION_SPEC, INPUT_OPTION_DESC, { type: "text" })
        .option("d", "-d 直接按文字提示词生成，跳过图片输入（仅文生图模式）")
        .option("n", "-n <count> 指定返回图片数量，默认 1")
        .userFields(["id"])
        .action(async (argv, ...promptArgs: string[]) => {
          const { session } = argv
          if (!session) return
          if (isParseFailed(argv) && !promptArgs.length) {
            promptArgs = [fallbackPrompt(session)]
          }
          const commandName = `${config.basename}.自定义`
          await runCustomDrawing(ctx, session, argv, readOptions(argv).input, promptArgs, [commandName, config.basename], config, log)
        })
    }

    for (const cmdConfig of config.customCommands) {
      if (!cmdConfig.enabled) continue

      ctx.command(`${config.basename}.${PRESET_SUBCOMMAND_DECL(cmdConfig.name)}`, `${cmdConfig.name} 风格绘画`, {
        authority: config.commandAuthority,
      })
        .usage(`${cmdConfig.name} 处理图片`)
        .option(INPUT_OPTION_SPEC, INPUT_OPTION_DESC, { type: "text" })
        .option("n", "-n <count> 指定返回图片数量，默认 1")
        .userFields(["id"])
        .action(async (argv, ...promptArgs: string[]) => {
          const { session } = argv
          if (!session) return
          if (!(await checkCurrency(ctx, session, config, log))) return

          const commandName = `${config.basename}.${cmdConfig.name}`
          const input = collectCommandInput(session, readOptions(argv).input, promptArgs, [commandName, config.basename])
          input.promptArgs = normalizePromptArgs(input.promptArgs)
          const extraContent = input.promptArgs.join("\n").trim()
          const imagesNumber = resolveImagesNumber(readOptions(argv).n)
          const images = await collectImages(session, extraContent, config, log, input.images)
          if (!images) return

          // 子命令固定使用配置里的预设提示词
          await generateImage(ctx, session, images.images, cmdConfig.prompt, config, log, imagesNumber)
        })
    }

    if (config.agnesVideoEnabled) {
      const videoCommand = ctx.command(`${AGENT_VIDEO_COMMAND} [input:text]`, "AI 视频生成", {
        authority: config.commandAuthority,
      })
        .usage("生成视频：使用 -d 可直接输入提示词，-s 指定目标秒数（自动按当前模型可用时长取档）；也可以附带参考图片后输入动作提示词")
        .option(INPUT_OPTION_SPEC, INPUT_OPTION_DESC, { type: "text" })
        .option("d", "-d 直接按文字提示词生成，跳过图片输入")
        .option("s", "-s <seconds> 指定目标秒数（自动按当前模型可用时长取档）")
      videoCommand.removeOption("n")
      videoCommand.userFields(["id"])
        .action(async (argv, ...promptArgs: string[]) => {
          const { session } = argv
          if (!session) return
          if (isParseFailed(argv) && !promptArgs.length) {
            promptArgs = [fallbackPrompt(session)]
          }
          await runVideoGeneration(ctx, session, argv, readOptions(argv).input, promptArgs, [AGENT_VIDEO_COMMAND], config, log)
        })
    }
  })
}