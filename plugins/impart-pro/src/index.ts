// src/index.ts

import { Context } from 'koishi';
import { Config, usage } from './config';
import { applyCommands } from './commands';
import './types'; // 确保类型被正确加载

export const name = 'impart-pro';

export { Config, usage };

export const inject = {
  required: ["i18n", "database", "monetary", "glyph"],
  optional: ['puppeteer']
};

export function apply(ctx: Context, config: Config) {
  // 扩展数据库表
  ctx.model.extend('impartpro', {
    userid: 'string',
    username: 'string',
    channelId: 'list',
    length: 'float',
    injectml: 'string',
    growthFactor: 'float',
    lastGrowthTime: 'string',
    lastDuelTime: 'string',
    locked: 'boolean'
  }, {
    primary: ['userid'],
  });

  // 注册指令
  applyCommands(ctx, config);

}
