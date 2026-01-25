import { Context } from "koishi";
import { Config } from "./types";

/**
 * 获取指令名称
 */
export function getCommandName(config: Config, command: string): string | null {
  const entry = config.commandTable.find(item => item.command === command);
  return entry ? entry.commandname : null;
}

/**
 * 获取指令权限等级
 */
export function getCommandAuthority(config: Config, command: string): number | null {
  const entry = config.commandTable.find(item => item.command === command);
  return entry ? entry.command_authority : null;
}

/**
 * 获取控制台 URL
 */
export function getConsoleUrl(ctx: Context, config: Config, path: string = ''): string {
  const port = config.accessPort || ctx.server?.port;
  if (!port) {
    throw new Error('无法获取控制台端口');
  }
  return `http://127.0.0.1:${port}${path}`;
}

/**
 * 日志输出函数
 */
export function createLogger(ctx: Context, config: Config) {
  return (message: string) => {
    if (config.loggerinfo) {
      ctx.logger.info(message);
    }
  };
}
