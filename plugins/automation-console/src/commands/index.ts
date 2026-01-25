import { Context } from "koishi";
import { Config, PageInstance } from "../types";
import { getCommandName } from "../utils";
import { registerUIControlCommands } from "./ui-control";
import { registerPluginManagementCommands } from "./plugin-management";
import { registerMarketCommands } from "./market";
import { registerSystemCommands } from "./system";

/**
 * 注册所有命令
 */
export function registerAllCommands(
  ctx: Context,
  config: Config,
  pageRef: { current: PageInstance }
) {
  // 获取所有命令名称
  const commandNames = {
    automation: getCommandName(config, "automation-console"),
    openUI: getCommandName(config, "打开UI控制"),
    cancanUI: getCommandName(config, "查看UI控制"),
    closeUI: getCommandName(config, "退出UI控制"),
    plugins: getCommandName(config, "配置插件"),
    refreshMarket: getCommandName(config, "刷新插件市场"),
    restart: getCommandName(config, "软重启"),
    yarnUpToLatest: getCommandName(config, "小火箭更新依赖"),
    cancanLogs: getCommandName(config, "查看日志"),
    searchMarketPlugins: getCommandName(config, "插件市场搜索插件"),
  };

  // 注册主命令
  ctx.command(`${commandNames.automation || "automation-console"}`, "通过指令操作控制台");

  // 注册各模块命令
  registerUIControlCommands(ctx, config, pageRef, {
    automation: commandNames.automation,
    openUI: commandNames.openUI,
    cancanUI: commandNames.cancanUI,
    closeUI: commandNames.closeUI,
  });

  registerPluginManagementCommands(ctx, config, pageRef, {
    automation: commandNames.automation,
    plugins: commandNames.plugins,
    cancanUI: commandNames.cancanUI,
    openUI: commandNames.openUI,
    closeUI: commandNames.closeUI,
  });

  registerMarketCommands(ctx, config, pageRef, {
    automation: commandNames.automation,
    searchMarketPlugins: commandNames.searchMarketPlugins,
    refreshMarket: commandNames.refreshMarket,
    openUI: commandNames.openUI,
    closeUI: commandNames.closeUI,
  });

  registerSystemCommands(ctx, config, pageRef, {
    automation: commandNames.automation,
    restart: commandNames.restart,
    yarnUpToLatest: commandNames.yarnUpToLatest,
    cancanLogs: commandNames.cancanLogs,
    cancanUI: commandNames.cancanUI,
    openUI: commandNames.openUI,
    closeUI: commandNames.closeUI,
  });
}
