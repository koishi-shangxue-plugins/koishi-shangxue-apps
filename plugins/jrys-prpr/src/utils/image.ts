import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from 'koishi'

export interface ImageFileData {
  buffer: Buffer
  mimeType: string
}

/**
 * 判断图片地址是否为网络地址
 */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/**
 * 将本地路径规范化为 file URL，避免 HTTP 层无法识别文件协议
 */
function normalizeImageSource(source: string): string {
  if (source.startsWith('data:') || source.startsWith('file:') || isHttpUrl(source)) {
    return source
  }
  return pathToFileURL(resolve(source)).href
}

/**
 * 将图片 Buffer 转换为 Data URL
 */
export function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

/**
 * 通过 Koishi HTTP 读取图片，并以响应 MIME 为准
 */
export async function getImageFile(ctx: Context, source: string): Promise<ImageFileData> {
  const file = await ctx.http.file(normalizeImageSource(source))
  const mimeType = file.mime || file.type
  if (!mimeType) {
    throw new Error(`无法获取图片 MIME 类型: ${source}`)
  }
  return { buffer: Buffer.from(file.data), mimeType }
}

/**
 * 将图片 URL 转换为 Base64 格式
 */
export async function convertToBase64image(ctx: Context, url: string, logInfo: (...args: any[]) => void): Promise<string> {
  logInfo("转换base64：", url)
  try {
    const { buffer, mimeType } = await getImageFile(ctx, url)
    return bufferToDataUrl(buffer, mimeType)
  } catch (error) {
    throw new Error(`转换本地图片为 Base64 失败: ${url}, 错误: ${error.message}`)
  }
}

/**
 * 对时间戳进行编码，用于生成唯一标识符
 */
export function encodeTimestamp(timestamp: string): string {
  // 将日期和时间部分分开
  let [date, time] = timestamp.split('T')
  // 替换一些字符
  date = date.replace(/-/g, '')
  time = time.replace(/:/g, '').replace(/\..*/, '') // 去掉毫秒部分
  // 加入随机数
  const randomNum = Math.floor(Math.random() * 10000) // 生成一个0到9999的随机数
  // 重排字符顺序
  return `${time}${date}${randomNum}`
}
