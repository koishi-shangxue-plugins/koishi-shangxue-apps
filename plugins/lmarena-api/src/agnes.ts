export type AgnesRegion = "cn" | "intl"
export type AgnesModel = "agnes-image-2.5-flash" | "agnes-image-2.1-flash" | "agnes-image-2.0-flash"
export const AGNES_VIDEO_MODELS = ["agnes-video-2.5", "agnes-video-2.5-flash"] as const
export type AgnesVideoModel = (typeof AGNES_VIDEO_MODELS)[number]

const AGNES_API_ORIGINS: Record<AgnesRegion, string> = {
  cn: "https://api.agnes-ai.cn",
  intl: "https://apihub.agnes-ai.com",
}

const AGNES_API_URLS: Record<AgnesRegion, string> = {
  cn: `${AGNES_API_ORIGINS.cn}/v1/images/generations`,
  intl: `${AGNES_API_ORIGINS.intl}/v1/images/generations`,
}

export interface AgnesConfig {
  apiUrl: string
  apiKey: string
  model: AgnesModel
  apiParams: Record<string, string>
}

export function getAgnesConfig(
  configuredKey: string | null | undefined = null,
  configuredParams: Record<string, string> = {},
  region: AgnesRegion = "intl",
  model: AgnesModel = "agnes-image-2.5-flash",
): AgnesConfig {
  const apiKey = resolveAgnesApiKey(configuredKey)
  return {
    apiUrl: AGNES_API_URLS[region],
    apiKey,
    model,
    apiParams: { ...configuredParams, model },
  }
}

export interface AgnesVideoConfig {
  apiUrl: string
  queryUrl: string
  apiKey: string
  model: AgnesVideoModel
}

export function getAgnesVideoConfig(
  configuredKey: string | null | undefined = null,
  region: AgnesRegion = "intl",
  model: AgnesVideoModel = "agnes-video-2.5-flash",
): AgnesVideoConfig {
  return {
    apiUrl: `${AGNES_API_ORIGINS[region]}/v1`,
    queryUrl: `${AGNES_API_ORIGINS[region]}/agnesapi`,
    apiKey: resolveAgnesApiKey(configuredKey),
    model,
  }
}

function resolveAgnesApiKey(
  configuredKey: string | null | undefined,
): string {
  const trimmed = (configuredKey ?? "").trim()
  if (!trimmed) {
    throw new Error("Agnes API Key 未配置，请前往 https://platform.agnes-ai.cn/（国际站）或 https://platform.agnes-ai.com/（中国站）注册并填写 API Key。")
  }

  // 明文 sk- 直接使用
  if (trimmed.startsWith("sk-")) return trimmed

  // 兼容 Base64 编码的 Key
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8")
    if (decoded.startsWith("sk-")) return decoded
  } catch {}

  return trimmed
}
