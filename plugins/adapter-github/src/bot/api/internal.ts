import { GitHubBotComplete } from '../webhook'

/**
 * GitHub 平台特有的 API
 * 通过 bot.internal 调用
 */
export class GitHubInternal {
  constructor(private bot: GitHubBotComplete) {}

  /**
   * 创建 Issue
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param title Issue 标题
   * @param body Issue 内容
   * @param labels 标签列表
   * @param assignees 分配给的用户列表
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[],
    assignees?: string[]
  ) {
    try {
      const { data } = await this.bot.octokit.issues.create({
        owner,
        repo,
        title,
        body: body || '',
        labels: labels || [],
        assignees: assignees || [],
      })
      return data
    } catch (e) {
      this.bot.logError(`创建 Issue 失败:`, e)
      throw e
    }
  }

  /**
   * 关闭 Issue
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param issueNumber Issue 编号
   */
  async closeIssue(owner: string, repo: string, issueNumber: number) {
    try {
      const { data } = await this.bot.octokit.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
      })
      return data
    } catch (e) {
      this.bot.logError(`关闭 Issue 失败:`, e)
      throw e
    }
  }

  /**
   * 重新打开 Issue
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param issueNumber Issue 编号
   */
  async reopenIssue(owner: string, repo: string, issueNumber: number) {
    try {
      const { data } = await this.bot.octokit.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'open',
      })
      return data
    } catch (e) {
      this.bot.logError(`重新打开 Issue 失败:`, e)
      throw e
    }
  }

  /**
   * 为 Issue 添加标签
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param issueNumber Issue 编号
   * @param labels 标签列表
   */
  async addIssueLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ) {
    try {
      const { data } = await this.bot.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      })
      return data
    } catch (e) {
      this.bot.logError(`添加标签失败:`, e)
      throw e
    }
  }

  /**
   * 移除 Issue 的标签
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param issueNumber Issue 编号
   * @param label 标签名称
   */
  async removeIssueLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    label: string
  ) {
    try {
      await this.bot.octokit.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label,
      })
    } catch (e) {
      this.bot.logError(`移除标签失败:`, e)
      throw e
    }
  }

  /**
   * 为 Issue 分配用户
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param issueNumber Issue 编号
   * @param assignees 用户列表
   */
  async addIssueAssignees(
    owner: string,
    repo: string,
    issueNumber: number,
    assignees: string[]
  ) {
    try {
      const { data } = await this.bot.octokit.issues.addAssignees({
        owner,
        repo,
        issue_number: issueNumber,
        assignees,
      })
      return data
    } catch (e) {
      this.bot.logError(`分配用户失败:`, e)
      throw e
    }
  }

  /**
   * 移除 Issue 的分配用户
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param issueNumber Issue 编号
   * @param assignees 用户列表
   */
  async removeIssueAssignees(
    owner: string,
    repo: string,
    issueNumber: number,
    assignees: string[]
  ) {
    try {
      const { data } = await this.bot.octokit.issues.removeAssignees({
        owner,
        repo,
        issue_number: issueNumber,
        assignees,
      })
      return data
    } catch (e) {
      this.bot.logError(`移除分配用户失败:`, e)
      throw e
    }
  }

  /**
   * 创建 Pull Request
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param title PR 标题
   * @param head 源分支（格式：用户名:分支名 或 分支名）
   * @param base 目标分支
   * @param body PR 内容
   */
  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string
  ) {
    try {
      const { data } = await this.bot.octokit.pulls.create({
        owner,
        repo,
        title,
        head,
        base,
        body: body || '',
      })
      return data
    } catch (e) {
      this.bot.logError(`创建 Pull Request 失败:`, e)
      throw e
    }
  }

  /**
   * 关闭 Pull Request
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param pullNumber PR 编号
   */
  async closePullRequest(owner: string, repo: string, pullNumber: number) {
    try {
      const { data } = await this.bot.octokit.pulls.update({
        owner,
        repo,
        pull_number: pullNumber,
        state: 'closed',
      })
      return data
    } catch (e) {
      this.bot.logError(`关闭 Pull Request 失败:`, e)
      throw e
    }
  }

  /**
   * 合并 Pull Request
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param pullNumber PR 编号
   * @param commitTitle 合并提交标题
   * @param commitMessage 合并提交消息
   * @param mergeMethod 合并方式（merge/squash/rebase）
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    commitTitle?: string,
    commitMessage?: string,
    mergeMethod?: 'merge' | 'squash' | 'rebase'
  ) {
    try {
      const { data } = await this.bot.octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        commit_title: commitTitle,
        commit_message: commitMessage,
        merge_method: mergeMethod || 'merge',
      })
      return data
    } catch (e) {
      this.bot.logError(`合并 Pull Request 失败:`, e)
      throw e
    }
  }

  /**
   * 为 Pull Request 添加标签
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param pullNumber PR 编号
   * @param labels 标签列表
   */
  async addPullRequestLabels(
    owner: string,
    repo: string,
    pullNumber: number,
    labels: string[]
  ) {
    try {
      const { data } = await this.bot.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: pullNumber,
        labels,
      })
      return data
    } catch (e) {
      this.bot.logError(`添加 PR 标签失败:`, e)
      throw e
    }
  }

  /**
   * 为 Pull Request 分配审查者
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param pullNumber PR 编号
   * @param reviewers 审查者用户名列表
   * @param teamReviewers 审查团队名称列表
   */
  async requestPullRequestReviewers(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewers?: string[],
    teamReviewers?: string[]
  ) {
    try {
      const { data } = await this.bot.octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: pullNumber,
        reviewers: reviewers || [],
        team_reviewers: teamReviewers || [],
      })
      return data
    } catch (e) {
      this.bot.logError(`请求 PR 审查失败:`, e)
      throw e
    }
  }

  /**
   * 为 Pull Request 分配用户
   * @param owner 仓库所有者
   * @param repo 仓库名称
   * @param pullNumber PR 编号
   * @param assignees 用户列表
   */
  async addPullRequestAssignees(
    owner: string,
    repo: string,
    pullNumber: number,
    assignees: string[]
  ) {
    try {
      const { data } = await this.bot.octokit.issues.addAssignees({
        owner,
        repo,
        issue_number: pullNumber,
        assignees,
      })
      return data
    } catch (e) {
      this.bot.logError(`分配 PR 用户失败:`, e)
      throw e
    }
  }
}
