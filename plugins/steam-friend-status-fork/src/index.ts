import { Context, Schema, h } from "koishi";
import { } from "koishi-plugin-puppeteer";
import { SteamUser, SteamUserInfo } from "./types";
import {
  getSteamUserInfoByDatabase,
  getSteamProfile,
  getSteamId,
} from "./steam";
import { bindPlayer, unbindPlayer, unbindAll, downloadAvatar } from "./database";
import {
  getFriendStatusImg,
  initHeadshots,
  getGroupHeadshot,
  getSteamProfileImg,
  getGameChangeImg,
} from "./image";
import {
  startGameSession,
  endGameSession,
  formatPlayTime,
  setUserNickname,
  getUserNickname,
} from "./userdata";
import * as path from "node:path";
import * as fs from "node:fs";

export const name = "steam-friend-status";

export const inject = ["puppeteer", "database"];

export const usage = `
---

<h3>📝 指令列表</h3>

<h4>🔗 账号管理</h4>
<ul>
  <li><code>steam-friend-status.绑定steam 123456789</code> - 绑定自己的 Steam 账号（steamid 可以是好友码或 SteamID）</li>
  <li><code>steam-friend-status.绑定steam 123456789 @用户</code> - 为其他用户绑定 Steam 账号</li>
  <li><code>steam-friend-status.解绑steam</code> - 解绑自己的 Steam 账号</li>
  <li><code>steam-friend-status.解绑steam @用户</code> - 为其他用户解绑 Steam 账号</li>
  <li><code>steam-friend-status.解绑全部steam</code> - 解绑当前频道所有用户的 Steam 账号</li>
</ul>

<h4>📊 状态查看</h4>
<ul>
  <li><code>steam-friend-status.看看steam</code> - 查看当前群所有绑定用户的游戏状态</li>
  <li><code>steam-friend-status.steam信息</code> - 查看自己的好友码和 Steam ID</li>
  <li><code>steam-friend-status.steam信息 @用户</code> - 查看其他用户的好友码和 Steam ID</li>
  <li><code>steam-friend-status.更新steam</code> - 更新所有用户的头像信息</li>
</ul>

<h4>⚙️ 群组设置</h4>
<ul>
  <li><code>steam-friend-status.steam群报 on</code> - 开启群内游戏状态播报（需要管理员权限）</li>
  <li><code>steam-friend-status.steam群报 off</code> - 关闭群内游戏状态播报（需要管理员权限）</li>
</ul>

---

`;

export const Config = Schema.intersect([
  Schema.object({
    SteamApiKey: Schema.string()
      .description(
        "Steam API Key，获取方式：https://partner.steamgames.com/doc/webapi_overview/auth",
      )
      .role("secret")
      .required(),
    interval: Schema.number().default(300).description("查询间隔,单位：秒"),
    useSteamName: Schema.boolean()
      .default(true)
      .description("使用Steam昵称,关闭时使用的QQ昵称"),
    broadcastWithImage: Schema.boolean()
      .default(true)
      .description("播报时附带图片"),
  }).description("基础设置"),

  Schema.object({
    useProxy: Schema.boolean()
      .default(false)
      .description("是否使用代理"),
    proxyUrl: Schema.string()
      .default("http://localhost:7897")
      .description("代理地址（仅支持 http/https 协议）"),
    maxRetries: Schema.number()
      .default(3)
      .min(1)
      .step(1)
      .description("网络请求最大重试次数"),
  }).description("网络设置"),

  Schema.object({
    showcardmode: Schema.union([
      Schema.const("1").description("展示 下方的 botname 与 头像"),
      Schema.const("2").description("展示 当前群组的名称与头像"),
    ])
      .role("radio")
      .description("替换Bot头像与ID为群头像")
      .default("2"),
    showuserIdorsteamId: Schema.boolean()
      .default(false)
      .description("开启后展示用户的steamID，关闭后展示用户的userId"),
    showOfflineFriends: Schema.boolean()
      .default(true)
      .description("显示离线好友，关闭后在【看看steam】指令中不显示离线好友"),
  }).description("fork扩展设置"),
  Schema.union([
    Schema.object({
      showcardmode: Schema.const("1").required(),
      botname: Schema.string()
        .default("Bot of Koishi")
        .description("展示的bot昵称"),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    databasemaxlength: Schema.number()
      .default(500)
      .description(
        "数据表 允许绑定的数据条数上限<br>绑定达到上限时会提示：`该Bot已达到绑定玩家数量上限`",
      ),
    steamIdOffset: Schema.number()
      .default(76561197960265728)
      .description("steamIdOffset")
      .experimental(),
    steamWebApiUrl: Schema.string()
      .description("steam 的 Web Api 请求地址")
      .default(
        "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
      )
      .role("link")
      .experimental(),
    steamstatus: Schema.dict(String)
      .role("table")
      .default({
        "0": "🔘 离线",
        "1": "🟢 在线",
        "2": "⛔ 忙碌",
        "3": "🌙 离开",
        "4": "💤 打盹",
        "5": "🔄 想交易",
        "6": "🎮 想玩",
      })
      .description("steamstatus")
      .experimental(),
    loggerinfo: Schema.boolean().default(false).description("日志调试模式"),
  }).description("开发者设置"),
]);

export function apply(ctx: Context, config) {
  // 扩展数据库和频道模型
  ctx.model.extend("channel", {
    usingSteam: { type: "boolean", initial: false, nullable: false },
    channelName: { type: "string", initial: null, nullable: true },
  });

  ctx.model.extend(
    "SteamUser",
    {
      userId: "string",
      userName: "string",
      steamId: "string",
      steamName: "string",
      effectGroups: "list",
      lastPlayedGame: "string",
      lastUpdateTime: "string",
    },
    { primary: "userId" },
  );

  ctx.on("ready", () => {
    initHeadshots(ctx);
    ctx.setInterval(() => steamInterval(ctx, config), config.interval * 1000);
  });

  // 指令注册
  ctx.command("steam-friend-status", "查询群友steam状态");

  ctx
    .command(
      "steam-friend-status.绑定steam <steamid:string> [user]",
      "绑定steam账号",
    )
    .usage("steamid参数 可以是好友码 也可以是steamID")
    .example("绑定steam 123456789")
    .example("绑定steam 123456789 @用户")
    .action(async ({ session }, steamid, user) => {
      if (!steamid) {
        return "缺少 steamid 参数。";
      }
      let targetUserId: string, targetUsername: string;
      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type !== "at" || !parsedUser.attrs.id) {
          return "无效的用户输入，请使用@用户的格式";
        }
        targetUserId = parsedUser.attrs.id;
        // 从 h.parse 的结果中获取被 @ 用户的昵称
        let rawUsername = parsedUser.attrs.name;
        // 如果昵称以 @ 开头，则移除开头的 @
        if (rawUsername && rawUsername.startsWith('@')) {
          targetUsername = rawUsername.substring(1);
        } else {
          targetUsername = rawUsername;
        }
      }
      const result = await bindPlayer(
        ctx,
        steamid,
        session,
        config.SteamApiKey,
        targetUserId,
        targetUsername,
      );
      await session.send(result);
      if (result === "绑定成功") {
        await session.execute("steam-friend-status.更新steam");
        const steamId = getSteamId(steamid);
        if (steamId) {
          const profileData = await getSteamProfile(ctx, steamId);
          if (profileData) {
            const profileImg = await getSteamProfileImg(ctx, profileData, steamId);
            await session.send(profileImg);
          }
        }
      }
    });

  ctx
    .command("steam-friend-status.解绑steam [user]", "解绑steam账号")
    .action(async ({ session }, user) => {
      let targetUserId = session.userId;
      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type !== "at" || !parsedUser.attrs.id) {
          return "无效的用户输入，请使用@用户的格式";
        }
        targetUserId = parsedUser.attrs.id;
      }
      return await unbindPlayer(ctx, targetUserId, session.channelId);
    });

  ctx
    .command("steam-friend-status.解绑全部steam", "解绑当前频道所有用户的steam账号")
    .action(async ({ session }) => {
      return await unbindAll(ctx, session.channelId);
    });

  ctx
    .command("steam-friend-status.steam群报 <word:text>", "开启或关闭群通报")
    .channelFields(["usingSteam"])
    .userFields(["authority"])
    .action(async ({ session }, text) => {
      const hasPermission =
        session.user.authority > 1 ||
        session.event.member?.roles?.some((role) =>
          ["admin", "owner"].includes(String(role)),
        );
      if (!hasPermission) {
        return "您没有权限执行此操作";
      }
      switch (text) {
        case "on":
        case "开启":
          session.channel.usingSteam = true;
          return "开启成功";
        case "off":
        case "关闭":
          session.channel.usingSteam = false;
          return "关闭成功";
        default:
          return "无效指令，请使用指令【steam-friend-status.steam群报 on】或者【steam-friend-status.steam群报 off】";
      }
    });

  ctx
    .command("steam-friend-status.更新steam", "更新绑定的steam用户的头像")
    .action(async ({ session }) => {
      // 更新指令调用者在当前群组的昵称
      if (session.username && session.channelId) {
        await setUserNickname(ctx, session.userId, session.channelId, session.username);
      }

      await updataPlayerHeadshots(ctx, config.SteamApiKey);
      const image = await session.execute("steam-friend-status.看看steam", true)
      await session.send("更新成功");
      await session.send(image);
      return
    });

  ctx
    .command("steam-friend-status.看看steam", "查看当前绑定过的玩家状态")
    .action(async ({ session }) => {
      const { channelId, bot, username, userId } = session;
      let channelName = "当前群组";

      // 更新当前用户在当前群组的昵称
      if (username && channelId) {
        await setUserNickname(ctx, userId, channelId, username);
      }

      if (typeof bot.getGuild === "function") {
        try {
          const guild = await bot.getGuild(channelId);
          channelName = guild.name;
          await ctx.database.set("channel", { id: channelId }, { channelName });
        } catch (error) {
          ctx.logger.warn("获取群组名称失败:", error);
        }
      }

      const allUserData = await ctx.database.get("SteamUser", {});
      const users = selectUsersByGroup(allUserData, channelId);
      if (users.length === 0) {
        return "本群无人绑定";
      }

      const data = await getSteamUserInfoByDatabase(
        ctx,
        users,
        config.SteamApiKey,
      );
      if (!data) {
        return "获取 Steam 用户信息失败，请稍后再试。";
      }

      logInfo(data);
      if (config.showcardmode === "1") {
        return await getFriendStatusImg(ctx, data, session.selfId);
      } else {
        await getGroupHeadshot(ctx, channelId);
        return await getFriendStatusImg(
          ctx,
          data,
          session.selfId,
          channelId,
          channelName,
        );
      }
    });

  ctx
    .command(
      "steam-friend-status.steam信息 [user]",
      "查看自己或其他用户的好友码和ID",
    )
    .action(async ({ session }, user) => {
      let targetUserId = session.userId;
      // 如果指定了用户，则解析用户ID
      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type !== "at" || !parsedUser.attrs.id) {
          return "无效的用户输入，请使用@用户的格式";
        }
        targetUserId = parsedUser.attrs.id;
      }

      // 从数据库获取用户信息
      const userdata = await ctx.database.get("SteamUser", {
        userId: targetUserId,
      });

      // 检查用户是否绑定
      if (userdata.length === 0) {
        return "用户未绑定,无法获得好友码";
      }

      const steamID = userdata[0].steamId;
      const steamFriendCode = BigInt(steamID) - BigInt(config.steamIdOffset);

      // 根据是否查询他人来构造不同的回复消息
      if (user) {
        await session.send([
          h.at(targetUserId),
          ` 的好友码为: ${steamFriendCode.toString()}`,
        ]);
      } else {
        await session.send(`你的好友码为: ${steamFriendCode.toString()}`);
      }

      // 获取并发送 Steam 个人主页图片
      const profileData = await getSteamProfile(ctx, steamID);
      if (profileData) {
        const profileImg = await getSteamProfileImg(ctx, profileData, steamID);
        await session.send(profileImg);
      } else {
        ctx.logger.warn(`无法获取 Steam 个人主页信息: ${steamID}`);
      }
    });

  // 循环检测玩家状态
  async function steamInterval(ctx: Context, config) {
    const allUserData = await ctx.database.get("SteamUser", {});
    const userdata = await getSteamUserInfoByDatabase(
      ctx,
      allUserData,
      config.SteamApiKey,
    );
    if (!userdata) return;

    const changeMessage = await getUserStatusChanged(
      ctx,
      userdata,
      config.useSteamName,
    );
    if (!changeMessage || Object.keys(changeMessage).length === 0) {
      return;
    }

    const supportPlatform = ["onebot", "red", "chronocat"];
    const channels = await ctx.database.get("channel", {
      usingSteam: true,
      platform: { $in: supportPlatform },
    });

    for (const channel of channels) {
      const groupMessage: GameChangeInfo[] = [];
      for (const user of allUserData) {
        if (
          user.effectGroups.includes(channel.id) &&
          changeMessage[user.userId]
        ) {
          groupMessage.push(changeMessage[user.userId]);
        }
      }

      if (groupMessage.length > 0) {
        const bot = ctx.bots[`${channel.platform}:${channel.assignee}`];
        if (bot) {
          for (const changeInfo of groupMessage) {
            const user = allUserData.find((u) => u.userId === changeInfo.userId);
            if (user) {
              const playerInfo = userdata.response.players.find(
                (p) => p.steamid === user.steamId,
              );

              // 获取用户在当前群组的昵称
              const channelNickname = await getUserNickname(ctx, changeInfo.userId, channel.id);
              const displayName = channelNickname || changeInfo.userName;

              // 重新构建文本消息
              let textMessage = "";
              if (changeInfo.status === "start") {
                textMessage = `${displayName} 开始玩 ${changeInfo.newGame} 了`;
              } else if (changeInfo.status === "stop") {
                // 如果有游玩时长，添加到消息中
                if (changeInfo.playTime) {
                  textMessage = `${displayName} 不玩 ${changeInfo.oldGame} 了，玩了 ${changeInfo.playTime}`;
                } else {
                  textMessage = `${displayName} 不玩 ${changeInfo.oldGame} 了`;
                }
              } else if (changeInfo.status === "change") {
                // 如果有游玩时长，添加到消息中
                if (changeInfo.playTime) {
                  textMessage = `${displayName} 不玩 ${changeInfo.oldGame} 了，玩了 ${changeInfo.playTime}，开始玩 ${changeInfo.newGame} 了`;
                } else {
                  textMessage = `${displayName} 不玩 ${changeInfo.oldGame} 了，开始玩 ${changeInfo.newGame} 了`;
                }
              }

              // 捕获发送消息的错误，避免一个群发送失败影响其他群
              try {
                if (playerInfo && config.broadcastWithImage) {
                  const image = await getGameChangeImg(ctx, playerInfo, changeInfo);
                  await bot.sendMessage(channel.id, [h.text(textMessage), image]);
                } else {
                  await bot.sendMessage(channel.id, textMessage);
                }
              } catch (error) {
                ctx.logger.warn(`向群组 ${channel.id} 发送消息失败:`, error);
              }
            }
          }
        }
      }
    }
  }

  // 更新所有绑定用户的头像
  async function updataPlayerHeadshots(ctx: Context, apiKey: string) {
    const allUserData = await ctx.database.get("SteamUser", {});
    const userdata = await getSteamUserInfoByDatabase(ctx, allUserData, apiKey);
    if (!userdata) return;

    for (const player of userdata.response.players) {
      const success = await downloadAvatar(ctx, player.avatarmedium, player.steamid);
      if (!success) {
        ctx.logger.error(`更新头像失败 (SteamID: ${player.steamid})`);
      }
    }
  }


  // 筛选在特定群组中的用户
  function selectUsersByGroup(
    steamusers: SteamUser[],
    groupid: string,
  ): SteamUser[] {
    return steamusers.filter((user) => user.effectGroups.includes(groupid));
  }

  // 检查玩家状态是否变化
  // 定义游戏状态变化的数据结构
  interface GameChangeInfo {
    userId: string;
    userName: string;
    status: "start" | "stop" | "change";
    oldGame?: string;
    newGame?: string;
    playTime?: string; // 游玩时长（格式化后的字符串）
  }

  // 检查玩家状态是否变化，返回结构化数据
  async function getUserStatusChanged(
    ctx: Context,
    steamUserInfo: SteamUserInfo,
    usingSteamName: boolean,
  ): Promise<{ [key: string]: GameChangeInfo }> {
    if (!steamUserInfo) return {};
    const changes: { [key: string]: GameChangeInfo } = {};
    for (const player of steamUserInfo.response.players) {
      const userData = (
        await ctx.database.get("SteamUser", { steamId: player.steamid })
      )[0];
      if (!userData) continue;

      if (userData.steamName !== player.personaname) {
        await ctx.database.set(
          "SteamUser",
          { steamId: player.steamid },
          { steamName: player.personaname },
        );
      }

      const userName = usingSteamName ? player.personaname : userData.userName;
      // 对正在玩的游戏名称进行 trim 操作，防止因为空格导致重复播报
      const newGame = player.gameextrainfo?.trim();
      const oldGame = userData.lastPlayedGame;
      // 同时对新旧游戏名称进行 trim 操作，确保比较的准确性
      const trimmedOldGame = oldGame?.trim();

      let changeInfo: GameChangeInfo = null;
      if (newGame && !trimmedOldGame) {
        // 开始玩游戏
        changeInfo = {
          userId: userData.userId,
          userName,
          status: "start",
          newGame,
        };
        // 记录游戏开始时间
        await startGameSession(ctx, userData.userId, newGame);
      } else if (newGame && trimmedOldGame && newGame !== trimmedOldGame) {
        // 切换游戏
        // 结束旧游戏会话并获取游玩时长
        const playTimeMinutes = await endGameSession(ctx, userData.userId);
        changeInfo = {
          userId: userData.userId,
          userName,
          status: "change",
          oldGame: trimmedOldGame,
          newGame,
          playTime: playTimeMinutes ? formatPlayTime(playTimeMinutes) : undefined,
        };
        // 开始新游戏会话
        await startGameSession(ctx, userData.userId, newGame);
      } else if (!newGame && trimmedOldGame) {
        // 停止玩游戏
        const playTimeMinutes = await endGameSession(ctx, userData.userId);
        changeInfo = {
          userId: userData.userId,
          userName,
          status: "stop",
          oldGame: trimmedOldGame,
          playTime: playTimeMinutes ? formatPlayTime(playTimeMinutes) : undefined,
        };
      }

      if (changeInfo) {
        changes[userData.userId] = changeInfo;
      }

      await ctx.database.set(
        "SteamUser",
        { steamId: userData.steamId },
        { lastPlayedGame: newGame || "" },
      );
    }
    return changes;
  }

  // 日志记录
  function logInfo(...args: any[]) {
    if (config.loggerinfo) {
      (ctx.logger.info as (...args: any[]) => void)(...args);
    }
  }
}
