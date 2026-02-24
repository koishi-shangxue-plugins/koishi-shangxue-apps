// src/fetch.ts
import { Context } from "koishi";
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

/**
 * 封装的 fetch 函数，支持代理和自动重试
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
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        ctx.logger.warn(`请求出错, 重试 ${attempt + 1}/${maxRetries}: ${url}`, error);
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

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
