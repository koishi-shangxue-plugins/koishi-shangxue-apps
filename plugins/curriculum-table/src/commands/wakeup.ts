
import type { Context } from 'koishi'
import type { Config } from '../config'
import type { CurriculumTable, LogInfoFn } from '../types'
import { TABLE_NAME } from '../types'
import { calculateDate, resolveTargetUser } from '../utils'

export function registerWakeupCommand(ctx: Context, config: Config, logInfo: LogInfoFn): void {
  ctx.command(`${config.baseCommand}.${config.importWakeupCommand} <param:text>`)
    .option('target', '-t <target:text> 指定用户（请直接@目标用户）')
    .example(`${config.importWakeupCommand} 这是来自「WakeUp课程表」的课表分享......分享口令为「PaJ_8Kj_zeelspJs2HBL1」`)
    .action(async ({ session, options }, param) => {
      if (!param) {
        await session.send('请输入wakeup课程表分享口令：')
        param = await session.prompt(config.interactionTimeoutSeconds * 1000)
      }
      const keyMatch = param.match(/分享口令为「(.*?)」/)
      if (!keyMatch) return '未检测到分享口令，请检查输入格式。'
      const shareKey = keyMatch[1]

      const apiUrl = `https:
      const headers = {
        Connection: 'keep-alive',
        'Accept-Encoding': 'gzip',
        'User-Agent': 'okhttp/4.12.0',
        'Content-Type': 'application/json',
        version: '248',
        Host: 'i.wakeup.fun',
      }

      try {
        const response = await ctx.http.get(apiUrl, { headers })
        logInfo('WakeUp API 请求:', apiUrl)

        if (response?.status !== 1 || !response?.data) {
          return `WakeUp API 请求失败: ${String(response?.message ?? '未知错误')}`
        }

        const dataString = (response.data as string).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        const jsonStrings = dataString.trim().split('\n')

        if (jsonStrings.length < 5) {
          return 'API响应数据格式错误，缺少必要的JSON部分。'
        }

        let timeTable: { node: number; startTime: string; endTime: string }[]
        let courseInfos: { id: number; courseName: string }[]
        let courseDetails: { id: number; day: number; startNode: number; step: number; startWeek: number; endWeek: number; ownTime?: boolean }[]
        let tableInfo: { startDate: string }

        try {
          timeTable = JSON.parse(jsonStrings[1])
          tableInfo = JSON.parse(jsonStrings[2])
          courseInfos = JSON.parse(jsonStrings[3])
          courseDetails = JSON.parse(jsonStrings[4])
        } catch (parseError) {
          ctx.logger.error('解析JSON失败:', parseError)
          return 'API响应数据解析失败，请检查数据格式。'
        }

        const termStartDate = tableInfo.startDate
        if (!termStartDate) return 'API响应数据中缺少学期开始日期 (startDate)。'

        const targetUser = await resolveTargetUser(session, options.target)

        const weekdayMap: Record<number, string> = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' }
        const coursesToInsert: Omit<CurriculumTable, 'id'>[] = []
        const uniqueKeys = new Set<string>()

        for (const detail of courseDetails) {
          if (detail.ownTime) continue
          const courseInfo = courseInfos.find(info => info.id === detail.id)
          if (!courseInfo) continue

          const weekday = weekdayMap[detail.day]
          let startTime = ''
          let endTime = ''
          for (let i = detail.startNode; i < detail.startNode + detail.step; i++) {
            const slot = timeTable.find(s => s.node === i)
            if (slot) {
              if (!startTime) startTime = slot.startTime
              endTime = slot.endTime
            }
          }
          const curriculumtime = `${startTime.slice(0, 5)}-${endTime.slice(0, 5)}`
          const courseStartDate = calculateDate(termStartDate, detail.startWeek)
          const courseEndDate = calculateDate(termStartDate, detail.endWeek, true)

          const key = `${targetUser.userId}-${courseInfo.courseName}-${weekday}-${curriculumtime}-${courseStartDate}-${courseEndDate}`
          if (!uniqueKeys.has(key)) {
            uniqueKeys.add(key)
            coursesToInsert.push({
              channelId: session.channelId,
              userid: targetUser.userId,
              username: targetUser.username,
              useravatar: targetUser.useravatar,
              curriculumname: courseInfo.courseName,
              curriculumndate: [weekday],
              curriculumtime,
              startDate: courseStartDate,
              endDate: courseEndDate,
            })
          }
        }

        let importedCount = 0
        let details = ''
        for (const data of coursesToInsert) {
          try {
            await ctx.database.create(TABLE_NAME, data)
            importedCount++
            details += `\n${data.curriculumname} (${data.curriculumndate[0]} ${data.curriculumtime})`
          } catch (dbErr) {
            ctx.logger.error('导入课程到数据库失败:', dbErr)
          }
        }

        if (importedCount > 0) {
          if (config.autoDeduplicateOnImport) await session.execute(config.deduplicateCoursesCommand)
          return `已成功导入 ${importedCount} 门课程：${details}`
        } else {
          return '课程表导入完成，但没有可导入的新课程（可能已全部导入或数据异常）。'
        }
      } catch (apiError) {
        if (apiError instanceof Error && apiError.message === 'INVALID_TARGET_USER') {
          return '指定用户参数无效，请直接@目标用户，或省略该参数为自己导入。'
        }
        ctx.logger.error('WakeUp API 请求失败:', apiError)
        return '导入课程表失败，请检查网络或稍后重试。'
      }
    })
}
