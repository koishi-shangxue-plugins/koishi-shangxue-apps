import { Context, Service } from 'koishi'
import { promises as fs } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Config } from '.'

export class BaseData extends Service {
  constructor(ctx: Context, config: Config) {
    super(ctx, 'basedata', true)
    this.config = config
  }

  /**
   * 带重试机制的 fetch
   * @param url 请求的 URL
   * @param retries 重试次数
   * @returns 返回 Response 对象
   */
  private async fetchWithRetry(url: string, retries: number): Promise<Response> {
    try {
      // 创建超时控制器
      const controller = new AbortController()
      const dispose = this.ctx.setTimeout(() => controller.abort(), this.config.requestTimeout)

      try {
        const response = await fetch(url, { signal: controller.signal })
        dispose()

        if (!response.ok) {
          throw new Error(`HTTP 请求失败，状态码: ${response.status}`)
        }
        return response
      } catch (fetchError) {
        dispose()
        throw fetchError
      }
    } catch (error) {
      if (retries > 0) {
        const errorMsg = error.name === 'AbortError' ? '请求超时' : error.message
        this.ctx.logger('basedata').warn(`请求 ${url} 失败 (${errorMsg})，正在重试... (剩余 ${retries} 次)`)
        return this.fetchWithRetry(url, retries - 1)
      }
      this.ctx.logger('basedata').error(`请求 ${url} 在多次重试后仍然失败。`)
      throw error
    }
  }

  /**
   * 获取文件的本地存储路径
   * @param fileName 文件名
   * @param scope 作用域 (用于隔离不同插件的文件)
   * @returns 文件的绝对路径
   */
  private getLocalPath(fileName: string, scope?: string): string {
    const baseDir = resolve(this.ctx.baseDir, 'data', 'basedata')
    if (scope) {
      return resolve(baseDir, scope, fileName)
    }
    return resolve(baseDir, fileName)
  }

  /**
   * 下载文件到本地 (内部实现)
   * @param scope 作用域
   * @param fileName 文件名
   * @param downloadsurl 下载链接
   * @returns 下载文件的本地路径
   */
  private async _download(scope: string | undefined, fileName: string, downloadsurl?: string): Promise<string> {
    if (!downloadsurl) {
      throw new Error('当文件不存在时，downloadsurl 是必需的。')
    }

    const filePath = this.getLocalPath(fileName, scope)
    // 确保目录存在
    await fs.mkdir(dirname(filePath), { recursive: true })

    const response = await this.fetchWithRetry(downloadsurl, this.config.retryCount)
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    this.ctx.logger('basedata').info(`文件 ${fileName} 已下载到 ${filePath}`)
    return filePath
  }

  /**
   * 将本地文件转换为 Base64 Data URL (内部实现)
   * @param filePath 文件绝对路径
   * @returns 文件的 Base64 Data URL
   */
  private async _fileToBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath)
    const fileUrl = pathToFileURL(filePath).href
    const { type } = await this.ctx.http.file(fileUrl)
    const finalMime = type || 'application/octet-stream'
    return `data:${finalMime};base64,${buffer.toString('base64')}`
  }

  /**
   * 读取文件内容 (缓存优先)
   */
  private async _read(scope: string | undefined, fileName: string, downloadsurl?: string): Promise<string> {
    const filePath = this.getLocalPath(fileName, scope)
    try {
      await fs.access(filePath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.ctx.logger('basedata').info(`本地未找到文件 ${fileName}，尝试下载。`)
        await this._download(scope, fileName, downloadsurl)
      } else {
        throw error
      }
    }
    return this._fileToBase64(filePath)
  }

  /**
   * 获取一个带作用域的 API 对象
   * @param scope 作用域名称
   */
  public scope(scope: string) {
    return {
      read: (fileName: string, downloadsurl?: string) => this._read(scope, fileName, downloadsurl),
      download: async (fileName: string, downloadsurl?: string) => {
        const filePath = await this._download(scope, fileName, downloadsurl)
        return this._fileToBase64(filePath)
      },
    }
  }

  /**
   * 读取文件内容为 Base64 Data URL (无作用域, 缓存优先)
   */
  public read(fileName: string, downloadsurl?: string) {
    return this._read(undefined, fileName, downloadsurl)
  }

  /**
   * 强制下载文件并返回 Base64 Data URL (无作用域, 覆盖本地)
   */
  public async download(fileName: string, downloadsurl?: string) {
    const filePath = await this._download(undefined, fileName, downloadsurl)
    return this._fileToBase64(filePath)
  }
}