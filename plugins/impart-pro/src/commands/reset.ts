// src/commands/reset.ts

import { Context } from 'koishi';
import { Config } from '../config';
import { isUserAllowed, updateChannelId } from '../utils';

function randomLength([base, variance]: number[]): number {
  const min = base * (1 - variance / 100);
  const max = base * (1 + variance / 100);
  return min + Math.random() * (max - min);
}

export function applyResetCommand(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command5}`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }) => {
      const userId = session.userId;
      const username = session.user.name || session.username;
      const initialLength = randomLength(config.defaultLength);
      const growthFactor = Math.random();
      const currentTime = new Date().toISOString();
      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          return session.text('.not-allowed');
        }
        return;
      }
      let [userRecord] = await ctx.database.get('impartpro', { userid: userId });

      if (userRecord) {
        await ctx.database.set('impartpro', { userid: userId }, {
          length: initialLength,
          growthFactor: growthFactor,
          lastDuelTime: currentTime,
          channelId: await updateChannelId(ctx, userId, session.channelId),
        });
        return session.text('.reset-success', [initialLength.toFixed(2), growthFactor.toFixed(2)]);
      } else {
        userRecord = {
          userid: userId,
          username: username,
          channelId: await updateChannelId(ctx, userId, session.channelId),
          length: initialLength,
          injectml: "0-0",
          growthFactor: growthFactor,
          lastGrowthTime: currentTime,
          lastDuelTime: currentTime,
          locked: false
        };

        await ctx.database.create('impartpro', userRecord);
        return session.text('.initialize-success', [initialLength.toFixed(2), growthFactor.toFixed(2)]);
      }
    });
}