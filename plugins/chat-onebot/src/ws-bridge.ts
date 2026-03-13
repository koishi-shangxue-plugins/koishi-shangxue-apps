import { Context, Logger } from 'koishi'
import type { WebSocketLayer } from '@koishijs/plugin-server'
import type { IncomingMessage } from 'node:http'

type RawData = Buffer | ArrayBuffer | Buffer[]
type MessageHandler = (data: RawData, isBinary: boolean) => void
type WsSocket = Parameters<WebSocketLayer['accept']>[0]

const WS_OPEN = 1

export type WsMode = 'none' | 'forward' | 'reverse'

export interface WsBridgeConfig {
  wsMode: WsMode
  protocolEndpoint?: string
  protocolToken?: string
  proxyPath?: string
  reversePath?: string
  accessToken?: string
}

function normalizeData(data: RawData): Buffer | ArrayBuffer {
  if (Array.isArray(data)) return Buffer.concat(data)
  return data
}

function prepareForward(data: RawData, isBinary: boolean): string | Buffer | ArrayBuffer {
  const normalized = normalizeData(data)
  if (!isBinary) return normalized.toString()
  return normalized
}

function validateToken(request: IncomingMessage, token: string, logger: Logger, socket: WsSocket): boolean {
  const auth = (request.headers['authorization'] ?? '') as string
  if (auth === `Bearer ${token}`) return true
  const qs = (request.url ?? '').split('?')[1] ?? ''
  if (new URLSearchParams(qs).get('access_token') === token) return true
  logger.warn('[WS桥接] 连接被拒绝: token 验证失败')
  socket.close(1008, 'Invalid token')
  return false
}

export function setupWsBridge(
  ctx: Context,
  config: WsBridgeConfig,
  logInfo: (msg: string) => void
): void {
  const logger = ctx.logger('chat-onebot')

  if (config.wsMode === 'none') {
    logInfo('WS桥接: 未启用')
    return
  }

  if (config.wsMode === 'forward') {
    setupForwardBridge(ctx, config, logInfo, logger)
  } else if (config.wsMode === 'reverse') {
    setupReverseBridge(ctx, config, logInfo, logger)
  }
}

function setupForwardBridge(
  ctx: Context,
  config: WsBridgeConfig,
  logInfo: (msg: string) => void,
  logger: Logger
): void {
  const proxyPath = config.proxyPath ?? '/chat-onebot/ws-proxy'
  const baseUrl = `ws://localhost:${ctx.server.port || 5140}`

  logger.info(`[WS桥接] WebQQ 请连接到: ${baseUrl}${proxyPath}`)
  logger.info(`[WS桥接] 将代理至协议端: ${config.protocolEndpoint}`)

  const layer = ctx.server.ws(proxyPath, (webqqSocket, request) => {
    if (config.accessToken && !validateToken(request, config.accessToken, logger, webqqSocket)) return
    logInfo('WebQQ 已连接到代理端点，正在连接协议端...')

    const pendingMessages: Array<{ data: RawData; isBinary: boolean }> = []
    let ready = false

    const bufferHandler: MessageHandler = (data, isBinary) => {
      if (!ready) pendingMessages.push({ data, isBinary })
    }
    webqqSocket.on('message', bufferHandler)

    const protocolWs = ctx.http.ws(config.protocolEndpoint!, config.protocolToken
      ? { headers: { Authorization: `Bearer ${config.protocolToken}` } }
      : undefined)

    protocolWs.addEventListener('open', () => {
      logInfo(`协议端连接已建立，转发缓冲消息 ${pendingMessages.length} 条`)
      ready = true
      webqqSocket.off('message', bufferHandler)

      for (const { data, isBinary } of pendingMessages) {
        protocolWs.send(prepareForward(data, isBinary))
      }
      pendingMessages.length = 0

      webqqSocket.on('message', (data: RawData, isBinary: boolean) => {
        if (protocolWs.readyState === WS_OPEN) {
          protocolWs.send(prepareForward(data, isBinary))
        }
      })

      protocolWs.addEventListener('message', (event) => {
        if (webqqSocket.readyState === 1) {
          webqqSocket.send(event.data)
        }
      })
    })

    protocolWs.addEventListener('error', () => {
      logger.error('[WS桥接] 连接协议端失败')
      webqqSocket.close(1011, '协议端连接失败')
    })

    protocolWs.addEventListener('close', () => {
      logInfo('协议端连接已断开，关闭 WebQQ 连接')
      webqqSocket.close(1001, '协议端已断开')
    })

    webqqSocket.once('close', () => {
      logInfo('WebQQ 已断开，关闭协议端连接')
      protocolWs.close()
    })
  })

  ctx.on('dispose', () => {
    logInfo('WS桥接（正向模式）已停止')
    layer.close()
  })
}

function setupReverseBridge(
  ctx: Context,
  config: WsBridgeConfig,
  logInfo: (msg: string) => void,
  logger: Logger
): void {
  const reversePath = config.reversePath ?? '/chat-onebot/ws-incoming'
  const proxyPath = config.proxyPath ?? '/chat-onebot/ws-proxy'
  const baseUrl = `ws://localhost:${ctx.server.port || 5140}`

  logger.info(`[WS桥接] 协议端反向 WS 请连接到: ${baseUrl}${reversePath}`)
  logger.info(`[WS桥接] WebQQ 请连接到: ${baseUrl}${proxyPath}`)

  let protocolSocket: WsSocket | null = null
  let webqqSocket: WsSocket | null = null
  let proto2webqq: MessageHandler | null = null
  let webqq2proto: MessageHandler | null = null

  function bridge(): void {
    if (!protocolSocket || !webqqSocket) return
    if (protocolSocket.readyState !== 1 || webqqSocket.readyState !== 1) return

    logInfo('桥接已建立: 协议端 ↔ WebQQ')

    proto2webqq = (data: RawData, isBinary: boolean) => {
      if (webqqSocket?.readyState === 1) webqqSocket.send(prepareForward(data, isBinary))
    }
    webqq2proto = (data: RawData, isBinary: boolean) => {
      if (protocolSocket?.readyState === 1) protocolSocket.send(prepareForward(data, isBinary))
    }

    protocolSocket.on('message', proto2webqq)
    webqqSocket.on('message', webqq2proto)
  }

  function clearBridge(): void {
    if (proto2webqq && protocolSocket) protocolSocket.off('message', proto2webqq)
    if (webqq2proto && webqqSocket) webqqSocket.off('message', webqq2proto)
    proto2webqq = null
    webqq2proto = null
  }

  const reverseLayer = ctx.server.ws(reversePath, (socket, request) => {
    if (config.accessToken && !validateToken(request, config.accessToken, logger, socket)) return
    if (protocolSocket) {
      logger.warn('[WS桥接] 已有协议端连接，断开旧连接')
      clearBridge()
      protocolSocket.close(1001, '新连接已建立')
    }

    logInfo('协议端已连接（反向 WS）')
    protocolSocket = socket

    socket.once('close', () => {
      logInfo('协议端连接已断开')
      clearBridge()
      protocolSocket = null
      if (webqqSocket && webqqSocket.readyState === 1) {
        webqqSocket.close(1001, '协议端已断开连接')
      }
      webqqSocket = null
    })

    bridge()
  })

  const proxyLayer = ctx.server.ws(proxyPath, (socket, request) => {
    if (config.accessToken && !validateToken(request, config.accessToken, logger, socket)) return
    if (webqqSocket) {
      clearBridge()
      webqqSocket.close(1001, '新连接已建立')
    }

    logInfo('WebQQ 已连接到代理端点')
    webqqSocket = socket

    socket.once('close', () => {
      logInfo('WebQQ 已断开')
      clearBridge()
      webqqSocket = null
    })

    if (!protocolSocket || protocolSocket.readyState !== 1) {
      logger.warn('[WS桥接] 协议端尚未连接，WebQQ 已连接并等待中...')
    }

    bridge()
  })

  ctx.on('dispose', () => {
    logInfo('WS桥接（反向模式）已停止')
    clearBridge()
    reverseLayer.close()
    proxyLayer.close()
    protocolSocket?.close()
    webqqSocket?.close()
  })
}
