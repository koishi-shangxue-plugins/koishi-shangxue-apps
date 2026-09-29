import { h, type Session } from "koishi"

// 多段提示词按行拼接时使用的分隔符，避免中文上下句被空格割裂
const PROMPT_JOINER = "\n"

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

// 贪婪参数会把带空格的元素标签切成多个片段，同样一个 <img src="..."/> 可能变成
// ["<img", "src=\"...\"/>"]。这里先按空格切碎再逐个把片段还原成元素，
// 这样单独一片 "<img" 也能被识别成图片元素，不会作为文本混进提示词。
function parseElements(content: string): h[] {
  if (!content) return []
  const elements: h[] = []
  const nested = h.parse(content)
  // 整段就能解析出非文本元素时说明结构完整，直接使用，避免再切碎丢信息
  if (nested.some(element => element.type !== "text")) return nested
  for (const fragment of content.split(" ")) {
    if (fragment === "") continue
    elements.push(...h.parse(fragment))
  }
  return elements
}

// 从消息元素里提取纯文本，保留换行并按行拼接
// 只取 text 元素：h.transform 会把 img 等元素原样保留成标签文本，
// 会让 "<img src=.../>" 混进提示词发给接口。
function textFromContent(content: string): string {
  const parts: string[] = []
  for (const element of parseElements(content)) {
    if (element.type !== "text") continue
    const text = element.attrs.content
    if (typeof text === "string") parts.push(text)
  }
  return parts
    .join(PROMPT_JOINER)
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join(PROMPT_JOINER)
    .trim()
}

// 图片地址可能在整段或某个片段里，两种粒度都要扫一遍
function imagesFromContent(content: string): string[] {
  const images: string[] = []
  const sources = [content, ...content.split(" ")]
  for (const source of sources) {
    for (const element of h.parse(source)) {
      if (element.type === "img" && element.attrs.src) images.push(element.attrs.src)
      if (element.type === "mface" && element.attrs.url) images.push(element.attrs.url)
    }
  }
  return images
}

// 引用消息的 content 是完整原文（如 "imagen 提示词"），需要把指令名去掉再当提示词
function stripCommandName(text: string, commandNames: string[]): string {
  for (const name of commandNames) {
    if (!name || !text.startsWith(name)) continue
    const rest = text.slice(name.length)
    // 只有后面紧跟空白（或整段就是指令名）时才是指令名，避免误砍 "imagen绘制" 这类词
    if (!rest || /^\s/.test(rest)) return rest.trim()
  }
  return text
}

// 收集本次调用涉及的输入
// 提示词优先取 koishi 解析后的贪婪参数与 --input 选项：它们已经去掉了指令名和选项标记，
// 是用户真正想表达的内容。session.content 是完整原文（含 "imagen -d 提示词" 这类标记），
// 只从里面取图片，不再取文本，否则标记会混进提示词、也会和贪婪参数重复拼一遍。
export function collectCommandInput(
  session: Session,
  inputOption: unknown,
  promptArgs: string[],
  commandNames: string[] = [],
): CommandInput {
  const promptSources = [...promptArgs, ...toArray(inputOption)]
  const imageSources = [
    ...promptSources,
    session.content,
    session.stripped.content,
    session.quote?.content ?? "",
  ]

  const prompts: string[] = []
  const images: string[] = []
  for (const source of imageSources) {
    images.push(...imagesFromContent(source))
  }
  for (const source of promptSources) {
    const text = stripCommandName(textFromContent(source), commandNames)
    if (!text || prompts.includes(text)) continue
    prompts.push(text)
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