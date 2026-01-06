import { Config } from './config'
import { Context } from 'koishi'
import { writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export class Utils {
  constructor(private config: Config, private ctx?: Context) { }

  isPlatformBlocked(platform: string): boolean {
    if (!this.config.blockedPlatforms || this.config.blockedPlatforms.length === 0) {
      return false
    }

    for (const blockedPlatform of this.config.blockedPlatforms) {
      if (blockedPlatform.exactMatch) {
        if (platform === blockedPlatform.platformName) {
          return true
        }
      } else {
        if (platform.includes(blockedPlatform.platformName)) {
          return true
        }
      }
    }

    return false
  }

  extractTextContent(elements: any[]): string {
    let text = ''
    for (const element of elements) {
      if (element.type === 'text') {
        text += element.attrs?.content || ''
      } else if (element.type === 'p') {
        if (element.children && element.children.length > 0) {
          text += this.extractTextContent(element.children) + '\n'
        }
      } else if (element.children && element.children.length > 0) {
        text += this.extractTextContent(element.children)
      }
    }
    return text
  }

  private isBase64(str: string): boolean {
    if (!str || typeof str !== 'string') return false

    if (str.startsWith('data:')) {
      return str.includes('base64,')
    }

    if (str.length > 100) {
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      return base64Regex.test(str)
    }

    return false
  }

  persistBase64Image(base64Data: string): string {
    if (!this.ctx || !base64Data.startsWith('data:image/')) return base64Data

    try {
      const dir = join(this.ctx.baseDir, 'data', 'chat-patch', 'persist-images')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

      const hash = createHash('md5').update(base64Data).digest('hex')
      const ext = base64Data.split(';')[0].split('/')[1] || 'png'
      const filename = `${Date.now()}_${hash}.${ext}`
      const filePath = join(dir, filename)

      const base64Content = base64Data.split(',')[1]
      writeFileSync(filePath, Buffer.from(base64Content, 'base64'))

      this.cleanupPersistImages(dir)

      return pathToFileURL(filePath).href
    } catch (e) {
      return base64Data
    }
  }

  private cleanupPersistImages(dir: string) {
    try {
      const files = readdirSync(dir)
        .map(name => ({ name, path: join(dir, name), mtime: statSync(join(dir, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)

      if (files.length > this.config.maxPersistImages) {
        files.slice(this.config.maxPersistImages).forEach(f => unlinkSync(f.path))
      }
    } catch (e) { }
  }

  cleanBase64Content(obj: any, isBotMessage: boolean = false): any {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (typeof obj === 'string') {
      if (this.isBase64(obj)) {

        if (isBotMessage && !obj.startsWith('data:image/')) {
          return '[富媒体内容已省略]'
        }
        return this.persistBase64Image(obj)
      }
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanBase64Content(item, isBotMessage))
    }

    if (typeof obj === 'object') {
      const cleaned: any = {}
      for (const [key, value] of Object.entries(obj)) {

        if (isBotMessage && obj.type && !['text', 'image', 'img'].includes(obj.type)) {

          if (typeof value === 'string' && (key === 'src' || key === 'url' || key === 'file') && this.isBase64(value)) {
            cleaned[key] = '[富媒体内容已省略]'
            continue
          }
        }

        if (typeof value === 'string' && (
          key === 'src' ||
          key === 'url' ||
          key === 'file' ||
          key === 'data' ||
          key === 'content'
        ) && this.isBase64(value)) {

          if (isBotMessage && !value.startsWith('data:image/')) {
            cleaned[key] = '[富媒体内容已省略]'
          } else {
            cleaned[key] = this.persistBase64Image(value)
          }
        } else {
          cleaned[key] = this.cleanBase64Content(value, isBotMessage)
        }
      }
      return cleaned
    }

    return obj
  }
}
