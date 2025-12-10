// src/commands/duel.ts

import { Context, h } from 'koishi';
import { Config } from '../config';
import { isUserAllowed, updateUserCurrency, updateChannelId, loggerinfo } from '../utils';

function randomLength([base, variance]: number[]): number {
  const min = base * (1 - variance / 100);
  const max = base * (1 + variance / 100);
  return min + Math.random() * (max - min);
}

export function applyDuelCommand(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command4} [user]`)
    .example(`${config.commandList.command4} @用户`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }, user) => {
      let userId: string = null;
      let username: string = null;
      const currentTime = Date.now();

      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          return session.text('.not-allowed');
        }
        return;
      }

      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type === 'at') {
          const { id, name } = parsedUser.attrs;
          if (!id || (session.userId === id)) {
            return session.text('.invalid-user');
          }
          userId = id;
          username = name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(userId))?.name || userId) : userId);
        } else {
          return session.text('.invalid-user-format');
        }
      } else {
        return session.text('.no-duel-target');
      }

      let [attackerRecord] = await ctx.database.get('impartpro', { userid: session.userId });
      if (!attackerRecord) {
        return session.text('.not-initialized');
      }

      let [defenderRecord] = await ctx.database.get('impartpro', { userid: userId });
      if (!defenderRecord) {
        return session.text('.target-not-initialized');
      }

      const lastAttackerTime = new Date(attackerRecord.lastDuelTime).getTime();
      const lastDefenderTime = new Date(defenderRecord.lastDuelTime).getTime();
      const cooldownTime = config.duelCooldownTime * 1000;

      if (currentTime - lastAttackerTime < cooldownTime || currentTime - lastDefenderTime < cooldownTime) {
        const remainingAttackerTime = Math.max(0, cooldownTime - (currentTime - lastAttackerTime));
        const remainingDefenderTime = Math.max(0, cooldownTime - (currentTime - lastDefenderTime));
        const remainingTime = Math.max(remainingAttackerTime, remainingDefenderTime);

        return session.text('.duel-cooldown', [Math.ceil(remainingTime / 1000)]);
      }

      const lengthDifference = attackerRecord.length - defenderRecord.length;

      const rateConfig = config.duelWinRateFactor.find(item =>
        Math.abs(lengthDifference) >= item.minlength && Math.abs(lengthDifference) < item.maxlength
      );
      let baseWinRate = rateConfig ? rateConfig.rate : 50;

      const attackerIsLonger = attackerRecord.length > defenderRecord.length;
      const attackerWinProbability = attackerIsLonger ? baseWinRate - config.duelWinRateFactor2 : baseWinRate + config.duelWinRateFactor2;
      const finalWinProbability = Math.min(100, Math.max(0, attackerWinProbability));

      const isAttackerWin = Math.random() * 100 < finalWinProbability;
      let growthChange = 0;
      let reductionChange = 0;
      let currencyGain = 0;
      if (isAttackerWin) {
        const [baseGrowth, growthVariance] = config.duelWinGrowthRange;
        growthChange = randomLength([baseGrowth, growthVariance]);

        const [baseReduction, reductionVariance] = config.duelLossReductionRange;
        reductionChange = randomLength([baseReduction, reductionVariance]);

        attackerRecord.length += growthChange;
        defenderRecord.length -= reductionChange;

        currencyGain = reductionChange * (config.duelLossCurrency / 100);
        await updateUserCurrency(ctx, userId, currencyGain, config.currency);

      } else {
        const [baseGrowth, growthVariance] = config.duelWinGrowthRange;
        growthChange = randomLength([baseGrowth, growthVariance]);

        const [baseReduction, reductionVariance] = config.duelLossReductionRange;
        reductionChange = randomLength([baseReduction, reductionVariance]);

        defenderRecord.length += growthChange;
        attackerRecord.length -= reductionChange;

        currencyGain = reductionChange * (config.duelLossCurrency / 100);
        await updateUserCurrency(ctx, session.userId, currencyGain, config.currency);
      }

      attackerRecord.lastDuelTime = new Date(currentTime).toISOString();
      defenderRecord.lastDuelTime = new Date(currentTime).toISOString();

      await ctx.database.set('impartpro', { userid: session.userId }, {
        length: attackerRecord.length,
        lastDuelTime: attackerRecord.lastDuelTime,
        channelId: await updateChannelId(ctx, session.userId, session.channelId),
      });

      await ctx.database.set('impartpro', { userid: userId }, {
        length: defenderRecord.length,
        lastDuelTime: defenderRecord.lastDuelTime,
        channelId: await updateChannelId(ctx, userId, session.channelId),
      });

      loggerinfo(ctx, config, `攻击者ID: ${session.userId}, 胜率: ${finalWinProbability.toFixed(2)}%`);
      loggerinfo(ctx, config, `防御者ID: ${userId}, 胜率: ${(100 - finalWinProbability).toFixed(2)}%`);

      return session.text('.duel-result', [
        h.at(session.userId),
        isAttackerWin ? '胜利' : '失败',
        h.at(session.userId),
        isAttackerWin ? '增加' : '减少',
        growthChange.toFixed(2),
        h.at(userId),
        isAttackerWin ? '减少' : '增加',
        reductionChange.toFixed(2),
        currencyGain.toFixed(2)
      ]);
    });
}