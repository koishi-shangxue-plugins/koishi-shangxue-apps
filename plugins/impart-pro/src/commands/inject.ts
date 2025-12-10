// src/commands/inject.ts

import { Context, h } from 'koishi';
import { Config } from '../config';
import { isUserAllowed } from '../utils';

function randomLength([base, variance]: number[]): number {
  const min = base * (1 - variance / 100);
  const max = base * (1 + variance / 100);
  return min + Math.random() * (max - min);
}

export function applyInjectCommand(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command1} [user]`)
    .userFields(["id", "name", "permissions"])
    .example(config.commandList.command1)
    .example(`${config.commandList.command1} @用户`)
    .action(async ({ session }, user) => {
      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          return session.text('.not-allowed');
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
            return session.text('.self-inject-disallowed');
          }
        } else {
          return session.text('.invalid-user-format');
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
          return session.text('.no-valid-users');
        }

        const randomIndex = Math.floor(Math.random() * filteredRecords.length);
        const targetRecord = filteredRecords[randomIndex];
        targetUserId = targetRecord.userid;
        targetUsername = targetRecord.username || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(targetUserId))?.name || targetUserId) : targetUserId);
      }

      if (!targetUserId) {
        return session.text('.no-target-user');
      }

      const [targetRecord] = await ctx.database.get('impartpro', { userid: targetUserId });
      if (!targetRecord) {
        return session.text('.target-user-not-initialized', [h.at(targetUserId)]);
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
      return h.text(session.text('.inject-success', [session.username, targetUsername, randomML, totalML])) + `<p>` + h.image(imageLink);
    });
}