import type {
  ApiResult,
  CurriculumBotInfo,
  CurriculumCourseInput,
  CurriculumCourseV2,
  CurriculumPushInput,
  CurriculumPushV2,
  CurriculumScheduleInput,
  CurriculumScheduleV2,
  CurriculumWebState,
} from '../src/types'

export type {
  ApiResult,
  CurriculumBotInfo,
  CurriculumCourseInput,
  CurriculumCourseV2,
  CurriculumPushInput,
  CurriculumPushV2,
  CurriculumScheduleInput,
  CurriculumScheduleV2,
  CurriculumWebState,
}

declare module '@koishijs/plugin-console' {
  interface Events {
    'curriculum-table/state'(): Promise<CurriculumWebState>
    'curriculum-table/schedule/save'(input: CurriculumScheduleInput): Promise<ApiResult<CurriculumScheduleV2>>
    'curriculum-table/schedule/delete'(id: number): Promise<ApiResult>
    'curriculum-table/course/save'(input: CurriculumCourseInput): Promise<ApiResult<CurriculumCourseV2>>
    'curriculum-table/course/delete'(id: number): Promise<ApiResult>
    'curriculum-table/push/save'(input: CurriculumPushInput): Promise<ApiResult<CurriculumPushV2>>
    'curriculum-table/push/delete'(id: number): Promise<ApiResult>
  }
}

export type ScheduleDraft = Omit<CurriculumScheduleV2, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: number
}

export type CourseDraft = Omit<CurriculumCourseV2, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: number
}

export type PushDraft = Omit<CurriculumPushV2, 'id' | 'lastPushAt' | 'createdAt' | 'updatedAt'> & {
  id?: number
  lastPushAt?: string
}
