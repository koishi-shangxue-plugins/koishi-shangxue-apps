import { ProxyAgent, Dispatcher } from 'undici';

/**
 * 使用 Node.js 内置的 fetch 功能进行网络请求，并支持通过参数传入代理地址。
 * @param url 请求的 URL
 * @param init 请求的配置
 * @param proxyUrl 代理地址 (例如 "socks://localhost:7897" 或 "http://localhost:7890")
 * @returns 返回一个 Promise<Response>
 */
export function fetchWithProxy(url: RequestInfo, init?: RequestInit, proxyUrl?: string): Promise<Response> {
  let options: RequestInit = { ...init };

  // 如果提供了代理地址，则创建一个 ProxyAgent 并将其设置为 dispatcher
  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);
    // Node.js 的 fetch 支持 dispatcher，但 @types/node 可能未更新，我们使用 as any 绕过类型检查
    (options as any).dispatcher = dispatcher;
  }

  // 直接调用全局的 fetch 函数
  return fetch(url, options);
}

