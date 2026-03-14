import { Schema } from 'koishi'

export type IntervalConfig =
  | { unit: 'hours'; value: number }
  | { unit: 'days'; value: number }

export interface Config {
  intervalMode: 'daily' | 'custom'
  dailyTime?: string
  intervalConfig?: IntervalConfig
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    intervalMode: Schema.union([
      Schema.const('daily').description('每日重启'),
      Schema.const('custom').description('自定义间隔重启'),
    ]).default('daily')
      .description('重启模式'),
  }).description('定时配置'),
  Schema.union([
    Schema.object({
      intervalMode: Schema.const('daily'),
      dailyTime: Schema.string().role('time').default("03:00:00").description('每天定时重启的时间点'),
    }),
    Schema.object({
      intervalMode: Schema.const('custom').required(),
      intervalConfig: Schema.union([
        Schema.object({
          unit: Schema.const('hours').required(),
          value: Schema.number().min(1).default(24).description('间隔时长（小时）'),
        }).description('小时'),
        Schema.object({
          unit: Schema.const('days').required(),
          value: Schema.number().min(1).default(1).description('间隔时长（天）'),
        }).description('天'),
      ]).default({ unit: 'hours', value: 24 }).description('重启间隔单位与时长'),
    }),
  ]),
])
