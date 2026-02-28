import { Context, Schema, Session } from 'koishi'

export const name = 'without-assignee'
export const reusable = false
export const filter = false

export const inject = {
  optional: ['database', 'logger'],
  required: []
}

export const usage = `
---


禁用 Koishi 的 assignee 机制，允许同一频道内的多个机器人同时响应无前缀指令。

默认情况下，当同一平台的同一频道内有多个机器人时，Koishi 会启用 assignee 机制，
只允许被分配的机器人响应无前缀指令，其他机器人需要通过 @机器人 的方式调用。

启用此插件后，所有机器人都可以响应无前缀指令。

---
`;


export interface Config {
  loggerinfo?: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
  }).description("调试设置"),
])

export function apply(ctx: Context, config: Config) {
  ctx.on("ready", async () => {
    // 日志输出函数
    function logInfo(...args: any[]) {
      if (config.loggerinfo) {
        (ctx.logger.info as (...args: any[]) => void)(...args);
      }
    }

    // 在 observeChannel 之后、assignee 检查之前触发
    ctx.on('attach-channel', (session: Session) => {

      // 如果没有数据库服务，无需处理
      if (!ctx.database) {
        ctx.logger.warn('数据库服务未启用，插件无法工作');
        return;
      }

      // 只处理群组消息
      if (session.isDirect) return;

      const channel = session.channel;
      if (!channel) return;

      // 获取原始的 assignee 值
      const originalAssignee = (channel as any).assignee;

      // 如果 assignee 存在且不是当前 bot
      if (originalAssignee && originalAssignee !== session.selfId) {
        logInfo(`检测到频道 ${session.channelId} 的 assignee 为 ${originalAssignee}，当前 bot 为 ${session.selfId}`);

        // 临时修改 assignee 为当前 bot，绕过后续的 assignee 检查
        (channel as any).assignee = session.selfId;

        logInfo(`已将频道 ${session.channelId} 的 assignee 临时修改为 ${session.selfId}`);
      }
    });
  })
}
