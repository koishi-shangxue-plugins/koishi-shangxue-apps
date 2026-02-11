import { Context, HTTP, Schema } from 'koishi'
import Assets from '@koishijs/assets'
import { } from '@koishijs/plugin-http'

export const name = 'assets-img-scdn-io'

class ScdnAssets extends Assets<ScdnAssets.Config> {
  types = ['image', 'img'] // 支持图片类型
  http: HTTP

  constructor(ctx: Context, config: ScdnAssets.Config) {
    super(ctx, config)
    this.http = ctx.http.extend({
      endpoint: config.endpoint,
      headers: { accept: 'application/json' },
    })
    this.logInfo(`初始化完成 - API地址: ${config.endpoint}`)
  }

  private logInfo(...args: any[]) {
    if (this.config.loggerinfo) {
      const logger = this.ctx.logger('assets-img-scdn-io')
        ; (logger.info as (...args: any[]) => void)(...args)
    }
  }

  async upload(url: string, file: string) {
    const { buffer, filename, type } = await this.analyze(url, file)
    const logger = this.ctx.logger('assets-img-scdn-io')

    try {
      // 构造表单数据
      const payload = new FormData()
      payload.append('image', new Blob([new Uint8Array(buffer)], { type }), filename)
      payload.append('outputFormat', 'auto')
      payload.append('cdn_domain', 'default')

      this.logInfo(`开始上传文件: ${filename}, 类型: ${type}`)

      // 发送请求到 img.scdn.io API
      const response = await this.http.post('/upload.php', payload)

      this.logInfo(`API响应: ${JSON.stringify(response)}`)

      // 解析响应 - 新的响应结构
      if (response && typeof response === 'object') {
        const data = response as {
          success?: boolean;
          data?: {
            url?: string;
            data?: {
              filename?: string;
              original_size?: number;
              compressed_size?: number;
              compression_ratio?: number;
            }
          }
        }

        if (data.success && data.data && data.data.url) {
          const uploadedUrl = data.data.url
          this.logInfo(`上传成功: ${uploadedUrl}`)
          return uploadedUrl
        }
      }

      // 如果响应格式不符合预期
      logger.error(`上传失败 - 响应格式异常: ${JSON.stringify(response)}`)
      throw new Error('上传失败：API响应格式异常')

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error(`上传失败: ${err.message}`)
      throw err
    }
  }

  async stats() {
    // img.scdn.io API 没有提供统计信息接口，返回空对象
    return {}
  }
}

namespace ScdnAssets {
  export interface Config extends Assets.Config {
    endpoint: string
    loggerinfo: boolean
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      endpoint: Schema.string()
        .role('link')
        .description('API 服务器地址')
        .default('https://img.scdn.io/api')
        .disabled(),
      loggerinfo: Schema.boolean()
        .default(false)
        .description('日志调试：一般输出<br>提issue时，请开启此功能 并且提供BUG复现日志')
        .experimental(),
    }),
    Assets.Config,
  ])

  export const usage = `
  ---

  要使用本插件提供的 assets 服务，你需要先关闭默认开启的 assets-local 插件，然后开启本插件。

  本插件使用 img.scdn.io 图床服务，支持图片文件的上传和存储。

  ---

  本插件图床服务来自: <a href="https://img.scdn.io" target="_blank">https://img.scdn.io</a>

  ---
  `
}

export interface Config extends ScdnAssets.Config { }

export const Config = ScdnAssets.Config

export function apply(ctx: Context, config: Config) {
  ctx.plugin(ScdnAssets, config)
}

export default ScdnAssets
