/**
 * types.ts - 共享类型定义
 */

/** 课程表数据库记录结构 */
export interface CurriculumTable {
  id: number
  channelId: string
  userid: string
  username: string
  useravatar: string
  curriculumndate: string[]
  curriculumname: string
  curriculumtime: string
  startDate: string
  endDate: string
}

/** 数据表名（v2 防止与旧版冲突） */
export const TABLE_NAME = 'curriculumtable_v2' as const

/** 调试日志函数类型 */
export type LogInfoFn = (msg: string, ...rest: unknown[]) => void

declare module 'koishi' {
  interface Tables {
    curriculumtable_v2: CurriculumTable
  }
}
