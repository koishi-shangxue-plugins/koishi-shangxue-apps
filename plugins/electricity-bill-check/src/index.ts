import { Context, Logger, Schema } from 'koishi'
import fetch from 'node-fetch'

export const name = 'electricity-bill-check'
export const reusable = true
export const filter = false

export const inject = {
  optional: [],
  required: []
}

export const usage = `
## 电费查询插件

定时查询电费余额，当余额变动时自动通知到指定频道。

### 功能特性
- 定时HTTP请求获取电费信息
- 正则表达式匹配电费数据
- 智能变动检测（可设置变动阈值）
- 自动发送通知到指定频道
- 支持多个查询任务配置
`;

const logger = new Logger(name);

export interface QueryTask {
  url: string;
  interval: number;
  regex: string;
  botId: string;
  channelId: string;
  changeThreshold: number;
  enabled: boolean;
}

export interface Config {
  tasks: QueryTask[];
  loggerinfo?: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    tasks: Schema.array(Schema.object({
      url: Schema.string()
        .description('请求地址（URL）')
        .default('https://epay.czu.cn/wechat/h5/eleresult?sysid=1&roomid=14970&areaid=1&buildid=19&buildname=%E8%8F%81%E5%9B%AD%E5%85%AC%E5%AF%935%E5%8F%B7-D&roomname=514'),
      interval: Schema.number()
        .min(1)
        .max(1440)
        .default(30)
        .description('请求间隔时间（单位：分钟）'),
      regex: Schema.string()
        .description('匹配结果的正则表达式（使用捕获组提取数值）')
        .default('([\\d.]+)度'),
      botId: Schema.string()
        .description('发送消息的Bot ID')
        .default('1787850032'),
      channelId: Schema.string()
        .description('发送消息到频道的ID')
        .default('572978374'),
      changeThreshold: Schema.number()
        .min(0)
        .default(0)
        .description('变动阈值（度）。当电量变动大于此值时才发送通知，0表示任何变动都通知'),
      enabled: Schema.boolean()
        .default(true)
        .description('是否启用此任务')
    }).description('查询任务配置'))
  }).description("基础设置"),
  Schema.object({
    loggerinfo: Schema.boolean()
      .default(false)
      .description("日志调试模式")
      .experimental(),
  }).description("调试设置"),
])

// 存储每个任务的上次查询结果
const lastResults = new Map<string, number>();
// 存储定时器
const timers = new Map<string, NodeJS.Timeout>();

export function apply(ctx: Context, config: Config) {

  function logInfo(...args: any[]) {
    if (config.loggerinfo) {
      (logger.info as any)(...args);
    }
  }

  // 执行单个查询任务
  async function executeTask(task: QueryTask, taskIndex: number) {
    const taskKey = `task-${taskIndex}`;

    try {
      logInfo(`[${taskKey}] 开始查询: ${task.url}`);

      // 发送HTTP GET请求
      const response = await fetch(task.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      if (!response.ok) {
        logger.warn(`[${taskKey}] HTTP请求失败: ${response.status} ${response.statusText}`);
        return;
      }

      const html = await response.text();
      logInfo(`[${taskKey}] 获取到响应，长度: ${html.length}`);

      // 使用正则表达式匹配
      const regex = new RegExp(task.regex);
      const match = html.match(regex);

      if (!match || !match[1]) {
        logger.warn(`[${taskKey}] 正则匹配失败，未找到电量数据`);
        logInfo(`[${taskKey}] 正则表达式: ${task.regex}`);
        return;
      }

      const currentValue = parseFloat(match[1]);
      logInfo(`[${taskKey}] 匹配到电量: ${currentValue}度`);

      // 检查是否有上次的结果
      const lastValue = lastResults.get(taskKey);

      if (lastValue === undefined) {
        // 首次查询，只记录不发送
        lastResults.set(taskKey, currentValue);
        logger.info(`[${taskKey}] 首次查询，当前电量: ${currentValue}度`);
        return;
      }

      // 计算变动
      const change = Math.abs(currentValue - lastValue);
      logInfo(`[${taskKey}] 电量变动: ${change}度 (上次: ${lastValue}度, 当前: ${currentValue}度)`);

      // 判断是否需要发送通知
      if (change > task.changeThreshold) {
        // 查找指定的Bot
        const bot = ctx.bots.find(b => b.sid === task.botId || b.selfId === task.botId);

        if (!bot) {
          logger.warn(`[${taskKey}] 未找到Bot: ${task.botId}`);
          logger.warn(`[${taskKey}] 当前可用的Bot: ${ctx.bots.map(b => `${b.sid}(${b.selfId})`).join(', ')}`);
          return;
        }

        // 构建消息内容
        const changeText = currentValue > lastValue ? '增加' : '减少';
        const message = `⚡ 电费余额变动通知\n\n` +
          `当前余额: ${currentValue}度\n` +
          `上次余额: ${lastValue}度\n` +
          `变动情况: ${changeText} ${change.toFixed(2)}度\n` +
          `查询时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;

        try {
          await bot.sendMessage(task.channelId, message);
          logger.info(`[${taskKey}] 已发送通知到频道 ${task.channelId}`);

          // 更新上次结果
          lastResults.set(taskKey, currentValue);
        } catch (error) {
          logger.error(`[${taskKey}] 发送消息失败:`, error);
        }
      } else {
        logInfo(`[${taskKey}] 变动未超过阈值(${task.changeThreshold}度)，不发送通知`);
      }

    } catch (error) {
      logger.error(`[${taskKey}] 查询失败:`, error);
    }
  }

  // 启动定时任务
  function startTask(task: QueryTask, taskIndex: number) {
    if (!task.enabled) {
      logInfo(`任务 ${taskIndex} 已禁用，跳过`);
      return;
    }

    const taskKey = `task-${taskIndex}`;

    // 清除旧的定时器
    if (timers.has(taskKey)) {
      clearInterval(timers.get(taskKey));
    }

    // 立即执行一次
    executeTask(task, taskIndex);

    // 设置定时器
    const intervalMs = task.interval * 60 * 1000;
    const timer = setInterval(() => {
      executeTask(task, taskIndex);
    }, intervalMs);

    timers.set(taskKey, timer);
    logger.info(`任务 ${taskIndex} 已启动，间隔: ${task.interval}分钟`);
  }

  // 停止所有任务
  function stopAllTasks() {
    timers.forEach((timer, key) => {
      clearInterval(timer);
      logInfo(`已停止任务: ${key}`);
    });
    timers.clear();
  }

  ctx.on('ready', () => {
    logger.info('电费查询插件已启动');

    // 启动所有任务
    config.tasks.forEach((task, index) => {
      startTask(task, index);
    });
  });

  ctx.on('dispose', () => {
    stopAllTasks();
    logger.info('电费查询插件已停止');
  });

  // 添加命令用于手动触发查询
  ctx.command('electricity-check', '手动触发电费查询')
    .action(async ({ session }) => {
      if (config.tasks.length === 0) {
        return '未配置任何查询任务';
      }

      let result = '正在执行查询...\n\n';

      for (let i = 0; i < config.tasks.length; i++) {
        const task = config.tasks[i];
        if (!task.enabled) {
          result += `任务 ${i + 1}: 已禁用\n`;
          continue;
        }

        await executeTask(task, i);
        result += `任务 ${i + 1}: 已执行\n`;
      }

      return result + '\n查询完成！如有变动将自动发送通知。';
    });

  // 添加命令用于查看当前状态
  ctx.command('electricity-status', '查看电费查询状态')
    .action(async ({ session }) => {
      if (config.tasks.length === 0) {
        return '未配置任何查询任务';
      }

      let result = '📊 电费查询状态\n\n';

      config.tasks.forEach((task, index) => {
        const taskKey = `task-${index}`;
        const lastValue = lastResults.get(taskKey);
        const status = task.enabled ? '✅ 运行中' : '⏸️ 已禁用';

        result += `任务 ${index + 1}: ${status}\n`;
        result += `  间隔: ${task.interval}分钟\n`;
        result += `  阈值: ${task.changeThreshold}度\n`;
        result += `  上次电量: ${lastValue !== undefined ? lastValue + '度' : '未查询'}\n`;
        result += `  Bot: ${task.botId}\n`;
        result += `  频道: ${task.channelId}\n\n`;
      });

      return result;
    });
}
