import fetch from 'node-fetch'
import type { Context } from 'koishi'
import { formatShanghaiTime, getNextShanghaiNoon } from './time'
import type {
  Config,
  QueryResult,
  RuntimeLogger,
  TaskExecutionResult,
  TaskTrigger,
} from './types'

export class ElectricityBillRuntime {
  // 定时器和运行状态只保存在内存里。
  private timerDispose?: () => void
  private running = false
  private stopped = false

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly logger: RuntimeLogger
  ) {}

  start() {
    this.stopped = false
    this.scheduleDailyBroadcast()
  }

  stop() {
    if (this.stopped) {
      return
    }

    this.stopped = true
    this.clearTimer()
  }

  async runManualCheck() {
    const result = await this.executeTaskWithRetry('manual')

    if (result.success) {
      return result.resultText ?? '查询成功，但未提取到结果文本'
    }

    return `查询失败，已尝试 ${result.attempts} 次，原因: ${result.error}`
  }

  private scheduleDailyBroadcast() {
    this.clearTimer()

    if (this.stopped) {
      return
    }

    if (!this.config.enabled) {
      this.logger.debug('已禁用每日定时播报，跳过调度')
      return
    }

    const nextRun = getNextShanghaiNoon()
    const delay = Math.max(nextRun.getTime() - Date.now(), 0)

    this.timerDispose = this.ctx.setTimeout(() => {
      this.timerDispose = undefined
      void this.handleScheduledBroadcast()
    }, delay)

    this.logger.info(`已计划于 ${formatShanghaiTime(nextRun)} 执行每日查询`)
  }

  private clearTimer() {
    if (!this.timerDispose) {
      return
    }

    this.timerDispose()
    this.timerDispose = undefined
    this.logger.debug('已停止每日定时器')
  }

  private async handleScheduledBroadcast() {
    try {
      const result = await this.executeTaskWithRetry('schedule')

      if (result.success && result.resultText) {
        await this.sendBroadcastMessage(result.resultText)
      }
    } finally {
      if (!this.stopped) {
        this.scheduleDailyBroadcast()
      }
    }
  }

  private async executeTaskWithRetry(trigger: TaskTrigger): Promise<TaskExecutionResult> {
    if (this.running) {
      const error = '任务正在执行中，本次触发已跳过'
      this.logger.debug(error)
      return { success: false, attempts: 0, error }
    }

    this.running = true
    const totalAttempts = this.config.maxRetries + 1
    let lastError = '未知错误'

    try {
      for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        if (this.stopped && trigger === 'schedule') {
          return {
            success: false,
            attempts: attempt - 1,
            error: '插件已停止',
          }
        }

        this.logger.info(`开始执行${trigger === 'manual' ? '手动' : '每日'}查询，第 ${attempt}/${totalAttempts} 次尝试`)

        try {
          const result = await this.requestCurrentValue()

          return {
            success: true,
            attempts: attempt,
            resultText: result.text,
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
          this.logger.warn(`第 ${attempt}/${totalAttempts} 次尝试失败: ${lastError}`)

          if (attempt <= this.config.maxRetries) {
            this.logger.debug(`${this.config.retryDelaySeconds} 秒后继续重试`)

            try {
              await this.ctx.sleep(this.config.retryDelaySeconds * 1000)
            } catch (sleepError) {
              lastError = sleepError instanceof Error ? sleepError.message : String(sleepError)
              break
            }
          }
        }
      }

      this.logger.error(`查询失败，已达到最大重试次数: ${this.config.maxRetries}`)
      return {
        success: false,
        attempts: totalAttempts,
        error: lastError,
      }
    } finally {
      this.running = false
    }
  }

  private async requestCurrentValue(): Promise<QueryResult> {
    this.logger.debug('开始请求电费页面')

    const response = await fetch(this.config.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: this.config.requestTimeoutSeconds * 1000,
    })

    if (!response.ok) {
      throw new Error(`HTTP 请求失败: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    this.logger.debug(`页面长度: ${html.length}`)

    const match = html.match(new RegExp(this.config.regex))
    if (!match || !match[1]) {
      throw new Error(`正则匹配失败，当前正则: ${this.config.regex}`)
    }

    const resultText = match[1].trim()
    this.logger.debug(`本次查询结果: ${resultText}`)

    return { text: resultText }
  }

  private async sendBroadcastMessage(resultText: string) {
    const bot = this.findTaskBot()
    if (!bot) {
      return
    }

    try {
      // 定时播报直接发送匹配到的结果文本。
      await bot.sendMessage(this.config.channelId, resultText)
      this.logger.info(`已播报到 ${this.config.channelId}`)
    } catch (error) {
      this.logger.error('播报失败', error)
    }
  }

  private findTaskBot() {
    const bot = this.ctx.bots.find((item) => item.sid === this.config.botId || item.selfId === this.config.botId)

    if (!bot) {
      const botList = this.ctx.bots.map((item) => `${item.sid}(${item.selfId})`).join(', ')
      this.logger.warn(`未找到 Bot: ${this.config.botId}`)
      this.logger.warn(`当前可用 Bot: ${botList}`)
    }

    return bot
  }
}
