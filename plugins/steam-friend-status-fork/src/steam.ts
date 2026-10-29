// src/steam.ts
import { Context } from "koishi";
import {
  RecentlyPlayedGamesInfo,
  SteamProfile,
  SteamUser,
  SteamUserInfo,
} from "./types";
import { fetchJson } from "./fetch";
import { getPluginLogger } from "./logger";

// 从配置文件或默认值中获取常量
const STEAM_ID_OFFSET = 76561197960265728;
const STEAM_WEB_API_URL =
  "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/";

// Steam 官方限制：GetPlayerSummaries 单次最多查询 100 个 Steam ID
const MAX_STEAM_IDS_PER_REQUEST = 100;

interface RecentlyPlayedGamesResponse {
  response: RecentlyPlayedGamesInfo;
}

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
  const requestUrl = `${getPlayerSummariesUrl(ctx)}?key=${steamApiKey}&steamids=${steamid}`;
  try {
    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      useApifoxProxy: ctx.config.useApifoxProxy,
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
    getPluginLogger().error("获取 Steam 用户信息时出错:", error);
    return undefined;
  }
}

/**
 * 通过 Steam Web API 批量获取多个用户的信息
 * 由于 Steam 单次最多查询 100 个 ID，这里自动分批请求并合并结果
 * @param ctx Koishi context
 * @param steamusers 包含 SteamUser 对象的数组
 * @param steamApiKey Steam Web API Key
 * @returns 返回合并后的玩家信息
 */
export async function getSteamUserInfoByDatabase(
  ctx: Context,
  steamusers: SteamUser[],
  steamApiKey: string,
): Promise<SteamUserInfo | undefined> {
  if (!steamusers || steamusers.length === 0) {
    return undefined;
  }

  // 去重并过滤空值，避免重复 ID 占用单次请求名额
  const steamIds = [
    ...new Set(steamusers.map((user) => user.steamId).filter((id) => !!id)),
  ];
  if (steamIds.length === 0) {
    return undefined;
  }

  // 逐批请求，超过 100 人的部分也能正常查询
  const players: SteamUserInfo["response"]["players"] = [];
  for (let i = 0; i < steamIds.length; i += MAX_STEAM_IDS_PER_REQUEST) {
    const batch = steamIds.slice(i, i + MAX_STEAM_IDS_PER_REQUEST);
    const requestUrl = `${getPlayerSummariesUrl(ctx)}?key=${steamApiKey}&steamids=${batch.join(",")}`;
    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      useApifoxProxy: ctx.config.useApifoxProxy,
      maxRetries: ctx.config.maxRetries,
    };
    try {
      const response = await fetchJson<SteamUserInfo>(ctx, requestUrl, config);
      if (response && response.response && response.response.players) {
        players.push(...response.response.players);
      }
    } catch (error) {
      // 单批失败不影响其他批次，继续查询剩余用户
      getPluginLogger().error(
        `批量获取 Steam 用户信息时出错 (第 ${Math.floor(i / MAX_STEAM_IDS_PER_REQUEST) + 1} 批):`,
        error,
      );
    }
  }

  if (players.length === 0) {
    getPluginLogger().warn("在 API 响应中没有找到玩家数据。");
    return undefined;
  }

  return { response: { players } };
}
function getPlayerSummariesUrl(ctx: Context): string {
  const configured = ctx.config.steamWebApiUrl;
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : STEAM_WEB_API_URL;
}

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
    getPluginLogger().error(
      `抓取 Steam 个人主页失败 (SteamID: ${steamId}):`,
      error,
    );
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
  const url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json`;
  try {
    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      useApifoxProxy: ctx.config.useApifoxProxy,
      maxRetries: ctx.config.maxRetries
    };
    const response = await fetchJson<RecentlyPlayedGamesResponse>(
      ctx,
      url,
      config,
    );
    if (response && response.response && response.response.games) {
      return response.response;
    }
    return { total_count: 0, games: [] };
  } catch (error) {
    getPluginLogger().error(
      `获取最近玩过的游戏失败 (SteamID: ${steamId}):`,
      error,
    );
    return { total_count: 0, games: [] };
  }
}
