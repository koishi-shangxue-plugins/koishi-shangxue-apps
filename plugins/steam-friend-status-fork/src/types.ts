// src/types.ts

// 扩展 Koishi 的内部类型
declare module "koishi" {
  interface Tables {
    SteamUser: SteamUser;
  }
  interface Channel {
    usingSteam: boolean;
    channelName: string;
  }
}

// Steam 用户数据结构，用于数据库存储
export interface SteamUser {
  userId: string;
  userName: string; // 用户名
  steamId: string;
  steamName: string; // Steam用户名
  effectGroups: string[];
  lastPlayedGame: string;
  lastUpdateTime: string;
}

// Steam Web API 返回的玩家信息结构
export interface SteamUserInfo {
  response: {
    players: {
      steamid: string; // 用户ID
      communityvisibilitystate: number; // 社区可见性状态
      profilestate: number; // 用户是否配置了社区配置文件
      personaname: string; // 玩家角色名
      commentpermission: number; // 注释许可
      profileurl: string; // 玩家Steam社区个人资料的完整URL
      avatar: string; // 32*32大小头像
      avatarmedium: string; // 64*64大小头像
      avatarfull: string; // 184*184大小头像
      avatarhash: string; // 头像哈希值
      lastlogoff: number; // 上次联机的时间 (unix)
      personastate: number; // 用户当前状态
      realname: string; // 真实姓名
      primaryclanid: string; // 主要群组
      timecreated: number; // 帐户创建时间
      personastateflags: number;
      loccountrycode: string; // 居住国
      gameid: number; // 正在玩的游戏ID
      gameserverip: string; // 游戏服务器地址
      gameextrainfo: string; // 正在玩的游戏名
    }[];
  };
}

// 从 Steam 个人主页抓取的数据结构
export interface SteamProfile {
  name: string;
  avatar: string;
  level: string;
  status: string;
  recentGames: {
    name: string;
    hours: string;
    img: string;
  }[];
}
