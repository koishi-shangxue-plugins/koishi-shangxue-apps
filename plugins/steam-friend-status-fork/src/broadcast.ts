import { Context, h } from "koishi";
import { downloadAvatar } from "./database";
import { getGameChangeImg } from "./image";
import { PluginLogger } from "./logger";
import { getSteamUserInfoByDatabase } from "./steam";
import { GameChangeInfo, SteamUser, SteamUserInfo } from "./types";
import {
  endGameSession,
  formatPlayTime,
  getGameSession,
  getUserNickname,
  startGameSession,
} from "./userdata";

export interface SteamBroadcastConfig {
  SteamApiKey: string;
  useSteamName: boolean;
  broadcastWithImage: boolean;
}

type SteamPlayer = SteamUserInfo["response"]["players"][number];

// 轮询 Steam 状态，并按用户绑定过的群组进行播报
export async function pollSteamBroadcast(
  ctx: Context,
  config: SteamBroadcastConfig,
  logger: PluginLogger,
  shouldStop: () => boolean,
): Promise<void> {
  const allUserData = await ctx.database.select("SteamUser").execute();
  if (allUserData.length === 0) {
    logger.debug("没有已绑定的 Steam 用户，跳过本轮轮询");
    return;
  }

  const steamUserInfo = await getSteamUserInfoByDatabase(
    ctx,
    allUserData,
    config.SteamApiKey,
  );
  if (!steamUserInfo) {
    logger.warn("Steam 用户状态获取失败，本轮保留上次播报状态");
    return;
  }

  const changes = await detectGameChanges(
    ctx,
    allUserData,
    steamUserInfo,
    config.useSteamName,
    logger,
  );
  if (Object.keys(changes).length === 0) {
    logger.debug("本轮没有检测到游戏状态变化");
    return;
  }

  const channels = await ctx.database.select("channel").execute();
  for (const changeInfo of Object.values(changes)) {
    if (shouldStop()) return;

    const user = allUserData.find((item) => item.userId === changeInfo.userId);
    if (!user) continue;

    const targetChannels = channels.filter((channel) =>
      user.effectGroups.includes(channel.id),
    );
    if (targetChannels.length === 0) {
      logger.warn(
        `用户 ${user.userId} 的绑定群组未找到频道记录，暂不更新播报状态`,
      );
      continue;
    }

    const playerInfo = steamUserInfo.response.players.find(
      (player) => player.steamid === user.steamId,
    );
    let allSucceeded = true;

    for (const channel of targetChannels) {
      if (shouldStop()) return;

      const directBot = ctx.bots[`${channel.platform}:${channel.assignee}`];
      const bot =
        directBot ||
        Object.values(ctx.bots).find(
          (item) =>
            item.platform === channel.platform &&
            (item.selfId === channel.assignee ||
              item.user?.id === channel.assignee),
        );

      if (!bot) {
        allSucceeded = false;
        logger.warn(
          `未找到群组 ${channel.id} 对应的机器人 ${channel.platform}:${channel.assignee}`,
        );
        continue;
      }

      const channelNickname = await getUserNickname(
        ctx,
        changeInfo.userId,
        channel.id,
      );
      const textMessage = buildBroadcastText(
        channelNickname || changeInfo.userName,
        changeInfo,
      );

      try {
        await sendBroadcast(
          ctx,
          bot,
          channel.id,
          textMessage,
          playerInfo,
          changeInfo,
          config.broadcastWithImage,
          logger,
        );
        logger.debug(
          `已向群组 ${channel.id} 播报用户 ${changeInfo.userId}: ${textMessage}`,
        );
      } catch (error) {
        allSucceeded = false;
        logger.warn(`向群组 ${channel.id} 发送消息失败:`, error);
      }
    }

    if (allSucceeded) {
      await acknowledgeGameChange(ctx, changeInfo, logger);
    }
  }
}

// 更新所有已绑定用户的头像
export async function updatePlayerHeadshots(
  ctx: Context,
  config: SteamBroadcastConfig,
  logger: PluginLogger,
): Promise<void> {
  const allUserData = await ctx.database.select("SteamUser").execute();
  const steamUserInfo = await getSteamUserInfoByDatabase(
    ctx,
    allUserData,
    config.SteamApiKey,
  );
  if (!steamUserInfo) {
    logger.warn("获取 Steam 用户信息失败，跳过头像更新");
    return;
  }

  for (const player of steamUserInfo.response.players) {
    const success = await downloadPlayerAvatar(ctx, player);
    if (!success) {
      logger.error(`更新头像失败 (SteamID: ${player.steamid})`);
    }
  }
}

async function detectGameChanges(
  ctx: Context,
  allUserData: SteamUser[],
  steamUserInfo: SteamUserInfo,
  useSteamName: boolean,
  logger: PluginLogger,
): Promise<Record<string, GameChangeInfo>> {
  const players = new Map(
    steamUserInfo.response.players.map((player) => [player.steamid, player]),
  );
  const changes: Record<string, GameChangeInfo> = {};

  for (const userData of allUserData) {
    const player = players.get(userData.steamId);
    if (!player) {
      logger.debug(`Steam API 未返回用户 ${userData.steamId} 的信息`);
      continue;
    }

    if (userData.steamName !== player.personaname) {
      await ctx.database.set(
        "SteamUser",
        { steamId: player.steamid },
        { steamName: player.personaname },
      );
    }

    const newGame = player.gameextrainfo?.trim() || "";
    const oldGame = userData.lastPlayedGame?.trim() || "";
    if (newGame === oldGame) continue;

    const playTime = await getCurrentPlayTime(ctx, userData.userId);
    const userName = useSteamName ? player.personaname : userData.userName;

    if (newGame && !oldGame) {
      changes[userData.userId] = {
        userId: userData.userId,
        userName,
        status: "start",
        newGame,
      };
    } else if (newGame && oldGame && newGame !== oldGame) {
      changes[userData.userId] = {
        userId: userData.userId,
        userName,
        status: "change",
        oldGame,
        newGame,
        playTime,
      };
    } else if (!newGame && oldGame) {
      changes[userData.userId] = {
        userId: userData.userId,
        userName,
        status: "stop",
        oldGame,
        playTime,
      };
    }
  }

  return changes;
}

async function getCurrentPlayTime(
  ctx: Context,
  userId: string,
): Promise<string | undefined> {
  const session = await getGameSession(ctx, userId);
  if (!session) return undefined;

  const minutes = Math.floor((Date.now() - session.startTime) / 60000);
  return minutes > 0 ? formatPlayTime(minutes) : undefined;
}

function buildBroadcastText(
  displayName: string,
  changeInfo: GameChangeInfo,
): string {
  if (changeInfo.status === "start") {
    return `${displayName} 开始玩 ${changeInfo.newGame} 了`;
  }

  if (changeInfo.status === "stop") {
    return changeInfo.playTime
      ? `${displayName} 不玩 ${changeInfo.oldGame} 了，玩了 ${changeInfo.playTime}`
      : `${displayName} 不玩 ${changeInfo.oldGame} 了`;
  }

  return changeInfo.playTime
    ? `${displayName} 不玩 ${changeInfo.oldGame} 了，玩了 ${changeInfo.playTime}，开始玩 ${changeInfo.newGame} 了`
    : `${displayName} 不玩 ${changeInfo.oldGame} 了，开始玩 ${changeInfo.newGame} 了`;
}

async function sendBroadcast(
  ctx: Context,
  bot: (typeof ctx.bots)[string],
  channelId: string,
  textMessage: string,
  playerInfo: SteamPlayer | undefined,
  changeInfo: GameChangeInfo,
  broadcastWithImage: boolean,
  logger: PluginLogger,
): Promise<void> {
  let message: h.Fragment = textMessage;

  if (playerInfo && broadcastWithImage) {
    try {
      const image = await getGameChangeImg(ctx, playerInfo, changeInfo);
      message = [...h.parse(textMessage), image];
    } catch (error) {
      // 图片失败时仍发送文字播报
      logger.warn("生成游戏变化图片失败，降级为文字播报:", error);
    }
  }

  await bot.sendMessage(channelId, message);
}

async function acknowledgeGameChange(
  ctx: Context,
  changeInfo: GameChangeInfo,
  logger: PluginLogger,
): Promise<void> {
  try {
    if (changeInfo.status === "start") {
      await startGameSession(ctx, changeInfo.userId, changeInfo.newGame || "");
    } else if (changeInfo.status === "change") {
      await endGameSession(ctx, changeInfo.userId);
      await startGameSession(ctx, changeInfo.userId, changeInfo.newGame || "");
    } else {
      await endGameSession(ctx, changeInfo.userId);
    }

    await ctx.database.set(
      "SteamUser",
      { userId: changeInfo.userId },
      { lastPlayedGame: changeInfo.newGame || "" },
    );
  } catch (error) {
    logger.error(
      `播报已发送，但更新用户 ${changeInfo.userId} 的游戏状态失败:`,
      error,
    );
  }
}

async function downloadPlayerAvatar(
  ctx: Context,
  player: SteamPlayer,
): Promise<boolean> {
  return downloadAvatar(ctx, player.avatarmedium, player.steamid);
}
