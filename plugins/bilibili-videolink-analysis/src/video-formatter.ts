import { h } from 'koishi'
import type { BiliVideoView } from './bilibili-api'
import type { Config, VideoParseMode } from './config'

function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://')
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function numeral(value: number, useNumeral: boolean): string {
  if (!useNumeral) return String(value)
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
  return String(value)
}

function pageLink(view: BiliVideoView, config: Config): string {
  return config.bVideoIDPreference === 'av'
    ? `https://www.bilibili.com/video/av${view.aid}`
    : `https://www.bilibili.com/video/${view.bvid}`
}

function playerLink(view: BiliVideoView, page: number): string {
  return `https://www.bilibili.com/blackboard/webplayer/mbplayer.html?bvid=${view.bvid}&p=${page}&autoplay=true`
}

function applyPlaceholders(template: string, config: Config, view: BiliVideoView, page: number): string {
  const maxLength = config.bVideoShowIntroductionTofixed
  const description = view.desc.length > maxLength
    ? `${view.desc.slice(0, maxLength)}...`
    : view.desc

  const placeholders: Record<string, string> = {
    '${标题}': escapeText(view.title),
    '${UP主}': escapeText(view.owner?.name ?? ''),
    '${简介}': escapeText(description),
    '${点赞}': numeral(view.stat.like ?? 0, config.useNumeral),
    '${投币}': numeral(view.stat.coin ?? 0, config.useNumeral),
    '${收藏}': numeral(view.stat.favorite ?? 0, config.useNumeral),
    '${转发}': numeral(view.stat.share ?? 0, config.useNumeral),
    '${观看}': numeral(view.stat.view ?? 0, config.useNumeral),
    '${弹幕}': numeral(view.stat.danmaku ?? 0, config.useNumeral),
    '${封面}': view.pic ? h.image(toHttps(view.pic)).toString() : '',
    '${播放链接}': `${playerLink(view, page)}`,
    '${视频地址}': `${pageLink(view, config)}`,
    '${tab}': '\t',
  }

  for (const [placeholder, value] of Object.entries(placeholders)) {
    template = template.split(placeholder).join(value)
  }
  return template
}

// 返回多条消息，${~~~} 用于把模板拆成独立消息
export function buildVideoMessages(
  config: Config,
  view: BiliVideoView,
  page: number,
  mode: VideoParseMode = 'link',
): h[][] {
  // 升级前没有卡片模板配置时继续使用原模板，避免旧配置失效
  const template = mode === 'card'
    ? config.bVideoCard_area ?? config.bVideo_area
    : config.bVideo_area
  const parts = template.split(/\$\{~~~\}/g)
  const messages: h[][] = []

  for (const part of parts) {
    const rendered = applyPlaceholders(part, config, view, page).trim()
    if (!rendered) continue
    const parsed = h.parse(rendered)
    if (parsed.length > 0) messages.push(parsed)
  }
  return messages
}
