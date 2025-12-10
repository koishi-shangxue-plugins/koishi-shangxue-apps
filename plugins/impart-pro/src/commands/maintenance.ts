// src/commands/maintenance.ts

import { Context } from 'koishi';
import { Config } from '../config';
import { isUserAllowed, getUserCurrency, updateUserCurrency, updateChannelId } from '../utils';

export function applyMaintenanceCommand(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command2}`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }) => {
      const userId = session.userId;
      if (!await isUserAllowed(ctx, userId, session.channelId)) {
        if (config.notallowtip) {
          return session.text('.not-allowed');
        }
        return;
      }

      let [userRecord] = await ctx.database.get('impartpro', { userid: userId });
      if (!userRecord) {
        return session.text('.not-initialized');
      }

      const userCurrency = await getUserCurrency(ctx, userId, config.currency);
      const costPerUnit = config.maintenanceCostPerUnit;

      const maxPurchasableLength = Math.floor(userCurrency / (1 / costPerUnit));

      if (maxPurchasableLength <= 0) {
        return session.text('.insufficient-currency');
      }

      await session.send(session.text('.purchase-prompt', [maxPurchasableLength]));

      const response = await session.prompt();
      const desiredLength = parseInt(response);

      if (isNaN(desiredLength) || desiredLength <= 0) {
        return session.text('.invalid-input');
      }

      if (desiredLength > maxPurchasableLength) {
        return session.text('.currency-not-enough-for-purchase');
      }

      userRecord.length += desiredLength;
      await updateUserCurrency(ctx, userId, -desiredLength / costPerUnit, config.currency);

      await ctx.database.set('impartpro', { userid: userId }, {
        length: userRecord.length,
        channelId: await updateChannelId(ctx, userId, session.channelId),
      });

      return session.text('.purchase-success', [desiredLength / costPerUnit, desiredLength]);
    });
}