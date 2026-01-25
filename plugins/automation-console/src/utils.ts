import { Context, Session } from "koishi";
import { Config, PageInstance } from "./types";

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
export function getConsoleUrl(ctx: Context, config: Config): string {
  const port = config.accessPort || ctx.server?.port;
  if (!port) {
    throw new Error('无法获取控制台端口');
  }
  return `http://127.0.0.1:${port}`;
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

/**
 * 确保 UI 控制台已打开
 */
export async function ensureUIControl(
  page: PageInstance,
  config: Config,
  session: Session,
  getCommandName_openUI: string | null
): Promise<boolean> {
  if (!page) {
    if (config.auto_execute_openUI) {
      await session.execute(`${getCommandName_openUI}`);
      if (config.resolvesetTimeout) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // 停顿 1.5 秒
      }
    } else {
      await session.send("UI控制台未打开，请先使用【打开UI控制】指令。");
      return false;
    }
  }
  return true;
}

/**
 * 如果启用自动关闭，则关闭 UI
 */
export async function closeUIIfEnabled(
  session: Session,
  config: Config,
  getCommandName_closeUI: string | null
): Promise<void> {
  if (config.auto_execute_closeUI) {
    await session.execute(`${getCommandName_closeUI}`);
  }
}
