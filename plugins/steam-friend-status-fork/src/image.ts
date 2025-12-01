// src/image.ts
import { Context, h } from "koishi";
import { SteamUserInfo } from "./types";
import * as fs from "node:fs";
import * as path from "node:path";
import * as URL from "node:url";

/**
 * 初始化机器人和群组的头像缓存
 * @param ctx Koishi context
 */
export async function initHeadshots(ctx: Context) {
  const sourcepath = path.join(ctx.baseDir, `data/steam-friend-status`);
  const imgpath = path.join(sourcepath, "img");

  if (!fs.existsSync(sourcepath)) {
    fs.mkdirSync(sourcepath, { recursive: true });
  }
  if (!fs.existsSync(imgpath)) {
    fs.mkdirSync(imgpath);
  }

  const channels = await ctx.database.get("channel", {});
  const botsToProcess = new Set<string>();

  for (const channel of channels) {
    const platforms = ["onebot", "red", "chronocat"];
    if (platforms.includes(channel.platform)) {
      botsToProcess.add(channel.assignee);
      if (channel.usingSteam) {
        await getGroupHeadshot(ctx, channel.id);
      }
    }
  }

  for (const botId of botsToProcess) {
    await getBotHeadshot(ctx, botId);
  }
}

/**
 * 获取并保存群组头像
 * @param ctx Koishi context
 * @param groupid 群组ID
 */
export async function getGroupHeadshot(
  ctx: Context,
  groupid: string,
): Promise<void> {
  const imgpath = path.join(ctx.baseDir, "data/steam-friend-status/img");
  const filepath = path.join(imgpath, `group${groupid}.jpg`);
  try {
    const groupheadshot = await ctx.http.get(
      `http://p.qlogo.cn/gh/${groupid}/${groupid}/0`,
      { responseType: "arraybuffer" },
    );
    fs.writeFileSync(filepath, Buffer.from(groupheadshot));
  } catch (error) {
    ctx.logger.error(`获取群组 ${groupid} 头像失败:`, error);
  }
}

/**
 * 获取并保存机器人头像
 * @param ctx Koishi context
 * @param userid 用户ID (机器人ID)
 */
export async function getBotHeadshot(ctx: Context, userid: string) {
  const imgpath = path.join(ctx.baseDir, "data/steam-friend-status/img");
  const filepath = path.join(imgpath, `bot${userid}.jpg`);
  try {
    const userheadshot = await ctx.http.get(
      `http://q.qlogo.cn/headimg_dl?dst_uin=${userid}&spec=640`,
      { responseType: "arraybuffer" },
    );
    fs.writeFileSync(filepath, Buffer.from(userheadshot));
  } catch (error) {
    ctx.logger.error(`获取机器人 ${userid} 头像失败:`, error);
  }
}

/**
 * 使用 Puppeteer 生成好友状态图片
 * @param ctx Koishi context
 * @param userData 从 Steam API 获取的用户数据
 * @param botid 机器人ID
 * @param channelid 可选，频道ID
 * @param channelname 可选，频道名称
 * @returns 返回一个 h.image 元素
 */
export async function getFriendStatusImg(
  ctx: Context,
  userData: SteamUserInfo,
  botid: string,
  channelid?: string,
  channelname?: string,
) {
  const { config } = ctx;
  const resourcePath = path.join(ctx.baseDir, 'data', 'steam-friend-status');
  const templatePath = path.resolve(__dirname, '..', 'data', 'html', 'steamFriendList.html');

  const gamingUsers = userData.response.players.filter((p) => p.gameextrainfo);
  const onlineUsers = userData.response.players
    .filter((p) => p.personastate !== 0 && !p.gameextrainfo)
    .sort((a, b) => a.personastate - b.personastate);
  const offlineUsers = config.showOfflineFriends
    ? userData.response.players.filter((p) => p.personastate === 0)
    : [];

  const url = URL.pathToFileURL(templatePath).href;

  const convertImageToBase64 = async (filePath) => {
    try {
      const data = await fs.promises.readFile(filePath);
      return `data:image/jpeg;base64,${data.toString("base64")}`;
    } catch {
      // 如果图片不存在，返回一个默认的占位图
      return `data:image/jpeg;base64,...`; // 省略默认图片数据
    }
  };

  let botname;
  let headshotBase64 = "";
  if (channelid) {
    botname = channelname || `当前群组`;
    await getGroupHeadshot(ctx, channelid);
    headshotBase64 = await convertImageToBase64(
      path.join(resourcePath, 'img', `group${channelid}.jpg`),
    );
  } else {
    botname = config.botname;
    await getBotHeadshot(ctx, botid);
    headshotBase64 = await convertImageToBase64(
      path.join(resourcePath, 'img', `bot${botid}.jpg`),
    );
  }

  const allUserData = await ctx.database.get("SteamUser", {});
  const findUserId = (steamId) =>
    allUserData.find((u) => u.steamId === steamId)?.userName || steamId;

  const page = await ctx.puppeteer.page();
  const displayedUsers =
    gamingUsers.length +
    onlineUsers.length +
    (config.showOfflineFriends ? offlineUsers.length : 0);
  const displayedGroups =
    (gamingUsers.length > 0 ? 1 : 0) +
    (onlineUsers.length > 0 ? 1 : 0) +
    (config.showOfflineFriends && offlineUsers.length > 0 ? 1 : 0);
  const totalHeight = 75 + 30 + 15 + displayedGroups * 28 + displayedUsers * 46;
  await page.setViewport({
    width: 227,
    height: totalHeight,
    deviceScaleFactor: 2,
  });
  await page.goto(url);

  const gamingUsersBase64 = await Promise.all(
    gamingUsers.map((u) =>
      convertImageToBase64(
        path.join(
          resourcePath,
          'img',
          `steamuser${u.steamid}.jpg`,
        ),
      ),
    ),
  );
  const onlineUsersBase64 = await Promise.all(
    onlineUsers.map((u) =>
      convertImageToBase64(
        path.join(
          resourcePath,
          'img',
          `steamuser${u.steamid}.jpg`,
        ),
      ),
    ),
  );
  const offlineUsersBase64 = await Promise.all(
    offlineUsers.map((u) =>
      convertImageToBase64(
        path.join(
          resourcePath,
          'img',
          `steamuser${u.steamid}.jpg`,
        ),
      ),
    ),
  );

  const processedGamingUsers = gamingUsers.map((u) => ({
    ...u,
    displayName: config.showuserIdorsteamId ? u.steamid : findUserId(u.steamid),
  }));
  const processedOnlineUsers = onlineUsers.map((u) => ({
    ...u,
    displayName: config.showuserIdorsteamId ? u.steamid : findUserId(u.steamid),
  }));
  const processedOfflineUsers = offlineUsers.map((u) => ({
    ...u,
    displayName: config.showuserIdorsteamId ? u.steamid : findUserId(u.steamid),
  }));

  await page.evaluate(
    (data) => {
      // 页面渲染逻辑 (与原版类似，但使用传入的数据对象)
      // ...
    },
    {
      headshotBase64,
      botname,
      gamingUsersBase64,
      onlineUsersBase64,
      offlineUsersBase64,
      steamstatus: config.steamstatus,
      processedGamingUsers,
      processedOnlineUsers,
      processedOfflineUsers,
      showOfflineFriends: config.showOfflineFriends,
    },
  );

  const image = await page.screenshot({
    fullPage: true,
    type: "png",
    encoding: "binary",
  });
  await page.close();
  return h.image(image, "image/png");
}
import { SteamProfile } from "./types";
import * as handlebars from "handlebars";

/**
 * 使用 Puppeteer 和 Handlebars 生成 Steam 个人主页图片
 * @param ctx Koishi context
 * @param profileData 从 Steam 个人主页抓取的数据
 * @returns 返回一个 h.image 元素
 */
export async function getSteamProfileImg(
  ctx: Context,
  profileData: SteamProfile,
) {
  const templatePath = path.resolve(__dirname, '..', 'data', 'html', 'steamProfile.html');
  const templateSource = fs.readFileSync(templatePath, "utf8");
  const template = handlebars.compile(templateSource);
  const htmlContent = template(profileData);

  const page = await ctx.puppeteer.page();
  await page.setContent(htmlContent);

  const clip = await page.evaluate(() => {
    const element = document.querySelector(".profile-card");
    if (!element) return null;
    const { width, height, top, left } = element.getBoundingClientRect();
    return { width, height, x: left, y: top };
  });

  if (!clip) {
    await page.close();
    return "无法生成个人主页图片。";
  }

  await page.setViewport({
    width: Math.ceil(clip.width),
    height: Math.ceil(clip.height),
  });
  const image = await page.screenshot({
    clip,
    type: "png",
    encoding: "binary",
  });
  await page.close();
  return h.image(image, "image/png");
}
/**
 * 生成游戏状态变化播报的图片
 * @param ctx Koishi context
 * @param avatarUrl 玩家头像的URL
 * @param message 播报消息
 * @returns 返回一个 h.image 元素
 */
export async function getGameChangeImg(
  ctx: Context,
  avatarUrl: string,
  message: string,
) {
  const templatePath = path.resolve(__dirname, '..', 'data', 'html', 'gameChange.html');
  const templateSource = fs.readFileSync(templatePath, "utf8");
  const template = handlebars.compile(templateSource);

  // 将头像图片转换为Base64
  let avatarBase64 = "";
  try {
    const avatarBuffer = await ctx.http.get(avatarUrl, {
      responseType: "arraybuffer",
    });
    avatarBase64 = `data:image/jpeg;base64,${Buffer.from(avatarBuffer).toString("base64")}`;
  } catch (error) {
    ctx.logger.error("下载播报头像失败:", error);
    // 可以设置一个默认头像
  }

  const htmlContent = template({ avatar: avatarBase64, message });

  const page = await ctx.puppeteer.page();
  await page.setContent(htmlContent);

  const clip = await page.evaluate(() => {
    const element = document.querySelector(".card");
    if (!element) return null;
    const { width, height, top, left } = element.getBoundingClientRect();
    return { width, height, x: left, y: top };
  });

  if (!clip) {
    await page.close();
    return "无法生成播报图片。";
  }

  await page.setViewport({
    width: Math.ceil(clip.width),
    height: Math.ceil(clip.height),
  });
  const image = await page.screenshot({
    clip,
    type: "png",
    encoding: "binary",
  });
  await page.close();
  return h.image(image, "image/png");
}
