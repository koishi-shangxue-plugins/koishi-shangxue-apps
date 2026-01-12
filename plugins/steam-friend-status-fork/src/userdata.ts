// src/userdata.ts
import { Context } from "koishi";
import * as path from "node:path";
import * as fs from "node:fs";

// 用户游戏会话数据结构
interface GameSession {
  gameName: string;
  startTime: number; // 开始时间戳（毫秒）
}

// 用户在不同群组的昵称数据结构
interface UserNicknames {
  [channelId: string]: string; // 群组ID -> 昵称
}

// 所有用户的游戏会话数据
interface GameSessionsData {
  [userId: string]: GameSession;
}

// 所有用户的昵称数据
interface UserNicknamesData {
  [userId: string]: UserNicknames;
}

// 文件锁管理
const fileLocks = new Map<string, Promise<void>>();

/**
 * 获取数据文件路径
 */
function getDataPath(ctx: Context, filename: string): string {
  const dataDir = path.join(ctx.baseDir, "data", "steam-friend-status");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, filename);
}

/**
 * 获取文件锁，确保同一时间只有一个操作在访问文件
 */
async function acquireLock(filepath: string): Promise<() => void> {
  // 等待当前文件的锁释放
  while (fileLocks.has(filepath)) {
    await fileLocks.get(filepath);
  }

  // 创建新的锁
  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  fileLocks.set(filepath, lockPromise);

  // 返回释放锁的函数
  return () => {
    fileLocks.delete(filepath);
    releaseLock();
  };
}

/**
 * 读取游戏会话数据（带锁）
 */
async function loadGameSessionsLocked(ctx: Context): Promise<GameSessionsData> {
  const filepath = getDataPath(ctx, "game-sessions.json");
  try {
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    ctx.logger.warn("读取游戏会话数据失败:", error);
  }
  return {};
}

/**
 * 保存游戏会话数据（带锁）
 */
async function saveGameSessionsLocked(ctx: Context, data: GameSessionsData): Promise<void> {
  const filepath = getDataPath(ctx, "game-sessions.json");
  const releaseLock = await acquireLock(filepath);

  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    ctx.logger.error("保存游戏会话数据失败:", error);
  } finally {
    releaseLock();
  }
}

/**
 * 记录用户开始玩游戏
 */
export async function startGameSession(ctx: Context, userId: string, gameName: string): Promise<void> {
  const sessions = await loadGameSessionsLocked(ctx);
  sessions[userId] = {
    gameName,
    startTime: Date.now(),
  };
  await saveGameSessionsLocked(ctx, sessions);
}

/**
 * 结束游戏会话并返回游玩时长（分钟）
 */
export async function endGameSession(ctx: Context, userId: string): Promise<number | null> {
  const sessions = await loadGameSessionsLocked(ctx);
  const session = sessions[userId];

  if (!session) {
    return null;
  }

  const duration = Date.now() - session.startTime;
  const minutes = Math.floor(duration / 60000); // 转换为分钟

  // 删除会话记录
  delete sessions[userId];
  await saveGameSessionsLocked(ctx, sessions);

  return minutes;
}

/**
 * 获取用户当前游戏会话
 */
export async function getGameSession(ctx: Context, userId: string): Promise<GameSession | null> {
  const sessions = await loadGameSessionsLocked(ctx);
  return sessions[userId] || null;
}

/**
 * 读取用户昵称数据（带锁）
 */
async function loadUserNicknamesLocked(ctx: Context): Promise<UserNicknamesData> {
  const filepath = getDataPath(ctx, "user-nicknames.json");
  try {
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    ctx.logger.warn("读取用户昵称数据失败:", error);
  }
  return {};
}

/**
 * 保存用户昵称数据（带锁）
 */
async function saveUserNicknamesLocked(ctx: Context, data: UserNicknamesData): Promise<void> {
  const filepath = getDataPath(ctx, "user-nicknames.json");
  const releaseLock = await acquireLock(filepath);

  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    ctx.logger.error("保存用户昵称数据失败:", error);
  } finally {
    releaseLock();
  }
}

/**
 * 设置用户在特定群组的昵称
 */
export async function setUserNickname(ctx: Context, userId: string, channelId: string, nickname: string): Promise<void> {
  const nicknames = await loadUserNicknamesLocked(ctx);
  if (!nicknames[userId]) {
    nicknames[userId] = {};
  }
  nicknames[userId][channelId] = nickname;
  await saveUserNicknamesLocked(ctx, nicknames);
}

/**
 * 获取用户在特定群组的昵称
 */
export async function getUserNickname(ctx: Context, userId: string, channelId: string): Promise<string | null> {
  const nicknames = await loadUserNicknamesLocked(ctx);
  return nicknames[userId]?.[channelId] || null;
}

/**
 * 删除用户在特定群组的昵称
 */
export async function deleteUserNickname(ctx: Context, userId: string, channelId: string): Promise<void> {
  const nicknames = await loadUserNicknamesLocked(ctx);
  if (nicknames[userId]) {
    delete nicknames[userId][channelId];
    // 如果用户没有任何群组昵称了，删除整个用户记录
    if (Object.keys(nicknames[userId]).length === 0) {
      delete nicknames[userId];
    }
    await saveUserNicknamesLocked(ctx, nicknames);
  }
}

/**
 * 删除用户的所有昵称记录
 */
export async function deleteAllUserNicknames(ctx: Context, userId: string): Promise<void> {
  const nicknames = await loadUserNicknamesLocked(ctx);
  if (nicknames[userId]) {
    delete nicknames[userId];
    await saveUserNicknamesLocked(ctx, nicknames);
  }
}

/**
 * 格式化游玩时长
 */
export function formatPlayTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}小时`;
  }
  return `${hours}小时${remainingMinutes}分钟`;
}
