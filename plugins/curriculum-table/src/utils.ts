/**
 * utils.ts - 通用工具函数
 */
import { h } from 'koishi'
import type { Session } from 'koishi'

export interface ResolvedTargetUser {
  userId: string
  username: string
  useravatar: string
  specified: boolean
}

/** 从 Satori at 元素或纯数字字符串中提取用户 ID */
export function extractTargetUser(target?: string): { id: string, name?: string } | null {
  if (!target?.trim()) return null

  const trimmed = target.trim()
  for (const element of h.parse(trimmed)) {
    if (element.type !== 'at') continue
    const id = typeof element.attrs?.id === 'string' ? element.attrs.id : ''
    if (!id) continue
    const name = typeof element.attrs?.name === 'string' ? element.attrs.name : undefined
    return { id, name }
  }

  if (/^\d+$/.test(trimmed)) {
    return { id: trimmed }
  }

  return null
}

/** 统一解析目标用户信息；未指定时默认当前用户 */
export async function resolveTargetUser(session: Session, target?: string): Promise<ResolvedTargetUser> {
  if (!target?.trim()) {
    return {
      userId: session.userId,
      username: session.username || session.userId,
      useravatar: session.event.user?.avatar ?? '',
      specified: false,
    }
  }

  const parsed = extractTargetUser(target)
  if (!parsed) {
    throw new Error('INVALID_TARGET_USER')
  }

  let username = parsed.name || parsed.id
  let useravatar = `http://q.qlogo.cn/headimg_dl?dst_uin=${parsed.id}&spec=640`

  try {
    const user = await session.bot.getUser(parsed.id)
    if (user?.name) username = user.name
    if (user?.avatar) useravatar = user.avatar
  } catch {
    // 查询失败时使用 at 中的名称或默认头像回退
  }

  return {
    userId: parsed.id,
    username,
    useravatar,
    specified: true,
  }
}

/** 解析星期字符串，返回标准化星期数组（如 "周一周三" => ["周一","周三"]） */
export function parseWeekdays(weekday: string): string[] {
  return weekday
    .replace(/，/g, ',')
    .split(/[,、，]/)
    .flatMap(group => {
      const days: string[] = []
      let cur = ''
      for (const ch of group) {
        cur += ch
        if (['一', '二', '三', '四', '五', '六', '日', '天'].includes(ch)) {
          days.push(cur)
          cur = ''
        }
      }
      if (cur) days.push(cur)
      return days.map(d => {
        if (d.startsWith('周') || d.startsWith('星期')) return d
        const map: Record<string, string> = {
          '一': '周一', '二': '周二', '三': '周三', '四': '周四',
          '五': '周五', '六': '周六', '日': '周日', '天': '周日',
        }
        return map[d] ?? d
      })
    })
    .filter(Boolean)
}

/** 根据学期开始日期和第N周计算具体日期（YYYY-MM-DD） */
export function calculateDate(startDate: string, week: number, isEnd = false): string {
  const start = new Date(startDate)
  let offset = (week - 1) * 7
  if (isEnd) offset += 6
  start.setDate(start.getDate() + offset)
  return start.toISOString().split('T')[0]
}
