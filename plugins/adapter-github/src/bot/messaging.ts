import { Fragment } from 'koishi'
import { GitHubBotWithEventHandling } from './event'
import { encodeMessage } from '../message/message'
import { logger } from '../index'

// 扩展 GitHubBot 类，添加消息发送方法
export class GitHubBotWithMessaging extends GitHubBotWithEventHandling {
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

  // 获取消息
  async getMessage(channelId: string, messageId: string) {
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
}
