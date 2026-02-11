import { h } from 'koishi'
import { GitHubBot } from './bot'

/**
 * 将 Koishi 的 Fragment 转换为纯文本，用于发送到 GitHub
 * 特别处理 i18n 标签和其他元素
 */
export async function encodeMessage(bot: GitHubBot, content: h.Fragment): Promise<string> {
  let result = ''

  const elements = h.normalize(content)

  for (const element of elements) {
    if (typeof element === 'string') {
      result += element
      continue
    }

    const { type, attrs, children } = element

    switch (type) {
      case 'text':
        result += attrs.content || ''
        break

      case 'i18n': {
        try {
          const path = attrs?.path
          if (path && bot.ctx.i18n) {
            const locales = bot.ctx.i18n.fallback([])
            try {
              const rendered = bot.ctx.i18n.render(locales, [path], attrs || {})

              // i18n.render 可能返回字符串或 Fragment
              if (typeof rendered === 'string') {
                result += rendered
                break
              } else if (Array.isArray(rendered)) {
                // 递归处理 Fragment 数组
                const nested = await encodeMessage(bot, rendered)
                result += nested
                break
              }
            } catch (e) {
              bot.logError(`i18n 解析失败: ${e}`)
            }
          }
          result += `[${path || 'i18n'}]`
        } catch (error) {
          result += `[${attrs?.path || 'i18n'}]`
        }
        break
      }

      case 'at':
        if (attrs.id) {
          result += `@${attrs.name || attrs.id}`
        }
        break

      case 'sharp':
        if (attrs.id) {
          result += `#${attrs.name || attrs.id}`
        }
        break

      case 'a':
        result += attrs.href || ''
        break

      case 'img':
      case 'image':
        result += `![image](${attrs.url || attrs.src})`
        break

      case 'audio':
        result += `[音频](${attrs.url || attrs.src})`
        break

      case 'video':
        result += `[视频](${attrs.url || attrs.src})`
        break

      case 'file':
        result += `[文件](${attrs.url || attrs.src})`
        break

      case 'b':
      case 'strong':
        result += `**${await encodeMessage(bot, children)}**`
        break

      case 'i':
      case 'em':
        result += `*${await encodeMessage(bot, children)}*`
        break

      case 'u':
        result += `__${await encodeMessage(bot, children)}__`
        break

      case 's':
      case 'del':
        result += `~~${await encodeMessage(bot, children)}~~`
        break

      case 'code':
        result += `\`${await encodeMessage(bot, children)}\``
        break

      case 'p':
        result += await encodeMessage(bot, children)
        result += '\n\n'
        break

      case 'br':
        result += '\n'
        break

      case 'quote':
        const quoteText = await encodeMessage(bot, children)
        result += quoteText.split('\n').map(line => `> ${line}`).join('\n')
        result += '\n\n'
        break

      default:
        // 对于未知类型，递归处理子元素
        if (children && children.length > 0) {
          result += await encodeMessage(bot, children)
        }
        break
    }
  }

  return result.trim()
}
