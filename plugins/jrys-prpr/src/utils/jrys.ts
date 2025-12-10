import crypto from 'node:crypto'
import { Random } from 'koishi'
import type { Session } from 'koishi'
import jrys_json from './../../data/jrys.json'
import { defaultFortuneProbability } from '../constants'
import type { JrysData, Config } from '../types'

/**
 * 获取今日运势数据
 */
export async function getJrys(session: Session, config: Config, logInfo: (...args: any[]) => void): Promise<JrysData> {
  const md5 = crypto.createHash('md5')
  const hash = crypto.createHash('sha256')
  // 获取当前时间
  let now = new Date()
  let etime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() // 使用当天的0点时间戳
  let userId
  // 获取用户ID
  if (!isNaN(Number(session.event.user.id))) {
    userId = session.event.user.id
  } else if (session.event.user.id) {
    hash.update(session.event.user.id + String(etime))
    const hashHexDigest = hash.digest('hex')
    userId = Number(parseInt(hashHexDigest, 16)) % 1000000001
  } else {
    md5.update(session.username + String(etime))
    const hexDigest = md5.digest('hex')
    userId = parseInt(hexDigest, 16) % 1000000001
  }
  // 获取运势概率表
  let fortuneProbabilityTable = config.FortuneProbabilityAdjustmentTable || defaultFortuneProbability
  // 检查所有概率是否都为0，如果是则使用默认配置
  const allProbabilitiesZero = fortuneProbabilityTable.every(entry => entry.Probability === 0)
  if (allProbabilitiesZero) {
    fortuneProbabilityTable = defaultFortuneProbability
  }
  // 使用种子来确保随机结果的一致性
  const seedInput = String(userId) + String(etime) + now.toDateString() // 加入当前日期字符串
  const seed = parseInt(md5.update(seedInput).digest('hex').slice(0, 8), 16)
  const random = new Random(() => (seed / 0xffffffff))
  // 使用 Random.weightedPick 选择运势
  const weights = {}
  fortuneProbabilityTable.forEach(entry => {
    if (entry.Probability > 0) {
      weights[entry.luckValue] = entry.Probability
    }
  })
  const fortuneCategory = random.weightedPick(weights)
  const todayJrys = (jrys_json as Record<string, JrysData[]>)[fortuneCategory]
  // 随机选择当前幸运值类别下的一个文案
  const randomIndex = (((etime / 100000) * userId % 1000001) * 2333) % todayJrys.length
  logInfo(`今日运势文案:\n ${JSON.stringify(todayJrys[randomIndex], null, 2)}`)
  return new Promise(resolve => {
    resolve(todayJrys[randomIndex])
  })
}

/**
 * 获取格式化的日期字符串
 */
export async function getFormattedDate(logInfo: (...args: any[]) => void): Promise<string> {
  // 获取当前时间
  const today = new Date()

  logInfo(`使用时区日期: ${today}`)
  let year = today.getFullYear()  // 获取年份
  let month = today.getMonth() + 1  // 获取月份，月份是从0开始的，所以需要加1
  let day = today.getDate()  // 获取日
  logInfo(year)
  logInfo(month)
  logInfo(day)
  // 格式化日期
  const monthStr = month < 10 ? '0' + month : month.toString()
  const dayStr = day < 10 ? '0' + day : day.toString()
  let formattedDate = `${year}/${monthStr}/${dayStr}`
  logInfo(formattedDate)
  return formattedDate
}