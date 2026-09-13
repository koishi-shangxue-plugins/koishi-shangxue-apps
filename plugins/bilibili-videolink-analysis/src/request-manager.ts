import type { Context } from 'koishi'
import type { RequestMode } from './config'
import type { PluginLogger } from './logger'

const APIFOX_PROXY_URL = 'https://web-proxy.apifox.cn/api/v1/request'

interface RequestCandidate<T> {
  label: string
  run: (signal: AbortSignal) => Promise<T>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 使用原生 fetch 读取文本，便于直连与代理共用同一套解析逻辑
async function requestText(targetUrl: string, headers: Record<string, string>, signal: AbortSignal) {
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers,
    signal,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return await response.text()
}

async function requestTextByProxy(
  targetUrl: string,
  timeoutMs: number,
  signal: AbortSignal,
) {
  const response = await fetch(APIFOX_PROXY_URL, {
    method: 'POST',
    signal,
    headers: {
      'api-u': targetUrl,
      'api-o0': `method=GET, timings=true, timeout=${timeoutMs}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return await response.text()
}

export class RequestManager {
  private readonly activeControllers = new Map<AbortController, () => void>()
  private disposed = false

  constructor(
    private readonly ctx: Context,
    private readonly logger: PluginLogger,
  ) {}

  dispose() {
    if (this.disposed) return
    this.disposed = true

    for (const [controller, disposeTimeout] of this.activeControllers) {
      controller.abort()
      disposeTimeout()
    }
    this.activeControllers.clear()
  }

  // 按配置创建直连、代理或并行请求，并返回第一个可解析结果
  async request<T>(
    targetUrl: string,
    mode: RequestMode,
    headers: Record<string, string>,
    timeoutMs: number,
    parser: (content: string) => T | null,
    description: string,
  ): Promise<T> {
    if (this.disposed) {
      throw new Error(`${description}请求已销毁`)
    }

    const candidates: RequestCandidate<T>[] = []
    const parse = async (run: () => Promise<string>, label: string) => {
      const content = await run()
      const result = parser(content)
      if (result === null) {
        throw new Error(`${label}返回结果不可用`)
      }
      return result
    }

    if (mode === 'parallel' || mode === 'direct') {
      candidates.push({
        label: '直连',
        run: (signal) => parse(() => requestText(targetUrl, headers, signal), '直连'),
      })
    }

    if (mode === 'parallel' || mode === 'proxy') {
      candidates.push({
        label: '代理',
        run: (signal) => parse(() => requestTextByProxy(targetUrl, timeoutMs, signal), '代理'),
      })
    }

    return await this.race(candidates, timeoutMs, description)
  }

  private async race<T>(
    candidates: RequestCandidate<T>[],
    timeoutMs: number,
    description: string,
  ): Promise<T> {
    if (candidates.length === 0) {
      throw new Error(`${description}没有可用请求`)
    }

    const controllers = candidates.map(() => new AbortController())
    const failures: Array<{ label: string; error: unknown }> = []

    const tasks = candidates.map(async (candidate, index) => {
      const controller = controllers[index]
      const disposeTimeout = this.ctx.setTimeout(() => controller.abort(), timeoutMs)
      this.activeControllers.set(controller, disposeTimeout)

      try {
        this.logger.debug(`${description}开始请求：${candidate.label}`)
        const result = await candidate.run(controller.signal)
        this.logger.debug(`${description}命中：${candidate.label}`)
        return result
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(`${candidate.label}请求超时或已取消`)
        }
        throw new Error(`${candidate.label}请求失败：${getErrorMessage(error)}`)
      } finally {
        disposeTimeout()
        if (this.activeControllers.delete(controller)) {
          controller.abort()
        }
      }
    })

    try {
      return await new Promise<T>((resolve, reject) => {
        let remaining = tasks.length
        let settled = false

        for (const [index, task] of tasks.entries()) {
          task.then(
            (result) => {
              if (settled) return
              settled = true
              resolve(result)
            },
            (error: unknown) => {
              failures.push({ label: candidates[index].label, error })
              remaining -= 1
              if (remaining > 0 || settled) return
              settled = true
              const details = failures
                .map((failure) => `${failure.label}：${getErrorMessage(failure.error)}`)
                .join('；')
              reject(new Error(`${description}全部失败：${details}`))
            },
          )
        }
      })
    } finally {
      for (const controller of controllers) {
        controller.abort()
      }
    }
  }
}
