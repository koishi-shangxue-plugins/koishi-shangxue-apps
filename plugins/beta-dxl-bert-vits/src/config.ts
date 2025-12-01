import { Schema, Logger } from 'koishi'
import { loadSpeakersData } from './constants'

export const usage = `
开启插件，然后使用指令输入你想要转语音的文字吧！

---


<a href="https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/beta-dxl-bert-vits" target="_blank">更多说明，请点我前往查看 Readme</a>
`

export interface Config {
    loggerinfo: boolean
    speaker: string
    sdp_ratio: number
    noise: number
    noisew: number
    length: number
    prompt: string
    weight: number
}

const { SpeakersList } = loadSpeakersData(new Logger('beta-dxl-bert-vits'))

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        speaker: Schema.union(SpeakersList).description('选择一个模型').default(SpeakersList[0] ?? ''),
    }).description('基础设置'),

    Schema.object({
        prompt: Schema.union(['Happy', 'Sad', 'Angry', 'Neutral']).description('选择一个预设的生成风格').default('Happy'),
        sdp_ratio: Schema.number().min(0).max(1).step(0.1).role('slider').description('SDP/DP混合比').default(0.5),
        noise: Schema.number().min(0.1).max(2).step(0.1).role('slider').description('感情').default(0.6),
        noisew: Schema.number().min(0.1).max(2).step(0.1).role('slider').description('音素长度').default(0.9),
        length: Schema.number().min(0.1).max(2).step(0.1).role('slider').description('语速').default(1),
        weight: Schema.number().min(0).max(1).step(0).role('slider').description('主文本和辅助文本的混合比率').default(0.7),
    }).description('进阶设置（不一定会生效）'),

    Schema.object({
        loggerinfo: Schema.boolean().default(false).description('日志调试模式`日常使用无需开启`'),
    }).description('调试设置'),
])