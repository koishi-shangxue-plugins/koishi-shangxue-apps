// src/image.ts
import { Context, h } from "koishi";
import { SteamUserInfo } from "./types";
import { fetchArrayBuffer } from "./fetch";
import { downloadAvatar } from "./database";
import { getSteamUserInfoByDatabase } from "./steam";
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

  // 获取群组和机器人头像
  for (const channel of channels) {
    const platforms = ["onebot", "red", "chronocat"];
    if (platforms.includes(channel.platform)) {
      botsToProcess.add(channel.assignee);
      if (channel.usingSteam) {
        await getGroupHeadshot(ctx, channel.id, channel.assignee);
      }
    }
  }

  for (const botId of botsToProcess) {
    await getBotHeadshot(ctx, botId);
  }

  // 获取所有 Steam 用户头像
  ctx.logger.info('开始初始化 Steam 用户头像...');
  // 使用 select 方法获取所有记录，不受默认限制
  const allSteamUsers = await ctx.database.select("SteamUser").execute();

  ctx.logger.info(`数据库中共有 ${allSteamUsers.length} 个 Steam 用户`);

  if (allSteamUsers.length > 0) {
    // 批量获取用户信息
    const steamUserInfo = await getSteamUserInfoByDatabase(ctx, allSteamUsers, ctx.config.SteamApiKey);

    if (steamUserInfo && steamUserInfo.response && steamUserInfo.response.players) {
      let downloadedCount = 0;
      for (const player of steamUserInfo.response.players) {
        const localAvatarPath = path.join(imgpath, `steamuser${player.steamid}.jpg`);

        // 如果本地不存在头像，下载
        if (!fs.existsSync(localAvatarPath)) {
          await downloadAvatar(ctx, player.avatarmedium, player.steamid);
          downloadedCount++;
        }
      }

      ctx.logger.info(`Steam 用户头像初始化完成，共处理 ${steamUserInfo.response.players.length} 个用户，下载了 ${downloadedCount} 个新头像`);
    }
  }
}

/**
 * 获取并保存群组头像
 * @param ctx Koishi context
 * @param groupid 群组ID
 * @param botId 机器人ID
 */
export async function getGroupHeadshot(
  ctx: Context,
  groupid: string,
  botId?: string,
): Promise<void> {
  // 如果 botId 为 undefined，跳过处理
  if (!botId) {
    return;
  }

  const imgpath = path.join(ctx.baseDir, "data/steam-friend-status/img");
  const filepath = path.join(imgpath, `group${groupid}.jpg`);

  // 如果本地已存在头像文件，跳过下载
  if (fs.existsSync(filepath)) {
    return;
  }

  try {
    // 尝试通过 bot API 获取群组信息
    let avatarUrl: string | undefined;
    let botPlatform: string | undefined;

    const bot = Object.values(ctx.bots).find(b => b.selfId === botId || b.user?.id === botId);
    if (!bot) {
      // 机器人不在线或不存在，跳过（可能是数据库中的旧数据）
      return;
    }

    botPlatform = bot.platform;
    if (typeof bot.getGuild === 'function') {
      try {
        const guild = await bot.getGuild(groupid);
        avatarUrl = guild?.avatar;
      } catch (error) {
        ctx.logger.warn(`通过 bot API 获取群组 ${groupid} 信息失败:`, error);
      }
    }

    // 如果是 onebot 平台且没有获取到头像，使用拼接的 URL
    if (!avatarUrl && botPlatform == "onebot") {
      avatarUrl = `http://p.qlogo.cn/gh/${groupid}/${groupid}/0`;
    }

    // 如果没有获取到头像 URL，跳过
    if (!avatarUrl) {
      ctx.logger.warn(`无法获取群组 ${groupid} 的头像 URL`);
      return;
    }

    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      maxRetries: ctx.config.maxRetries
    };
    const groupheadshot = await fetchArrayBuffer(ctx, avatarUrl, config);
    fs.writeFileSync(filepath, Buffer.from(groupheadshot));
  } catch (error) {
    ctx.logger.error(`获取群组 ${groupid} 头像失败:`, error);
  }
}

/**
 * 获取并保存机器人头像
 * @param ctx Koishi context
 * @param botId 机器人ID
 */
export async function getBotHeadshot(ctx: Context, botId: string) {
  const imgpath = path.join(ctx.baseDir, "data/steam-friend-status/img");
  const filepath = path.join(imgpath, `bot${botId}.jpg`);
  try {
    // 直接获取机器人自己的头像
    let avatarUrl: string | undefined;
    let botPlatform: string | undefined;

    const bot = Object.values(ctx.bots).find(b => b.selfId === botId || b.user?.id === botId);
    if (!bot) {
      // 机器人不在线或不存在，跳过（可能是数据库中的旧数据）
      return;
    }

    botPlatform = bot.platform;
    // 直接使用 bot.user.avatar 获取机器人头像
    avatarUrl = bot.user?.avatar;

    // 如果是 onebot 平台且没有获取到头像，使用拼接的 URL
    if (!avatarUrl && botPlatform === "onebot") {
      avatarUrl = `http://q.qlogo.cn/headimg_dl?dst_uin=${botId}&spec=640`;
    }

    // 如果没有获取到头像 URL，跳过
    if (!avatarUrl) {
      ctx.logger.warn(`无法获取机器人 ${botId} 的头像 URL`);
      return;
    }

    const config = {
      useProxy: ctx.config.useProxy,
      proxyUrl: ctx.config.proxyUrl,
      maxRetries: ctx.config.maxRetries
    };
    const userheadshot = await fetchArrayBuffer(ctx, avatarUrl, config);
    fs.writeFileSync(filepath, Buffer.from(userheadshot));
  } catch (error) {
    ctx.logger.error(`获取机器人 ${botId} 头像失败:`, error);
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
      const unknownAvatarPath = path.resolve(
        __dirname,
        "..",
        "data",
        "res",
        "unknown_avatar.jpg",
      );
      const unknownAvatarBase64 = fs.readFileSync(
        unknownAvatarPath,
        "base64",
      );
      return `data:image/jpeg;base64,${unknownAvatarBase64}`;
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
      const {
        headshotBase64,
        botname,
        gamingUsersBase64,
        onlineUsersBase64,
        offlineUsersBase64,
        steamstatus,
        processedGamingUsers,
        processedOnlineUsers,
        processedOfflineUsers,
        showOfflineFriends,
      } = data;

      const bot = document.getElementsByClassName("bot")[0];
      const botHeadshot = bot.querySelector("img");
      const botName = bot.querySelector("p");
      const gamingList = document.getElementById("ul-gaming");
      const onlineList = document.getElementById("ul-online");
      const offlineList = document.getElementById("ul-offline");
      const titles = document.getElementsByClassName("title");

      botHeadshot.setAttribute("src", headshotBase64);
      botName.innerHTML = `<b>${botname}</b>`;

      titles[0].innerHTML = `游戏中(${processedGamingUsers.length})`;
      titles[1].innerHTML = `在线好友(${processedOnlineUsers.length})`;
      if (showOfflineFriends) {
        titles[2].innerHTML = `离线好友(${processedOfflineUsers.length})`;
      } else {
        const offlineGroup = titles[2].parentElement;
        (offlineGroup as HTMLElement).style.display = "none";
        const onlineGroup = titles[1].parentElement;
        (onlineGroup as HTMLElement).style.borderBottom = "none";
      }

      processedGamingUsers.forEach((user, i) => {
        const li = document.createElement("li");
        li.setAttribute("class", "friend");
        li.innerHTML = `
          <img src="${gamingUsersBase64[i]}" class="headshot-online">
          <div class="name-and-status">
              <p class="name-gaming">${user.personaname}(${user.displayName})</p>
              <p class="status-gaming">${user.gameextrainfo}</p>
          </div>`;
        gamingList.appendChild(li);
      });

      processedOnlineUsers.forEach((user, i) => {
        const li = document.createElement("li");
        li.setAttribute("class", "friend");
        li.innerHTML = `
          <img src="${onlineUsersBase64[i]}" class="headshot-online">
          <div class="name-and-status">
              <p class="name-online">${user.personaname}(${user.displayName})</p>
              <p class="status-online">${steamstatus[user.personastate]}</p>
          </div>`;
        onlineList.appendChild(li);
      });

      if (showOfflineFriends) {
        processedOfflineUsers.forEach((user, i) => {
          const li = document.createElement("li");
          li.setAttribute("class", "friend");
          li.innerHTML = `
            <img src="${offlineUsersBase64[i]}" class="headshot-offline">
            <div class="name-and-status">
                <p class="name-offline">${user.personaname}(${user.displayName})</p>
                <p class="status-offline">${steamstatus[user.personastate]}</p>
            </div>`;
          offlineList.appendChild(li);
        });
      }
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

/**
 * 使用 Puppeteer 和字符串替换生成 Steam 个人主页图片
 * @param ctx Koishi context
 * @param profileData 从 Steam 个人主页抓取的数据
 * @returns 返回一个 h.image 元素
 */
export async function getSteamProfileImg(
  ctx: Context,
  profileData: SteamProfile,
  steamId: string,
) {
  const templatePath = path.resolve(__dirname, '..', 'data', 'html', 'steamProfile.html');
  let htmlContent = fs.readFileSync(templatePath, "utf8");

  // 读取背景图片并转换为 Base64
  const backgroundPath = path.resolve(
    __dirname,
    "..",
    "data",
    "res",
    "bg_dots.png",
  );
  const backgroundBase64 = fs.readFileSync(backgroundPath, "base64");

  // 读取本地头像并转换为 Base64
  let avatarBase64 = "";
  const localAvatarPath = path.join(
    ctx.baseDir,
    'data',
    'steam-friend-status',
    'img',
    `steamuser${steamId}.jpg`
  );

  try {
    if (fs.existsSync(localAvatarPath)) {
      const localAvatarBuffer = fs.readFileSync(localAvatarPath);
      avatarBase64 = `data:image/jpeg;base64,${localAvatarBuffer.toString("base64")}`;
    } else {
      // 使用默认头像
      const unknownAvatarPath = path.resolve(
        __dirname,
        "..",
        "data",
        "res",
        "unknown_avatar.jpg",
      );
      const unknownAvatarBuffer = fs.readFileSync(unknownAvatarPath);
      avatarBase64 = `data:image/jpeg;base64,${unknownAvatarBuffer.toString("base64")}`;
    }
  } catch (error) {
    ctx.logger.error("读取 Steam 个人资料头像失败:", error);
    // 使用默认头像
    const unknownAvatarPath = path.resolve(
      __dirname,
      "..",
      "data",
      "res",
      "unknown_avatar.jpg",
    );
    const unknownAvatarBuffer = fs.readFileSync(unknownAvatarPath);
    avatarBase64 = `data:image/jpeg;base64,${unknownAvatarBuffer.toString("base64")}`;
  }

  // 替换基础信息
  htmlContent = htmlContent
    .replace(
      "{{background}}",
      `data:image/png;base64,${backgroundBase64}`,
    )
    .replace("{{avatar}}", avatarBase64)
    .replace("{{name}}", profileData.name)
    .replace("{{level}}", profileData.level)
    .replace("{{status}}", profileData.status);

  // 构建最近游戏列表的 HTML
  let gamesHtml = "";
  if (profileData.recentGames && profileData.recentGames.length > 0) {
    for (const game of profileData.recentGames) {
      gamesHtml += `
        <div class="game">
          <img class="game-banner" src="${game.img}">
          <div class="game-details">
            <div class="game-name">${game.name}</div>
            <div class="game-hours">${game.hours}</div>
          </div>
        </div>`;
    }
  } else {
    gamesHtml = "<p>最近没有玩过游戏。</p>";
  }
  htmlContent = htmlContent.replace("{{recentGames}}", gamesHtml);

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
// 定义传入的数据结构，与 index.ts 中保持一致
interface GameChangeInfo {
  userName: string;
  status: "start" | "stop" | "change";
  oldGame?: string;
  newGame?: string;
}

/**
 * 生成游戏状态变化播报的图片 (新版)
 * @param ctx Koishi context
 * @param playerInfo 玩家的 Steam 信息
 * @param changeInfo 游戏状态变化信息
 * @returns 返回一个 h.image 元素
 */
export async function getGameChangeImg(
  ctx: Context,
  playerInfo: SteamUserInfo["response"]["players"][0],
  changeInfo: GameChangeInfo,
) {
  const templatePath = path.resolve(
    __dirname,
    "..",
    "data",
    "html",
    "gameChange.html",
  );
  let htmlContent = fs.readFileSync(templatePath, "utf8");

  // 1. 获取头像并转换为 Base64
  let avatarBase64 = "";
  const localAvatarPath = path.join(
    ctx.baseDir,
    'data',
    'steam-friend-status',
    'img',
    `steamuser${playerInfo.steamid}.jpg`
  );

  // 检查本地是否有头像文件
  if (fs.existsSync(localAvatarPath)) {
    // 使用本地头像
    const localAvatarBase64 = fs.readFileSync(localAvatarPath, "base64");
    avatarBase64 = `data:image/jpeg;base64,${localAvatarBase64}`;
  } else {
    // 本地没有头像，尝试下载
    ctx.logger.info(`本地未找到用户 ${playerInfo.steamid} 的头像，尝试下载...`);
    const downloadSuccess = await downloadAvatar(ctx, playerInfo.avatarmedium, playerInfo.steamid);

    if (downloadSuccess && fs.existsSync(localAvatarPath)) {
      const localAvatarBase64 = fs.readFileSync(localAvatarPath, "base64");
      avatarBase64 = `data:image/jpeg;base64,${localAvatarBase64}`;
    } else {
      // 下载失败，使用默认头像
      ctx.logger.warn(`下载用户 ${playerInfo.steamid} 头像失败，使用默认头像`);
      const unknownAvatarPath = path.resolve(
        __dirname,
        "..",
        "data",
        "res",
        "unknown_avatar.jpg",
      );
      const unknownAvatarBase64 = fs.readFileSync(unknownAvatarPath, "base64");
      avatarBase64 = `data:image/jpeg;base64,${unknownAvatarBase64}`;
    }
  }

  // 2. 根据状态确定文本和样式
  let statusText = "";
  let gameName = "";
  let statusClass = "ingame"; // 默认为游戏中

  if (changeInfo.status === "start") {
    statusText = "正在玩";
    gameName = changeInfo.newGame;
    statusClass = "ingame";
  } else if (changeInfo.status === "stop") {
    statusText = "停止玩";
    gameName = changeInfo.oldGame;
    statusClass = "online"; // 停止玩游戏后，状态可视为普通在线
  } else if (changeInfo.status === "change") {
    statusText = "现在玩";
    gameName = changeInfo.newGame;
    statusClass = "ingame";
  }

  // 3. 替换模板中的占位符
  const backgroundPath = path.resolve(
    __dirname,
    "..",
    "data",
    "res",
    "gaming.png",
  );
  const backgroundBase64 = fs.readFileSync(backgroundPath, "base64");
  htmlContent = htmlContent
    .replace(
      "{{background}}",
      `data:image/png;base64,${backgroundBase64}`,
    )
    .replace("{{avatar}}", avatarBase64)
    .replace("{{statusClass}}", statusClass)
    .replace("{{username}}", changeInfo.userName)
    .replace("{{statusText}}", statusText)
    .replace("{{gameName}}", gameName);

  // 4. 使用 Puppeteer 截图
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
    return "无法生成播-报图片。";
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
