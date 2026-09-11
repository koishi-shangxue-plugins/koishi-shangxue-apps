import h from '@satorijs/element'

// 自定义消息元素：使用 Satori 元素工厂，保留命名空间扩展类型。
const ELEMENT_TYPE_PATTERN = /^[a-z][a-z0-9_:-]*$/i

type CustomElement = ReturnType<typeof h>

/**
 * 将输入的类型和内容转换为 Satori 元素。
 * 空内容不生成元素，避免发送无意义的空消息。
 */
export function buildCustomElement(type: string, content: string): CustomElement | null {
    const elementType = type.trim()
    const elementContent = content.trim()
    if (!ELEMENT_TYPE_PATTERN.test(elementType) || elementContent.length === 0) return null

    const normalizedType = elementType.toLowerCase()
    if (normalizedType === 'text') return h.text(content)
    if (normalizedType === 'img' || normalizedType === 'image') return h.img(elementContent)
    if (normalizedType === 'file') return h.file(elementContent)
    if (normalizedType === 'video') return h.video(elementContent)
    if (normalizedType === 'audio' || normalizedType === 'record') return h.audio(elementContent)
    if (normalizedType === 'json' || normalizedType === 'xml') {
        return h(normalizedType, { data: elementContent })
    }
    if (normalizedType === 'markdown') {
        return h('markdown', elementContent)
    }

    return h(elementType, elementContent)
}
