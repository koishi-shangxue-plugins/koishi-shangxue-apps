// src/utils.ts

import { Context, Session } from 'koishi';
import { Config } from './config';

export async function updateUserCurrency(ctx: Context, uid: string, amount: number, currency: string) {
  try {
    const numericUserId = Number(uid);
    if (amount > 0) {
      await ctx.monetary.gain(numericUserId, amount, currency);
    } else if (amount < 0) {
      await ctx.monetary.cost(numericUserId, -amount, currency);
    }
  } catch (error) {
    ctx.logger.error(`更新用户 ${uid} 的货币时出错: ${error}`);
  }
}

export async function getUserCurrency(ctx: Context, uid: string, currency: string): Promise<number> {
  try {
    const numericUserId = Number(uid);
    const [data] = await ctx.database.get('monetary', {
      uid: numericUserId,
      currency,
    }, ['value']);
    return data ? data.value : 0;
  } catch (error) {
    ctx.logger.error(`获取用户 ${uid} 的货币时出错: ${error}`);
    return 0;
  }
}

export async function updateChannelId(ctx: Context, userId: string, newChannelId: string): Promise<string[]> {
  const [userRecord] = await ctx.database.get('impartpro', { userid: userId });
  if (!userRecord) {
    return [newChannelId];
  }
  const currentChannels = userRecord.channelId || [];
  if (!currentChannels.includes(newChannelId)) {
    currentChannels.push(newChannelId);
  }
  return currentChannels;
}

export async function isUserAllowed(ctx: Context, userId: string, channelId: string): Promise<boolean> {
  const specialUserId = `channel_${channelId}`;
  const [channelRecord] = await ctx.database.get('impartpro', { userid: specialUserId, channelId: { $el: channelId } });
  if (channelRecord && channelRecord.locked) {
    return false;
  }
  const [userRecord] = await ctx.database.get('impartpro', { userid: userId, channelId: { $el: channelId } });
  if (userRecord) {
    return !userRecord.locked;
  }
  return true;
}

export function checkPermission(session: Session, scope: string, allowedList: string[]): boolean {
  const { userId, author } = session;
  const role = author?.roles?.[0];
  if (scope === 'all') return true;
  if (scope === 'admin' && (role === 'admin' || role === 'owner')) return true;
  if (scope === 'owner' && role === 'owner') return true;
  if (scope === 'owner_admin' && (role === 'owner' || role === 'admin')) return true;
  if (scope === 'onlybotowner' && allowedList.includes(userId)) return true;
  if (scope === 'onlybotowner_admin_owner' && (allowedList.includes(userId) || role === 'owner' || role === 'admin')) return true;
  return false;
}

export function loggerinfo(ctx: Context, config: Config, message: string) {
  if (config.loggerinfo) {
    ctx.logger.info(message);
  }
}

export async function getFontStyles(ctx: Context, config: Config) {
  let fontFaceStyle = '';
  let customFontFamily = '';
  if (config.useCustomFont) {
    const selectedFont = config.font || (ctx.glyph.getFontNames ? ctx.glyph.getFontNames()[0] : null);
    const fontDataUrl = selectedFont ? ctx.glyph.getFontDataUrl(selectedFont) : null;
    if (fontDataUrl) {
      fontFaceStyle = `
        @font-face {
          font-family: 'CustomFont';
          src: url('${fontDataUrl}');
        }
      `;
      customFontFamily = `'CustomFont', `;
    }
  }
  return { fontFaceStyle, customFontFamily };
}