import { Context } from "koishi";
import { inspect } from "node:util";

// 统一日志入口，调试日志由配置项控制
export interface PluginLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

let activeLogger: PluginLogger | undefined;

export function createPluginLogger(
  ctx: Context,
  debugEnabled: boolean,
): PluginLogger {
  return {
    debug(...args) {
      if (debugEnabled) {
        ctx.logger.info(`[debug] ${formatLogArgs(args)}`);
      }
    },
    info(...args) {
      ctx.logger.info(formatLogArgs(args));
    },
    warn(...args) {
      ctx.logger.warn(formatLogArgs(args));
    },
    error(...args) {
      ctx.logger.error(formatLogArgs(args));
    },
  };
}

// index.ts 在插件加载时初始化，供其他模块统一输出日志
export function initializePluginLogger(
  ctx: Context,
  debugEnabled: boolean,
): PluginLogger {
  activeLogger = createPluginLogger(ctx, debugEnabled);
  return activeLogger;
}

export function getPluginLogger(): PluginLogger {
  if (!activeLogger) {
    throw new Error("插件日志器尚未初始化");
  }
  return activeLogger;
}

function formatLogArgs(args: unknown[]): string {
  return args
    .map((value) =>
      value instanceof Error
        ? value.stack || value.message
        : typeof value === "string"
          ? value
          : inspect(value, { depth: 4, colors: false }),
    )
    .join(" ");
}
