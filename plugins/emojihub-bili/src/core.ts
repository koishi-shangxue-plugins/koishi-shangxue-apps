import fs from 'node:fs';
import url from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { Context } from "koishi";
import { Config } from "./config";
import { logError, logInfoformat, getAllFiles, getVirtualFilename, logger } from "./utils";

export interface ImageResult {
  imageUrl: string | null;
  isLocal: boolean;
  imageName?: string;
  imageTime?: Date;
  imageSize?: number;
  imagePath?: string;
}

/**
 * 刷新机器人的令牌并上传图片到指定频道
 * @param ctx 
 * @param data - 图片数据或者文件路径
 * @param appId - 机器人AppID
 * @param secret - 机器人Secret
 * @param channelId - 频道ID
 * @returns {Promise<{ url: string }>} - 上传图片后的URL
 */
export async function uploadImageToChannel(ctx: Context, consoleinfo, data, appId, secret, channelId) {

  async function refreshToken(bot) {
    const { access_token: accessToken, expires_in: expiresIn } = await ctx.http.post('https://bots.qq.com/app/getAppAccessToken', {
      appId: bot.appId,
      clientSecret: bot.secret
    });
    bot.token = accessToken;
    ctx.setTimeout(() => refreshToken(bot), (expiresIn - 30) * 1000);
  }

  // 临时的bot对象
  const bot = { appId, secret, channelId, token: "" };

  // 刷新令牌
  await refreshToken(bot);

  // 处理图片数据
  if (typeof data === 'string') {
    if (new URL(data).protocol === 'file:') {
      data = await fs.promises.readFile(url.fileURLToPath(data));
    } else {
      data = await ctx.http.get(data, { responseType: 'arraybuffer' });
      data = Buffer.from(data);
    }
  }

  const payload = new FormData();
  payload.append('msg_id', '0');
  payload.append('file_image', new Blob([data], { type: 'image/png' }), 'image.jpg');

  await ctx.http.post(`https://api.sgroup.qq.com/channels/${bot.channelId}/messages`, payload, {
    headers: {
      Authorization: `QQBot ${bot.token}`,
      'X-Union-Appid': bot.appId
    }
  });

  // 计算MD5并返回图片URL
  const md5 = crypto.createHash('md5').update(data).digest('hex').toUpperCase();
  if (channelId !== undefined && consoleinfo) {
    logger.info(`使用本地图片*QQ频道  发送URL为： https://gchat.qpic.cn/qmeetpic/0/0-0-${md5}/0`)
  };
  return { url: `https://gchat.qpic.cn/qmeetpic/0/0-0-${md5}/0` };
}

export async function getImageAsBase64(imagePath) {
  try {
    let filePath = imagePath;
    // 检查 imagePath 是否是 file:// URL
    if (imagePath.startsWith('file://')) {
      // 如果是，则转换为本地文件路径
      filePath = url.fileURLToPath(imagePath);
    }
    const imageBuffer = fs.readFileSync(filePath);
    // 将图片 buffer 转换为 Base64 字符串
    const base64String = imageBuffer.toString('base64');
    return base64String;
  } catch (error) {
    logger.error('Error converting image to base64:', error);
    return null;
  }
}

export async function determineImagePath(txtPath, config: Config, channelId, command, ctx: Context, local_picture_name = null): Promise<ImageResult> {
  // 判断是否是本地文件夹的绝对路径 (优先判断文件夹，解决linux路径识别问题)
  if (isLocalDirectory(txtPath)) {
    let filePath = txtPath;
    if (txtPath.startsWith('file:///')) {
      filePath = decodeURIComponent(txtPath.substring(8)); // 去除 file:/// 并解码 URL
    }
    return await getRandomImageFromFolder(filePath, config, channelId, command, ctx, local_picture_name);
  }

  // 判断是否是直接的图片链接
  if (txtPath.startsWith('http://') || txtPath.startsWith('https://')) {
    logInfoformat(config, channelId, command, `直接的图片链接: ${txtPath}`);
    return { imageUrl: txtPath, isLocal: false };
  }

  // 判断是否是本地图片的绝对路径
  if (isLocalImagePath(txtPath)) {
    let filePath = txtPath;
    if (txtPath.startsWith('file:///')) {
      filePath = decodeURIComponent(txtPath.substring(8)); // 去除 file:/// 并解码 URL
    }
    if (!fs.existsSync(filePath)) {
      logError(`错误:路径不存在： ${txtPath}`);
      return { imageUrl: null, isLocal: false };
    }
    logInfoformat(config, channelId, command, `本地图片的绝对路径: ${txtPath}`);
    const stats = fs.statSync(filePath);
    return {
      imageUrl: url.pathToFileURL(filePath).href,
      isLocal: true,
      imageName: path.basename(filePath), // 文件名称
      imageTime: stats.mtime, // 修改时间
      imageSize: stats.size,   // 文件大小
      imagePath: filePath     // 文件路径 
    };
  }

  // 判断是否是本地txt文件的绝对路径
  if (isLocalTextFile(txtPath)) {
    let filePath = txtPath;
    if (txtPath.startsWith('file:///')) {
      filePath = decodeURIComponent(txtPath.substring(8)); // 去除 file:/// 并解码 URL
    }
    return await getRandomImageUrlFromFile(filePath, config, channelId, command, ctx);
  }

  // 默认处理逻辑：随机选择一个表情包
  const allValidPaths = getAllValidPaths(config);
  if (config.consoleinfo && config.allfileinfo) {
    logger.info(allValidPaths);
  }
  if (allValidPaths.length > 0) {
    txtPath = allValidPaths[Math.floor(Math.random() * allValidPaths.length)];
  } else {
    // 如果没有有效的路径，则返回null
    return { imageUrl: null, isLocal: false };
  }

  // 重新判断随机选择的路径类型
  if (txtPath.startsWith('http://') || txtPath.startsWith('https://')) {
    logInfoformat(config, channelId, command, `随机选择的网络图片链接: ${txtPath}`);
    return { imageUrl: txtPath, isLocal: false };
  } else if (isLocalDirectory(txtPath)) {
    let filePath = txtPath;
    if (txtPath.startsWith('file:///')) {
      filePath = decodeURIComponent(txtPath.substring(8)); // 去除 file:/// 并解码 URL
    }
    return await getRandomImageFromFolder(filePath, config, channelId, command, ctx, local_picture_name);
  } else if (isLocalTextFile(txtPath)) {
    let filePath = txtPath;
    if (txtPath.startsWith('file:///')) {
      filePath = decodeURIComponent(txtPath.substring(8)); // 去除 file:/// 并解码 URL
    }
    return await getRandomImageUrlFromFile(filePath, config, channelId, command, ctx);
  } else if (isLocalImagePath(txtPath)) {
    let filePath = txtPath;
    if (txtPath.startsWith('file:///')) {
      filePath = decodeURIComponent(txtPath.substring(8)); // 去除 file:/// 并解码 URL
    }
    logInfoformat(config, channelId, command, `随机选择的本地图片路径: ${txtPath}`);
    const stats = fs.statSync(txtPath);
    return {
      imageUrl: url.pathToFileURL(txtPath).href,
      isLocal: true,
      imageName: path.basename(txtPath),
      imageTime: stats.mtime, // 修改时间
      imageSize: stats.size,   // 文件大小
      imagePath: txtPath      // 文件路径
    };
  }
  return { imageUrl: null, isLocal: false };
}

export function getRandomEmojiHubCommand(config: Config) {
  const commands = config.MoreEmojiHubList.map(emoji => emoji.command);
  if (commands.length > 0) {
    return commands[Math.floor(Math.random() * commands.length)];
  } else {
    return null;
  }
}

function isLocalImagePath(txtPath) {
  const lowerCasePath = txtPath.toLowerCase(); // 转换为小写
  return (path.isAbsolute(txtPath) || txtPath.startsWith('file:///')) &&
    (lowerCasePath.endsWith('.jpg') || lowerCasePath.endsWith('.png') || lowerCasePath.endsWith('.gif') || lowerCasePath.endsWith('.bmp') || lowerCasePath.endsWith('.webp'));
}

function isLocalDirectory(txtPath) {
  if (txtPath.startsWith('file:///')) {
    try {
      const filePath = decodeURIComponent(txtPath.substring(8)); // 去除 file:/// 并解码 URL
      return fs.lstatSync(filePath).isDirectory();
    } catch (e) {
      return false; // 路径不存在或不是目录
    }
  }
  return path.isAbsolute(txtPath) && fs.lstatSync(txtPath).isDirectory();
}

function isLocalTextFile(txtPath) {
  // 修改：同时判断 file:/// 开头的路径
  if (txtPath.startsWith('file:///')) {
    return txtPath.endsWith('.txt');
  }
  return path.isAbsolute(txtPath) && txtPath.endsWith('.txt');
}

function getAllValidPaths(config: Config) {
  return config.MoreEmojiHubList.filter(emoji => {
    const sourceUrl = emoji.source_url;
    return path.isAbsolute(sourceUrl) || sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://') || sourceUrl.startsWith('file:///');
  }).map(emoji => emoji.source_url);
}

async function getRandomImageFromFolder(folderPath, config: Config, channelId, command, ctx, local_picture_name) {
  if (!fs.existsSync(folderPath)) {
    logError(`错误:路径不存在： ${folderPath}`);
    return { imageUrl: null, isLocal: false };
  }

  let files = config.searchSubfolders
    ? getAllFiles(folderPath)
    : fs.readdirSync(folderPath).map(file => path.join(folderPath, file));

  files = files.filter(file => {
    const lowerCaseFile = file.toLowerCase(); // 转换为小写
    return lowerCaseFile.endsWith('.jpg') || lowerCaseFile.endsWith('.png') || lowerCaseFile.endsWith('.gif') || lowerCaseFile.endsWith('.bmp') || lowerCaseFile.endsWith('.webp');
  });

  if (files.length === 0) {
    logError("文件夹中未找到有效图片文件（jpg,png,gif,webp,bmp）");
    return { imageUrl: null, isLocal: false };
  }

  // 如果提供了 local_picture_name 数组，则根据关键词进行匹配
  if (local_picture_name?.length > 0) {
    files = files.filter(file => {
      let filenameToMatch;
      if (config.searchSubfoldersWithfilename && config.searchSubfolders) {
        // 获取虚拟文件名，包含子文件夹名称
        filenameToMatch = getVirtualFilename(file, folderPath);
      } else {
        // 默认情况下只匹配文件名
        filenameToMatch = path.basename(file);
      }
      const filenameLower = filenameToMatch.toLowerCase();
      // 检查文件名是否包含所有关键词
      return local_picture_name.every(keyword => filenameLower.includes(keyword.toLowerCase()));
    });
    if (files.length === 0) {
      logError(`未找到匹配关键词 "${local_picture_name.join(' ')}" 的图片文件`);
      return { imageUrl: null, isLocal: false };
    }
  }

  // 输出文件夹下的全部文件
  if (config.consoleinfo && config.allfileinfo) {
    logger.info(`文件夹 ${folderPath} 下的所有文件: \n${files.join('\n')}`);
  }

  const imageUrl = files[Math.floor(Math.random() * files.length)];
  logInfoformat(config, channelId, command, `使用文件夹 ${folderPath} \n发送本地图片为 ${imageUrl}`);
  const stats = fs.statSync(imageUrl);
  return {
    imageUrl: url.pathToFileURL(imageUrl).href,
    isLocal: true,
    imageName: path.basename(imageUrl),
    imageTime: stats.mtime, // 修改时间
    imageSize: stats.size,   // 文件大小
    imagePath: imageUrl      // 文件路径
  };
}

export async function getRandomImageUrlFromFile(txtPath, config: Config, channelId, command, ctx) {
  let urls, imageUrl;
  try {
    urls = fs.readFileSync(txtPath, 'utf8').split('\n').filter(url => url.trim() !== ''); // 过滤空行
  } catch (error) {
    if (error instanceof Error && error.message === 'ENOENT') {
      return { imageUrl: null, isLocal: false };
    } else {
      logError(error);
      return { imageUrl: null, isLocal: false };
    }
  }

  // 检查是否有有效的URL
  if (urls.length === 0) {
    logError(`错误！无有效URL可用：${txtPath}`);
    return { imageUrl: null, isLocal: false };
  }

  // 随机选择URL
  const index = Math.floor(Math.random() * urls.length);
  let txtUrl = urls[index].trim();

  // 移除多余的前缀
  /*
    多余的前缀 是由于浏览器脚本模式二所产生的，会出现链接重复https：的bug，比如
    https:https://i0.hdslb.com/bfs/new_dyn/c5196e99b284901ba699d609ced3446673456403.gif

    可用于测试 模式二提取的帖子
    https://www.bilibili.com/read/cv35076823
  */
  const extraPrefix = 'https:';
  const bilibiliPrefix = "https://i0.hdslb.com/bfs/";
  if (txtUrl.startsWith(extraPrefix + bilibiliPrefix)) {
    txtUrl = txtUrl.replace(extraPrefix, '');
  }

  // 没有前缀 "https://" ，添加前缀
  if (!txtUrl.startsWith("https://") && !txtUrl.startsWith("http://")) {
    txtUrl = bilibiliPrefix + txtUrl;
  }

  imageUrl = txtUrl.trim();

  // 将这些指令下载至本地，进行本地发图的逻辑
  if (config.LocalSendNetworkPicturesList && config.LocalSendNetworkPicturesList.length > 0) {
    const normalizedList = config.LocalSendNetworkPicturesList.split(/\n|,|，/).map(item => item.trim().toLowerCase());
    const lowerCaseCommand = command.toLowerCase();
    if (normalizedList.includes(lowerCaseCommand)) { // 如果配置了需要下载到本地
      const outputPath = path.join(__dirname, `${Date.now()}.png`); // 临时文件
      try {
        imageUrl = await downloadImage(txtUrl, outputPath, ctx);
        ctx.setTimeout(() => {
          fs.unlinkSync(imageUrl);
          logInfoformat(config, null, null, `临时文件已删除：${imageUrl}`);
        }, config.deletePictime * 1000);
        logInfoformat(config, channelId, command, `下载并发送本地图片: ${imageUrl}`);
        return { imageUrl: imageUrl, isLocal: true };
      } catch (downloadError) {
        logError(`图片下载失败：${downloadError.message}`);
        return { imageUrl: null, isLocal: false };
      }
    }
  }

  logInfoformat(config, channelId, command, `使用文件 ${txtPath} \n发送URL为 ${imageUrl}`);
  return { imageUrl: imageUrl, isLocal: false };
}

export async function downloadImage(url, outputPath, ctx) {
  try {
    const response = await ctx.http.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response);
    await fs.promises.writeFile(outputPath, buffer);
    return outputPath;
  } catch (error) {
    logError(`下载图片失败: ${error.message}`);
    throw error;
  }
}

/**
* 列出所有表情包指令名称。
* @param config 配置对象，包含 MoreEmojiHubList 数组
* @returns {string[]} 所有表情包指令的列表
*/
export function listAllCommands(config: Config) {
  // 使用 map 方法来提取每个表情包的指令名称
  const allCommands = config.MoreEmojiHubList.map(emoji => emoji.command);

  // 检查结果是否为空
  if (allCommands.length === 0) {
    logError("未找到任何表情包指令。");
  }

  // 返回命令列表
  return allCommands;
}