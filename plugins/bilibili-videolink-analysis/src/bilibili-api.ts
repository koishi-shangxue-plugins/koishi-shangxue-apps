import type { Context } from 'koishi'
import type { VideoApiMode } from './config'
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
}

interface BiliApiResponse<T> {
  code: number
  message: string
  data: T
}

interface VideoViewTarget {
  bvid?: string
  aid?: string | number
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
    private readonly videoApiMode: VideoApiMode,
    private readonly logger: PluginLogger,
  ) {}

  private headers() {
    return {
      'User-Agent': this.userAgent,
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json, text/plain, */*',
    }
  }

  // 统一入口：按配置决定官方、外置或外置优先
  async fetchVideoView(target: VideoViewTarget): Promise<BiliVideoView | null> {
    if (this.videoApiMode === 'official') return this.fetchOfficialVideoView(target)
    if (this.videoApiMode === 'external') return this.fetchExternalVideoView(target)
    return this.fetchExternalFirstVideoView(target)
  }

  // 官方公开接口，按 BV 或 AV 获取视频信息
  private async fetchOfficialVideoView(target: VideoViewTarget): Promise<BiliVideoView | null> {
    const params = target.bvid
      ? `bvid=${encodeURIComponent(target.bvid)}`
      : `aid=${encodeURIComponent(String(target.aid))}`
    const url = `https://api.bilibili.com/x/web-interface/view?${params}`
    const response = await this.ctx.http.get<BiliApiResponse<BiliVideoView>>(url, {
      headers: this.headers(),
    })
    if (response.code !== 0 || !response.data) {
      return null
    }
    return response.data
  }

  // 外置接口优先，请求失败或未返回有效数据时回退官方接口
  private async fetchExternalFirstVideoView(target: VideoViewTarget): Promise<BiliVideoView | null> {
    try {
      const view = await this.fetchExternalVideoView(target)
      if (view) {
        this.logger.debug('使用外置 API 解析成功')
        return view
      }
      this.logger.warn('外置 API 未返回有效视频数据，回退到 B 站官方 API')
    } catch (error) {
      this.logger.warn('外置 API 请求失败，回退到 B 站官方 API', error)
    }
    return this.fetchOfficialVideoView(target)
  }

  // 外置接口来自旧版解析服务，返回字段与官方接口略有差异，这里统一为 BiliVideoView
  private async fetchExternalVideoView(target: VideoViewTarget): Promise<BiliVideoView | null> {
    const videoUrl = target.bvid
      ? `https://www.bilibili.com/video/${target.bvid}`
      : `https://www.bilibili.com/video/av${target.aid}`
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
