import { h, Fragment } from 'koishi'

/**
 * 将 GitHub Markdown 转换为 Koishi Fragment
 * 支持常见的 Markdown 语法和 GitHub 特性
 */
export function decodeMarkdown(markdown: string): Fragment {
  if (!markdown) return []

  const elements: (string | h)[] = []
  let currentText = ''

  // 辅助函数：将累积的文本添加到元素数组
  const flushText = () => {
    if (currentText) {
      elements.push(currentText)
      currentText = ''
    }
  }

  // 按行处理
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 代码块
    if (line.startsWith('```')) {
      flushText()
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      const code = codeLines.join('\n')
      elements.push(h('code', code))
      elements.push('\n')
      i++
      continue
    }

    // 引用块
    if (line.startsWith('>')) {
      flushText()
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].slice(1).trim())
        i++
      }
      const quoteContent = parseInlineMarkdown(quoteLines.join('\n'))
      elements.push(h('quote', quoteContent))
      continue
    }

    // 标题（简化处理，转为加粗）
    if (line.match(/^#{1,6}\s/)) {
      flushText()
      const text = line.replace(/^#{1,6}\s/, '')
      elements.push(h('b', parseInlineMarkdown(text)))
      elements.push('\n')
      i++
      continue
    }

    // 分隔线
    if (line.match(/^[-*_]{3,}$/)) {
      flushText()
      elements.push('\n---\n')
      i++
      continue
    }

    // 空行
    if (line.trim() === '') {
      flushText()
      elements.push('\n')
      i++
      continue
    }

    // 普通行，处理行内元素
    currentText += line
    i++

    // 如果不是最后一行，添加换行
    if (i < lines.length) {
      currentText += '\n'
    }
  }

  // 处理剩余的文本中的行内元素
  if (currentText) {
    const inlineElements = parseInlineMarkdown(currentText)
    elements.push(...inlineElements)
  }

  return elements
}

/**
 * 解析行内 Markdown 元素
 */
function parseInlineMarkdown(text: string): (string | h)[] {
  const elements: (string | h)[] = []
  let remaining = text
  let pos = 0

  while (pos < remaining.length) {
    // 图片：![alt](url)
    const imgMatch = remaining.slice(pos).match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (imgMatch) {
      elements.push(h('img', { src: imgMatch[2], alt: imgMatch[1] }))
      pos += imgMatch[0].length
      continue
    }

    // 链接：[text](url)
    const linkMatch = remaining.slice(pos).match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      elements.push(h('a', { href: linkMatch[2] }, linkMatch[1]))
      pos += linkMatch[0].length
      continue
    }

    // 行内代码：`code`
    const codeMatch = remaining.slice(pos).match(/^`([^`]+)`/)
    if (codeMatch) {
      elements.push(h('code', codeMatch[1]))
      pos += codeMatch[0].length
      continue
    }

    // 加粗：**text** 或 __text__
    const boldMatch = remaining.slice(pos).match(/^(\*\*|__)(.+?)\1/)
    if (boldMatch) {
      elements.push(h('b', boldMatch[2]))
      pos += boldMatch[0].length
      continue
    }

    // 斜体：*text* 或 _text_
    const italicMatch = remaining.slice(pos).match(/^(\*|_)(.+?)\1/)
    if (italicMatch) {
      elements.push(h('i', italicMatch[2]))
      pos += italicMatch[0].length
      continue
    }

    // 删除线：~~text~~
    const strikeMatch = remaining.slice(pos).match(/^~~(.+?)~~/)
    if (strikeMatch) {
      elements.push(h('s', strikeMatch[1]))
      pos += strikeMatch[0].length
      continue
    }

    // @mention
    const mentionMatch = remaining.slice(pos).match(/^@([a-zA-Z0-9_-]+)/)
    if (mentionMatch) {
      elements.push(h('at', { id: mentionMatch[1], name: mentionMatch[1] }))
      pos += mentionMatch[0].length
      continue
    }

    // #issue
    const issueMatch = remaining.slice(pos).match(/^#(\d+)/)
    if (issueMatch) {
      elements.push(h('sharp', { id: issueMatch[1], name: issueMatch[1] }))
      pos += issueMatch[0].length
      continue
    }

    // 普通字符
    elements.push(remaining[pos])
    pos++
  }

  return elements
}
