// src/commands/leaderboard.ts

import { Context, h } from 'koishi';
import { Config } from '../config';
import { isUserAllowed, loggerinfo, getFontStyles } from '../utils';

export function applyLeaderboardCommands(ctx: Context, config: Config) {
  ctx.command(`impartpro/${config.commandList.command6}`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }) => {
      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          return session.text('.not-allowed');
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
        return session.text('.no-leaderboard-data');
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
          return session.text('.puppeteer-not-enabled');
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
          /* ... (rest of the CSS) */
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
        return leaderboardImage;
      } else {
        const leaderboard = rankData.map(record => `${record.order}. ${record.username}: ${record.milliliter} mL`).join('\n');
        return session.text('.inject-leaderboard-text', [leaderboard]);
      }
    });

  ctx.command(`impartpro/${config.commandList.command7}`)
    .userFields(["id", "name", "permissions"])
    .action(async ({ session }) => {
      if (!await isUserAllowed(ctx, session.userId, session.channelId)) {
        if (config.notallowtip) {
          return session.text('.not-allowed');
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
        return session.text('.no-leaderboard-data');
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
          return session.text('.puppeteer-not-enabled');
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
          /* ... (rest of the CSS) */
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

        return leaderboardImage;
      } else {
        const leaderboard = topRecords.map((record, index) => `${index + 1}. ${record.username}: ${record.length} cm`).join('\n');
        return session.text('.leaderboard-text', [leaderboard]);
      }
    });
}