export interface ImageSize {
  width: number
  height: number
}

export interface DynamicImageParams {
  size: string
  ratio?: string
}

// 解析常见图片格式的宽高，失败时返回 null
export function getImageSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 12) return null

  if (isPng(buffer)) return readPngSize(buffer)
  if (isJpeg(buffer)) return readJpegSize(buffer)
  if (isGif(buffer)) return readGifSize(buffer)
  if (isBmp(buffer)) return readBmpSize(buffer)
  if (isWebp(buffer)) return readWebpSize(buffer)

  return null
}

// 指令能识别的标准比例，用于把提示词里写明的比例换算成具体尺寸
const KNOWN_RATIOS: Array<{ label: string; value: number }> = [
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "3:2", value: 3 / 2 },
  { label: "2:3", value: 2 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "21:9", value: 21 / 9 },
  { label: "9:21", value: 9 / 21 },
]

// OpenAI 兼容接口只认标准尺寸档位，这里把比例映射成同方向的档位
const OPENAI_SIZE_TABLE: Record<string, { landscape: string; portrait: string }> = {
  "16:9": { landscape: "1536x1024", portrait: "1024x1536" },
  "9:16": { landscape: "1536x1024", portrait: "1024x1536" },
  "21:9": { landscape: "1536x1024", portrait: "1024x1536" },
  "9:21": { landscape: "1536x1024", portrait: "1024x1536" },
  "4:3": { landscape: "1536x1024", portrait: "1024x1536" },
  "3:4": { landscape: "1536x1024", portrait: "1024x1536" },
  "3:2": { landscape: "1536x1024", portrait: "1024x1536" },
  "2:3": { landscape: "1536x1024", portrait: "1024x1536" },
  "1:1": { landscape: "1024x1024", portrait: "1024x1024" },
}

// 从提示词里识别用户显式写明的画面比例，例如“画面比例9:16”“aspect ratio 16:9”
function extractRatioFromPrompt(prompt: string): string | undefined {
  if (!prompt) return undefined

  // 只在比例关键词附近找数字，避免把“3:2 构图，17:45 拍摄”这类无关数字当成比例
  const anchor = /(画面比例|画面尺寸|图片比例|图片尺寸|比例|画幅|纵横比|宽高比|aspect\s*ratio)/i
  const hit = anchor.exec(prompt)
  const scopes = hit
    ? [prompt.slice(Math.max(0, hit.index - 8), hit.index + hit[0].length + 24), prompt]
    : [prompt]

  for (const scope of scopes) {
    for (const candidate of findRatioCandidates(scope)) {
      const matched = matchKnownRatio(candidate)
      if (matched) return matched
    }
  }

  return undefined
}

// 从提示词里识别用户显式写明的像素尺寸，例如“尺寸：1024x1536”“2048×2048”
function extractSizeFromPrompt(prompt: string): string | undefined {
  if (!prompt) return undefined
  const matched = /(\d{2,5})\s*[x×*]\s*(\d{2,5})/i.exec(prompt)
  if (!matched) return undefined
  return `${matched[1]}x${matched[2]}`
}

// 综合提示词、配置与输入图片，决定本次请求最终使用的尺寸参数
// 说明：配置项里写的 `auto` 不再直接透传。OpenAI 兼容接口的 auto 只会按参考图比例出图，
// 结果就是“提示词里写明了 9:16，返回的却不是 9:16”；这里统一算成明确的尺寸参数。
export function resolveSizeParams(options: {
  configuredSize: string
  prompt: string
  width?: number
  height?: number
  agnesMode: boolean
}): DynamicImageParams {
  const hasImageSize = Boolean(options.width && options.height && options.height > 0)
  const ratio = hasImageSize ? (options.width as number) / (options.height as number) : undefined

  // agnes 走 size 档位 + ratio 字段，比例优先级：提示词 > 输入图片 > 默认正方形
  if (options.agnesMode) {
    const configured = options.configuredSize.trim()
    const size = /^[1-4]K$/i.test(configured) ? configured : "1K"
    const ratioLabel = extractRatioFromPrompt(options.prompt)
      ?? (ratio === undefined ? undefined : findClosestAgnesRatio(ratio))
      ?? "1:1"
    return { size, ratio: ratioLabel }
  }

  // 1. 提示词里写了像素尺寸时最优先，直接透传
  const promptSize = extractSizeFromPrompt(options.prompt)
  if (promptSize) return { size: promptSize }

  // 2. 提示词里写了画面比例时，换算成同方向的标准尺寸档位
  const promptRatio = extractRatioFromPrompt(options.prompt)
  if (promptRatio) {
    const landscape = (KNOWN_RATIOS.find(item => item.label === promptRatio)?.value ?? 1) >= 1
    return { size: pickOpenAiSize(promptRatio, landscape) }
  }

  // 3. 没有提示词约束时，按输入图片比例推断
  if (ratio !== undefined) {
    return { size: pickOpenAiSize("", ratio >= 1) }
  }

  // 4. 都没有就沿用配置值，配置为 dynamic_size 时再走兜底
  return { size: resolveFallbackSize(options.configuredSize, false) }
}

export function resolveFallbackSize(configuredSize: string, agnesMode: boolean): string {
  if (agnesMode) {
    return /^[1-4]K$/i.test(configuredSize.trim()) ? configuredSize.trim() : "1K"
  }
  const trimmed = configuredSize.trim()
  return trimmed && trimmed !== "{{dynamic_size}}" ? trimmed : "1024x1024"
}

const AGNES_RATIOS: Array<{ label: string; value: number }> = [
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "21:9", value: 21 / 9 },
]

function findClosestAgnesRatio(ratio: number): string {
  let best = AGNES_RATIOS[0]
  let bestDiff = Number.POSITIVE_INFINITY

  for (const item of AGNES_RATIOS) {
    const diff = Math.abs(ratio - item.value)
    if (diff < bestDiff) {
      bestDiff = diff
      best = item
    }
  }

  return best.label
}

// 按比例挑一个标准尺寸档位；比例不在映射表里时按横竖方向给默认档位
function pickOpenAiSize(ratioLabel: string, landscape: boolean): string {
  const entry = OPENAI_SIZE_TABLE[ratioLabel]
  if (!entry) return landscape ? "1536x1024" : "1024x1536"
  return landscape ? entry.landscape : entry.portrait
}

// 找出文本里所有形如 a:b 的比例候选
function findRatioCandidates(scope: string): string[] {
  const candidates: string[] = []
  const regexp = /(\d{1,3})\s*[:：]\s*(\d{1,3})/g
  let matched: RegExpExecArray | null
  while ((matched = regexp.exec(scope))) {
    candidates.push(`${matched[1]}:${matched[2]}`)
  }
  return candidates
}

// 把候选比例在容差内归一到标准比例的标签
function matchKnownRatio(candidate: string): string | undefined {
  const [left, right] = candidate.split(":").map(Number)
  if (!left || !right) return undefined
  const value = left / right

  for (const item of KNOWN_RATIOS) {
    if (Math.abs(value - item.value) / item.value <= 0.12) return item.label
  }

  // 数值合法但不在标准档位里时（例如 7:5、17:45），按横竖方向取最近的档位
  return value >= 1 ? "4:3" : "3:4"
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 24
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
}

function readPngSize(buffer: Buffer): ImageSize | null {
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function isJpeg(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8
}

function readJpegSize(buffer: Buffer): ImageSize | null {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }

    let marker = buffer[offset + 1]
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1
      marker = buffer[offset + 1]
    }

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }

    const length = buffer.readUInt16BE(offset + 2)
    if (isSofMarker(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      }
    }

    offset += 2 + length
  }

  return null
}

function isSofMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
}

function isGif(buffer: Buffer): boolean {
  return buffer.toString("ascii", 0, 3) === "GIF"
}

function readGifSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 10) return null
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  }
}

function isBmp(buffer: Buffer): boolean {
  return buffer.toString("ascii", 0, 2) === "BM"
}

function readBmpSize(buffer: Buffer): ImageSize | null {
  if (buffer.length < 26) return null
  return {
    width: buffer.readInt32LE(18),
    height: Math.abs(buffer.readInt32LE(22)),
  }
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 30
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
}

function readWebpSize(buffer: Buffer): ImageSize | null {
  const fourCC = buffer.toString("ascii", 12, 16)

  if (fourCC === "VP8X") {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
    }
  }

  if (fourCC === "VP8L") {
    const b1 = buffer[21]
    const b2 = buffer[22]
    const b3 = buffer[23]
    const b4 = buffer[24]
    const b5 = buffer[25]
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b2),
      height: 1 + (((b3 & 0x0f) << 10) | (b4 << 2) | ((b5 & 0xc0) >> 6)),
    }
  }

  if (fourCC === "VP8 " && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    }
  }

  return null
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}
