import type { Context } from 'koishi'
import type { PluginLogger } from './logger'

export interface BiliVideoStat {
  view: number
  danmaku: number
  favorite: number
  coin: number
  share: number
  like: number
}

export interface BiliVideoPage {
  page: number
  cid: number
  part: string
  duration: number
}

export interface BiliVideoView {
  bvid: string
  aid: number
  title: string
  desc: string
  pic: string
  duration: number
  owner: {
    name: string
    face: string
    mid: number
  }
  stat: BiliVideoStat
  pages: BiliVideoPage[]
  videoUrl: string
}

interface VideoViewTarget {
  bvid?: string
  aid?: string | number
  page?: number
}

interface ExternalApiResponse {
  code: number
  message?: string
  msg?: string
  data?: {
    bvid?: string
    aid?: string | number
    title?: string
    desc?: string
    pic?: string
    owner?: {
      name?: string
      face?: string
      mid?: string | number
    }
    stat?: {
      view?: string | number
      like?: string | number
      coin?: string | number
      favorite?: string | number
      share?: string | number
      danmuku?: string | number
      danmaku?: string | number
    }
    video?: {
      title?: string
      desc?: string
      fm?: string
      url?: string
    }
  }
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export class BilibiliApi {
  constructor(
    private readonly ctx: Context,
    private readonly userAgent: string,
    private readonly logger: PluginLogger,
  ) {}

  private headers() {
    return {
      'User-Agent': this.userAgent,
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json, text/plain, */*',
    }
  }

  // 使用旧版外置接口解析视频信息和视频直链
  async fetchVideoView(target: VideoViewTarget): Promise<BiliVideoView | null> {
    const baseUrl = target.bvid
      ? `https://www.bilibili.com/video/${target.bvid}`
      : `https://www.bilibili.com/video/av${target.aid}`
    const videoUrl = target.page && target.page > 1 ? `${baseUrl}?p=${target.page}` : baseUrl
    const url = `https://api.xingzhige.com/API/b_parse/?url=${encodeURIComponent(videoUrl)}`
    const response = await this.ctx.http.get<ExternalApiResponse>(url, {
      headers: this.headers(),
    })
    const data = response.data
    const bvid = data?.bvid ?? ''
    const aid = toNumber(data?.aid)
    const title = data?.title ?? data?.video?.title ?? ''
    if (response.code !== 0 || !data || !bvid || !aid || !title) {
      return null
    }

    return {
      bvid,
      aid,
      title,
      desc: data.desc ?? data.video?.desc ?? '',
      pic: data.pic ?? data.video?.fm ?? '',
      duration: 0,
      owner: {
        name: data.owner?.name ?? '',
        face: data.owner?.face ?? '',
        mid: toNumber(data.owner?.mid),
      },
      stat: {
        view: toNumber(data.stat?.view),
        like: toNumber(data.stat?.like),
        coin: toNumber(data.stat?.coin),
        favorite: toNumber(data.stat?.favorite),
        share: toNumber(data.stat?.share),
        danmaku: toNumber(data.stat?.danmuku ?? data.stat?.danmaku),
      },
      pages: [],
      videoUrl: data.video?.url ?? '',
    }
  }

  // 按模板变量需要下载视频，返回 Buffer 和 MIME 类型供 h.video 使用
  async downloadVideo(url: string): Promise<{ data: Buffer; type: string } | null> {
    const controller = new AbortController()
    const clearTimer = this.ctx.setTimeout(() => controller.abort(), 120000)
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Referer': 'https://www.bilibili.com/',
          'Accept': 'video/*,*/*;q=0.8',
        },
        signal: controller.signal,
      })
      if (!response.ok) {
        this.logger.warn(`下载视频失败：HTTP ${response.status}`)
        return null
      }

      const contentType = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
      const type = contentType.startsWith('video/') ? contentType : 'video/mp4'
      const data = Buffer.from(await response.arrayBuffer())
      this.logger.debug(`视频下载完成，大小：${(data.length / 1024 / 1024).toFixed(2)}MB`)
      return { data, type }
    } catch (error) {
      this.logger.warn('下载视频失败', error)
      return null
    } finally {
      clearTimer()
    }
  }

  // 短链重定向使用原生 fetch 手动读取 Location，避免额外依赖
  async resolveShortLink(host: string, code: string): Promise<string | null> {
    const controller = new AbortController()
    const clearTimer = this.ctx.setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(`https://${host}/${code}`, {
        redirect: 'manual',
        headers: {
          'User-Agent': this.userAgent,
          'Referer': 'https://www.bilibili.com/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        return location ? new URL(location, response.url).toString() : null
      }
      const text = await response.text()
      const match = text.match(/https?:\/\/[^"'<\s]+/i)
      return match ? match[0] : null
    } catch (error) {
      this.logger.debug('短链解析失败', error)
      return null
    } finally {
      clearTimer()
    }
  }
}
