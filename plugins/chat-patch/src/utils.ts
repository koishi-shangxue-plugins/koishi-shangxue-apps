import { Config } from './config'
import { Context } from 'koishi'
import { writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export class Utils {
  constructor(private config: Config, private ctx?: Context) { }

  // 检查平台是否被屏蔽
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

  // 递归提取所有文本内容的函数
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

  // 检查字符串是否为base64格式
  private isBase64(str: string): boolean {
    if (!str || typeof str !== 'string') return false

    // 检查是否以data:开头的base64格式
    if (str.startsWith('data:')) {
      return str.includes('base64,')
    }

    // 检查纯base64字符串（长度大于100且符合base64格式）
    if (str.length > 100) {
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
      return base64Regex.test(str)
    }

    return false
  }

  // 持久化 base64 图片并返回本地文件 URL
  persistBase64Image(base64Data: string): string {
    if (!this.ctx || !base64Data.startsWith('data:image/')) return base64Data

    try {
      const dir = join(this.ctx.baseDir, 'data', 'chat-patch', 'persist-images')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

      // 生成文件名：时间戳 + 内容哈希
      const hash = createHash('md5').update(base64Data).digest('hex')
      const ext = base64Data.split(';')[0].split('/')[1] || 'png'
      const filename = `${Date.now()}_${hash}.${ext}`
      const filePath = join(dir, filename)

      // 写入文件
      const base64Content = base64Data.split(',')[1]
      writeFileSync(filePath, Buffer.from(base64Content, 'base64'))

      // 清理旧图片
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

  // 清理对象中的base64内容，改为持久化存储
  // isBotMessage: 是否为机器人发送的消息
  cleanBase64Content(obj: any, isBotMessage: boolean = false): any {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (typeof obj === 'string') {
      if (this.isBase64(obj)) {
        // 如果是机器人消息且是非图片的Base64，直接返回占位符
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
        // 检查元素类型，如果是机器人消息的非图片元素，跳过Base64处理
        if (isBotMessage && obj.type && !['text', 'image', 'img'].includes(obj.type)) {
          // 对于video、audio等元素，如果src是Base64，替换为占位符
          if (typeof value === 'string' && (key === 'src' || key === 'url' || key === 'file') && this.isBase64(value)) {
            cleaned[key] = '[富媒体内容已省略]'
            continue
          }
        }

        // 特别处理常见的base64字段
        if (typeof value === 'string' && (
          key === 'src' ||
          key === 'url' ||
          key === 'file' ||
          key === 'data' ||
          key === 'content'
        ) && this.isBase64(value)) {
          // 如果是机器人消息且不是图片Base64，跳过
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
