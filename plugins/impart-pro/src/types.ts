// src/types.ts

import type { } from 'koishi-plugin-monetary';
import type { } from 'koishi-plugin-puppeteer';
import type { } from 'koishi-plugin-glyph';

// 定义 impartpro 数据表的结构
export interface ImpartproTable {
  userid: string;
  username: string;
  channelId: string[];
  length: number;
  injectml: string;
  growthFactor: number;
  lastGrowthTime: string; // 开导间隔
  lastDuelTime: string; // 决斗间隔
  locked: boolean;
}

declare module 'koishi' {
  interface Tables {
    impartpro: ImpartproTable;
    monetary: {
      uid: number;
      currency: string;
      value: number;
    };
  }
}