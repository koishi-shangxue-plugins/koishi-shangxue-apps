// src/fetch.ts
import { Context, sleep } from "koishi";
import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

/**
 * 封装的 fetch 配置接口
 */
export interface FetchConfig {
  useProxy: boolean;
  proxyUrl: string;
  maxRetries: number;
}

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
 * 封装的 fetch 函数，支持代理、自动重试和熔断器保护
 * @param ctx Koishi context
 * @param url 请求的 URL
 * @param options fetch 选项
 * @param config 代理和重试配置
 * @returns 返回 Response 对象
 */
export async function fetchWithProxy(
  ctx: Context,
  url: string,
  options: RequestInit = {},
  config: FetchConfig
): Promise<Response> {
  const { useProxy, proxyUrl, maxRetries } = config;

  // 提取 host 用于熔断器隔离
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }

  // 熔断器检查：如果当前处于熔断状态，直接快速失败，不发起任何请求
  if (!isAllowed(host)) {
    throw new Error(`[熔断器] ${host} 当前处于熔断状态，跳过请求以保护内存。将在 ${RECOVERY_TIMEOUT_MS / 1000}s 后自动恢复。`);
  }

  // 重试逻辑
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let response: Response;

      // 如果启用代理，使用代理请求
      if (useProxy && proxyUrl) {
        try {
          response = await fetchViaProxy(url, proxyUrl, options);
        } catch (proxyError) {
          ctx.logger.warn('代理请求失败，尝试直连:', proxyError);
          response = await fetch(url, options);
        }
      } else {
        response = await fetch(url, options);
      }

      if (!response.ok && attempt < maxRetries) {
        ctx.logger.warn(`请求失败 (${response.status}), 重试 ${attempt + 1}/${maxRetries}: ${url}`);
        continue;
      }

      // 请求成功，重置熔断器
      recordSuccess(host);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        ctx.logger.warn(`请求出错, 重试 ${attempt + 1}/${maxRetries}: ${url}`, error);
        // 使用 koishi 的 sleep 替代原生 setTimeout，避免游离 Promise 堆积
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  // 所有重试均失败，记录失败并可能触发熔断
  recordFailure(host);
  throw lastError || new Error(`请求失败: ${url}`);
}

/**
 * 通过代理发送请求
 * @param targetUrl 目标 URL
 * @param proxyUrl 代理 URL
 * @param options fetch 选项
 * @returns 返回 Response 对象
 */
async function fetchViaProxy(
  targetUrl: string,
  proxyUrl: string,
  options: RequestInit = {}
): Promise<Response> {
  const target = new URL(targetUrl);
  const proxy = new URL(proxyUrl);

  return new Promise((resolve, reject) => {
    const requestOptions = {
      host: proxy.hostname,
      port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
      method: options.method || 'GET',
      path: targetUrl,
      headers: {
        Host: target.host,
        ...(options.headers as Record<string, string> || {})
      }
    };

    const req = (proxy.protocol === 'https:' ? httpsRequest : request)(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const response = new Response(buffer, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers as HeadersInit
        });
        resolve(response);
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * 获取 JSON 数据
 * @param ctx Koishi context
 * @param url 请求的 URL
 * @param config 代理和重试配置
 * @returns 返回解析后的 JSON 对象
 */
export async function fetchJson<T = any>(
  ctx: Context,
  url: string,
  config: FetchConfig
): Promise<T> {
  const response = await fetchWithProxy(ctx, url, {}, config);
  return await response.json();
}

/**
 * 获取 ArrayBuffer 数据（用于下载图片等二进制数据）
 * @param ctx Koishi context
 * @param url 请求的 URL
 * @param config 代理和重试配置
 * @returns 返回 ArrayBuffer
 */
export async function fetchArrayBuffer(
  ctx: Context,
  url: string,
  config: FetchConfig
): Promise<ArrayBuffer> {
  const response = await fetchWithProxy(ctx, url, {}, config);
  return await response.arrayBuffer();
}
