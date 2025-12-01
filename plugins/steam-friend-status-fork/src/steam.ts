// src/steam.ts
import { Context } from 'koishi'
import { SteamUserInfo, SteamUser } from './types'

// 从配置文件或默认值中获取常量
const STEAM_ID_OFFSET = 76561197960265728;
const STEAM_WEB_API_URL = "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/";

/**
 * 将 Steam 好友码转换为 Steam64 ID
 * @param steamIdOrFriendCode 用户的 SteamID 或好友码
 * @returns 返回 Steam64 ID
 */
export function getSteamId(steamIdOrFriendCode: string): string {
  if (!/^\d+$/.test(steamIdOrFriendCode)) {
    return '';
  }
  const steamId = BigInt(steamIdOrFriendCode);
  if (steamId < STEAM_ID_OFFSET) {
    return (steamId + BigInt(STEAM_ID_OFFSET)).toString();
  }
  return steamIdOrFriendCode;
}

/**
 * 通过 Steam Web API 获取单个用户的公开信息
 * @param ctx Koishi context
 * @param steamApiKey Steam Web API Key
 * @param steamid 用户的 Steam64 ID
 * @returns 返回包含玩家信息的 Promise
 */
export async function getSteamUserInfo(ctx: Context, steamApiKey: string, steamid: string): Promise<SteamUserInfo> {
  const requestUrl = `${STEAM_WEB_API_URL}?key=${steamApiKey}&steamids=${steamid}`;
  try {
    const response = await ctx.http.get(requestUrl);
    if (!response || !response.response || response.response.players.length === 0) {
      return undefined;
    }
    return response as SteamUserInfo;
  } catch (error) {
    ctx.logger.error('获取 Steam 用户信息时出错:', error);
    return undefined;
  }
}

/**
 * 通过 Steam Web API 批量获取多个用户的信息
 * @param ctx Koishi context
 * @param steamusers 包含 SteamUser 对象的数组
 * @param steamApiKey Steam Web API Key
 * @returns 返回包含多个玩家信息的 Promise
 */
export async function getSteamUserInfoByDatabase(ctx: Context, steamusers: SteamUser[], steamApiKey: string): Promise<SteamUserInfo | undefined> {
  if (!steamusers || steamusers.length === 0) {
    return undefined;
  }
  try {
    const steamIds = steamusers.map(user => user.steamId);
    const requestUrl = `${STEAM_WEB_API_URL}?key=${steamApiKey}&steamids=${steamIds.join(',')}`;
    const response = await ctx.http.get(requestUrl);
    if (!response || !response.response || response.response.players.length === 0) {
      ctx.logger.warn('在 API 响应中没有找到玩家数据。');
      return undefined;
    }
    return response as SteamUserInfo;
  } catch (error) {
    ctx.logger.error('批量获取 Steam 用户信息时出错:', error);
    return undefined;
  }
}