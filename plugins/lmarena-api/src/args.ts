import { h, type Session } from "koishi"

// 多段提示词按行拼接时使用的分隔符，避免中文上下句被空格割裂
const PROMPT_JOINER = "\n"
// h 转纯文本时保留换行，便于还原用户输入的多行提示词
const TEXT_TRANSFORM_OPTIONS = { text: true, newline: "\n" as const }

// 指令级的 input 选项：每个提示词片段前加 --input，值为贪婪文本
export const INPUT_OPTION_SPEC = "input"
export const INPUT_OPTION_DESC = "--input <text> 自定义提示词（贪婪文本，会自动收集同一条消息里的所有片段）"

// 子指令声明统一使用贪婪文本参数，保证同一条消息里的提示词不会被空格切碎
export const CUSTOM_SUBCOMMAND_DECL = "自定义 [input:text]"
export const PRESET_SUBCOMMAND_DECL = (name: string) => `${name} [input:text]`

// 本次调用需要收集的提示词片段与参考图片
export interface CommandInput {
  promptArgs: string[]
  images: string[]
}

// 把任意输入统一成字符串数组
function toArray(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value.map(item => String(item))
  return [String(value)]
}

// 从消息元素里提取文本，保留换行并按行拼接
function textFromContent(content: string): string {
  if (!content) return ""
  // 直接传字符串，命中 h.transform 的 string -> string 重载（传 Element[] 会返回 Element[]）
  return h.transform(content, TEXT_TRANSFORM_OPTIONS)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join(PROMPT_JOINER)
}

// 从消息元素里提取图片地址
function imagesFromContent(content: string): string[] {
  if (!content) return []
  const images: string[] = []
  for (const img of h.select(content, "img")) {
    if (img.attrs.src) images.push(img.attrs.src)
  }
  for (const mface of h.select(content, "mface")) {
    if (mface.attrs.url) images.push(mface.attrs.url)
  }
  return images
}

// 判断 text 是否已被 collected 里的某一段覆盖，覆盖了就说明是同一段输入的重复来源
function isCovered(text: string, collected: string[]): boolean {
  return collected.some(existing => existing.includes(text))
}

// 去掉文本开头残留的指令名，例如兜底参数里带进来的 "imagen.手办化 提示词"
function stripCommandName(text: string, commandNames: string[]): string {
  for (const name of commandNames) {
    if (!name || !text.startsWith(name)) continue
    const rest = text.slice(name.length)
    // 只有后面紧跟空白才是指令名，避免把 "imagen绘制" 这种词也砍掉
    if (!rest || /^\s/.test(rest)) return rest.trim()
  }
  return text
}

// 收集本次调用涉及的所有消息片段：贪婪参数、--input 选项、当前消息、引用消息
// 注意：koishi 的贪婪参数本身就是从 session.content 里切出来的，两者内容会重叠，
// 直接拼接会让同一条提示词出现两次，所以这里按包含关系去重。
export function collectCommandInput(
  session: Session,
  inputOption: unknown,
  promptArgs: string[],
  commandNames: string[],
): CommandInput {
  const sources = [
    ...promptArgs,
    ...toArray(inputOption),
    session.content,
    session.quote?.content ?? "",
  ]

  const prompts: string[] = []
  const images: string[] = []
  for (const source of sources) {
    images.push(...imagesFromContent(source))
    const raw = textFromContent(source)
    if (!raw) continue
    const text = stripCommandName(raw, commandNames)
    if (!text || isCovered(text, prompts)) continue
    // 更完整的片段优先：新片段覆盖旧片段时，在原位替换，避免打乱提示词顺序
    const covered = prompts.findIndex(existing => text.includes(existing))
    if (covered !== -1) prompts[covered] = text
    else prompts.push(text)
  }

  return {
    promptArgs: prompts,
    images: [...new Set(images)],
  }
}

// 兜底：命令行参数解析失败时，直接从原始消息里取纯文本
export function fallbackPrompt(session: Session): string {
  return textFromContent(session.content)
}