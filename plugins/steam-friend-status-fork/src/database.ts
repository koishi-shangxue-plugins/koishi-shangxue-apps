// src/database.ts
import { Context, Session } from "koishi";
import { SteamUser } from "./types";
import { getSteamId, getSteamUserInfo } from "./steam";
import { deleteUserNickname, deleteAllUserNicknames } from "./userdata";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * 绑定 Steam 账号到用户
 * @param ctx Koishi context
 * @param friendcodeOrId 用户的 SteamID 或好友码
 * @param session Koishi session
 * @param steamApiKey Steam Web API Key
 * @param inputid 可选，指定的用户ID
 * @param inputname 可选，指定用户名
 * @returns 返回操作结果的字符串
 */
export async function bindPlayer(
  ctx: Context,
  friendcodeOrId: string,
  session: Session,
  steamApiKey: string,
  inputid?: string,
  inputname?: string,
): Promise<string> {
  const userid = inputid || session.event.user.id;
  const channelid = session.event.channel.id;
  if (!userid || !channelid) {
    return "未检测到用户ID或群ID";
  }

  const database = await ctx.database.get("SteamUser", {});
  if (database.length >= (ctx.config.databasemaxlength || 100)) {
    return "该Bot已达到绑定玩家数量上限";
  }

  const steamId = getSteamId(friendcodeOrId);
  if (!steamId) {
    return "无效的 SteamID 或好友码";
  }

  const steamUserInfo = await getSteamUserInfo(ctx, steamApiKey, steamId);
  if (
    !steamUserInfo ||
    !steamUserInfo.response ||
    !steamUserInfo.response.players ||
    steamUserInfo.response.players.length === 0
  ) {
    return "无法获取到 Steam 用户信息，请检查输入的 SteamID 是否正确或网络环境";
  }

  const playerData = steamUserInfo.response.players[0];
  const userDataInDatabase = await ctx.database.get("SteamUser", {
    userId: userid,
  });

  if (userDataInDatabase.length === 0) {
    let userName = inputname;
    if (!userName && typeof session.bot.getUser === 'function') {
      try {
        const userInfo = await session.bot.getUser(userid);
        userName = userInfo?.name || userInfo?.username || userid;
      } catch (error) {
        ctx.logger.warn(`获取用户 ${userid} 信息失败:`, error);
        userName = userid;
      }
    } else if (!userName) {
      userName = userid;
    }

    const userData: SteamUser = {
      userId: userid,
      userName: userName,
      steamId: playerData.steamid,
      steamName: playerData.personaname,
      effectGroups: [channelid],
      lastPlayedGame: playerData.gameextrainfo || "",
      lastUpdateTime: Date.now().toString(),
    };
    await ctx.database.create("SteamUser", userData);
    // 下载头像
    await downloadAvatar(ctx, playerData.avatarmedium, playerData.steamid);
    return "绑定成功";
  }

  if (userDataInDatabase[0].effectGroups.includes(channelid)) {
    return `已在该群绑定过，无需再次绑定`;
  } else {
    const effectGroups = [...userDataInDatabase[0].effectGroups, channelid];
    await ctx.database.set("SteamUser", { userId: userid }, { effectGroups });
    return "绑定成功";
  }
}

/**
 * 从指定群组解绑用户的 Steam 账号
 * @param ctx Koishi context
 * @param userid 用户ID
 * @param channelid 频道ID
 * @returns 返回操作结果的字符串
 */
export async function unbindPlayer(
  ctx: Context,
  userid: string,
  channelid: string,
): Promise<string> {
  if (!userid || !channelid) {
    return "未获取到用户ID或者群ID，解绑失败";
  }
  const userData = (await ctx.database.get("SteamUser", { userId: userid }))[0];
  if (userData && userData.effectGroups.includes(channelid)) {
    if (userData.effectGroups.length === 1) {
      // 如果只在一个群组绑定，则完全移除
      await removeAvatar(ctx, userData.steamId);
      await ctx.database.remove("SteamUser", { userId: userid });
      // 删除用户的所有昵称记录
      await deleteAllUserNicknames(ctx, userid);
    } else {
      // 从群组列表中移除
      const effectGroups = userData.effectGroups.filter(
        (id) => id !== channelid,
      );
      await ctx.database.set("SteamUser", { userId: userid }, { effectGroups });
      // 删除用户在该群组的昵称
      await deleteUserNickname(ctx, userid, channelid);
    }
    return "解绑成功";
  }
  return "用户未曾绑定，无法解绑";
}

/**
 * 解绑当前频道所有用户的 Steam 账号
 * @param ctx Koishi context
 * @param channelid 频道ID
 * @returns 返回操作结果的字符串
 */
export async function unbindAll(
  ctx: Context,
  channelid: string,
): Promise<string> {
  if (!channelid) {
    return "未获取到频道ID，解绑失败";
  }

  // 获取所有用户数据
  const allUsers = await ctx.database.get("SteamUser", {});

  // 筛选出在当前频道绑定的用户
  const usersInChannel = allUsers.filter(user =>
    user.effectGroups.includes(channelid)
  );

  if (usersInChannel.length === 0) {
    return "当前频道无人绑定，无法解绑";
  }

  let unbindCount = 0;

  // 遍历每个用户进行解绑
  for (const user of usersInChannel) {
    if (user.effectGroups.length === 1) {
      // 如果只在当前频道绑定，则完全移除
      await removeAvatar(ctx, user.steamId);
      await ctx.database.remove("SteamUser", { userId: user.userId });
      // 删除用户的所有昵称记录
      await deleteAllUserNicknames(ctx, user.userId);
    } else {
      // 从群组列表中移除当前频道
      const effectGroups = user.effectGroups.filter(
        (id) => id !== channelid,
      );
      await ctx.database.set("SteamUser", { userId: user.userId }, { effectGroups });
      // 删除用户在该群组的昵称
      await deleteUserNickname(ctx, user.userId, channelid);
    }
    unbindCount++;
  }

  return `解绑成功，共解绑 ${unbindCount} 个用户`;
}

/**
 * 下载并保存用户头像
 * @param ctx Koishi context
 * @param url 头像URL
 * @param steamId Steam64 ID
 */
async function downloadAvatar(ctx: Context, url: string, steamId: string) {
  const resourcePath = path.join(ctx.baseDir, 'data', 'steam-friend-status', 'img');
  if (!fs.existsSync(resourcePath)) {
    fs.mkdirSync(resourcePath, { recursive: true });
  }
  const filepath = path.join(resourcePath, `steamuser${steamId}.jpg`);
  try {
    const headshot = await ctx.http.get(url, { responseType: "arraybuffer" });
    fs.writeFileSync(filepath, Buffer.from(headshot));
  } catch (error) {
    ctx.logger.error("下载头像出错:", error);
  }
}

/**
 * 删除用户头像文件
 * @param ctx Koishi context
 * @param steamId Steam64 ID
 */
async function removeAvatar(ctx: Context, steamId: string) {
  const filepath = path.join(
    ctx.baseDir, 'data', 'steam-friend-status', 'img', `steamuser${steamId}.jpg`
  );
  if (fs.existsSync(filepath)) {
    fs.unlink(filepath, (err) => {
      if (err) {
        ctx.logger.error("删除头像出错:", err);
      }
    });
  }
}
