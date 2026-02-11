import { h } from 'koishi'
import { } from '@koishijs/assets'
import { GitHubBot } from '../bot/base'

/**
 * 使用 assets 服务转存非 HTTPS 协议的资源
 */
async function transformUrl(bot: GitHubBot, elementString: string): Promise<string | null> {
  // 检查 assets 服务是否存在
  if (!bot.ctx.assets) {
    bot.logInfo('Assets 服务不可用，跳过资源转存')
    return null
  }

  try {
    const transformedContent = await bot.ctx.assets.transform(elementString)
    // 从转存后的内容中提取 URL
    const urlMatch = transformedContent.match(/src="([^"]+)"/)
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1]
    } else {
      bot.logInfo(`无法从转存内容中提取 URL: ${transformedContent}`)
      return null
    }
  } catch (error) {
    bot.logError('资源转存失败:', error)
    return null
  }
}

/**
 * 将 Koishi 的 Fragment 转换为纯文本，用于发送到 GitHub
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
      case 'image': {
        let url = attrs.url || attrs.src

        if (!url.startsWith('http')) {
          const transformedUrl = await transformUrl(bot, h.image(url).toString())
          if (transformedUrl) {
            url = transformedUrl
          } else {
            result += '[图片转存失败]'
            break
          }
        }

        result += `![image](${url})`
        break
      }

      case 'audio': {
        let url = attrs.url || attrs.src

        if (!url.startsWith('http')) {
          const transformedUrl = await transformUrl(bot, h.audio(url).toString())
          if (transformedUrl) {
            url = transformedUrl
          } else {
            result += '[音频转存失败]'
            break
          }
        }

        result += `[音频](${url})`
        break
      }

      case 'video': {
        let url = attrs.url || attrs.src

        if (!url.startsWith('http')) {
          const transformedUrl = await transformUrl(bot, h.video(url).toString())
          if (transformedUrl) {
            url = transformedUrl
          } else {
            result += '[视频转存失败]'
            break
          }
        }

        result += `[视频](${url})`
        break
      }

      case 'file': {
        let url = attrs.url || attrs.src

        if (!url.startsWith('http')) {
          const transformedUrl = await transformUrl(bot, h.file(url).toString())
          if (transformedUrl) {
            url = transformedUrl
          } else {
            result += '[文件转存失败]'
            break
          }
        }

        result += `[文件](${url})`
        break
      }

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
