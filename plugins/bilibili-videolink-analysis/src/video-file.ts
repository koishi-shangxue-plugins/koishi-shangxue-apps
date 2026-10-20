import { h } from 'koishi'

const MIME_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-flv': 'flv',
  'video/x-msvideo': 'avi',
  'video/mpeg': 'mpg',
  'video/mp2t': 'ts',
}

// 清理文件名中的非法字符，避免适配器使用平台不接受的名称
function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80)
}

// 根据视频 MIME 类型生成带后缀的文件名
function createFileName(title: string, type: string): string {
  const mime = type.split(';')[0].trim().toLowerCase()
  const extension = MIME_EXTENSIONS[mime] ?? 'mp4'
  const stem = sanitizeFileName(title)
    .replace(/\.(mp4|m4v|webm|mov|flv|avi|mkv|mpeg|mpg|ts)$/i, '')
    .replace(/[. ]+$/g, '')
    .trim()
  return `${stem || 'video'}.${extension}`
}

// 同时传入 name 和 filename，兼容 OneBot 与 QQ 适配器
export function createVideoElement(data: Buffer, type: string, title: string): h {
  const name = createFileName(title, type)
  return h.video(data, type, { name, filename: name })
}
