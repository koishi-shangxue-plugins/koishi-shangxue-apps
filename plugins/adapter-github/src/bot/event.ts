import { h, Universal } from 'koishi'
import { GitHubBot } from './base'
import { decodeMarkdown } from '../message/markdown'

// 扩展 GitHubBot 类，添加事件处理方法
export class GitHubBotWithEventHandling extends GitHubBot {
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

      // 验证并初始化每个仓库的最新事件 ID
      const validRepos: typeof this.config.repositories = []
      for (const repo of this.config.repositories) {
        const repoKey = `${repo.owner}/${repo.repo}`
        try {
          // 先验证仓库是否存在
          await this.octokit.repos.get({
            owner: repo.owner,
            repo: repo.repo,
          })

          // 获取最新事件
          const { data: events } = await this.octokit.activity.listRepoEvents({
            owner: repo.owner,
            repo: repo.repo,
            per_page: 1,
          })
          if (events.length > 0) {
            this._lastEventIds.set(repoKey, events[0].id)
          }

          validRepos.push(repo)
          this.loggerInfo(`仓库 ${repoKey} 验证成功`)
        } catch (e: any) {
          if (e.status === 404) {
            this.loggerWarn(`仓库 ${repoKey} 不存在或无权访问，已自动跳过`)
          } else {
            this.loggerError(`初始化仓库 ${repoKey} 失败:`, e)
          }
        }
      }

      // 检查是否有有效的仓库
      if (validRepos.length === 0) {
        this.loggerError('没有可用的仓库，插件将自动关闭')
        this.ctx.scope.dispose()
        return
      }

      // 更新配置为只包含有效的仓库
      this.config.repositories = validRepos

      this.status = Universal.Status.ONLINE
      const repoList = validRepos.map(r => `${r.owner}/${r.repo}`).join(', ')
      this.loggerInfo(`GitHub 机器人已上线：${this.selfId} (监听仓库：${repoList})`)

      // 构建通信模式信息
      let modeInfo = this.config.mode === 'webhook' ? 'Webhook' : 'Pull'
      if (this.config.mode === 'pull' && this.config.useProxy && this.config.proxyUrl) {
        modeInfo += ` (代理：${this.config.proxyUrl})`
      }
      this.loggerInfo(`通信模式：${modeInfo}`)

      // 仅在 Pull 模式下启动定时器
      if (this.config.mode === 'pull' && this.ctx.scope.isActive) {
        this._timer = this.ctx.setInterval(() => this.poll(), this.config.interval * 1000)
      } else if (this.config.mode === 'pull') {
        this.loggerWarn('上下文未激活，跳过定时器创建')
      }
    } catch (e) {
      this.loggerError('GitHub 机器人启动失败:', e)
      this.status = Universal.Status.OFFLINE
      throw e
    }
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

  // 派发 GitHub 特殊事件
  private dispatchGitHubEvent(event: any, owner: string, repo: string) {
    const repoKey = `${owner}/${repo}`

    // 构建事件数据
    const eventData = {
      owner,
      repo,
      repoKey,
      actor: event.actor,
      payload: event.payload,
      type: event.type,
      action: event.payload?.action,
      timestamp: new Date(event.created_at).getTime(),
    }

    // 根据事件类型派发不同的自定义事件
    switch (event.type) {
      case 'IssuesEvent':
        // 派发 github/issue-{action} 事件
        if (event.payload.action) {
          (this.ctx.emit as any)(`github/issue-${event.payload.action}`, {
            ...eventData,
            issue: event.payload.issue,
          })
        }
        // 派发通用 github/issue 事件
        (this.ctx.emit as any)('github/issue', {
          ...eventData,
          issue: event.payload.issue,
        })
        break

      case 'IssueCommentEvent':
        // 派发 github/issue-comment-{action} 事件
        if (event.payload.action) {
          (this.ctx.emit as any)(`github/issue-comment-${event.payload.action}`, {
            ...eventData,
            issue: event.payload.issue,
            comment: event.payload.comment,
          })
        }
        // 派发通用 github/issue-comment 事件
        (this.ctx.emit as any)('github/issue-comment', {
          ...eventData,
          issue: event.payload.issue,
          comment: event.payload.comment,
        })
        break

      case 'PullRequestEvent':
        // 派发 github/pull-request-{action} 事件
        if (event.payload.action) {
          (this.ctx.emit as any)(`github/pull-request-${event.payload.action}`, {
            ...eventData,
            pullRequest: event.payload.pull_request,
          })
        }
        // 派发通用 github/pull-request 事件
        (this.ctx.emit as any)('github/pull-request', {
          ...eventData,
          pullRequest: event.payload.pull_request,
        })
        break

      case 'PullRequestReviewCommentEvent':
        // 派发 github/pull-request-review-comment 事件
        (this.ctx.emit as any)('github/pull-request-review-comment', {
          ...eventData,
          pullRequest: event.payload.pull_request,
          comment: event.payload.comment,
        })
        break

      case 'DiscussionEvent':
        // 派发 github/discussion-{action} 事件
        if (event.payload.action) {
          (this.ctx.emit as any)(`github/discussion-${event.payload.action}`, {
            ...eventData,
            discussion: event.payload.discussion,
          })
        }
        // 派发通用 github/discussion 事件
        (this.ctx.emit as any)('github/discussion', {
          ...eventData,
          discussion: event.payload.discussion,
        })
        break

      case 'DiscussionCommentEvent':
        // 派发 github/discussion-comment 事件
        (this.ctx.emit as any)('github/discussion-comment', {
          ...eventData,
          discussion: event.payload.discussion,
          comment: event.payload.comment,
        })
        break
    }

    // 派发通用 github/event 事件（包含所有类型）
    (this.ctx.emit as any)('github/event', eventData)
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
            content += `\n${event.payload.issue.body || ''}`
          }
        }
        break
      case 'PullRequestEvent':
        if (['opened', 'closed', 'reopened'].includes(event.payload.action)) {
          channelId = `${repoPrefix}:pull:${event.payload.pull_request.number}`
          content = `[PR ${event.payload.action}] ${event.payload.pull_request.title}`
          if (event.payload.action === 'opened') {
            content += `\n${event.payload.pull_request.body || ''}`
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

      // 派发标准 Koishi 会话
      this.dispatch(session)

      // 派发 GitHub 特殊事件
      this.dispatchGitHubEvent(event, owner, repo)
    }
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
