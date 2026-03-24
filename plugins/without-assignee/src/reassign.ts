import { Context, Session } from 'koishi'

import type { DebugLogger } from './logger'

export function registerAssigneeBypass(ctx: Context, logDebug: DebugLogger) {
  ctx.on('attach-channel', (session: Session<never, 'assignee'>) => {
    const { channel } = session
    if (!channel || channel.assignee === session.selfId) return

    const originalAssignee = channel.assignee

    // 只改当前会话里的内存数据，不写入数据库。
    channel.$merge({ assignee: session.selfId })

    logDebug(
      '频道 %s 仅在当前会话内忽略 assignee：%s -> %s（不会写入数据库）',
      session.cid,
      originalAssignee || '(空)',
      session.selfId,
    )
  }, true)
}
