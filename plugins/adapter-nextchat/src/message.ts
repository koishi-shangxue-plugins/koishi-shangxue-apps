import { h, Fragment } from 'koishi'
import { NextChatBot } from './bot'
import { transformUrl } from './utils'
import { logInfo, loggerError } from './logger'

/**
 * 将 Fragment 转换为字符串
 * @param bot Bot 实例
 * @param fragment 要转换的 Fragment
 * @param allowedElements 允许渲染的元素类型
 * @returns 转换后的字符串
 */
export async function fragmentToString(
  bot: NextChatBot,
  fragment: Fragment,
  allowedElements: string[] = ['text', 'image', 'img', 'audio', 'video', 'file']
): Promise<string> {
  if (typeof fragment === 'string') {
    return fragment
  }

  if (Array.isArray(fragment)) {
    // 递归处理数组中的每个元素
    const results = await Promise.all(fragment.map((item, index) => {
      return fragmentToString(bot, item, allowedElements)
    }));
    const result = results.join('');
    return result
  }

  if (fragment && typeof fragment === 'object' && 'type' in fragment) {
    const element = fragment as h

    let result = ''

    switch (element.type) {
      case 'text':
        result = element.attrs.content || ''
        break

      case 'i18n':
        // 处理国际化文本
        const path = element.attrs?.path
        if (path && bot.ctx['i18n']) {
          const i18n = bot.ctx['i18n'] as any
          try {
            const locales = i18n.fallback([])
            const rendered = i18n.render(locales, [path], element.attrs || {})

            // i18n.render 返回的是 Element 数组，需要递归处理
            if (rendered) {
              if (typeof rendered === 'string') {
                result = rendered
              } else if (Array.isArray(rendered)) {
                // 递归处理返回的 Element 数组
                result = await fragmentToString(bot, rendered, allowedElements)
              } else {
                result = await fragmentToString(bot, rendered, allowedElements)
              }
            } else {
              result = `[${path}]`
            }
          } catch (e) {
            // i18n解析失败，使用fallback
            logInfo(`[${bot.selfId}] i18n解析失败:`, e)
            result = `[${path}]`
          }
        } else {
          logInfo(`[${bot.selfId}] i18n 不可用或 path 为空`)
          result = `[${path || 'i18n'}]`
        }
        break

      case 'image':
      case 'img': {
        // 检查是否允许渲染图片
        if (!allowedElements.includes('image') && !allowedElements.includes('img')) {
          result = '[图片]';
          break;
        }
        let url = element.attrs.src || element.attrs.url || '';
        if (!url.startsWith('http')) {
          const transformedUrl = await transformUrl(bot, h.image(url).toString());
          url = transformedUrl || '';
        }
        result = url ? `![image](${url})` : '[图片转存失败]';
        break;
      }

      case 'audio': {
        // 检查是否允许渲染音频
        if (!allowedElements.includes('audio')) {
          result = '[音频]';
          break;
        }
        let url = element.attrs.src || element.attrs.url || '';
        if (!url.startsWith('http')) {
          const transformedUrl = await transformUrl(bot, h.audio(url).toString());
          url = transformedUrl || '';
        }
        result = url ? `[🔊 点击收听音频](${url})` : '[音频转存失败]';
        break;
      }

      case 'video': {
        // 检查是否允许渲染视频
        if (!allowedElements.includes('video')) {
          result = '[视频]';
          break;
        }
        let url = element.attrs.src || element.attrs.url || '';
        if (!url.startsWith('http')) {
          const transformedUrl = await transformUrl(bot, h.video(url).toString());
          url = transformedUrl || '';
        }
        result = url ? `[🎬 点击观看视频](${url})` : '[视频转存失败]';
        break;
      }

      case 'file': {
        // 检查是否允许渲染文件
        if (!allowedElements.includes('file')) {
          result = '[文件]';
          break;
        }
        let url = element.attrs.src || element.attrs.url || '';
        result = url ? `[📎 文件](${url})` : '[文件]';
        break;
      }

      case 'at':
        result = `@${element.attrs.name || element.attrs.id}`
        break

      case 'p':
        // p 元素：手动递归处理子元素
        if (element.children && element.children.length > 0) {
          result = (await Promise.all(element.children.map(child => fragmentToString(bot, child, allowedElements)))).join('') + '\n'
        }
        break

      default:
        // 默认处理：手动递归处理子元素
        if (element.children && element.children.length > 0) {
          result = (await Promise.all(element.children.map(child => fragmentToString(bot, child, allowedElements)))).join('')
        }
        break
    }

    return result
  }

  return String(fragment)
}

/**
 * 简单的 token 估算
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.75)
}

/**
 * 创建流式响应
 */
export function createStreamResponse(content: string, model: string): string {
  const chunks = []
  const words = content.split('')
  chunks.push({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: { role: 'assistant' },
      finish_reason: null,
    }],
  })
  for (let i = 0; i < words.length; i++) {
    chunks.push({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        delta: { content: words[i] },
        finish_reason: null,
      }],
    })
  }
  chunks.push({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop',
    }],
  })
  return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'
}