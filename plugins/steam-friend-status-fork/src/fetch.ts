// src/fetch.ts
import { Context, sleep } from "koishi";
import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import * as tls from "node:tls";
import * as net from "node:net";
import { getPluginLogger } from "./logger";

/**
 * 封装的 fetch 配置接口
 */
export interface FetchConfig {
  useProxy: boolean;
  proxyUrl: string;
  maxRetries: number;
  useApifoxProxy: boolean;
}

const APIFOX_PROXY_URL = "https://web-proxy.apifox.cn/api/v1/request";
const APIFOX_TARGET_TIMEOUT_MS = 15_000;
const APIFOX_REQUEST_TIMEOUT_MS = 20_000;
const DIRECT_REQUEST_TIMEOUT_MS = 15_000;

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
  config: FetchConfig,
  allowApifox = false,
): Promise<Response> {
  const { useProxy, proxyUrl, maxRetries, useApifoxProxy } = config;
  const safeUrl = maskSensitiveUrl(url);
  const apifoxEnabled = useApifoxProxy !== false;

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

  // 允许多次尝试：自定义代理、直连、APIFOX 兜底
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (useProxy && proxyUrl) {
      try {
        const response = await fetchViaProxy(ctx, url, proxyUrl, options);
        if (response.ok) {
          recordSuccess(host);
          return response;
        }
        lastError = new Error(`自定义代理返回 HTTP ${response.status}`);
      } catch (error) {
        lastError = toError(error);
        getPluginLogger().warn("自定义代理请求失败，尝试直连:", error);
      }
    }

    try {
      const response = await fetchDirect(ctx, url, options);
      if (response.ok) {
        recordSuccess(host);
        return response;
      }
      lastError = new Error(`直连返回 HTTP ${response.status}`);
    } catch (error) {
      lastError = toError(error);
    }

    if (allowApifox && apifoxEnabled) {
      try {
        const response = await fetchViaApifox(ctx, url, options);
        if (response.ok) {
          recordSuccess(host);
          return response;
        }
        lastError = new Error(`APIFOX 代理返回 HTTP ${response.status}`);
      } catch (error) {
        lastError = toError(error);
        getPluginLogger().warn(
          `APIFOX 代理请求失败，重试 ${attempt + 1}/${maxRetries}: ${safeUrl}`,
          error,
        );
      }
    }

    if (attempt < maxRetries) {
      getPluginLogger().warn(
        `请求失败，重试 ${attempt + 1}/${maxRetries}: ${safeUrl}`,
        lastError,
      );
      // 使用 koishi 的 sleep 替代原生 setTimeout，避免游离 Promise 堆积
      await sleep(1000 * (attempt + 1));
    }
  }

  // 所有重试均失败，记录失败并可能触发熔断
  recordFailure(host);
  throw lastError || new Error(`请求失败: ${safeUrl}`);
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

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    disposeTimeout();
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
  }
}

/**
 * 通过代理发送请求
 * @param targetUrl 目标 URL
 * @param proxyUrl 代理 URL
 * @param options fetch 选项
 * @returns 返回 Response 对象
 */
async function fetchViaProxy(
  ctx: Context,
  targetUrl: string,
  proxyUrl: string,
  options: RequestInit = {}
): Promise<Response> {
  const target = new URL(targetUrl);
  const proxy = new URL(proxyUrl);

  // SOCKS5 代理
  if (proxy.protocol === 'socks5:' || proxy.protocol === 'socks5h:') {
    return fetchViaSocks5(ctx, targetUrl, proxyUrl, options);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let disposeTimeout: (() => void) | undefined;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      disposeTimeout?.();
      callback();
    };
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
      res.on('error', (error) => settle(() => reject(error)));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const response = new Response(buffer, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers as HeadersInit
        });
        settle(() => resolve(response));
      });
    });

    disposeTimeout = ctx.setTimeout(() => {
      req.destroy(new Error('自定义代理请求超时'));
    }, DIRECT_REQUEST_TIMEOUT_MS);
    req.on('error', (error) => settle(() => reject(error)));
    req.end();
  });
}

/**
 * 通过 SOCKS5 代理发送请求
 */
async function fetchViaSocks5(
  ctx: Context,
  targetUrl: string,
  proxyUrl: string,
  options: RequestInit = {}
): Promise<Response> {
  const target = new URL(targetUrl);
  const proxy = new URL(proxyUrl);

  const proxyPort = parseInt(proxy.port) || 1080;
  const targetPort = parseInt(target.port) || (target.protocol === 'https:' ? 443 : 80);
  const targetHost = target.hostname;
  const isHttps = target.protocol === 'https:';

  // 1. 连接代理
  const socket = new net.Socket();
  await new Promise<void>((resolve, reject) => {
    let disposeTimeout: (() => void) | undefined;
    const onConnect = () => {
      disposeTimeout?.();
      socket.removeListener('error', onError);
      resolve();
    };
    const onError = (error: Error) => {
      disposeTimeout?.();
      socket.removeListener('connect', onConnect);
      reject(error);
    };
    disposeTimeout = ctx.setTimeout(() => {
      socket.removeListener('connect', onConnect);
      socket.removeListener('error', onError);
      socket.destroy();
      reject(new Error('连接代理超时'));
    }, 10000);
    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.connect(proxyPort, proxy.hostname);
  });

  // 共享读缓冲区（仅用于 SOCKS 握手阶段；隧道建立后会移除监听以避免缓存整个响应）
  let readBuf = Buffer.alloc(0);
  const onHandshakeData = (chunk: Buffer) => {
    readBuf = Buffer.concat([readBuf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  };
  socket.on('data', onHandshakeData);

  // 读取精确 N 字节
  async function readN(n: number, timeout = 10000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let disposeTimeout: (() => void) | undefined;
      let settled = false;

      const cleanup = () => {
        disposeTimeout?.();
        socket.removeListener('data', tryRead);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
      };

      const finish = (error?: Error, result?: Buffer) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };

      const tryRead = () => {
        if (readBuf.length >= n) {
          const result = readBuf.subarray(0, n);
          readBuf = readBuf.subarray(n);
          finish(undefined, result);
          return;
        }
      };

      const onError = (error: Error) => finish(error);
      const onClose = () => finish(new Error('SOCKS5 连接关闭'));

      disposeTimeout = ctx.setTimeout(() => {
        finish(new Error(`SOCKS5 读取超时 (期望 ${n} 字节)`));
      }, timeout);
      socket.on('data', tryRead);
      socket.once('error', onError);
      socket.once('close', onClose);

      // 先检查缓冲区是否已有足够数据
      tryRead();
    });
  }

  try {
    // 2. SOCKS5 greeting
    socket.write(Buffer.from([0x05, 0x01, 0x00]));
    const greet = await readN(2, 5000);
    if (greet[0] !== 0x05) throw new Error(`SOCKS5 版本错误: ${greet[0]}`);
    if (greet[1] !== 0x00) throw new Error(`SOCKS5 需要认证 (方式 ${greet[1]})`);

    // 3. CONNECT 请求 (域名方式)
    const hostBytes = Buffer.from(targetHost, 'utf-8');
    const portBytes = Buffer.alloc(2);
    portBytes.writeUInt16BE(targetPort, 0);
    const connectReq = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]),
      hostBytes,
      portBytes,
    ]);
    socket.write(connectReq);

    // 4. 读 CONNECT 响应（先读 4 字节头，再根据 ATYP 读剩余部分）
    // 格式: VER(1) + REP(1) + RSV(1) + ATYP(1) + BND.ADDR(可变) + BND.PORT(2)
    const head = await readN(4, 10000);
    const status = head[1];
    if (status !== 0x00) {
      const msgs: Record<number, string> = {
        0x01: '服务器故障', 0x02: '连接不被允许',
        0x03: '网络不可达', 0x04: '主机不可达',
        0x05: '连接被拒绝', 0x06: 'TTL 超时',
        0x07: '不支持的命令', 0x08: '不支持的地址类型',
      };
      throw new Error(`SOCKS5 连接失败: ${msgs[status] || status}`);
    }

    const atyp = head[3];
    if (atyp === 0x01) await readN(6, 10000);       // IPv4: 4 字节地址 + 2 字节端口
    else if (atyp === 0x03) {                        // 域名
      const dl = (await readN(1, 10000))[0];
      await readN(dl + 2, 10000);                    // 域名 + 2 字节端口
    }
    else if (atyp === 0x04) await readN(18, 10000);  // IPv6: 16 字节地址 + 2 字节端口
    else throw new Error(`SOCKS5 不支持的地址类型: ${atyp}`);

    // 5. 隧道已建立，发送 HTTP 请求
    const httpBody = options.body as string | undefined;
    const httpHeaders = options.headers as Record<string, string> || {};
    let httpReq = `${options.method || 'GET'} ${target.pathname}${target.search} HTTP/1.1\r\n`;
    httpReq += `Host: ${target.host}\r\n`;
    for (const [k, v] of Object.entries(httpHeaders)) httpReq += `${k}: ${v}\r\n`;
    httpReq += 'Connection: close\r\n';
    httpReq += '\r\n';
    if (httpBody) httpReq += httpBody;

    if (isHttps) {
      const tlsSocket = tls.connect({ socket, host: targetHost, servername: targetHost });
      await new Promise<void>((resolve, reject) => {
        tlsSocket.once('secureConnect', resolve);
        tlsSocket.once('error', reject);
      });
      tlsSocket.write(Buffer.from(httpReq, 'utf-8'));
      const chunks = await readAllData(ctx, tlsSocket);
      return parseHttpResponse(chunks);
    } else {
      socket.write(Buffer.from(httpReq, 'utf-8'));
      const chunks = await readAllData(ctx, socket);
      return parseHttpResponse(chunks);
    }
  } finally {
    socket.destroy();
  }
}

/** 读取所有数据直到连接关闭 */
function readAllData(
  ctx: Context,
  socket: net.Socket | tls.TLSSocket,
): Promise<Buffer[]> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;
    let disposeTimeout: (() => void) | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      disposeTimeout?.();
      socket.removeListener('data', onData);
      socket.removeListener('end', finish);
      socket.removeListener('close', finish);
      socket.removeListener('error', finish);
      resolve(chunks);
    };
    const onData = (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    disposeTimeout = ctx.setTimeout(() => {
      socket.destroy();
      finish();
    }, 60000);
    socket.on('data', onData);
    socket.once('end', finish);
    socket.once('close', finish);
    socket.once('error', finish);
  });
}

/** 解析 HTTP 响应为 Response 对象 */
function parseHttpResponse(chunks: Buffer[]): Response {
  if (chunks.length === 0) throw new Error('收到空响应');
  const buf = Buffer.concat(chunks);
  const text = buf.toString('utf-8');
  const idx = text.indexOf('\r\n\r\n');
  if (idx === -1) throw new Error('无效的 HTTP 响应');
  const headerBlock = text.substring(0, idx);
  const body = buf.subarray(idx + 4);
  const first = headerBlock.split('\r\n')[0];
  const m = first.match(/HTTP\/\d\.\d (\d+) (.+)/);
  const code = m ? parseInt(m[1]) : 500;
  const statusText = m ? m[2] : 'Unknown';
  const hdrs: Record<string, string> = {};
  for (const line of headerBlock.split('\r\n').slice(1)) {
    const ci = line.indexOf(':');
    if (ci > 0) hdrs[line.substring(0, ci).toLowerCase()] = line.substring(ci + 2);
  }
  return new Response(body, { status: code, statusText, headers: hdrs });
}

/**
 * 获取 JSON 数据
 * @param ctx Koishi context
 * @param url 请求的 URL
 * @param config 代理和重试配置
 * @returns 返回解析后的 JSON 对象
 */
export async function fetchJson<T = unknown>(
  ctx: Context,
  url: string,
  config: FetchConfig
): Promise<T> {
  const response = await fetchWithProxy(ctx, url, {}, config, true);
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
