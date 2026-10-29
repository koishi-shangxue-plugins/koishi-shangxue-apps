import { Context, Schema, h } from "koishi";
import { } from "koishi-plugin-puppeteer";
import {
  getSteamUserInfoByDatabase,
  getSteamProfile,
  getSteamId,
} from "./steam";
import {
  bindPlayer,
  unbindPlayer,
  unbindAll,
  selectUsersByGroup,
} from "./database";
import {
  getFriendStatusImg,
  initHeadshots,
  getGroupHeadshot,
  getSteamProfileImg,
} from "./image";
import {
  setUserNickname,
} from "./userdata";
import { initializePluginLogger } from "./logger";
import { pollSteamBroadcast, updatePlayerHeadshots } from "./broadcast";

export const name = "steam-friend-status-fork";

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
    interval: Schema.number()
      .default(300)
      .min(10)
      .description("查询间隔,单位：秒"),
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
      .description("代理地址（支持 http/https/socks5/socks5h 协议）"),
    useApifoxProxy: Schema.boolean()
      .default(true)
      .description(
        "Steam API 直连失败时使用 APIFOX 公共代理兜底（请求 URL 会发送给代理）",
      ),
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
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
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

export interface PluginConfig {
  SteamApiKey: string;
  interval: number;
  useSteamName: boolean;
  broadcastWithImage: boolean;
  useProxy: boolean;
  proxyUrl: string;
  useApifoxProxy: boolean;
  maxRetries: number;
  showcardmode: "1" | "2";
  showuserIdorsteamId: boolean;
  showOfflineFriends: boolean;
  botname?: string;
  databasemaxlength: number;
  steamIdOffset: number;
  steamWebApiUrl: string;
  steamstatus: Record<string, string>;
  loggerinfo: boolean;
}

export function apply(ctx: Context, config: PluginConfig) {
  const logger = initializePluginLogger(ctx, config.loggerinfo);

  // 保留旧字段以兼容已有数据库，播报逻辑不再依赖该开关
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

  let disposed = false;
  let polling = false;
  let disposeInterval: (() => void) | undefined;

  // 避免慢请求与下一轮轮询叠加
  const runPoll = () => {
    if (disposed) return;
    if (polling) {
      logger.debug("上一轮 Steam 查询尚未结束，跳过本轮");
      return;
    }

    polling = true;
    void pollSteamBroadcast(
      ctx,
      config,
      logger,
      () => disposed,
    )
      .catch((error) => {
        logger.error("Steam 状态轮询失败:", error);
      })
      .finally(() => {
        polling = false;
      });
  };

  ctx.on("ready", () => {
    void initHeadshots(ctx, () => disposed).catch((error) => {
      logger.error("初始化 Steam 头像失败:", error);
    });

    // 启动后立即查询一次，避免 HMR 或重启后空等一个轮询周期
    ctx.setTimeout(runPoll, 1000);
    disposeInterval = ctx.setInterval(
      runPoll,
      Math.max(config.interval, 10) * 1000,
    );
  });

  ctx.on("dispose", () => {
    disposed = true;
    polling = false;
    disposeInterval?.();
    disposeInterval = undefined;
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
    .command("steam-friend-status.更新steam", "更新绑定的steam用户的头像")
    .action(async ({ session }) => {
      // 更新指令调用者在当前群组的昵称
      if (session.username && session.channelId) {
        await setUserNickname(ctx, session.userId, session.channelId, session.username);
      }

      await updatePlayerHeadshots(ctx, config, logger);
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
          logger.warn("获取群组名称失败:", error);
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

      logger.debug("看看steam 查询结果:", data);
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
        logger.warn(`无法获取 Steam 个人主页信息: ${steamID}`);
      }
    });

}
