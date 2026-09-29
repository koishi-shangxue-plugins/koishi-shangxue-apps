import type { Config } from "./config"
import type { ResolvedApiMode } from "./mode"

// OpenAI 兼容协议的默认文生图参数
export const DEFAULT_GENERATIONS_PARAMS: Record<string, string> = {
  model: "gpt-image-2.5-sunburst",
  prompt: "{{prompt}}",
  size: "auto",
  n: "{{images_number}}",
  response_format: "b64_json",
}

// OpenAI 兼容协议的默认图生图参数
export const DEFAULT_EDITS_PARAMS: Record<string, string> = {
  model: "gpt-image-2.5-sunburst",
  image: "{{inputimage}}",
  prompt: "{{prompt}}",
  size: "{{dynamic_size}}",
  n: "{{images_number}}",
  response_format: "b64_json",
}

function getDefaultParams(mode: ResolvedApiMode): Record<string, string> {
  return mode === "edits" ? DEFAULT_EDITS_PARAMS : DEFAULT_GENERATIONS_PARAMS
}

// 按当前接口类型返回对应请求体参数
export function resolveApiParamsForMode(config: Config, mode: ResolvedApiMode): Record<string, string> {
  const params = mode === "edits" ? config.apiParams_edits : config.apiParams_generations
  return Object.keys(params).length > 0 ? { ...params } : { ...getDefaultParams(mode) }
}
