// src/commands.ts

import { Context, h } from 'koishi';
import { Config } from './config';
import { updateUserCurrency, getUserCurrency, updateChannelId, isUserAllowed, checkPermission, loggerinfo, getFontStyles } from './utils';

// 随机生成长度
function randomLength([base, variance]: number[]): number {
  const min = base * (1 - variance / 100);
  const max = base * (1 + variance / 100);
  return min + Math.random() * (max - min);
}

export function applyCommands(ctx: Context, config: Config) {
  ctx.i18n.define("zh-CN", {
    commands: {
      [config.commandList.command]: {
        description: "在群里玩牛牛相关游戏",
      },
      [config.commandList.command1]: {
        arguments: {
          user: "目标用户",
        },
        description: "注入群友",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command2]: {
        description: "通过花费货币来增加牛牛的长度",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command3]: {
        arguments: {
          user: "目标用户",
        },
        description: "让牛牛成长！",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command4]: {
        arguments: {
          user: "目标用户",
        },
        description: "决斗牛牛！",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command5]: {
        description: "重开一个牛牛~",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command6]: {
        description: "查看注入排行榜",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command7]: {
        description: "查看牛牛排行榜",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command8]: {
        arguments: {
          user: "目标用户",
        },
        description: "查看牛牛",
        options: {
          help: "查看指令帮助",
        }
      },
      [config.commandList.command9]: {
        arguments: {
          user: "目标用户",
        },
        description: "开启/禁止牛牛大作战",
        options: {
          help: "查看指令帮助",
        }
      }
    }
  });

  ctx.command(config.commandList.command)

  ctx.command(`impartpro/${config.commandList.command1} [user]`)
    .userFields(["id", "name", "permissions"])
    .example(config.commandList.command1)
    .example(`${config.commandList.command1} @用户`)
    .action(async ({ session }, user) => {
      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          await session.send('你没有权限触发这个指令。');
        }
        return;
      }

      const currentDate = new Date();
      const day = currentDate.getDate();
      const formattedDate = `${day}`;
      const randomML = randomLength(config.milliliter_range).toFixed(2);
      let targetUserId: string = null;
      let targetUsername: string = null;

      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type === 'at') {
          targetUserId = parsedUser.attrs.id;
          targetUsername = parsedUser.attrs.name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(targetUserId))?.name || targetUserId) : targetUserId);
          if (targetUserId === session.userId) {
            await session.send("不允许自己注入自己哦~ 换一个用户吧");
            return;
          }
        } else {
          await session.send("输入的用户格式不正确，请使用 @用户 格式。");
          return;
        }
      } else {
        const records = await ctx.database.get('impartpro', {});
        let filteredRecords;
        const drawingScope = config.randomdrawing || "1";
        if (drawingScope === "1") {
          filteredRecords = records.filter(
            record => record.channelId?.includes(session.channelId) &&
              !record.userid.startsWith('channel_') &&
              record.userid !== session.userId
          );
        } else if (drawingScope === "2") {
          filteredRecords = records.filter(
            record => !record.userid.startsWith('channel_') &&
              record.userid !== session.userId
          );
        }

        if (!filteredRecords || filteredRecords.length === 0) {
          await session.send("未找到符合条件的用户。");
          return;
        }

        const randomIndex = Math.floor(Math.random() * filteredRecords.length);
        const targetRecord = filteredRecords[randomIndex];
        targetUserId = targetRecord.userid;
        targetUsername = targetRecord.username || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(targetUserId))?.name || targetUserId) : targetUserId);
      }

      if (!targetUserId) {
        await session.send("未找到目标用户，请检查输入。");
        return;
      }

      const [targetRecord] = await ctx.database.get('impartpro', { userid: targetUserId });
      if (!targetRecord) {
        await session.send(`未找到用户 ${targetUserId} 的记录。请先 开导 ${h.at(targetUserId)}`);
        return;
      }

      let injectData: Record<string, number> = {};
      if (targetRecord.injectml) {
        const [date, ml] = targetRecord.injectml.split('-');
        if (date === formattedDate && !isNaN(parseFloat(ml))) {
          injectData[formattedDate] = parseFloat(ml);
        } else {
          injectData[formattedDate] = 0;
        }
      } else {
        injectData[formattedDate] = 0;
      }

      injectData[formattedDate] += parseFloat(randomML);
      const updatedInjectML = `${formattedDate}-${injectData[formattedDate].toFixed(2)}`;
      await ctx.database.set('impartpro', { userid: targetUserId }, { injectml: updatedInjectML });

      const totalML = injectData[formattedDate].toFixed(2);
      const imageLink = `http://q.qlogo.cn/headimg_dl?dst_uin=${targetUserId}&spec=640`;
      await session.send(h.text(`现在咱将随机抽取一位幸运群友送给 ${session.username}！\n好诶！${session.username} 给 ${targetUsername} 注入了${randomML}毫升的脱氧核糖核酸，\n${targetUsername}当日的总注入量为${totalML}毫升`) + `<p>` + h.image(imageLink));
    });

  ctx.command(`impartpro/${config.commandList.command2}`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }) => {
      const userId = session.userId;
      if (!await isUserAllowed(ctx, userId, session.channelId)) {
        if (config.notallowtip) {
          await session.send('你没有权限触发这个指令。');
        }
        return;
      }

      let [userRecord] = await ctx.database.get('impartpro', { userid: userId });
      if (!userRecord) {
        await session.send('你还没有数据，请先进行初始化。');
        return;
      }

      const userCurrency = await getUserCurrency(ctx, session.userId, config.currency);
      const costPerUnit = config.maintenanceCostPerUnit;

      const maxPurchasableLength = Math.floor(userCurrency / (1 / costPerUnit));

      if (maxPurchasableLength <= 0) {
        await session.send('你的货币不足以进行保养。');
        return;
      }

      await session.send(`你可以购买的最大长度为 ${maxPurchasableLength} cm。请输入你想购买的长度：`);

      const response = await session.prompt();
      const desiredLength = parseInt(response);

      if (isNaN(desiredLength) || desiredLength <= 0) {
        await session.send('输入无效，请输入一个有效的长度值。');
        return;
      }

      if (desiredLength > maxPurchasableLength) {
        await session.send('你的货币不足以购买这么多长度，请输入一个较小的值。');
        return;
      }

      userRecord.length += desiredLength;
      await updateUserCurrency(ctx, session.userId, -desiredLength / costPerUnit, config.currency);

      await ctx.database.set('impartpro', { userid: userId }, {
        length: userRecord.length,
        channelId: await updateChannelId(ctx, userId, session.channelId),
      });

      await session.send(`你花费了 ${desiredLength / costPerUnit} 货币，增加了 ${desiredLength} cm。`);
      return;
    });

  ctx.command(`impartpro/${config.commandList.command3} [user]`)
    .example(`${config.commandList.command3} @用户`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }, user) => {
      let userId = session.userId;
      let username = session.user.name || session.username;
      const currentTime = Date.now();

      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          await session.send('你没有权限触发这个指令。');
        }
        return;
      }

      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type === 'at') {
          const { id, name } = parsedUser.attrs;
          if (!id || (session.userId === id)) {
            await session.send('不可用的用户！请换一个用户吧~');
            return;
          }
          userId = id;
          username = name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(userId))?.name || userId) : userId);
        } else {
          await session.send('不可用的用户！请检查输入');
          return;
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
        await session.send(`${h.at(userId)} 自动初始化成功！你的牛牛初始长度为 ${initialLength.toFixed(2)} cm。初始生长系数为：${growthFactor.toFixed(2)}`);
        return;
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
        await session.send(`${h.at(session.userId)} 自动初始化成功！你的牛牛初始长度为 ${initialLength.toFixed(2)} cm。初始生长系数为：${growthFactor.toFixed(2)}`);
        return;
      }

      const lastInitiatorGrowthTime = new Date(initiatorRecord.lastGrowthTime).getTime();
      const cooldownTime = config.exerciseCooldownTime * 1000;
      if (isNaN(lastInitiatorGrowthTime)) {
        await session.send('用户数据有误，无法解析最后锻炼时间。');
        return;
      }

      if (currentTime - lastInitiatorGrowthTime < cooldownTime) {
        const remainingTime = Math.ceil((cooldownTime - (currentTime - lastInitiatorGrowthTime)) / 1000);
        await session.send(`${h.at(session.userId)} 处于冷却中，无法进行锻炼。冷却还剩 ${remainingTime} 秒。`);
        return;
      }

      if (user) {
        const lastTargetGrowthTime = new Date(userRecord.lastGrowthTime).getTime();
        if (isNaN(lastTargetGrowthTime)) {
          await session.send('目标用户数据有误，无法解析最后锻炼时间。');
          return;
        }

        if (currentTime - lastTargetGrowthTime < cooldownTime) {
          const remainingTime = Math.ceil((cooldownTime - (currentTime - lastTargetGrowthTime)) / 1000);
          await session.send(`${h.at(userId)} 处于冷却中，无法被开导。冷却还剩 ${remainingTime} 秒。`);
          return;
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

      await session.send(`${h.at(userId)} 锻炼${isSuccess ? '成功' : '失败'}！牛牛强化后长度为 ${enhancedLength.toFixed(2)} cm。`);
      return;
    });

  ctx.command(`impartpro/${config.commandList.command4} [user]`)
    .example(`${config.commandList.command4} @用户`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }, user) => {
      let userId: string = null;
      let username: string = null;
      const currentTime = Date.now();

      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          await session.send('你没有权限触发这个指令。');
        }
        return;
      }

      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type === 'at') {
          const { id, name } = parsedUser.attrs;
          if (!id || (session.userId === id)) {
            await session.send('不可用的用户！请换一个用户吧~');
            return;
          }
          userId = id;
          username = name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(userId))?.name || userId) : userId);
        } else {
          await session.send('不可用的用户！请检查输入');
          return;
        }
      } else {
        await session.send('请指定一个决斗用户！\n示例：决斗  @猫猫');
        return;
      }

      let [attackerRecord] = await ctx.database.get('impartpro', { userid: session.userId });
      if (!attackerRecord) {
        await session.send('你还没有数据，请先进行初始化。');
        return;
      }

      let [defenderRecord] = await ctx.database.get('impartpro', { userid: userId });
      if (!defenderRecord) {
        await session.send('目标用户还没有数据，无法进行决斗。');
        return;
      }

      const lastAttackerTime = new Date(attackerRecord.lastDuelTime).getTime();
      const lastDefenderTime = new Date(defenderRecord.lastDuelTime).getTime();
      const cooldownTime = config.duelCooldownTime * 1000;

      if (currentTime - lastAttackerTime < cooldownTime || currentTime - lastDefenderTime < cooldownTime) {
        const remainingAttackerTime = Math.max(0, cooldownTime - (currentTime - lastAttackerTime));
        const remainingDefenderTime = Math.max(0, cooldownTime - (currentTime - lastDefenderTime));
        const remainingTime = Math.max(remainingAttackerTime, remainingDefenderTime);

        await session.send(`你或目标用户处于冷却中，无法进行决斗。\n冷却还剩 ${Math.ceil(remainingTime / 1000)} 秒。`);
        return;
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

      await session.send(
        `${h.at(session.userId)} 决斗${isAttackerWin ? '胜利' : '失败'}！ <p>` +
        `${h.at(session.userId)} ${isAttackerWin ? '增加' : '减少'}了 ${growthChange.toFixed(2)} cm， <p>` +
        `${h.at(userId)} ${isAttackerWin ? '减少' : '增加'}了 ${reductionChange.toFixed(2)} cm。<p> ` +
        `战败方获得了 ${currencyGain.toFixed(2)} 点经验（货币）。`
      );
      return;
    });

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
          await session.send('你没有权限触发这个指令。');
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
        await session.send(`牛牛重置成功，当前长度为 ${initialLength.toFixed(2)} cm，成长系数为 ${growthFactor.toFixed(2)}。`);
        return;
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
        await session.send(`牛牛初始化成功，当前长度为 ${initialLength.toFixed(2)} cm，成长系数为 ${growthFactor.toFixed(2)}。`);
        return;
      }
    });

  ctx.command(`impartpro/${config.commandList.command6}`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }) => {
      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          await session.send('你没有权限触发这个指令。');
        }
        return;
      }

      const leaderboardPeopleNumber = config.leaderboardPeopleNumber || 10;
      const enableAllChannel = config.enableAllChannel;
      const currentDate = new Date();
      const day = currentDate.getDate().toString();

      const records = await ctx.database.get('impartpro', {});
      const filteredRecords = enableAllChannel
        ? records.filter(record => record.username !== '频道')
        : records.filter(record => record.channelId?.includes(session.channelId) && record.username !== '频道');

      const validRecords = filteredRecords.map(record => {
        if (!record.injectml) return null;
        const [date, ml] = record.injectml.split('-');
        if (date === day && !isNaN(parseFloat(ml))) {
          return {
            username: record.username || `用户 ${record.userid}`,
            milliliter: parseFloat(ml),
          };
        }
        return null;
      }).filter(Boolean);

      if (validRecords.length === 0) {
        await session.send('当前没有可用的注入排行榜数据。');
        return;
      }

      validRecords.sort((a, b) => b.milliliter - a.milliliter);
      const topRecords = validRecords.slice(0, leaderboardPeopleNumber);

      const rankData = topRecords.map((record, index) => ({
        order: index + 1,
        username: record.username,
        milliliter: record.milliliter.toFixed(2),
      }));

      if (config.imagemode) {
        if (!ctx.puppeteer) {
          await session.send("没有开启 puppeteer 服务");
          return;
        }

        const { fontFaceStyle, customFontFamily } = await getFontStyles(ctx, config);

        const leaderboardHTML = `
          <!DOCTYPE html>
          <html lang="zh-CN">
          <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>今日注入排行榜</title>
          <style>
          ${fontFaceStyle}
          body {
          font-family: ${customFontFamily}'Microsoft YaHei', Arial, sans-serif;
          background-color: #f0f4f8;
          margin: 0;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          }
          .container {
          background-color: white;
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          padding: 30px;
          width: 100%;
          max-width: 500px;
          }
          h1 {
          text-align: center;
          color: #2c3e50;
          margin-bottom: 30px;
          font-size: 28px;
          }
          .ranking-list {
          list-style-type: none;
          padding: 0;
          margin: 0;
          }
          .ranking-item {
          display: flex;
          align-items: center;
          padding: 15px 10px;
          border-bottom: 1px solid #ecf0f1;
          transition: background-color 0.3s;
          }
          .ranking-item:hover {
          background-color: #f8f9fa;
          }
          .ranking-number {
          font-size: 18px;
          font-weight: bold;
          margin-right: 15px;
          min-width: 30px;
          color: #7f8c8d;
          }
          .medal {
          font-size: 24px;
          margin-right: 15px;
          }
          .name {
          flex-grow: 1;
          font-size: 18px;
          }
          .milliliter {
          font-weight: bold;
          color: #3498db;
          font-size: 18px;
          }
          .milliliter::after {
          content: ' mL';
          font-size: 14px;
          color: #95a5a6;
          }
          </style>
          </head>
          <body>
          <div class="container">
          <h1>今日注入排行榜</h1>
          <ol class="ranking-list">
          ${rankData.map(record => `
          <li class="ranking-item">
          <span class="ranking-number">${record.order}</span>
          ${record.order === 1 ? '<span class="medal">🥇</span>' : ''}
          ${record.order === 2 ? '<span class="medal">🥈</span>' : ''}
          ${record.order === 3 ? '<span class="medal">🥉</span>' : ''}
          <span class="name">${record.username}</span>
          <span class="milliliter">${record.milliliter}</span>
          </li>
          `).join('')}
          </ol>
          </div>
          </body>
          </html>
          `;

        const page = await ctx.puppeteer.page();
        await page.setContent(leaderboardHTML, { waitUntil: 'domcontentloaded' });
        const leaderboardElement = await page.$('.container');
        const boundingBox = await leaderboardElement.boundingBox();
        await page.setViewport({
          width: Math.ceil(boundingBox.width),
          height: Math.ceil(boundingBox.height),
        });
        const imgBuf = await leaderboardElement.screenshot({ captureBeyondViewport: false });
        const leaderboardImage = h.image(imgBuf, 'image/png');
        await page.close();
        await session.send(leaderboardImage);
      } else {
        const leaderboard = rankData.map(record => `${record.order}. ${record.username}: ${record.milliliter} mL`).join('\n');
        await session.send(`今日注入排行榜：\n${leaderboard}`);
      }
    });

  ctx.command(`impartpro/${config.commandList.command7}`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }) => {
      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          await session.send('你没有权限触发这个指令。');
        }
        return;
      }

      const leaderboardPeopleNumber = config.leaderboardPeopleNumber;
      const enableAllChannel = config.enableAllChannel;

      const records = await ctx.database.get('impartpro', {});
      const filteredRecords = enableAllChannel
        ? records
        : records.filter(record => record.channelId?.includes(session.channelId));

      const validRecords = filteredRecords.filter(record => record.username !== '频道');

      loggerinfo(ctx, config, validRecords.toString());
      if (validRecords.length === 0) {
        await session.send('当前没有可用的排行榜数据。');
        return;
      }

      validRecords.sort((a, b) => b.length - a.length);

      const topRecords = validRecords.slice(0, leaderboardPeopleNumber);
      const rankData = topRecords.map((record, index) => ({
        order: index + 1,
        username: record.username,
        length: record.length.toFixed(2),
      }));

      if (config.imagemode) {
        if (!ctx.puppeteer) {
          await session.send("没有开启 puppeteer 服务");
          return;
        }
        const { fontFaceStyle, customFontFamily } = await getFontStyles(ctx, config);

        const leaderboardHTML = `
          <!DOCTYPE html>
          <html lang="zh-CN">
          <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>牛牛排行榜</title>
          <style>
          ${fontFaceStyle}
          body {
          font-family: ${customFontFamily}'Microsoft YaHei', Arial, sans-serif;
          background-color: #f0f4f8;
          margin: 0;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          }
          .container {
          background-color: white;
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          padding: 30px;
          width: 100%;
          max-width: 500px;
          }
          h1 {
          text-align: center;
          color: #2c3e50;
          margin-bottom: 30px;
          font-size: 28px;
          }
          .ranking-list {
          list-style-type: none;
          padding: 0;
          margin: 0;
          }
          .ranking-item {
          display: flex;
          align-items: center;
          padding: 15px 10px;
          border-bottom: 1px solid #ecf0f1;
          transition: background-color 0.3s;
          }
          .ranking-item:hover {
          background-color: #f8f9fa;
          }
          .ranking-number {
          font-size: 18px;
          font-weight: bold;
          margin-right: 15px;
          min-width: 30px;
          color: #7f8c8d;
          }
          .medal {
          font-size: 24px;
          margin-right: 15px;
          }
          .name {
          flex-grow: 1;
          font-size: 18px;
          }
          .length {
          font-weight: bold;
          color: #e74c3c;
          font-size: 18px;
          }
          .length::after {
          content: ' cm';
          font-size: 14px;
          color: #95a5a6;
          }
          </style>
          </head>
          <body>
          <div class="container">
          <h1>牛牛排行榜</h1>
          <ol class="ranking-list">
          ${rankData.map(record => `
          <li class="ranking-item">
          <span class="ranking-number">${record.order}</span>
          ${record.order === 1 ? '<span class="medal">🥇</span>' : ''}
          ${record.order === 2 ? '<span class="medal">🥈</span>' : ''}
          ${record.order === 3 ? '<span class="medal">🥉</span>' : ''}
          <span class="name">${record.username}</span>
          <span class="length">${record.length}</span>
          </li>
          `).join('')}
          </ol>
          </div>
          </body>
          </html>
          `;

        const page = await ctx.puppeteer.page();
        await page.setContent(leaderboardHTML, { waitUntil: 'domcontentloaded' });
        const leaderboardElement = await page.$('.container');

        const boundingBox = await leaderboardElement.boundingBox();
        await page.setViewport({
          width: Math.ceil(boundingBox.width),
          height: Math.ceil(boundingBox.height),
        });

        const imgBuf = await leaderboardElement.screenshot({ captureBeyondViewport: false });
        const leaderboardImage = h.image(imgBuf, 'image/png');

        await page.close();

        await session.send(leaderboardImage);
      } else {
        const leaderboard = topRecords.map((record, index) => `${index + 1}. ${record.username}: ${record.length} cm`).join('\n');
        await session.send(`牛牛排行榜：\n${leaderboard}`);
      }
    });

  ctx.command(`impartpro/${config.commandList.command8} [user]`)
    .example(`${config.commandList.command8} @用户`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }, user) => {
      let userId = session.userId;
      let username = session.user.name || session.username;
      if (!await isUserAllowed(ctx, userId, session.channelId)) {
        if (config.notallowtip) {
          await session.send('你没有权限触发这个指令。');
        }
        return;
      }

      if (user) {
        const parsedUser = h.parse(user)[0];
        if (parsedUser?.type === 'at') {
          userId = parsedUser.attrs.id;
          username = parsedUser.attrs.name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(userId))?.name || userId) : userId);
        } else {
          await session.send('不可用的用户！请检查输入');
          return;
        }
      }

      const [userRecord] = await ctx.database.get('impartpro', { userid: userId });
      const balance = await getUserCurrency(ctx, userId, config.currency);
      if (!userRecord) {
        await session.send(`暂时没有${h.at(userId)} 的记录。快输入【生成牛牛】进行初始化吧`);
        return;
      }
      await session.send(`${h.at(userId)} 的牛牛长度为 ${userRecord.length.toFixed(2)} cm，成长系数为 ${userRecord.growthFactor.toFixed(2)} 。<p>剩余点数为：${balance.toFixed(2)}`);
      return;
    });

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
        await session.send('你没有权限执行此操作。');
        return;
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
          await session.send('不可用的用户！请检查输入');
          return;
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

          await session.send(`用户 ${username} 已被禁止触发牛牛大作战。`);
        } else {
          const newStatus = !record.locked;
          await ctx.database.set('impartpro', { userid: userId }, { locked: newStatus });
          await session.send(`用户 ${username} 已${newStatus ? '被禁止' : '可以'}触发牛牛大作战。`);
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

          await session.send(`牛牛大作战已在本频道被禁止。`);
        } else {
          const newStatus = !channelRecord.locked;
          await ctx.database.set('impartpro', { userid: specialUserId }, { locked: newStatus });
          await session.send(`牛牛大作战已在本频道${newStatus ? '被禁止' : '开启'}。`);
        }
      }
    });
}