import type { Bot } from 'koishi'
import type { CurriculumCourseView } from './types'

/** 使用实际发送机器人补全课程用户昵称和头像。 */
export async function hydrateCourseUsers(
  bot: Bot,
  courses: CurriculumCourseView[],
  guildId: string,
): Promise<CurriculumCourseView[]> {
  const cache = new Map<string, { name: string; avatar: string }>()
  const result: CurriculumCourseView[] = []

  for (const course of courses) {
    let profile = cache.get(course.userid)
    if (!profile) {
      let name = course.username
      let avatar = course.useravatar
      try {
        const user = await bot.getUser(course.userid, course.guildId || guildId || undefined)
        if (user?.name) name = user.name
        if (user?.avatar) avatar = user.avatar
      } catch {
        // 平台不支持查询用户时保留已有信息。
      }
      avatar = await fetchAvatarDataUrl(avatar, course.userid, name)
      profile = { name, avatar }
      cache.set(course.userid, profile)
    }
    result.push({
      ...course,
      username: profile.name,
      useravatar: profile.avatar,
    })
  }
  return result
}

async function fetchAvatarDataUrl(avatar: string, userId: string, name: string): Promise<string> {
  const source = avatar || (/^\d+$/.test(userId)
    ? `https://q.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=640`
    : '')
  if (!source) return createFallbackAvatar(name || userId)
  try {
    const response = await fetch(source)
    if (!response.ok) return createFallbackAvatar(name || userId)
    const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    const buffer = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString('base64')}`
  } catch {
    return createFallbackAvatar(name || userId)
  }
}

function createFallbackAvatar(name: string): string {
  const label = (name.trim().slice(0, 1) || '?')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
    <rect width="96" height="96" fill="#dcefe9"/>
    <text x="48" y="60" text-anchor="middle" font-size="40" fill="#147a66">${label}</text>
  </svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
