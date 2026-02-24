// src/steam.ts
import { Context } from "koishi";
import { SteamUserInfo, SteamUser } from "./types";
import { fetchJson } from "./fetch";

// 从配置文件或默认值中获取常量
const STEAM_ID_OFFSET = 76561197960265728;
const STEAM_WEB_API_URL =
  "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/";

/**
 * 将 Steam 好友码转换为 Steam64 ID
 * @param steamIdOrFriendCode 用户的 SteamID 或好友码
 * @returns 返回 Steam64 ID
 */
export function getSteamId(steamIdOrFriendCode: string): string {
  if (!/^\d+$/.test(steamIdOrFriendCode)) {
    return "";
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
export async function getSteamUserInfo(
  ctx: Context,
  steamApiKey: string,
  steamid: string,
): Promise<SteamUserInfo> {
  const requestUrl = `${STEAM_WEB_API_URL}?key=${steamApiKey}&steamids=${steamid}`;
  try {
    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      maxRetries: ctx.config.maxRetries
    };
    const response = await fetchJson<SteamUserInfo>(ctx, requestUrl, config);
    if (
      !response ||
      !response.response ||
      response.response.players.length === 0
    ) {
      return undefined;
    }
    return response;
  } catch (error) {
    ctx.logger.error("获取 Steam 用户信息时出错:", error);
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
export async function getSteamUserInfoByDatabase(
  ctx: Context,
  steamusers: SteamUser[],
  steamApiKey: string,
): Promise<SteamUserInfo | undefined> {
  if (!steamusers || steamusers.length === 0) {
    return undefined;
  }
  try {
    const steamIds = steamusers.map((user) => user.steamId);
    const requestUrl = `${STEAM_WEB_API_URL}?key=${steamApiKey}&steamids=${steamIds.join(",")}`;
    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      maxRetries: ctx.config.maxRetries
    };
    const response = await fetchJson<SteamUserInfo>(ctx, requestUrl, config);
    if (
      !response ||
      !response.response ||
      response.response.players.length === 0
    ) {
      ctx.logger.warn("在 API 响应中没有找到玩家数据。");
      return undefined;
    }
    return response;
  } catch (error) {
    ctx.logger.error("批量获取 Steam 用户信息时出错:", error);
    return undefined;
  }
}
import { RecentlyPlayedGamesInfo, SteamProfile } from "./types";

/**
 * 使用 Puppeteer 抓取用户的 Steam 个人主页信息
 * @param ctx Koishi context
 * @param steamId 用户的 Steam64 ID
 * @returns 返回包含个人主页信息的 Promise
 */
export async function getSteamProfile(
  ctx: Context,
  steamId: string,
): Promise<SteamProfile> {
  const url = `https://steamcommunity.com/profiles/${steamId}`;
  const page = await ctx.puppeteer.page();
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

    // 等待页面加载完成
    await page.waitForSelector(".actual_persona_name", { timeout: 120000 });

    const profile = await page.evaluate(() => {
      const name = (
        document.querySelector(".actual_persona_name") as HTMLElement
      )?.innerText;
      const avatar = (
        document.querySelector(
          ".playerAvatarAutoSizeInner > img",
        ) as HTMLImageElement
      )?.src;
      const level = (
        document.querySelector(".friendPlayerLevelNum") as HTMLElement
      )?.innerText;
      const status = (
        document.querySelector(".profile_in_game_header") as HTMLElement
      )?.innerText;

      const recentGames = Array.from(
        document.querySelectorAll(".game_info"),
      ).map((game) => {
        const gameName = (game.querySelector(".game_name a") as HTMLElement)
          ?.innerText;
        const hours = (game.querySelector(".game_hours") as HTMLElement)
          ?.innerText;
        const img = (
          game.querySelector(".game_capsule img") as HTMLImageElement
        )?.src;
        return { name: gameName, hours, img };
      });

      return { name, avatar, level, status, recentGames };
    });

    const recentlyPlayed = await getRecentlyPlayedGames(
      ctx,
      ctx.config.SteamApiKey,
      steamId,
    );
    profile.recentGames = recentlyPlayed.games.map((game) => ({
      name: game.name,
      // 将分钟转换为小时
      hours: `${(game.playtime_forever / 60).toFixed(1)} 小时`,
      // 构建游戏横幅图片的URL
      img: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
    }));

    return profile;
  } catch (error) {
    ctx.logger.error(`抓取 Steam 个人主页失败 (SteamID: ${steamId}):`, error);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * 使用 Steam Web API 获取用户最近玩过的游戏
 * @param ctx Koishi context
 * @param apiKey Steam Web API Key
 * @param steamId 用户的 Steam64 ID
 * @returns 返回包含最近游戏信息的 Promise
 */
export async function getRecentlyPlayedGames(
  ctx: Context,
  apiKey: string,
  steamId: string,
): Promise<RecentlyPlayedGamesInfo> {
  const url = `http://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json`;
  try {
    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      maxRetries: ctx.config.maxRetries
    };
    const response = await fetchJson<any>(ctx, url, config);
    if (response && response.response && response.response.games) {
      return response.response;
    }
    return { total_count: 0, games: [] };
  } catch (error) {
    ctx.logger.error(
      `获取最近玩过的游戏失败 (SteamID: ${steamId}):`,
      error,
    );
    return { total_count: 0, games: [] };
  }
}
