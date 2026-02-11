import { Context, Bot, Universal, Fragment, h } from 'koishi'
import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { fetchWithProxy } from './http'
import { Config } from './config'
import { logger } from './index'
import { encodeMessage } from './message'
import { decodeMarkdown } from './markdown'
import * as crypto from 'crypto'

// GitHub 机器人实现类
export class GitHubBot extends Bot<Context, Config> {
  octokit: Octokit
  graphql: typeof graphql
  private _timer: () => void
  private _lastEventIds: Map<string, string> = new Map()

  constructor(ctx: Context, config: Config) {
    super(ctx, config, 'github')

    const commonOptions = {
      auth: config.token,
      request: {
        fetch: (url, init) => {
          const proxy = this.config.useProxy ? this.config.proxyUrl : undefined;
          return fetchWithProxy(url, init, proxy);
        }
      }
    }

    // 初始化 REST API 客户端
    this.octokit = new Octokit(commonOptions)

    // 初始化 GraphQL API 客户端
    this.graphql = graphql.defaults({
      headers: {
        authorization: `token ${config.token}`,
      },
      request: commonOptions.request,
    })
  }

  // 调试日志函数
  logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      (logger.info as (...args: any[]) => void)(...args);
    }
  }
  logError(...args: any[]) {
    (logger.error as (...args: any[]) => void)(...args);
  }
  // 启动机器人
  async start() {
    try {
      // 获取当前认证用户信息
      const { data: user } = await this.octokit.users.getAuthenticated()
      this.selfId = user.login
      this.user = {
        id: user.login,
        name: user.login,
        avatar: user.avatar_url,
      }

      // 初始化每个仓库的最新事件 ID
      for (const repo of this.config.repositories) {
        const repoKey = `${repo.owner}/${repo.repo}`
        try {
          const { data: events } = await this.octokit.activity.listRepoEvents({
            owner: repo.owner,
            repo: repo.repo,
            per_page: 1,
          })
          if (events.length > 0) {
            this._lastEventIds.set(repoKey, events[0].id)
          }
        } catch (e) {
          this.logError(`初始化仓库 ${repoKey} 失败:`, e)
        }
      }

      this.status = Universal.Status.ONLINE
      const repoList = this.config.repositories.map(r => `${r.owner}/${r.repo}`).join(', ')
      logger.info(`GitHub 机器人已上线：${this.selfId} (监听仓库：${repoList})`)
      logger.info(`通信模式：${this.config.mode === 'webhook' ? 'Webhook' : 'Pull'}`)

      // 仅在 Pull 模式下启动定时器
      if (this.config.mode === 'pull' && this.ctx.scope.isActive) {
        this._timer = this.ctx.setInterval(() => this.poll(), this.config.interval * 1000)
      } else if (this.config.mode === 'pull') {
        logger.warn('上下文未激活，跳过定时器创建')
      }
    } catch (e) {
      logger.error('GitHub 机器人启动失败:', e)
      this.status = Universal.Status.OFFLINE
      throw e
    }
  }

  // 停止机器人
  async stop() {
    // 调用 ctx.setInterval 返回的函数来清理定时器
    if (this._timer) this._timer()
    this.status = Universal.Status.OFFLINE
    logger.info(`GitHub 机器人已下线：${this.selfId}`)
  }

  // 轮询 GitHub 事件
  async poll() {
    for (const repo of this.config.repositories) {
      const repoKey = `${repo.owner}/${repo.repo}`
      try {
        const { data: events } = await this.octokit.activity.listRepoEvents({
          owner: repo.owner,
          repo: repo.repo,
          per_page: 20,
        })

        const lastEventId = this._lastEventIds.get(repoKey)
        const newEvents = []
        for (const event of events) {
          if (event.id === lastEventId) break
          newEvents.push(event)
        }

        if (newEvents.length > 0) {
          this._lastEventIds.set(repoKey, events[0].id)
          // 逆序处理，确保消息按时间顺序派发
          for (const event of newEvents.reverse()) {
            await this.handleEvent(event, repo.owner, repo.repo)
          }
        }
      } catch (e) {
        this.logError(`轮询仓库 ${repoKey} 事件时出错:`, e)
      }
    }
  }

  // 处理 GitHub 事件并转换为 Koishi 会话
  async handleEvent(event: any, owner: string, repo: string) {
    // 忽略机器人自己产生的事件
    if (event.actor.login === this.selfId) {
      this.logInfo(`忽略机器人自己的事件: ${event.type}`)
      return
    }

    this.logInfo(`事件详情: ${JSON.stringify(event, null, 2)}`)

    const session = this.session({
      type: 'message',
      timestamp: new Date(event.created_at).getTime(),
      user: {
        id: event.actor.login,
        name: event.actor.login,
        avatar: event.actor.avatar_url,
      }
    })

    let content = ''
    let channelId = ''
    const repoPrefix = `${owner}/${repo}`

    // 根据事件类型解析频道 ID 和内容
    switch (event.type) {
      case 'IssueCommentEvent':
        channelId = `${repoPrefix}:issues:${event.payload.issue.number}`
        content = event.payload.comment.body
        break
      case 'IssuesEvent':
        if (['opened', 'closed', 'reopened'].includes(event.payload.action)) {
          channelId = `${repoPrefix}:issues:${event.payload.issue.number}`
          content = `[Issue ${event.payload.action}] ${event.payload.issue.title}`
          if (event.payload.action === 'opened') {
            content += `
${event.payload.issue.body || ''}`
          }
        }
        break
      case 'PullRequestEvent':
        if (['opened', 'closed', 'reopened'].includes(event.payload.action)) {
          channelId = `${repoPrefix}:pull:${event.payload.pull_request.number}`
          content = `[PR ${event.payload.action}] ${event.payload.pull_request.title}`
          if (event.payload.action === 'opened') {
            content += `
${event.payload.pull_request.body || ''}`
          }
        }
        break
      case 'PullRequestReviewCommentEvent':
        channelId = `${repoPrefix}:pull:${event.payload.pull_request.number}`
        content = event.payload.comment.body
        break
      case 'DiscussionEvent':
        channelId = `${repoPrefix}:discussions:${event.payload.discussion.number}`
        content = `[Discussion ${event.payload.action}] ${event.payload.discussion.title}`
        break
      case 'DiscussionCommentEvent':
        channelId = `${repoPrefix}:discussions:${event.payload.discussion.number}`
        content = event.payload.comment.body
        break
    }

    // 如果成功解析出频道和内容，则派发会话
    if (channelId && content) {
      session.channelId = channelId
      session.guildId = channelId
      // 将 Markdown 内容转换为 Satori 元素，然后转为字符串用于 content
      const elements = decodeMarkdown(content)
      session.content = h.normalize(elements).join('')
      // 保存原始元素供后续使用
      session.elements = h.normalize(elements)
      session.messageId = event.id

      // 设置 guild 和 channel 信息
      if (event.type === 'IssueCommentEvent' || event.type === 'IssuesEvent') {
        session.event.guild = {
          id: channelId,
          name: event.payload.issue.title,
        }
        session.event.channel = {
          id: channelId,
          name: event.payload.issue.title,
          type: Universal.Channel.Type.TEXT,
        }
      } else if (event.type === 'PullRequestEvent' || event.type === 'PullRequestReviewCommentEvent') {
        session.event.guild = {
          id: channelId,
          name: event.payload.pull_request.title,
        }
        session.event.channel = {
          id: channelId,
          name: event.payload.pull_request.title,
          type: Universal.Channel.Type.TEXT,
        }
      } else if (event.type === 'DiscussionEvent' || event.type === 'DiscussionCommentEvent') {
        session.event.guild = {
          id: channelId,
          name: event.payload.discussion.title,
        }
        session.event.channel = {
          id: channelId,
          name: event.payload.discussion.title,
          type: Universal.Channel.Type.TEXT,
        }
      }

      this.dispatch(session)
    }
  }

  // 发送消息实现
  async sendMessage(channelId: string, content: Fragment, guildId?: string) {
    // 解析 channelId: owner/repo:type:number
    const parts = channelId.split(':')
    if (parts.length !== 3) return []

    const [repoPrefix, type, numberStr] = parts
    const [owner, repo] = repoPrefix.split('/')
    const number = parseInt(numberStr)
    if (isNaN(number) || !owner || !repo) return []

    // 使用消息编码器将 Fragment 转换为纯文本
    const body = await encodeMessage(this, content)

    try {
      if (type === 'issues' || type === 'pull') {
        const { data } = await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: number,
          body,
        })
        return [data.id.toString()]
      } else if (type === 'discussions') {
        // 1. 通过 GraphQL 查询获取 Discussion 的 node_id
        const { repository } = await this.graphql<{
          repository: { discussion: { id: string } }
        }>(`
          query($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
              discussion(number: $number) {
                id
              }
            }
          }
        `, {
          owner,
          repo,
          number,
        });

        const discussionId = repository.discussion.id;
        if (!discussionId) {
          throw new Error(`Discussion #${number} not found.`);
        }

        // 2. 使用 node_id 发表评论
        const { addDiscussionComment } = await this.graphql<{
          addDiscussionComment: { comment: { id: string } }
        }>(`
          mutation($discussionId: ID!, $body: String!) {
            addDiscussionComment(input: {discussionId: $discussionId, body: $body}) {
              comment {
                id
              }
            }
          }
        `, {
          discussionId,
          body,
        });

        return [addDiscussionComment.comment.id];
      }
    } catch (e) {
      logger.error(`向频道 ${channelId} 发送消息失败:`, e)
    }
    return []
  }

  // 获取群组信息（对应 Issue/PR/Discussion）
  async getGuild(guildId: string): Promise<Universal.Guild> {
    // 解析 guildId: owner/repo:type:number
    const parts = guildId.split(':')
    if (parts.length !== 3) {
      return { id: guildId, name: guildId }
    }

    const [repoPrefix, type, numberStr] = parts
    const [owner, repo] = repoPrefix.split('/')
    const number = parseInt(numberStr)
    if (isNaN(number) || !owner || !repo) {
      return { id: guildId, name: guildId }
    }

    try {
      if (type === 'issues' || type === 'pull') {
        const { data } = await this.octokit.issues.get({
          owner,
          repo,
          issue_number: number,
        })
        return {
          id: guildId,
          name: `[${repoPrefix}] ${data.title}`,
        }
      } else if (type === 'discussions') {
        const { repository } = await this.graphql<{
          repository: { discussion: { title: string } }
        }>(`
          query($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
              discussion(number: $number) {
                title
              }
            }
          }
        `, {
          owner,
          repo,
          number,
        })
        return {
          id: guildId,
          name: `[${repoPrefix}] ${repository.discussion.title}`,
        }
      }
    } catch (e) {
      this.logError(`获取群组信息失败: ${guildId}`, e)
    }

    return {
      id: guildId,
      name: `${repoPrefix} ${type} #${number}`,
    }
  }

  // 获取频道信息（与群组相同）
  async getChannel(channelId: string, guildId?: string): Promise<Universal.Channel> {
    const guild = await this.getGuild(channelId)
    return {
      id: channelId,
      name: guild.name,
      type: Universal.Channel.Type.TEXT,
    }
  }

  // 验证 webhook 签名
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) return true // 如果没有配置密钥，跳过验证

    const hmac = crypto.createHmac('sha256', this.config.webhookSecret)
    const digest = 'sha256=' + hmac.update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
  }

  // 处理 webhook 事件
  async handleWebhookEvent(event: any, owner: string, repo: string) {
    this.logInfo(`收到 Webhook 事件: ${event.action || event.type}`)

    // 构造类似 GitHub Events API 的事件对象
    let eventType = ''
    let payload: any = {}
    let actor: any = event.sender

    if (event.issue && event.comment) {
      eventType = 'IssueCommentEvent'
      payload = { issue: event.issue, comment: event.comment, action: event.action }
    } else if (event.issue) {
      eventType = 'IssuesEvent'
      payload = { issue: event.issue, action: event.action }
    } else if (event.pull_request && event.comment) {
      eventType = 'PullRequestReviewCommentEvent'
      payload = { pull_request: event.pull_request, comment: event.comment }
    } else if (event.pull_request) {
      eventType = 'PullRequestEvent'
      payload = { pull_request: event.pull_request, action: event.action }
    } else if (event.discussion && event.comment) {
      eventType = 'DiscussionCommentEvent'
      payload = { discussion: event.discussion, comment: event.comment }
    } else if (event.discussion) {
      eventType = 'DiscussionEvent'
      payload = { discussion: event.discussion, action: event.action }
    } else {
      this.logInfo(`未处理的 webhook 事件类型`)
      return
    }

    const normalizedEvent = {
      id: `webhook-${Date.now()}`,
      type: eventType,
      actor: actor,
      payload: payload,
      created_at: new Date().toISOString(),
    }

    await this.handleEvent(normalizedEvent, owner, repo)
  }
}
