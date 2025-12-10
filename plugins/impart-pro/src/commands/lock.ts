// src/commands/lock.ts

import { Context, h } from 'koishi';
import { Config } from '../config';
import { checkPermission } from '../utils';

export function applyLockCommand(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command9} [user]`)
    .alias('开启牛牛大作战')
    .alias('关闭牛牛大作战')
    .example(`${config.commandList.command9} @用户`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }, user) => {
      const permissionScope = config.permissionScope;
      const onlybotownerList = config.onlybotowner_list;

      const isAllowed = checkPermission(session, permissionScope, onlybotownerList);
      if (!isAllowed) {
        return session.text('.permission-denied');
      }

      const channelId = session.channelId;
      let userId: string;
      let username: string;

      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type === 'at') {
          userId = parsedUser.attrs.id;
          username = parsedUser.attrs.name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(userId))?.name || userId) : userId);
        } else {
          return session.text('.invalid-user-format');
        }

        const [record] = await ctx.database.get('impartpro', { userid: userId, channelId: { $el: channelId } });

        if (!record) {
          await ctx.database.create('impartpro', {
            userid: userId,
            username,
            channelId: [session.channelId],
            locked: true,
            length: 0,
            injectml: '0-0',
            growthFactor: 0,
            lastGrowthTime: new Date().toISOString(),
            lastDuelTime: new Date().toISOString(),
          });

          return session.text('.user-locked', [username]);
        } else {
          const newStatus = !record.locked;
          await ctx.database.set('impartpro', { userid: userId }, { locked: newStatus });
          return session.text(newStatus ? '.user-locked' : '.user-unlocked', [username]);
        }
      } else {
        const specialUserId = `channel_${channelId}`;
        const [channelRecord] = await ctx.database.get('impartpro', { userid: specialUserId, channelId: { $el: channelId } });

        if (!channelRecord) {
          await ctx.database.create('impartpro', {
            userid: specialUserId,
            username: '频道',
            channelId: [session.channelId],
            locked: true,
            length: 0,
            injectml: '0-0',
            growthFactor: 0,
            lastGrowthTime: new Date().toISOString(),
            lastDuelTime: new Date().toISOString(),
          });

          return session.text('.channel-locked');
        } else {
          const newStatus = !channelRecord.locked;
          await ctx.database.set('impartpro', { userid: specialUserId }, { locked: newStatus });
          return session.text(newStatus ? '.channel-locked' : '.channel-unlocked');
        }
      }
    });
}