import { Context, Bot, Universal } from 'koishi'
import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { fetchWithProxy } from './http'
import { Config } from '../config'
import { logger } from '../index'

// GitHub 机器人基础类
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

  // 解析 channelId 的辅助方法
  parseChannelId(channelId: string): { owner: string; repo: string; type: string; number: number } | null {
    const parts = channelId.split(':')
    if (parts.length !== 3) return null

    const [repoPrefix, type, numberStr] = parts
    const [owner, repo] = repoPrefix.split('/')
    const number = parseInt(numberStr)

    if (isNaN(number) || !owner || !repo) return null
    return { owner, repo, type, number }
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
}
