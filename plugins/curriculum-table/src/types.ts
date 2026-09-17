  /** V2 课表主体，一行代表某个平台群组内某位用户的一份课表。 */
export interface CurriculumScheduleV2 {
  id: number
  name: string
  platform: string
  botId: string
  guildId: string
  channelId: string
  userId: string
  username: string
  userAvatar: string
  termStartDate: string
  termEndDate: string
  createdAt: number
  updatedAt: number
}

/** V2 课程卡片，星期、时间和合并范围决定它在编辑器中的位置及大小。 */
export interface CurriculumCourseV2 {
  id: number
  scheduleId: number
  name: string
  weekday: number
  /** 课程横向合并范围，单列课程时与 weekday 相同。 */
  weekdayEnd: number
  startTime: string
  endTime: string
  stackIndex: number
  createdAt: number
  updatedAt: number
}

/** V2 推送闹钟，始终汇总目标群组内全部课表。 */
export interface CurriculumPushV2 {
  id: number
  name: string
  platform: string
  botId: string
  guildId: string
  channelId: string
  weekdays: number[]
  dayOffset: number
  pushTime: string
  sendWhenEmpty: boolean
  enabled: boolean
  lastPushAt: string
  createdAt: number
  updatedAt: number
}

/** 查询课程时展开的用户与课表信息，兼容原有渲染流程。 */
export interface CurriculumCourseView {
  id: number
  scheduleId: number
  scheduleName: string
  channelId: string
  guildId: string
  userid: string
  username: string
  useravatar: string
  curriculumndate: string[]
  curriculumname: string
  curriculumtime: string
  startDate: string
  endDate: string
}

export type CurriculumScheduleInput = Omit<
  CurriculumScheduleV2,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: number }

export type CurriculumCourseInput = Omit<
  CurriculumCourseV2,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: number }

export type CurriculumPushInput = Omit<
  CurriculumPushV2,
  'id' | 'lastPushAt' | 'createdAt' | 'updatedAt'
> & { id?: number }

export interface CurriculumBotInfo {
  id: string
  name: string
  platform: string
  selfId: string
  status: number
}

export interface CurriculumWebState {
  schedules: CurriculumScheduleV2[]
  courses: CurriculumCourseV2[]
  pushes: CurriculumPushV2[]
  bots: CurriculumBotInfo[]
}

export interface ApiResult<T = undefined> {
  success: boolean
  message?: string
  data?: T
}

export const SCHEDULE_TABLE = 'curriculum_schedule_v2' as const
export const COURSE_TABLE = 'curriculum_course_v2' as const
export const PUSH_TABLE = 'curriculum_push_v2' as const

declare module 'koishi' {
  interface Tables {
    curriculum_schedule_v2: CurriculumScheduleV2
    curriculum_course_v2: CurriculumCourseV2
    curriculum_push_v2: CurriculumPushV2
  }
}
