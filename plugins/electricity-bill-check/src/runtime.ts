import fetch from 'node-fetch'
import type { Context } from 'koishi'
import { formatShanghaiTime, getNextShanghaiNoon } from './time'
import type {
  Config,
  QueryTask,
  RuntimeLogger,
  TaskExecutionResult,
  TaskStatusSnapshot,
  TaskTrigger,
} from './types'

export class ElectricityBillRuntime {
  // 这些状态只保存在内存里，热重载后会重新建立。
  private readonly lastResults = new Map<string, number>()
  private readonly lastAttemptTimes = new Map<string, Date>()
  private readonly lastSuccessTimes = new Map<string, Date>()
  private readonly timers = new Map<string, () => void>()
  private readonly nextRunTimes = new Map<string, Date>()
  private readonly runningTasks = new Set<string>()
  private stopped = false

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
    private readonly logger: RuntimeLogger
  ) {}

  start() {
    this.stopped = false

    this.config.tasks.forEach((task, index) => {
      this.scheduleTask(task, index)
    })
  }

  stop() {
    if (this.stopped) {
      return
    }

    this.stopped = true

    for (const [taskKey, dispose] of this.timers) {
      dispose()
      this.logger.debug(`[${taskKey}] 已停止定时器`)
    }

    this.timers.clear()
    this.nextRunTimes.clear()
  }

  async runManualCheck() {
    if (this.config.tasks.length === 0) {
      return '未配置任何查询任务。'
    }

    const lines: string[] = ['正在执行电费查询...', '']

    for (let index = 0; index < this.config.tasks.length; index += 1) {
      const task = this.config.tasks[index]

      if (!task.enabled) {
        lines.push(`任务 ${index + 1}: 已禁用`)
        continue
      }

      const result = await this.executeTaskWithRetry(task, index, 'manual')
      lines.push(this.formatManualResult(index, result))
    }

    return lines.join('\n')
  }

  getStatusText() {
    if (this.config.tasks.length === 0) {
      return '未配置任何查询任务。'
    }

    let message = '电费查询状态\n\n'

    this.config.tasks.forEach((task, index) => {
      const status = this.getTaskStatus(index, task)

      message += `任务 ${index + 1}: ${status.enabled ? '运行中' : '已禁用'}\n`
      message += `  每日执行时间: 12:00（Asia/Shanghai）\n`
      message += `  最大重试次数: ${status.maxRetries}\n`
      message += `  下次执行时间: ${status.nextRunAt ? formatShanghaiTime(status.nextRunAt) : '暂无'}\n`
      message += `  上次请求时间: ${status.lastAttemptAt ? formatShanghaiTime(status.lastAttemptAt) : '暂无'}\n`
      message += `  上次成功时间: ${status.lastSuccessAt ? formatShanghaiTime(status.lastSuccessAt) : '暂无'}\n`
      message += `  上次结果: ${status.lastValue ?? '暂无'}\n`
      message += `  当前执行中: ${status.running ? '是' : '否'}\n`
      message += `  Bot: ${status.botId}\n`
      message += `  群 / 频道: ${status.channelId}\n\n`
    })

    return message
  }

  private formatManualResult(taskIndex: number, result: TaskExecutionResult) {
    if (result.success) {
      const suffix = result.notificationSent === false ? '，但播报失败' : ''
      return `任务 ${taskIndex + 1}: 查询成功，结果 ${result.value}${suffix}`
    }

    return `任务 ${taskIndex + 1}: 查询失败，已尝试 ${result.attempts} 次，原因: ${result.error}`
  }

  private getTaskStatus(taskIndex: number, task: QueryTask): TaskStatusSnapshot {
    const taskKey = this.getTaskKey(taskIndex)

    return {
      enabled: task.enabled,
      running: this.runningTasks.has(taskKey),
      maxRetries: task.maxRetries,
      lastValue: this.lastResults.get(taskKey),
      lastAttemptAt: this.lastAttemptTimes.get(taskKey),
      lastSuccessAt: this.lastSuccessTimes.get(taskKey),
      nextRunAt: this.nextRunTimes.get(taskKey),
      botId: task.botId,
      channelId: task.channelId,
    }
  }

  private scheduleTask(task: QueryTask, taskIndex: number) {
    const taskKey = this.getTaskKey(taskIndex)
    this.clearTaskTimer(taskKey)

    if (this.stopped) {
      return
    }

    if (!task.enabled) {
      this.logger.debug(`[${taskKey}] 任务已禁用，跳过调度`)
      return
    }

    const nextRun = getNextShanghaiNoon()
    const delay = Math.max(nextRun.getTime() - Date.now(), 0)
    const dispose = this.ctx.setTimeout(() => {
      this.timers.delete(taskKey)
      this.nextRunTimes.delete(taskKey)
      void this.handleScheduledTask(task, taskIndex)
    }, delay)

    this.timers.set(taskKey, dispose)
    this.nextRunTimes.set(taskKey, nextRun)
    this.logger.info(`[${taskKey}] 已计划于 ${formatShanghaiTime(nextRun)} 执行每日查询`)
  }

  private clearTaskTimer(taskKey: string) {
    const dispose = this.timers.get(taskKey)
    if (!dispose) {
      return
    }

    dispose()
    this.timers.delete(taskKey)
    this.nextRunTimes.delete(taskKey)
  }

  private async handleScheduledTask(task: QueryTask, taskIndex: number) {
    try {
      await this.executeTaskWithRetry(task, taskIndex, 'schedule')
    } finally {
      if (!this.stopped) {
        this.scheduleTask(task, taskIndex)
      }
    }
  }

  private async executeTaskWithRetry(
    task: QueryTask,
    taskIndex: number,
    trigger: TaskTrigger
  ): Promise<TaskExecutionResult> {
    const taskKey = this.getTaskKey(taskIndex)
    if (this.runningTasks.has(taskKey)) {
      const error = '任务正在执行中，本次触发已跳过'
      this.logger.debug(`[${taskKey}] ${error}`)
      return { success: false, attempts: 0, error }
    }

    this.runningTasks.add(taskKey)
    const totalAttempts = task.maxRetries + 1
    let lastError = '未知错误'

    try {
      for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        if (this.stopped) {
          return {
            success: false,
            attempts: attempt - 1,
            error: '插件已停止',
          }
        }

        this.lastAttemptTimes.set(taskKey, new Date())
        this.logger.info(
          `[${taskKey}] 开始执行${trigger === 'manual' ? '手动' : '每日'}查询，第 ${attempt}/${totalAttempts} 次尝试`
        )

        try {
          const previousValue = this.lastResults.get(taskKey)
          const currentValue = await this.requestCurrentValue(task, taskIndex)

          this.lastResults.set(taskKey, currentValue)
          this.lastSuccessTimes.set(taskKey, new Date())

          const notificationSent = await this.sendReport(
            task,
            taskIndex,
            currentValue,
            previousValue,
            trigger,
            attempt
          )

          return {
            success: true,
            attempts: attempt,
            value: currentValue,
            notificationSent,
            error: notificationSent ? undefined : '查询成功，但播报失败',
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
          this.logger.warn(`[${taskKey}] 第 ${attempt}/${totalAttempts} 次尝试失败: ${lastError}`)

          if (attempt <= task.maxRetries) {
            const delay = task.retryDelaySeconds * 1000
            this.logger.debug(`[${taskKey}] ${task.retryDelaySeconds} 秒后继续重试`)

            try {
              await this.ctx.sleep(delay)
            } catch (sleepError) {
              lastError = sleepError instanceof Error ? sleepError.message : String(sleepError)
              break
            }
          }
        }
      }

      this.logger.error(`[${taskKey}] 查询失败，已达到最大重试次数: ${task.maxRetries}`)
      return {
        success: false,
        attempts: totalAttempts,
        error: lastError,
      }
    } finally {
      this.runningTasks.delete(taskKey)
    }
  }

  private async requestCurrentValue(task: QueryTask, taskIndex: number) {
    const taskKey = this.getTaskKey(taskIndex)
    this.logger.debug(`[${taskKey}] 开始请求电费页面`)

    const response = await fetch(this.resolveRequestUrl(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: task.requestTimeoutSeconds * 1000,
    })

    if (!response.ok) {
      throw new Error(`HTTP 请求失败: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    this.logger.debug(`[${taskKey}] 页面长度: ${html.length}`)

    const match = html.match(new RegExp(task.regex))
    if (!match || !match[1]) {
      throw new Error(`正则匹配失败，当前正则: ${task.regex}`)
    }

    const value = Number.parseFloat(match[1])
    if (Number.isNaN(value)) {
      throw new Error(`提取结果无法解析为数字: ${match[1]}`)
    }

    this.logger.debug(`[${taskKey}] 本次查询结果: ${value}`)
    return value
  }

  private async sendReport(
    task: QueryTask,
    taskIndex: number,
    currentValue: number,
    previousValue: number | undefined,
    trigger: TaskTrigger,
    attempt: number
  ) {
    const taskKey = this.getTaskKey(taskIndex)
    const bot = this.findTaskBot(task, taskKey)
    if (!bot) {
      return false
    }

    const message = this.createReportMessage(currentValue, previousValue, trigger, attempt)

    try {
      await bot.sendMessage(task.channelId, message)
      this.logger.info(`[${taskKey}] 已播报到 ${task.channelId}`)
      return true
    } catch (error) {
      this.logger.error(`[${taskKey}] 播报失败`, error)
      return false
    }
  }

  private findTaskBot(task: QueryTask, taskKey: string) {
    const bot = this.ctx.bots.find((item) => item.sid === task.botId || item.selfId === task.botId)

    if (!bot) {
      const botList = this.ctx.bots.map((item) => `${item.sid}(${item.selfId})`).join(', ')
      this.logger.warn(`[${taskKey}] 未找到 Bot: ${task.botId}`)
      this.logger.warn(`[${taskKey}] 当前可用 Bot: ${botList}`)
    }

    return bot
  }

  private createReportMessage(
    currentValue: number,
    previousValue: number | undefined,
    trigger: TaskTrigger,
    attempt: number
  ) {
    const triggerText = trigger === 'manual' ? '手动触发' : '每日定时'

    return [
      '电费查询播报',
      '',
      `当前结果: ${currentValue}`,
      `上次结果: ${previousValue ?? '暂无'}`,
      `变化情况: ${this.describeChange(currentValue, previousValue)}`,
      `触发方式: ${triggerText}`,
      `成功尝试: 第 ${attempt} 次`,
      `查询时间: ${formatShanghaiTime(new Date())}`,
    ].join('\n')
  }

  private describeChange(currentValue: number, previousValue: number | undefined) {
    if (previousValue === undefined) {
      return '首次播报'
    }

    if (currentValue === previousValue) {
      return '无变化'
    }

    if (currentValue > previousValue) {
      return `增加 ${(currentValue - previousValue).toFixed(2)}`
    }

    return `减少 ${(previousValue - currentValue).toFixed(2)}`
  }

  private resolveRequestUrl() {
    // 地址拆开写，避免在配置项里直接暴露。
    return [
      'https://epay.czu.cn',
      '/wechat/h5/eleresult',
      '?sysid=1',
      '&roomid=14970',
      '&areaid=1',
      '&buildid=19',
      '&buildname=%E8%8F%81%E5%9B%AD%E5%85%AC%E5%AF%935%E5%8F%B7-D',
      '&roomname=514',
    ].join('')
  }

  private getTaskKey(taskIndex: number) {
    return `task-${taskIndex}`
  }
}
