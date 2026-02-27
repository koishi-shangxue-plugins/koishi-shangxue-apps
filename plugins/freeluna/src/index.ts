import { Context, Logger, Schema, Session } from 'koishi'

export const name = 'freeluna'
export const reusable = false
export const filter = true

export const inject = {
  optional: [''],
  required: ['']
}

export const usage = `
`;

const logger = new Logger(`DEV:${name}`);

export interface Config {
  loggerinfo?: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
  }).description("基础设置"),
  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
  }).description("调试设置"),
])

export function apply(ctx: Context, config: Config) {
  // write your plugin here
  ctx.on('ready', () => {

    function logInfo(...args: any[]) {
      if (config.loggerinfo) {
        (logger.info as (...args: any[]) => void)(...args);
      }
    }

  })
}
