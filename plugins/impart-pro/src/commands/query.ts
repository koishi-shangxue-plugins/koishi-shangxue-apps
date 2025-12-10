// src/commands/query.ts

import { Context, h } from 'koishi';
import { Config } from '../config';
import { isUserAllowed, getUserCurrency } from '../utils';

export function applyQueryCommand(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command8} [user]`)
    .example(`${config.commandList.command8} @用户`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }, user) => {
      let userId = session.userId;
      let username = session.user.name || session.username;
      if (!await isUserAllowed(ctx, userId, session.channelId)) {
        if (config.notallowtip) {
          return session.text('.not-allowed');
        }
        return;
      }

      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type === 'at') {
          userId = parsedUser.attrs.id;
          username = parsedUser.attrs.name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(userId))?.name || userId) : userId);
        } else {
          return session.text('.invalid-user-format');
        }
      }

      const [userRecord] = await ctx.database.get('impartpro', { userid: userId });
      const balance = await getUserCurrency(ctx, userId, config.currency);
      if (!userRecord) {
        return session.text('.user-not-initialized', [h.at(userId)]);
      }
      return session.text('.user-info', [h.at(userId), userRecord.length.toFixed(2), userRecord.growthFactor.toFixed(2), balance.toFixed(2)]);
    });
}