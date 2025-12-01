// src/database.ts
import { Context, Session } from 'koishi'
import { SteamUser } from './types'
import { getSteamId, getSteamUserInfo } from './steam'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
export async function bindPlayer(ctx: Context, friendcodeOrId: string, session: Session, steamApiKey: string, inputid?: string, inputname?: string): Promise<string> {
  const userid = inputid || session.event.user.id;
  const channelid = session.event.channel.id;
  if (!userid || !channelid) {
    return '未检测到用户ID或群ID';
  }

  const database = await ctx.database.get('SteamUser', {});
  if (database.length >= (ctx.config.databasemaxlength || 100)) {
    return '该Bot已达到绑定玩家数量上限';
  }

  const steamId = getSteamId(friendcodeOrId);
  if (!steamId) {
    return '无效的 SteamID 或好友码';
  }

  const steamUserInfo = await getSteamUserInfo(ctx, steamApiKey, steamId);
  if (!steamUserInfo || !steamUserInfo.response || !steamUserInfo.response.players || steamUserInfo.response.players.length === 0) {
    return '无法获取到 Steam 用户信息，请检查输入的 SteamID 是否正确或网络环境';
  }

  const playerData = steamUserInfo.response.players[0];
  const userDataInDatabase = await ctx.database.get('SteamUser', { userId: userid });

  if (userDataInDatabase.length === 0) {
    let userName = inputname || session.event.user.name || userid;
    const userData: SteamUser = {
      userId: userid,
      userName: userName,
      steamId: playerData.steamid,
      steamName: playerData.personaname,
      effectGroups: [channelid],
      lastPlayedGame: playerData.gameextrainfo || '',
      lastUpdateTime: Date.now().toString()
    };
    await ctx.database.create('SteamUser', userData);
    // 下载头像
    await downloadAvatar(ctx, playerData.avatarmedium, playerData.steamid);
    return '绑定成功';
  }

  if (userDataInDatabase[0].effectGroups.includes(channelid)) {
    return `已在该群绑定过，无需再次绑定`;
  } else {
    const effectGroups = [...userDataInDatabase[0].effectGroups, channelid];
    await ctx.database.set('SteamUser', { userId: userid }, { effectGroups });
    return '绑定成功';
  }
}

/**
 * 从指定群组解绑用户的 Steam 账号
 * @param ctx Koishi context
 * @param userid 用户ID
 * @param channelid 频道ID
 * @returns 返回操作结果的字符串
 */
export async function unbindPlayer(ctx: Context, userid: string, channelid: string): Promise<string> {
  if (!userid || !channelid) {
    return '未获取到用户ID或者群ID，解绑失败';
  }
  const userData = (await ctx.database.get('SteamUser', { userId: userid }))[0];
  if (userData && userData.effectGroups.includes(channelid)) {
    if (userData.effectGroups.length === 1) {
      // 如果只在一个群组绑定，则完全移除
      await removeAvatar(ctx, userData.steamId);
      await ctx.database.remove('SteamUser', { userId: userid });
    } else {
      // 从群组列表中移除
      const effectGroups = userData.effectGroups.filter(id => id !== channelid);
      await ctx.database.set('SteamUser', { userId: userid }, { effectGroups });
    }
    return '解绑成功';
  }
  return '用户未曾绑定，无法解绑';
}

/**
 * 解绑用户在所有群组的 Steam 账号
 * @param ctx Koishi context
 * @param session Koishi session
 * @returns 返回操作结果的字符串
 */
export async function unbindAll(ctx: Context, session: Session): Promise<string> {
  const userid = session.event.user?.id;
  if (!userid) {
    return '未获取到用户ID，解绑失败';
  }
  const userData = await ctx.database.get('SteamUser', { userId: userid });
  if (userData.length < 1) {
    return '用户未曾绑定，无法解绑';
  }
  await removeAvatar(ctx, userData[0].steamId);
  await ctx.database.remove('SteamUser', { userId: userid });
  return '解绑成功';
}

/**
 * 下载并保存用户头像
 * @param ctx Koishi context
 * @param url 头像URL
 * @param steamId Steam64 ID
 */
async function downloadAvatar(ctx: Context, url: string, steamId: string) {
  const imgpath = path.join(ctx.baseDir, `data/steam-friend-status/img`);
  if (!fs.existsSync(imgpath)) {
    fs.mkdirSync(imgpath, { recursive: true });
  }
  const filepath = path.join(imgpath, `steamuser${steamId}.jpg`);
  try {
    const headshot = await ctx.http.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(filepath, Buffer.from(headshot));
  } catch (error) {
    ctx.logger.error('下载头像出错:', error);
  }
}

/**
 * 删除用户头像文件
 * @param ctx Koishi context
 * @param steamId Steam64 ID
 */
async function removeAvatar(ctx: Context, steamId: string) {
  const filepath = path.join(ctx.baseDir, `data/steam-friend-status/img/steamuser${steamId}.jpg`);
  if (fs.existsSync(filepath)) {
    fs.unlink(filepath, (err) => {
      if (err) {
        ctx.logger.error('删除头像出错:', err);
      }
    });
  }
}