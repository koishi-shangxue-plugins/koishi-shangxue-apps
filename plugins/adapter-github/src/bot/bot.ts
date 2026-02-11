import { Context, Bot, Universal, Fragment, h } from 'koishi'
import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { fetchWithProxy } from './http'
import { Config } from '../config'
import { logger } from '../index'
import { encodeMessage } from '../message/message'
import { decodeMarkdown } from '../message/markdown'
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

  // ========== Satori 通用 API 实现 ==========

  // 解析 channelId 的辅助方法
  private parseChannelId(channelId: string): { owner: string; repo: string; type: string; number: number } | null {
    const parts = channelId.split(':')
    if (parts.length !== 3) return null

    const [repoPrefix, type, numberStr] = parts
    const [owner, repo] = repoPrefix.split('/')
    const number = parseInt(numberStr)

    if (isNaN(number) || !owner || !repo) return null
    return { owner, repo, type, number }
  }

  // 获取登录信息
  async getLogin(): Promise<Universal.Login> {
    return {
      user: this.user,
      selfId: this.selfId,
      platform: 'github',
      status: this.status,
    } as Universal.Login
  }

  // 获取用户信息
  async getUser(userId: string): Promise<Universal.User> {
    try {
      const { data: user } = await this.octokit.users.getByUsername({ username: userId })
      return {
        id: user.login,
        name: user.name || user.login,
        avatar: user.avatar_url,
      }
    } catch (e) {
      this.logError(`获取用户信息失败: ${userId}`, e)
      throw e
    }
  }

  // 获取消息
  async getMessage(channelId: string, messageId: string): Promise<Universal.Message> {
    const parsed = this.parseChannelId(channelId)
    if (!parsed) throw new Error('Invalid channel ID')

    const { owner, repo, type, number } = parsed

    try {
      if (type === 'issues' || type === 'pull') {
        // 获取评论
        const commentId = parseInt(messageId)
        const { data: comment } = await this.octokit.issues.getComment({
          owner,
          repo,
          comment_id: commentId,
        })

        return {
          id: comment.id.toString(),
          content: comment.body || '',
          user: {
            id: comment.user?.login || '',
            name: comment.user?.login || '',
            avatar: comment.user?.avatar_url,
          },
          timestamp: new Date(comment.created_at).getTime(),
        }
      }
    } catch (e) {
      this.logError(`获取消息失败: ${messageId}`, e)
      throw e
    }

    throw new Error('Unsupported channel type')
  }

  // 删除消息
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const parsed = this.parseChannelId(channelId)
    if (!parsed) throw new Error('Invalid channel ID')

    const { owner, repo, type } = parsed

    try {
      if (type === 'issues' || type === 'pull') {
        const commentId = parseInt(messageId)
        await this.octokit.issues.deleteComment({
          owner,
          repo,
          comment_id: commentId,
        })
      }
    } catch (e) {
      this.logError(`删除消息失败: ${messageId}`, e)
      throw e
    }
  }

  // 编辑消息
  async editMessage(channelId: string, messageId: string, content: Fragment): Promise<void> {
    const parsed = this.parseChannelId(channelId)
    if (!parsed) throw new Error('Invalid channel ID')

    const { owner, repo, type } = parsed
    const body = await encodeMessage(this, content)

    try {
      if (type === 'issues' || type === 'pull') {
        const commentId = parseInt(messageId)
        await this.octokit.issues.updateComment({
          owner,
          repo,
          comment_id: commentId,
          body,
        })
      }
    } catch (e) {
      this.logError(`编辑消息失败: ${messageId}`, e)
      throw e
    }
  }

  // 创建反应（GitHub Reaction）
  async createReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    const parsed = this.parseChannelId(channelId)
    if (!parsed) throw new Error('Invalid channel ID')

    const { owner, repo, type, number } = parsed

    // GitHub 支持的反应类型映射
    const reactionMap: Record<string, string> = {
      '👍': '+1',
      '👎': '-1',
      '😄': 'laugh',
      '🎉': 'hooray',
      '😕': 'confused',
      '❤️': 'heart',
      '🚀': 'rocket',
      '👀': 'eyes',
    }

    const content = reactionMap[emoji] || emoji

    try {
      if (type === 'issues' || type === 'pull') {
        if (messageId === 'issue' || messageId === 'pull') {
          // 对 Issue/PR 本身添加反应
          await this.octokit.reactions.createForIssue({
            owner,
            repo,
            issue_number: number,
            content: content as any,
          })
        } else {
          // 对评论添加反应
          const commentId = parseInt(messageId)
          await this.octokit.reactions.createForIssueComment({
            owner,
            repo,
            comment_id: commentId,
            content: content as any,
          })
        }
      }
    } catch (e) {
      this.logError(`创建反应失败: ${emoji}`, e)
      throw e
    }
  }

  // 删除反应
  async deleteReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    // GitHub API 不直接支持删除特定反应，需要先获取反应 ID
    this.logInfo('GitHub 删除反应需要反应 ID，暂不支持')
  }

  // 获取反应列表
  async getReactionList(channelId: string, messageId: string, emoji: string): Promise<Universal.List<Universal.User>> {
    const parsed = this.parseChannelId(channelId)
    if (!parsed) throw new Error('Invalid channel ID')

    const { owner, repo, type, number } = parsed

    try {
      if (type === 'issues' || type === 'pull') {
        let reactions: any[]

        if (messageId === 'issue' || messageId === 'pull') {
          // 获取 Issue/PR 的反应
          const { data } = await this.octokit.reactions.listForIssue({
            owner,
            repo,
            issue_number: number,
          })
          reactions = data
        } else {
          // 获取评论的反应
          const commentId = parseInt(messageId)
          const { data } = await this.octokit.reactions.listForIssueComment({
            owner,
            repo,
            comment_id: commentId,
          })
          reactions = data
        }

        // 过滤指定 emoji 的用户
        const filtered = emoji ? reactions.filter(r => r.content === emoji) : reactions

        return {
          data: filtered.map(r => ({
            id: r.user.login,
            name: r.user.login,
            avatar: r.user.avatar_url,
          })),
        }
      }
    } catch (e) {
      this.logError(`获取反应列表失败`, e)
      throw e
    }

    return { data: [] }
  }

  // 获取群组成员列表（Issue/PR 的参与者）
  async getGuildMemberList(guildId: string): Promise<Universal.List<Universal.GuildMember>> {
    const parsed = this.parseChannelId(guildId)
    if (!parsed) throw new Error('Invalid guild ID')

    const { owner, repo, type, number } = parsed

    try {
      if (type === 'issues' || type === 'pull') {
        // 获取 Issue/PR 的参与者
        const { data: comments } = await this.octokit.issues.listComments({
          owner,
          repo,
          issue_number: number,
        })

        // 去重用户
        const users = new Map<string, any>()
        for (const comment of comments) {
          if (comment.user) {
            users.set(comment.user.login, comment.user)
          }
        }

        return {
          data: Array.from(users.values()).map(user => ({
            user: {
              id: user.login,
              name: user.login,
              avatar: user.avatar_url,
            },
            name: user.login,
            avatar: user.avatar_url,
          })),
        }
      }
    } catch (e) {
      this.logError(`获取群组成员列表失败`, e)
      throw e
    }

    return { data: [] }
  }

  // 获取群组成员
  async getGuildMember(guildId: string, userId: string): Promise<Universal.GuildMember> {
    try {
      const user = await this.getUser(userId)
      return {
        user,
        name: user.name,
        avatar: user.avatar,
      }
    } catch (e) {
      this.logError(`获取群组成员失败: ${userId}`, e)
      throw e
    }
  }

  // 获取群组列表（监听的仓库）
  async getGuildList(): Promise<Universal.List<Universal.Guild>> {
    const guilds: Universal.Guild[] = []

    for (const repo of this.config.repositories) {
      try {
        const { data: repoData } = await this.octokit.repos.get({
          owner: repo.owner,
          repo: repo.repo,
        })

        guilds.push({
          id: `${repo.owner}/${repo.repo}`,
          name: repoData.full_name,
        })
      } catch (e) {
        this.logError(`获取仓库信息失败: ${repo.owner}/${repo.repo}`, e)
      }
    }

    return { data: guilds }
  }

  // 获取频道列表（仓库的 Issues/PRs）
  async getChannelList(guildId: string): Promise<Universal.List<Universal.Channel>> {
    const [owner, repo] = guildId.split('/')
    if (!owner || !repo) throw new Error('Invalid guild ID')

    const channels: Universal.Channel[] = []

    try {
      // 获取 Issues
      const { data: issues } = await this.octokit.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        per_page: 50,
      })

      for (const issue of issues) {
        if (!issue.pull_request) {
          channels.push({
            id: `${owner}/${repo}:issues:${issue.number}`,
            name: issue.title,
            type: Universal.Channel.Type.TEXT,
          })
        }
      }

      // 获取 Pull Requests
      const { data: pulls } = await this.octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 50,
      })

      for (const pull of pulls) {
        channels.push({
          id: `${owner}/${repo}:pull:${pull.number}`,
          name: pull.title,
          type: Universal.Channel.Type.TEXT,
        })
      }
    } catch (e) {
      this.logError(`获取频道列表失败: ${guildId}`, e)
      throw e
    }

    return { data: channels }
  }

  // 创建频道（创建 Issue）
  async createChannel(guildId: string, data: Partial<Universal.Channel>): Promise<Universal.Channel> {
    const [owner, repo] = guildId.split('/')
    if (!owner || !repo) throw new Error('Invalid guild ID')

    try {
      const { data: issue } = await this.octokit.issues.create({
        owner,
        repo,
        title: data.name || 'New Issue',
        body: '',
      })

      return {
        id: `${owner}/${repo}:issues:${issue.number}`,
        name: issue.title,
        type: Universal.Channel.Type.TEXT,
      }
    } catch (e) {
      this.logError(`创建频道失败`, e)
      throw e
    }
  }

  // 更新频道（更新 Issue/PR 标题）
  async updateChannel(channelId: string, data: Partial<Universal.Channel>): Promise<void> {
    const parsed = this.parseChannelId(channelId)
    if (!parsed) throw new Error('Invalid channel ID')

    const { owner, repo, number } = parsed

    try {
      await this.octokit.issues.update({
        owner,
        repo,
        issue_number: number,
        title: data.name,
      })
    } catch (e) {
      this.logError(`更新频道失败`, e)
      throw e
    }
  }

  // 删除频道（关闭 Issue/PR）
  async deleteChannel(channelId: string): Promise<void> {
    const parsed = this.parseChannelId(channelId)
    if (!parsed) throw new Error('Invalid channel ID')

    const { owner, repo, number } = parsed

    try {
      await this.octokit.issues.update({
        owner,
        repo,
        issue_number: number,
        state: 'closed',
      })
    } catch (e) {
      this.logError(`删除频道失败`, e)
      throw e
    }
  }
}
