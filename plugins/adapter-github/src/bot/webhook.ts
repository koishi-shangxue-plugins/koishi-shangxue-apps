import * as crypto from 'node:crypto'
import { GitHubBotWithReaction } from './reaction'

// 扩展 GitHubBot 类，添加 webhook 签名验证方法
export class GitHubBotComplete extends GitHubBotWithReaction {
  // 验证 webhook 签名
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) return true // 如果没有配置密钥，跳过验证

    const hmac = crypto.createHmac('sha256', this.config.webhookSecret)
    const digest = 'sha256=' + hmac.update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
  }
}
