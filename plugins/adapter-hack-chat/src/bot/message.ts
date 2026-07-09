import { Context, MessageEncoder, h } from 'koishi'
import type { HackChatBot } from './index'

function toText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function quoteMarkdown(text: string): string {
  return text.split('\n').map((line) => `> ${line}`).join('\n')
}

export class HackChatMessageEncoder extends MessageEncoder<Context, HackChatBot> {
  async flush(): Promise<void> {}

  async visit(): Promise<void> {}

  async send(content: h.Fragment): Promise<never[]> {
    const text = await this.fragmentToText(content)
    if (text.trim()) {
      await this.bot.sendRoomText(this.channelId, text)
    }
    return []
  }

  private async fragmentToText(fragment: unknown): Promise<string> {
    if (typeof fragment === 'string') return fragment
    if (Array.isArray(fragment)) {
      let output = ''
      for (const item of fragment) {
        output += await this.fragmentToText(item)
      }
      return output
    }
    if (!fragment || typeof fragment !== 'object' || !('type' in fragment)) {
      return ''
    }

    const element = fragment as { type?: string; attrs?: Record<string, unknown>; children?: unknown }
    const { type, attrs = {}, children } = element

    switch (type) {
      case 'text':
        return toText(attrs.content)
      case 'i18n': {
        const path = toText(attrs.path)
        if (!path || !this.bot.ctx.i18n) return ''
        const params = { ...attrs }
        delete params.path
        try {
          const rendered = this.bot.ctx.i18n.render(this.bot.ctx.i18n.fallback([]), [path], params)
          return this.fragmentToText(h.normalize(rendered))
        } catch {
          return ''
        }
      }
      case 'at':
        return `@${toText(attrs.name) || toText(attrs.id)} `
      case 'sharp':
        return `#${toText(attrs.name) || toText(attrs.id)}`
      case 'b':
      case 'strong':
        return `**${await this.fragmentToText(children)}**`
      case 'i':
      case 'em':
        return `*${await this.fragmentToText(children)}*`
      case 's':
      case 'del':
        return `~~${await this.fragmentToText(children)}~~`
      case 'code':
        return `\`${await this.fragmentToText(children)}\``
      case 'p':
        return `${await this.fragmentToText(children)}\n\n`
      case 'br':
        return '\n'
      case 'quote': {
        const quoteId = toText(attrs.id)
        const reply = await this.fragmentToText(children)
        if (quoteId) {
          const quoted = await this.bot.getMessage(this.channelId, quoteId)
          if (quoted.content) {
            const quotedText = quoteMarkdown(quoted.content)
            return reply ? `${quotedText}\n\n\n${reply}` : `${quotedText}\n\n`
          }
        }
        return reply ? `\n\n${quoteMarkdown(reply)}\n\n` : '\n\n'
      }
      case 'img':
      case 'image':
      case 'audio':
      case 'video':
      case 'file':
        return toText(attrs.src) || toText(attrs.url)
      default:
        return this.fragmentToText(children)
    }
  }
}
