import type { Context } from 'koishi'
import {
  COURSE_TABLE,
  PUSH_TABLE,
  SCHEDULE_TABLE,
  type CurriculumCourseInput,
  type CurriculumCourseV2,
  type CurriculumCourseView,
  type CurriculumPushInput,
  type CurriculumPushV2,
  type CurriculumScheduleInput,
  type CurriculumScheduleV2,
} from './types'
import { getLocalDate, normalizeTime, numberToWeekday } from './schedule'

export interface CourseViewQuery {
  channelId?: string
  scheduleId?: number
}

export class CurriculumDatabase {
  constructor(private readonly ctx: Context) {}

  /** 注册 V2 表结构。 */
  initialize(): void {
    this.ctx.model.extend(SCHEDULE_TABLE, {
      id: 'unsigned',
      name: 'string',
      platform: 'string',
      botId: 'string',
      guildId: 'string',
      channelId: 'string',
      userId: 'string',
      username: 'string',
      userAvatar: 'string',
      termStartDate: 'string',
      termEndDate: 'string',
      createdAt: 'unsigned',
      updatedAt: 'unsigned',
    }, {
      primary: 'id',
      autoInc: true,
    })

    this.ctx.model.extend(COURSE_TABLE, {
      id: 'unsigned',
      scheduleId: 'unsigned',
      name: 'string',
      weekday: 'unsigned',
      weekdayEnd: 'unsigned',
      startTime: 'string',
      endTime: 'string',
      stackIndex: 'unsigned',
      createdAt: 'unsigned',
      updatedAt: 'unsigned',
    }, {
      primary: 'id',
      autoInc: true,
    })

    this.ctx.model.extend(PUSH_TABLE, {
      id: 'unsigned',
      name: 'string',
      platform: 'string',
      botId: 'string',
      guildId: 'string',
      channelId: 'string',
      weekdays: 'json',
      dayOffset: 'integer',
      pushTime: 'string',
      sendWhenEmpty: 'boolean',
      enabled: 'boolean',
      lastPushAt: 'string',
      createdAt: 'unsigned',
      updatedAt: 'unsigned',
    }, {
      primary: 'id',
      autoInc: true,
    })

  }

  async listSchedules(): Promise<CurriculumScheduleV2[]> {
    return this.ctx.database.get(SCHEDULE_TABLE, {})
  }

  async listCourses(): Promise<CurriculumCourseV2[]> {
    return this.ctx.database.get(COURSE_TABLE, {})
  }

  async listPushes(): Promise<CurriculumPushV2[]> {
    return this.ctx.database.get(PUSH_TABLE, {})
  }

  async getSchedule(id: number): Promise<CurriculumScheduleV2 | undefined> {
    const rows = await this.ctx.database.get(SCHEDULE_TABLE, { id })
    return rows[0]
  }

  async saveSchedule(input: CurriculumScheduleInput): Promise<CurriculumScheduleV2> {
    const now = Date.now()
    if (!input.channelId.trim()) throw new Error('请填写群组 ID')
    if (!input.userId.trim()) throw new Error('请填写用户 ID')
    const termStartDate = input.termStartDate || getLocalDate()
    const termEndDate = input.termEndDate || addDays(termStartDate, 139)
    const name = await this.uniqueScheduleName(
      input.name,
      input.channelId.trim(),
      input.id,
    )
    const normalized = {
      name,
      platform: input.platform.trim(),
      botId: input.botId.trim(),
      guildId: input.guildId.trim(),
      channelId: input.channelId.trim(),
      userId: input.userId.trim(),
      username: input.userId.trim(),
      userAvatar: input.userAvatar.trim(),
      termStartDate,
      termEndDate: termEndDate >= termStartDate ? termEndDate : addDays(termStartDate, 139),
      updatedAt: now,
    }

    if (input.id && input.id > 0) {
      await this.ctx.database.set(SCHEDULE_TABLE, { id: input.id }, normalized)
      const schedule = await this.getSchedule(input.id)
      if (!schedule) throw new Error('课表保存失败')
      return schedule
    }

    return this.ctx.database.create(SCHEDULE_TABLE, {
      ...normalized,
      createdAt: now,
    })
  }

  async deleteSchedule(id: number): Promise<void> {
    await this.ctx.database.remove(COURSE_TABLE, { scheduleId: id })
    await this.ctx.database.remove(SCHEDULE_TABLE, { id })
  }

  async saveCourse(input: CurriculumCourseInput): Promise<CurriculumCourseV2> {
    const now = Date.now()
    const startTime = normalizeTime(input.startTime) || '08:00'
    let endTime = normalizeTime(input.endTime) || '09:00'
    if (endTime <= startTime) endTime = addMinutes(startTime, 60)

    const normalized = {
      scheduleId: input.scheduleId,
      name: input.name.trim() || '未命名课程',
      weekday: Math.max(1, Math.min(7, Math.trunc(input.weekday))),
      weekdayEnd: Math.max(
        Math.max(1, Math.min(7, Math.trunc(input.weekday))),
        Math.max(1, Math.min(7, Math.trunc(input.weekdayEnd || input.weekday))),
      ),
      startTime,
      endTime,
      stackIndex: Math.max(0, Math.trunc(input.stackIndex || 0)),
      updatedAt: now,
    }

    if (input.id && input.id > 0) {
      await this.ctx.database.set(COURSE_TABLE, { id: input.id }, normalized)
      const rows = await this.ctx.database.get(COURSE_TABLE, { id: input.id })
      if (!rows[0]) throw new Error('课程保存失败')
      return rows[0]
    }

    return this.ctx.database.create(COURSE_TABLE, {
      ...normalized,
      createdAt: now,
    })
  }

  async deleteCourse(id: number): Promise<void> {
    await this.ctx.database.remove(COURSE_TABLE, { id })
  }

  async savePush(input: CurriculumPushInput): Promise<CurriculumPushV2> {
    const now = Date.now()
    if (!input.channelId.trim()) throw new Error('请填写群组 ID')
    if (!input.botId.trim() || !input.platform.trim()) {
      throw new Error('请选择机器人或填写机器人 ID 和平台名称')
    }
    const name = await this.uniquePushName(input.name, input.channelId.trim(), input.id)
    const normalized = {
      name,
      platform: input.platform.trim(),
      botId: input.botId.trim(),
      guildId: input.guildId.trim(),
      channelId: input.channelId.trim(),
      weekdays: normalizeWeekdays(input.weekdays),
      dayOffset: Math.max(-1, Math.min(1, Math.trunc(input.dayOffset || 0))),
      pushTime: normalizeTime(input.pushTime) || '07:30',
      sendWhenEmpty: input.sendWhenEmpty !== false,
      enabled: input.enabled !== false,
      updatedAt: now,
    }

    if (input.id && input.id > 0) {
      await this.ctx.database.set(PUSH_TABLE, { id: input.id }, normalized)
      const rows = await this.ctx.database.get(PUSH_TABLE, { id: input.id })
      if (!rows[0]) throw new Error('推送设置保存失败')
      return rows[0]
    }

    return this.ctx.database.create(PUSH_TABLE, {
      ...normalized,
      lastPushAt: '',
      createdAt: now,
    })
  }

  async deletePush(id: number): Promise<void> {
    await this.ctx.database.remove(PUSH_TABLE, { id })
  }

  async markPushRun(id: number, lastPushAt: string): Promise<void> {
    await this.ctx.database.set(PUSH_TABLE, { id }, {
      lastPushAt,
      updatedAt: Date.now(),
    })
  }

  async getCourseViews(query: CourseViewQuery = {}): Promise<CurriculumCourseView[]> {
    let schedules = await this.listSchedules()
    if (query.channelId) {
      schedules = schedules.filter(schedule => schedule.channelId === query.channelId)
    }
    if (query.scheduleId) {
      schedules = schedules.filter(schedule => schedule.id === query.scheduleId)
    }
    const views: CurriculumCourseView[] = []
    for (const schedule of schedules) {
      const courses = await this.ctx.database.get(COURSE_TABLE, {
        scheduleId: schedule.id,
      })
      for (const course of courses) {
        views.push({
          id: course.id,
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          channelId: schedule.channelId,
          guildId: schedule.guildId,
          userid: schedule.userId,
          username: schedule.username,
          useravatar: schedule.userAvatar,
          curriculumndate: Array.from(
            { length: Math.max(1, (course.weekdayEnd || course.weekday) - course.weekday + 1) },
            (_, index) => numberToWeekday(course.weekday + index),
          ),
          curriculumname: course.name,
          curriculumtime: `${course.startTime}-${course.endTime}`,
          startDate: schedule.termStartDate,
          endDate: schedule.termEndDate,
        })
      }
    }
    return views
  }

  private async uniqueScheduleName(
    rawName: string,
    channelId: string,
    excludeId?: number,
  ): Promise<string> {
    const rows = await this.ctx.database.get(SCHEDULE_TABLE, channelId ? { channelId } : {})
    return uniqueName(
      rawName.trim() || '新课程表',
      rows.filter(row => row.id !== excludeId).map(row => row.name),
    )
  }

  private async uniquePushName(
    rawName: string,
    channelId: string,
    excludeId?: number,
  ): Promise<string> {
    const rows = await this.ctx.database.get(PUSH_TABLE, channelId ? { channelId } : {})
    return uniqueName(
      rawName.trim() || '课表推送',
      rows.filter(row => row.id !== excludeId).map(row => row.name),
    )
  }
}

function uniqueName(rawName: string, existingNames: string[]): string {
  const names = new Set(existingNames)
  if (!names.has(rawName)) return rawName
  const match = rawName.match(/^(.*?)(?:\s*\((\d+)\))?$/)
  const base = (match?.[1] || rawName).trimEnd()
  let index = Number(match?.[2] || 1) + 1
  while (names.has(`${base} (${index})`)) index++
  return `${base} (${index})`
}

function addMinutes(time: string, minutes: number): string {
  const [hour, minute] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00`)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeWeekdays(weekdays: number[]): number[] {
  if (!Array.isArray(weekdays)) return []
  return [...new Set(weekdays.map(day => Math.trunc(Number(day))).filter(day => day >= 1 && day <= 7))]
}
