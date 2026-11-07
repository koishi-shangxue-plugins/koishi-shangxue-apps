// src/fetch.ts
import { Context, sleep } from "koishi";
import { URL } from "node:url";
import { getPluginLogger } from "./logger";

/**
 * 封装的 fetch 配置接口
 */
export interface FetchConfig {
  maxRetries: number;
  useApifoxProxy: boolean;
}

const APIFOX_PROXY_URL = "https://web-proxy.apifox.cn/api/v1/request";
const APIFOX_TARGET_TIMEOUT_MS = 15_000;
const APIFOX_REQUEST_TIMEOUT_MS = 20_000;
const DIRECT_REQUEST_TIMEOUT_MS = 15_000;
// 重试间隔固定为 30 秒，避免连续请求堆叠
const RETRY_DELAY_MS = 30_000;

// ─── 熔断器（Circuit Breaker）─────────────────────────────────────────────────
// 用于防止网络不通时大量请求堆积导致内存暴涨
// 状态：CLOSED（正常）→ OPEN（熔断，快速失败）→ HALF_OPEN（半开，试探恢复）

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreaker {
  state: CircuitState;
  /** 连续失败次数 */
  failureCount: number;
  /** 进入 OPEN 状态的时间戳（ms） */
  openedAt: number;
}

/** 全局熔断器实例（按 host 隔离，避免一个域名影响其他域名） */
const circuitBreakers = new Map<string, CircuitBreaker>();

/** 连续失败多少次后触发熔断 */
const FAILURE_THRESHOLD = 3;
/** 熔断冷却时间（ms），冷却后进入 HALF_OPEN 状态 */
const RECOVERY_TIMEOUT_MS = 60_000; // 60 秒

/**
 * 获取或创建指定 host 的熔断器
 */
function getBreaker(host: string): CircuitBreaker {
  if (!circuitBreakers.has(host)) {
    circuitBreakers.set(host, { state: "CLOSED", failureCount: 0, openedAt: 0 });
  }
  return circuitBreakers.get(host)!;
}

/**
 * 记录一次请求成功，重置熔断器
 */
function recordSuccess(host: string): void {
  const breaker = getBreaker(host);
  breaker.state = "CLOSED";
  breaker.failureCount = 0;
}

/**
 * 记录一次请求失败，必要时触发熔断
 */
function recordFailure(host: string): void {
  const breaker = getBreaker(host);
  breaker.failureCount++;
  if (breaker.failureCount >= FAILURE_THRESHOLD) {
    breaker.state = "OPEN";
    breaker.openedAt = Date.now();
  }
}

/**
 * 检查熔断器是否允许本次请求通过
 * @returns true 表示允许，false 表示应快速失败
 */
function isAllowed(host: string): boolean {
  const breaker = getBreaker(host);
  if (breaker.state === "CLOSED") return true;
  if (breaker.state === "OPEN") {
    // 冷却时间到了，切换到半开状态，放行一次试探请求
    if (Date.now() - breaker.openedAt >= RECOVERY_TIMEOUT_MS) {
      breaker.state = "HALF_OPEN";
      return true;
    }
    return false; // 仍在熔断冷却中，快速失败
  }
  // HALF_OPEN：允许一次试探
  return true;
}

/**
 * 封装的 fetch 函数，支持直连失败后的 APIFOX 兜底、自动重试和熔断器保护
 * @param ctx Koishi context
 * @param url 请求的 URL
 * @param options fetch 选项
 * @param config 重试与代理兜底配置
 * @param allowApifox 是否允许使用 APIFOX 公共代理兜底
 * @returns 返回 Response 对象
 */
export async function fetchWithProxy(
  ctx: Context,
  url: string,
  options: RequestInit = {},
  config: FetchConfig,
  allowApifox = false,
): Promise<Response> {
  const { maxRetries, useApifoxProxy } = config;
  const safeUrl = maskSensitiveUrl(url);
  const apifoxEnabled = useApifoxProxy !== false;

  // 提取 host 用于熔断器隔离
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }

  // 插件卸载后立即停止后续重试，避免遗留请求继续运行
  let disposed = false;
  const disposeListener = ctx.on("dispose", () => {
    disposed = true;
  });

  try {
    // 熔断器检查：如果当前处于熔断状态，直接快速失败，不发起任何请求
    if (!isAllowed(host)) {
      throw new Error(`[熔断器] ${host} 当前处于熔断状态，跳过请求以保护内存。将在 ${RECOVERY_TIMEOUT_MS / 1000}s 后自动恢复。`);
    }

    // 先直连，失败后再按配置使用 APIFOX 公共代理兜底
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (disposed) break;

      try {
        const response = await fetchDirect(ctx, url, options);
        if (response.ok) {
          recordSuccess(host);
          return response;
        }
        lastError = new Error(`直连返回 HTTP ${response.status}`);
        await response.body?.cancel();
      } catch (error) {
        lastError = toError(error);
      }

      if (disposed) break;

      if (allowApifox && apifoxEnabled) {
        try {
          const response = await fetchViaApifox(ctx, url, options);
          if (response.ok) {
            recordSuccess(host);
            return response;
          }
          lastError = new Error(`APIFOX 代理返回 HTTP ${response.status}`);
          await response.body?.cancel();
        } catch (error) {
          lastError = toError(error);
        }
      }

      if (disposed) break;

      if (attempt < maxRetries) {
        getPluginLogger().warn(
          `请求失败，${RETRY_DELAY_MS / 1000} 秒后重试 ${attempt + 1}/${maxRetries}: ${safeUrl}`,
          lastError,
        );
        // 使用 koishi 的 sleep 替代原生 setTimeout，避免游离 Promise 堆积
        await sleep(RETRY_DELAY_MS);
      }
    }

    // 插件卸载属于主动取消，不记为网络失败
    if (disposed) {
      throw new Error("插件已卸载，取消请求");
    }

    // 所有重试均失败，记录失败并可能触发熔断
    recordFailure(host);
    throw lastError || new Error(`请求失败: ${safeUrl}`);
  } finally {
    disposeListener();
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// 直连也设置超时，避免单次轮询无限挂起
async function fetchDirect(
  ctx: Context,
  url: string,
  options: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const disposeTimeout = ctx.setTimeout(() => {
    controller.abort("direct-request-timeout");
  }, DIRECT_REQUEST_TIMEOUT_MS);
  // 插件卸载时立即中断仍在进行的请求
  const disposeAbort = ctx.on("dispose", () => {
    controller.abort("plugin-disposed");
  });

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    disposeTimeout();
    disposeAbort();
  }
}

// 日志中隐藏 API Key 等敏感参数
function maskSensitiveUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ["key", "token", "access_token"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "***");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// 通过 APIFOX 公共网关转发 Steam API 请求
async function fetchViaApifox(
  ctx: Context,
  targetUrl: string,
  options: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const disposeTimeout = ctx.setTimeout(() => {
    controller.abort("apifox-request-timeout");
  }, APIFOX_REQUEST_TIMEOUT_MS);
  // 插件卸载时立即中断仍在进行的请求
  const disposeAbort = ctx.on("dispose", () => {
    controller.abort("plugin-disposed");
  });

  try {
    const method = options.method || "GET";
    const response = await fetch(APIFOX_PROXY_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "api-u": targetUrl,
        "api-o0": `method=${method}, timings=true, timeout=${APIFOX_TARGET_TIMEOUT_MS}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`APIFOX 网关返回 HTTP ${response.status}`);
    }

    // 网关会以 200 返回目标站点的错误 HTML，需要显式识别
    const contentType = response.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("text/html")) {
      await response.body?.cancel();
      throw new Error("APIFOX 目标站点返回了 HTML 错误页");
    }

    return response;
  } finally {
    disposeTimeout();
    disposeAbort();
  }
}

/**
 * 获取 JSON 数据
 * @param ctx Koishi context
 * @param url 请求的 URL
 * @param config 重试与代理兜底配置
 * @returns 返回解析后的 JSON 对象
 */
export async function fetchJson<T = unknown>(
  ctx: Context,
  url: string,
  config: FetchConfig,
): Promise<T> {
  const response = await fetchWithProxy(ctx, url, {}, config, true);
  return await response.json();
}

/**
 * 获取 ArrayBuffer 数据（用于下载图片等二进制数据）
 * @param ctx Koishi context
 * @param url 请求的 URL
 * @param config 重试与代理兜底配置
 * @returns 返回 ArrayBuffer
 */
export async function fetchArrayBuffer(
  ctx: Context,
  url: string,
  config: FetchConfig,
): Promise<ArrayBuffer> {
  const response = await fetchWithProxy(ctx, url, {}, config);
  return await response.arrayBuffer();
}
