import type { Context } from 'koishi'

/**
 * 将图片 URL 转换为 Base64 格式
 */
export async function convertToBase64image(ctx: Context, url: string, logInfo: (...args: any[]) => void): Promise<string> {
  logInfo("转换base64：", url)
  try {
    const fileresponse = await ctx.http.file(url)
    const imageBuffer = Buffer.from(fileresponse.data)
    const base64Image = imageBuffer.toString('base64')
    const mimeType = fileresponse.type || fileresponse.mime
    return `data:${mimeType};base64,${base64Image}`
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