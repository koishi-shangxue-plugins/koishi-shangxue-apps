// 运势数据接口
export interface JrysData {
  fortuneSummary: string
  luckyStar: string
  signText: string
  unsignText: string
  luckValue: number
}

// 运势概率配置
export interface FortuneProbability {
  Fortune: string
  luckValue: number
  Probability: number
}

// 插件配置类型
export interface Config {
  command: string
  command2: string
  GetOriginalImageCommand: boolean
  autocleanjson: boolean
  Checkin_HintText: string | 'unset'
  recallCheckin_HintText: boolean
  GetOriginalImage_Command_HintText: '1' | '2' | '3'
  FortuneProbabilityAdjustmentTable: FortuneProbability[]
  BackgroundURL: string[]
  screenshotquality: number
  HTML_setting: {
    UserNameColor: string
    MaskColor: string
    Maskblurs: number
    HoroscopeTextColor: string
    luckyStarGradientColor: boolean
    HoroscopeDescriptionTextColor: string
    DashedboxThickn: number
    Dashedboxcolor: string
    font: string
  }
  markdown_button_mode: 'unset' | 'json' | 'markdown' | 'markdown_raw_json' | 'raw' | 'raw_jrys'
  markdown_button_mode_initiative?: boolean
  markdown_button_mode_keyboard?: boolean
  QQchannelId?: string
  nested?: any
  enablecurrency: boolean
  currency: string
  maintenanceCostPerUnit: number
  retryexecute: boolean
  maxretrytimes?: number
  Repeated_signin_for_different_groups: boolean
  consoleinfo: boolean
}