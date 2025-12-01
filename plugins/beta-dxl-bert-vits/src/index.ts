import { Context, Logger } from 'koishi'
import { loadSpeakersData } from './constants'
import { betavits, betavitsService } from './service'
import { Config } from './config'

export * from './config'
export const usage = `
---

### 指令用法

\`\`\`
++betavits 你好啊，这是一段测试的模板语音
\`\`\`

---

如何添加新模型？

<a href="https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/beta-dxl-bert-vits)" target="_blank">请查看README.md</a>

---
`
const logger = new Logger('beta-dxl-bert-vits')

export function apply(ctx: Context, config: Config) {
    const { speakersMap, SpeakerIdMap } = loadSpeakersData(logger)

    const vits = new betavits(ctx, config, speakersMap, SpeakerIdMap)

    ctx.plugin(betavitsService, vits)

    ctx.command('betavits <text:text>', 'AIbetavits语音合成帮助')
        .option('speaker', '-s <speaker:string> 语音合成的讲者', {
            fallback: config.speaker,
        })
        .option('sdp_ratio', '-sr <sdp_ratio:number> 语音合成的SDP/DP混合比', {
            fallback: config.sdp_ratio,
        })
        .option('noise', '-n <noise:number> 语音合成的感情强度', {
            fallback: config.noise,
        })
        .option('noisew', '-nw <noisew:number> 语音合成的音素长度', {
            fallback: config.noisew,
        })
        .option('length', '-l <length:number> 语音合成语速', {
            fallback: config.length,
        })
        .option('prompt', '-p <prompt:string> 辅助语音合成的情感文本', {
            fallback: config.prompt,
        })
        .option('weight', '-w <weight:number> 主文本和辅助文本的混合比率', {
            fallback: config.weight,
        })
        .action(async ({ session, options }, text) => {
            if (!text) {
                await session.execute('betavits -h')
                return
            }

            if (config.loggerinfo) {
                logger.info(`传入的选项: ${JSON.stringify(options)}`)
            }

            try {
                return await vits.say(text, options)
            } catch (error) {
                logger.error(error)
                return '语音合成时出现问题。'
            }
        })
}

export const inject = {
    optional: ['translator'],
}
