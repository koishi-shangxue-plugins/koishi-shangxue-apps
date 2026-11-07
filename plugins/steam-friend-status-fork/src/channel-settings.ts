import { Session } from "koishi";
import { PluginLogger } from "./logger";

// 判断当前用户是否具备群组管理权限
function hasManagePermission(session: Session<"authority">): boolean {
  if (session.user && session.user.authority > 1) {
    return true;
  }

  const roles = session.event.member?.roles;
  return (
    roles?.some((role) => {
      const label = String(role);
      return (
        label === "admin" ||
        label === "owner" ||
        role.id === "admin" ||
        role.id === "owner" ||
        role.name === "admin" ||
        role.name === "owner"
      );
    }) ?? false
  );
}

// 切换当前群组的 Steam 播报开关，不传参数时在开/关之间切换
export function toggleChannelBroadcast(
  logger: PluginLogger,
  session: Session<"authority", "usingSteam">,
  action?: string,
): string {
  if (session.isDirect) {
    return "该指令只能在群组中使用";
  }

  if (!hasManagePermission(session)) {
    return "您没有权限执行此操作";
  }

  const normalized = action?.trim().toLowerCase();
  let enabled: boolean;

  if (!normalized) {
    enabled = !session.channel.usingSteam;
  } else if (normalized === "on" || normalized === "开启") {
    enabled = true;
  } else if (normalized === "off" || normalized === "关闭") {
    enabled = false;
  } else {
    return "无效指令，请直接发送指令切换开关，或使用 on / off";
  }

  // channelFields 会在指令结束后自动持久化该字段
  session.channel.usingSteam = enabled;
  logger.debug(
    `频道 ${session.channelId} 的 Steam 播报开关已${enabled ? "开启" : "关闭"}`,
  );
  return enabled ? "已开启本群 Steam 播报" : "已关闭本群 Steam 播报";
}
