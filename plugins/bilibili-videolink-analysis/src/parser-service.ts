import type { Context, Session } from 'koishi'
import { h } from 'koishi'
import type { BilibiliApi } from './bilibili-api'
import type { Config, VideoParseMode } from './config'
import type { PluginLogger } from './logger'
import type { BilibiliTarget, ResolvedVideoTarget } from './link-parser'
import { targetFromResolvedUrl } from './link-parser'
import type { BlockReason, VideoRateLimiter } from './rate-limiter'
import { buildVideoMessages } from './video-formatter'

interface SessionTask {
  session: Session
  content: string
  targets: BilibiliTarget[]
  source: VideoParseMode
  timestamp: number
}

export class VideoParseService {
  private lastProcessedUrls = new Map<string, number>()
  private sessionQueue: SessionTask[] = []
  private isProcessingSession = false
  private disposed = false

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly api: BilibiliApi,
    private readonly logger: PluginLogger,
    private readonly rateLimiter: VideoRateLimiter,
  ) {}

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.rateLimiter.dispose()
    this.sessionQueue = []
    this.lastProcessedUrls.clear()
    this.isProcessingSession = false
  }

  // 中间件把同一条消息里的链接加入串行队列
  async enqueue(
    session: Session,
    content: string,
    targets: BilibiliTarget[],
    source: VideoParseMode,
  ): Promise<BlockReason | null> {
    if (this.disposed || targets.length === 0) return null

    const reason = this.rateLimiter.checkNewMessage(session.channelId, session.userId, targets.length)
    if (reason) {
      if (reason === 'user-video-limit' && !this.rateLimiter.isUserBlocked(session.channelId, session.userId)) {
        this.rateLimiter.blockUser(session.channelId, session.userId)
      }
      this.clearSessionQueueByUser(session.channelId, session.userId)
      return reason
    }

    this.rateLimiter.reserveMessage(session.channelId, session.userId, targets.length)
    this.sessionQueue.push({ session, content, targets, source, timestamp: Date.now() })
    this.logger.debug(`收到解析消息，队列长度：${this.sessionQueue.length}`)
    this.processSessionQueue()
    return null
  }

  // 点播等入口直接处理单个目标
  async processTarget(session: Session, target: ResolvedVideoTarget): Promise<boolean> {
    if (this.disposed) return false
    return this.processOneTarget(session, target, 'link')
  }

  private async processSessionQueue() {
    if (this.disposed || this.isProcessingSession || this.sessionQueue.length === 0) return
    this.isProcessingSession = true

    while (this.sessionQueue.length > 0) {
      if (this.disposed) return
      const task = this.sessionQueue.shift()
      if (!task) continue
      if (this.rateLimiter.isUserBlocked(task.session.channelId, task.session.userId)) {
        this.logger.debug('用户已触发频率限制，跳过剩余解析')
        continue
      }
      try {
        await this.processSessionTask(task)
      } catch (error) {
        this.logger.error('处理解析任务失败', error)
      }
    }

    this.isProcessingSession = false
    this.logger.debug('解析队列处理完成')
    if (this.sessionQueue.length > 0) {
      this.processSessionQueue()
    }
  }

  private async processSessionTask(task: SessionTask) {
    if (this.disposed) return
    const isMultiLinkMessage = task.targets.length > 1

    for (let index = 0; index < task.targets.length; index += 1) {
      if (this.disposed) return
      if (!this.rateLimiter.canProcessUserVideo(task.session.channelId, task.session.userId, isMultiLinkMessage)) {
        this.clearSessionQueueByUser(task.session.channelId, task.session.userId)
        break
      }
      if (!this.rateLimiter.canStartChannelVideo(task.session.channelId)) {
        this.clearSessionQueueByChannel(task.session.channelId)
        break
      }

      const target = task.targets[index]
      this.logger.debug(`处理第 ${index + 1}/${task.targets.length} 个链接`)
      this.rateLimiter.startChannelVideo(task.session.channelId)
      try {
        if (target.kind === 'video') {
          await this.processOneTarget(task.session, target, task.source)
        } else {
          await this.processShortTarget(task.session, target, task.source)
        }
      } finally {
        this.rateLimiter.endChannelVideo(task.session.channelId)
      }

      if (isMultiLinkMessage) {
        this.rateLimiter.recordProcessedVideo(task.session.channelId, task.session.userId)
      }
    }
  }

  private async processShortTarget(
    session: Session,
    target: Extract<BilibiliTarget, { kind: 'short' }>,
    source: VideoParseMode,
  ) {
    const url = await this.api.resolveShortLink(target.host, target.code)
    if (!url) {
      this.logger.debug(`短链解析失败：${target.host}/${target.code}`)
      return false
    }
    const resolved = targetFromResolvedUrl(url)
    if (!resolved) {
      this.logger.debug(`短链目标不是普通视频：${url}`)
      return false
    }
    resolved.page = resolved.page || target.page
    return this.processOneTarget(session, resolved, source)
  }

  private isProcessedRecently(target: ResolvedVideoTarget, channelId: string): boolean {
    const key = this.targetKey(target)
    const currentTime = Date.now()
    const intervalMs = this.config.MinimumTimeInterval * 1000

    for (const [oldKey, time] of this.lastProcessedUrls) {
      if (currentTime - time >= intervalMs) {
        this.lastProcessedUrls.delete(oldKey)
      }
    }

    const channelKey = `${channelId}:${key}`
    const lastTime = this.lastProcessedUrls.get(channelKey)
    if (lastTime !== undefined && currentTime - lastTime < intervalMs) {
      this.logger.debug(`相同视频跳过：${key}，频道：${channelId}`)
      return true
    }
    this.lastProcessedUrls.set(channelKey, currentTime)
    return false
  }

  private targetKey(target: ResolvedVideoTarget): string {
    const id = target.bvid ?? `av${target.aid}`
    return `${id}:${target.page}`
  }

  private async processOneTarget(
    session: Session,
    target: ResolvedVideoTarget,
    source: VideoParseMode,
  ): Promise<boolean> {
    if (this.disposed || this.isProcessedRecently(target, session.channelId)) return false

    let view = null
    const waitTipId = await this.sendWaitTip(session)
    try {
      view = target.bvid
        ? await this.api.fetchVideoView({ bvid: target.bvid })
        : await this.api.fetchVideoView({ aid: target.aid })
    } catch (error) {
      this.logger.warn('请求视频解析 API 失败', error)
    } finally {
      if (waitTipId) {
        await session.bot.deleteMessage(session.channelId, waitTipId).catch(() => undefined)
      }
    }

    if (this.disposed || !view) {
      if (this.config.showError && !view) {
        await session.send(h.text('无法解析该链接，可能视频不存在或暂不可见'))
      }
      return false
    }

    this.logger.debug(`解析结果：${view.title} ${view.bvid} p=${target.page}`)

    const messages = buildVideoMessages(this.config, view, target.page, source)
    if (messages.length === 0) return false
    if (this.disposed) return false
    if (this.config.loggerinfofulljson) {
      this.logger.debug(messages.map((message) => message.map((element) => element.toString()).join('')).join('\n'))
    }
    for (const message of messages) {
      if (this.disposed) return false
      await session.send(message)
    }
    this.logger.debug(`发送完成：${view.bvid}`)
    return true
  }

  private async sendWaitTip(session: Session): Promise<string | null> {
    if (this.disposed || !this.config.waitTip_Switch) return null
    try {
      const result = await session.send(this.config.waitTip_Switch)
      return result[0] ?? null
    } catch {
      return null
    }
  }

  private clearSessionQueueByChannel(channelId: string) {
    this.sessionQueue = this.sessionQueue.filter((task) => task.session.channelId !== channelId)
  }

  private clearSessionQueueByUser(channelId: string, userId: string) {
    this.sessionQueue = this.sessionQueue.filter(
      (task) => task.session.channelId !== channelId || task.session.userId !== userId,
    )
  }
}
