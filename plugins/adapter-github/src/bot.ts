import { Context, Bot, Universal, Fragment, h } from 'koishi'
import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { fetchWithProxy } from './http'
import { Config } from './config'
import { logger } from './index'

// GitHub 机器人实现类
export class GitHubBot extends Bot<Context, Config> {
  octokit: Octokit
  graphql: typeof graphql
  private _timer: () => void
  private _lastEventId: string | null = null

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

      // 初始拉取一次事件，记录最新的 event ID，避免重复处理旧事件
      const { data: events } = await this.octokit.activity.listRepoEvents({
        owner: this.config.owner,
        repo: this.config.repo,
        per_page: 1,
      })
      if (events.length > 0) {
        this._lastEventId = events[0].id
      }

      this.status = Universal.Status.ONLINE
      logger.info(`GitHub 机器人已上线：${this.selfId} (监听仓库：${this.config.owner}/${this.config.repo})`)

      // 开启定时轮询，使用 ctx.setInterval 确保插件停用时自动清理
      this._timer = this.ctx.setInterval(() => this.poll(), this.config.interval * 1000)
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
    try {
      const { data: events } = await this.octokit.activity.listRepoEvents({
        owner: this.config.owner,
        repo: this.config.repo,
        per_page: 20,
      })

      const newEvents = []
      for (const event of events) {
        if (event.id === this._lastEventId) break
        newEvents.push(event)
      }

      if (newEvents.length > 0) {
        this._lastEventId = events[0].id
        this.logInfo(`拉取到 ${newEvents.length} 个新事件。`)
        // 逆序处理，确保消息按时间顺序派发
        for (const event of newEvents.reverse()) {
          this.logInfo(`处理事件: ${event.type} - ${event.actor.login}`)
          await this.handleEvent(event)
        }
      }
    } catch (e) {
      this.logInfo('轮询 GitHub 事件时出错:', e)
    }
  }

  // 处理 GitHub 事件并转换为 Koishi 会话
  async handleEvent(event: any) {
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

    // 根据事件类型解析频道 ID 和内容
    switch (event.type) {
      case 'IssueCommentEvent':
        channelId = `issues:${event.payload.issue.number}`
        content = event.payload.comment.body
        this.logInfo(`解析 IssueCommentEvent: channelId=${channelId}, content=${content}`)
        break
      case 'IssuesEvent':
        if (['opened', 'closed', 'reopened'].includes(event.payload.action)) {
          channelId = `issues:${event.payload.issue.number}`
          content = `[Issue ${event.payload.action}] ${event.payload.issue.title}`
          if (event.payload.action === 'opened') {
            content += `
${event.payload.issue.body || ''}`
          }
        }
        break
      case 'PullRequestEvent':
        if (['opened', 'closed', 'reopened'].includes(event.payload.action)) {
          channelId = `pull:${event.payload.pull_request.number}`
          content = `[PR ${event.payload.action}] ${event.payload.pull_request.title}`
          if (event.payload.action === 'opened') {
            content += `
${event.payload.pull_request.body || ''}`
          }
        }
        break
      case 'PullRequestReviewCommentEvent':
        channelId = `pull:${event.payload.pull_request.number}`
        content = event.payload.comment.body
        break
      case 'DiscussionEvent':
        channelId = `discussions:${event.payload.discussion.number}`
        content = `[Discussion ${event.payload.action}] ${event.payload.discussion.title}`
        break
      case 'DiscussionCommentEvent':
        channelId = `discussions:${event.payload.discussion.number}`
        content = event.payload.comment.body
        break
    }

    // 如果成功解析出频道和内容，则派发会话
    if (channelId && content) {
      session.channelId = channelId
      session.guildId = channelId
      session.content = content
      session.messageId = event.id
      this.logInfo(`派发事件: [${channelId}] ${content.substring(0, 50)}...`)
      this.dispatch(session)
    }
  }

  // 发送消息实现
  async sendMessage(channelId: string, content: Fragment, guildId?: string) {
    const [type, numberStr] = channelId.split(':')
    const number = parseInt(numberStr)
    if (isNaN(number)) return []

    const body = String(content)

    try {
      if (type === 'issues' || type === 'pull') {
        this.logInfo(`向频道 ${channelId} 发送消息: ${body.substring(0, 50)}...`)
        const { data } = await this.octokit.issues.createComment({
          owner: this.config.owner,
          repo: this.config.repo,
          issue_number: number,
          body,
        })
        return [data.id.toString()]
      } else if (type === 'discussions') {
        this.logInfo(`向 Discussions 频道 ${channelId} 发送消息...`);
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
          owner: this.config.owner,
          repo: this.config.repo,
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
    const [type, numberStr] = guildId.split(':')
    const number = parseInt(numberStr)

    try {
      if (type === 'issues' || type === 'pull') {
        const { data } = await this.octokit.issues.get({
          owner: this.config.owner,
          repo: this.config.repo,
          issue_number: number,
        })
        return {
          id: guildId,
          name: data.title,
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
          owner: this.config.owner,
          repo: this.config.repo,
          number,
        })
        return {
          id: guildId,
          name: repository.discussion.title,
        }
      }
    } catch (e) {
      this.logInfo(`获取群组信息失败: ${guildId}`, e)
    }

    return {
      id: guildId,
      name: `${type} #${number}`,
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
}
