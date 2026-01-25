import { Context } from "koishi";
import { Config } from "../types";
import { getCommandName } from "../utils";
import { registerPluginManagementCommands } from "./plugin-management";
import { registerSystemCommands } from "./system";

/**
 * 注册所有命令
 */
export function registerAllCommands(
  ctx: Context,
  config: Config
) {
  // 获取所有命令名称
  const commandNames = {
    automation: getCommandName(config, "automation-console"),
    plugins: getCommandName(config, "配置插件"),
    restart: getCommandName(config, "软重启"),
    yarnUpToLatest: getCommandName(config, "小火箭更新依赖"),
    cancanLogs: getCommandName(config, "查看日志"),
  };

  // 注册主命令
  ctx.command(`${commandNames.automation || "automation-console"}`, "通过指令操作控制台");

  // 注册各模块命令
  registerPluginManagementCommands(ctx, config, {
    automation: commandNames.automation,
    plugins: commandNames.plugins,
  });

  registerSystemCommands(ctx, config, {
    automation: commandNames.automation,
    restart: commandNames.restart,
    yarnUpToLatest: commandNames.yarnUpToLatest,
    cancanLogs: commandNames.cancanLogs,
  });
}
