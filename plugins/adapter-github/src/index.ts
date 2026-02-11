import { Context, Schema, Bot, Universal, Fragment, Logger, h } from 'koishi'
import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { fetchWithProxy } from './http'

export const name = 'adapter-github'

// 定义配置项接口
export interface Config {
  token: string
  owner: string
  repo: string
  interval?: number
  useProxy?: boolean
  proxyUrl?: string
  loggerinfo?: boolean
}

// 定义配置项 Schema
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    token: Schema.string().required().description('GitHub Personal Access Token (PAT)'),
    owner: Schema.string().required().description('仓库所有者 (Owner)'),
    repo: Schema.string().required().description('仓库名称 (Repo)'),
    interval: Schema.number().default(60000).description('轮询间隔 (单位：毫秒，默认 1 分钟)'),
  }).description('基础设置'),

  Schema.union([
    Schema.object({
      useProxy: Schema.const(true).required(),
      proxyUrl: Schema.string().description('请输入代理地址。').default("socks://localhost:7897"),
    }),
    Schema.object({
      useProxy: Schema.const(false).default(false),
    }),
  ]).description('代理配置'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
  }).description("调试设置"),
])


// 统一日志输出
export const logger = new Logger('github')

// GitHub 机器人实现类
export class GitHubBot extends Bot<Context, Config> {
  octokit: Octokit
  graphql: typeof graphql
  private _timer: any
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

      // 开启定时轮询
      this._timer = setInterval(() => this.poll(), this.config.interval)
    } catch (e) {
      logger.error('GitHub 机器人启动失败:', e)
      this.status = Universal.Status.OFFLINE
      throw e
    }
  }

  // 停止机器人
  async stop() {
    if (this._timer) clearInterval(this._timer)
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
    if (event.actor.login === this.selfId) return

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
}

// 插件入口
export function apply(ctx: Context, config: Config) {
  let bot: GitHubBot | null = null

  ctx.on('ready', async () => {
    bot = new GitHubBot(ctx, config)
    await bot.start()
  })

  ctx.on('dispose', async () => {
    if (bot) {
      await bot.stop()
      bot = null
    }
  })
}
