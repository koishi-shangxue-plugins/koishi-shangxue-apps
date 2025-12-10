import fs from 'node:fs'
import type { Context } from 'koishi'
import type { Config } from '../types'

/**
 * 记录用户签到时间
 */
export async function recordSignIn(ctx: Context, userId: string, channelId: string): Promise<void> {
  const currentTime = new Date()
  const dateString = currentTime.toISOString().split('T')[0] // 获取当前日期字符串

  const [record] = await ctx.database.get('jrysprprdata', { userid: userId, channelId })

  if (record) {
    // 更新用户签到时间
    await ctx.database.set('jrysprprdata', { userid: userId, channelId }, { lastSignIn: dateString })
  } else {
    // 创建新的签到记录
    await ctx.database.create('jrysprprdata', { userid: userId, channelId, lastSignIn: dateString })
  }
}

/**
 * 检查用户是否已签到
 */
export async function alreadySignedInToday(ctx: Context, userId: string, channelId: string, config: Config): Promise<boolean> {
  const currentTime = new Date()
  const dateString = currentTime.toISOString().split('T')[0] // 获取当前日期字符串

  if (!config.Repeated_signin_for_different_groups) {
    // 如果不允许从不同群组签到，检查所有群组
    const records = await ctx.database.get('jrysprprdata', { userid: userId })

    // 检查是否有任何记录的签到日期是今天
    return records.some(record => record.lastSignIn === dateString)
  } else {
    // 仅检查当前群组
    const [record] = await ctx.database.get('jrysprprdata', { userid: userId, channelId })

    if (record) {
      // 检查最后签到日期是否是今天
      return record.lastSignIn === dateString
    }
  }

  // 如果没有记录，表示未签到
  return false
}

/**
 * 更新用户货币
 */
export async function updateUserCurrency(
  ctx: Context,
  uid: string,
  amount: number,
  currency: string,
  logInfo: (...args: any[]) => void
): Promise<string> {
  try {
    const numericUserId = Number(uid) // 将 userId 转换为数字类型

    //  通过 ctx.monetary.gain 为用户增加货币，
    //  或者使用相应的 ctx.monetary.cost 来减少货币
    if (amount > 0) {
      await ctx.monetary.gain(numericUserId, amount, currency)
      logInfo(`为用户 ${uid} 增加了 ${amount} ${currency}`)
    } else if (amount < 0) {
      await ctx.monetary.cost(numericUserId, -amount, currency)
      logInfo(`为用户 ${uid} 减少了 ${-amount} ${currency}`)
    }

    return `用户 ${uid} 成功更新了 ${Math.abs(amount)} ${currency}`
  } catch (error) {
    ctx.logger.error(`更新用户 ${uid} 的货币时出错: ${error}`)
    return `更新用户 ${uid} 的货币时出现问题。`
  }
}

/**
 * 获取用户货币
 */
export async function getUserCurrency(ctx: Context, uid: string, currency: string): Promise<number> {
  try {
    const numericUserId = Number(uid)
    const [data] = await ctx.database.get('monetary', {
      uid: numericUserId,
      currency,
    }, ['value'])

    return data ? data.value : 0
  } catch (error) {
    ctx.logger.error(`获取用户 ${uid} 的货币时出错: ${error}`)
    return 0
  }
}

/**
 * 获取原图 URL
 */
export async function getOriginalImageURL(ctx: Context, jsonFilePath: string, messageIdOrTime: string): Promise<string | null> {
  try {
    const data = await fs.promises.readFile(jsonFilePath, { encoding: 'utf-8' })
    const images = JSON.parse(data)
    // 确保输入参数为字符串
    const input = messageIdOrTime.toString()
    // 检查输入参数是消息ID还是时间戳
    const isTimestamp = /^\d{15,}$/.test(input)
    // 定义变量来存储匹配结果
    let matchedImage = null
    // 查找对应的背景图URL
    for (const image of images) {
      if (isTimestamp) {
        // 匹配时间戳
        if (image.messageTime === input) {
          matchedImage = image
          break
        }
      } else {
        // 匹配消息ID
        if (Array.isArray(image.messageId) && image.messageId.includes(input)) {
          matchedImage = image
          break
        }
        // 处理 messageId 是空字符串的情况
        if (image.messageId.length === 0 && image.messageTime === input) {
          matchedImage = image
          break
        }
      }
    }
    // 返回匹配的背景图URL
    if (matchedImage) {
      return matchedImage.backgroundURL
    } else {
      // 如果未找到对应的URL，返回null
      return null
    }
  } catch (error) {
    ctx.logger.error('读取或解析JSON文件时出错: ', error)
    throw error
  }
}

/**
 * 删除图片记录
 */
export async function deleteImageRecord(
  ctx: Context,
  jsonFilePath: string,
  messageId: string,
  imageURL: string,
  logInfo: (...args: any[]) => void
): Promise<void> {
  try {
    const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'))
    const index = data.findIndex(record => record.messageId.includes(messageId) && record.backgroundURL === imageURL)
    if (index !== -1) {
      data.splice(index, 1)
      fs.writeFileSync(jsonFilePath, JSON.stringify(data, null, 2), 'utf-8')
      logInfo(`已删除消息ID ${messageId} 的记录`)
    }
  } catch (error) {
    ctx.logger.error("删除记录时出错: ", error)
  }
}