// src/commands/exercise.ts

import { Context, h } from 'koishi';
import { Config } from '../config';
import { isUserAllowed, updateChannelId, loggerinfo } from '../utils';

function randomLength([base, variance]: number[]): number {
  const min = base * (1 - variance / 100);
  const max = base * (1 + variance / 100);
  return min + Math.random() * (max - min);
}

export function applyExerciseCommand(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command3} [user]`)
    .example(`${config.commandList.command3} @用户`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }, user) => {
      let userId = session.userId;
      let username = session.user.name || session.username;
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
        await ctx.database.set('impartpro', { userid: userId }, {
          username: username
        });
      }

      let [userRecord] = await ctx.database.get('impartpro', { userid: userId });

      if (!userRecord) {
        const initialLength = randomLength(config.defaultLength);
        const growthFactor = Math.random();
        userRecord = {
          userid: userId,
          username: username,
          channelId: await updateChannelId(ctx, userId, session.channelId),
          length: initialLength,
          injectml: "0-0",
          growthFactor: growthFactor,
          lastGrowthTime: new Date().toISOString(),
          lastDuelTime: new Date().toISOString(),
          locked: false
        };
        await ctx.database.create('impartpro', userRecord);
        return session.text('.auto-initialize-success', [h.at(userId), initialLength.toFixed(2), growthFactor.toFixed(2)]);
      }

      let [initiatorRecord] = await ctx.database.get('impartpro', { userid: session.userId });

      if (!initiatorRecord) {
        const initialLength = randomLength(config.defaultLength);
        const growthFactor = Math.random();
        initiatorRecord = {
          userid: session.userId,
          username: session.user.name || session.username,
          channelId: await updateChannelId(ctx, session.userId, session.channelId),
          length: initialLength,
          injectml: "0-0",
          growthFactor: growthFactor,
          lastGrowthTime: new Date().toISOString(),
          lastDuelTime: new Date().toISOString(),
          locked: false
        };
        await ctx.database.create('impartpro', initiatorRecord);
        return session.text('.auto-initialize-success', [h.at(session.userId), initialLength.toFixed(2), growthFactor.toFixed(2)]);
      }

      const lastInitiatorGrowthTime = new Date(initiatorRecord.lastGrowthTime).getTime();
      const cooldownTime = config.exerciseCooldownTime * 1000;
      if (isNaN(lastInitiatorGrowthTime)) {
        return session.text('.data-error-last-growth-time');
      }

      if (currentTime - lastInitiatorGrowthTime < cooldownTime) {
        const remainingTime = Math.ceil((cooldownTime - (currentTime - lastInitiatorGrowthTime)) / 1000);
        return session.text('.cooldown', [h.at(session.userId), remainingTime]);
      }

      if (user) {
        const lastTargetGrowthTime = new Date(userRecord.lastGrowthTime).getTime();
        if (isNaN(lastTargetGrowthTime)) {
          return session.text('.target-data-error-last-growth-time');
        }

        if (currentTime - lastTargetGrowthTime < cooldownTime) {
          const remainingTime = Math.ceil((cooldownTime - (currentTime - lastTargetGrowthTime)) / 1000);
          return session.text('.target-cooldown', [h.at(userId), remainingTime]);
        }
      }

      const originalLength = userRecord.length;

      const rateConfig = config.exerciseRate.find(item =>
        originalLength >= item.minlength && originalLength < item.maxlength
      );

      const successRate = rateConfig ? rateConfig.rate : 50;
      const isSuccess = Math.random() * 100 < successRate;
      let growthChange = 0;
      let expectedGrowth = 0;
      let expectedReduction = 0;

      if (isSuccess) {
        const [baseGrowth, growthVariance] = config.exerciseWinGrowthRange;
        expectedGrowth = randomLength([baseGrowth, growthVariance]);
        const growthCoefficient = 1 + userRecord.growthFactor;
        growthChange = expectedGrowth * growthCoefficient;
      } else {
        const [baseReduction, reductionVariance] = config.exerciseLossReductionRange;
        expectedReduction = randomLength([baseReduction, reductionVariance]);
        growthChange = -expectedReduction;
      }

      const enhancedLength = originalLength + growthChange;

      userRecord.length = enhancedLength;
      userRecord.lastGrowthTime = new Date().toISOString();

      initiatorRecord.lastGrowthTime = new Date().toISOString();

      loggerinfo(ctx, config, `用户ID: ${userId}`);
      loggerinfo(ctx, config, `原有长度: ${originalLength.toFixed(2)} cm`);
      loggerinfo(ctx, config, `本应该的成长值: ${isSuccess ? expectedGrowth.toFixed(2) : expectedReduction.toFixed(2)} cm`);
      loggerinfo(ctx, config, `实际应用的成长值: ${growthChange.toFixed(2)} cm`);
      loggerinfo(ctx, config, `牛牛增长因数: ${userRecord.growthFactor.toFixed(2)}`);
      loggerinfo(ctx, config, `计算公式: 原有长度 + 本应该的成长值 * (1 + 牛牛增长因数) `);
      loggerinfo(ctx, config, `计算结果: ${originalLength.toFixed(2)} + ${growthChange.toFixed(2)} = ${enhancedLength.toFixed(2)} cm`);
      loggerinfo(ctx, config, `锻炼结果: ${isSuccess ? '成功' : '失败'}`);

      await ctx.database.set('impartpro', { userid: userId }, {
        length: userRecord.length,
        lastGrowthTime: userRecord.lastGrowthTime,
        channelId: await updateChannelId(ctx, userId, session.channelId),
      });

      if (user) {
        await ctx.database.set('impartpro', { userid: session.userId }, {
          lastGrowthTime: initiatorRecord.lastGrowthTime,
          channelId: await updateChannelId(ctx, session.userId, session.channelId),
        });
      }

      return session.text(isSuccess ? '.exercise-success' : '.exercise-failure', [h.at(userId), enhancedLength.toFixed(2)]);
    });
}