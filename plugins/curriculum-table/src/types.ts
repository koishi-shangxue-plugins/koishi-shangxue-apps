
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

export const TABLE_NAME = 'curriculumtable_v2' as const

export type LogInfoFn = (msg: string, ...rest: unknown[]) => void

declare module 'koishi' {
  interface Tables {
    curriculumtable_v2: CurriculumTable
  }
}
