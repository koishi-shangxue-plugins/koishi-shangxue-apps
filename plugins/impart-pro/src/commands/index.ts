// src/commands/index.ts

import { Context } from 'koishi';
import { Config } from '../config';
import { applyInjectCommand } from './inject';
import { applyMaintenanceCommand } from './maintenance';
import { applyExerciseCommand } from './exercise';
import { applyDuelCommand } from './duel';
import { applyResetCommand } from './reset';
import { applyLeaderboardCommands } from './leaderboard';
import { applyQueryCommand } from './query';
import { applyLockCommand } from './lock';

export function applyCommands(ctx: Context, config: Config) {
  // i18n
  ctx.i18n.define("zh-CN", {
    commands: {
      [config.commandList.command]: {
        description: "在群里玩牛牛相关游戏",
      },
      [config.commandList.command1]: {
        description: "注入群友",
        messages: {
          "not-allowed": "你没有权限触发这个指令。",
          "self-inject-disallowed": "不允许自己注入自己哦~ 换一个用户吧",
          "invalid-user-format": "输入的用户格式不正确，请使用 @用户 格式。",
          "no-valid-users": "未找到符合条件的用户。",
          "no-target-user": "未找到目标用户，请检查输入。",
          "target-user-not-initialized": "未找到用户 {0} 的记录。请先 开导 {0}",
          "inject-success": "现在咱将随机抽取一位幸运群友送给 {0}！\n好诶！{0} 给 {1} 注入了{2}毫升的脱氧核糖核酸，\n{1}当日的总注入量为{3}毫升",
        },
      },
      [config.commandList.command2]: {
        description: "通过花费货币来增加牛牛的长度",
        messages: {
          "not-initialized": "你还没有数据，请先进行初始化。",
          "insufficient-currency": "你的货币不足以进行保养。",
          "purchase-prompt": "你可以购买的最大长度为 {0} cm。请输入你想购买的长度：",
          "invalid-input": "输入无效，请输入一个有效的长度值。",
          "currency-not-enough-for-purchase": "你的货币不足以购买这么多长度，请输入一个较小的值。",
          "purchase-success": "你花费了 {0} 货币，增加了 {1} cm。",
        },
      },
      [config.commandList.command3]: {
        description: "让牛牛成长！",
        messages: {
          "invalid-user": "不可用的用户！请换一个用户吧~",
          "auto-initialize-success": "{0} 自动初始化成功！你的牛牛初始长度为 {1} cm。初始生长系数为：{2}",
          "data-error-last-growth-time": "用户数据有误，无法解析最后锻炼时间。",
          "cooldown": "{0} 处于冷却中，无法进行锻炼。冷却还剩 {1} 秒。",
          "target-data-error-last-growth-time": "目标用户数据有误，无法解析最后锻炼时间。",
          "target-cooldown": "{0} 处于冷却中，无法被开导。冷却还剩 {1} 秒。",
          "exercise-success": "{0} 锻炼成功！牛牛强化后长度为 {1} cm。",
          "exercise-failure": "{0} 锻炼失败！牛牛强化后长度为 {1} cm。",
        },
      },
      [config.commandList.command4]: {
        description: "决斗牛牛！",
        messages: {
          "no-duel-target": "请指定一个决斗用户！\n示例：决斗  @猫猫",
          "target-not-initialized": "目标用户还没有数据，无法进行决斗。",
          "duel-cooldown": "你或目标用户处于冷却中，无法进行决斗。\n冷却还剩 {0} 秒。",
          "duel-result": "{0} 决斗{1}！ <p>{2} {3}了 {4} cm， <p>{5} {6}了 {7} cm。<p> 战败方获得了 {8} 点经验（货币）。",
        },
      },
      [config.commandList.command5]: {
        description: "重开一个牛牛~",
        messages: {
          "reset-success": "牛牛重置成功，当前长度为 {0} cm，成长系数为 {1}。",
          "initialize-success": "牛牛初始化成功，当前长度为 {0} cm，成长系数为 {1}。",
        },
      },
      [config.commandList.command6]: {
        description: "查看注入排行榜",
        messages: {
          "no-leaderboard-data": "当前没有可用的排行榜数据。",
          "puppeteer-not-enabled": "没有开启 puppeteer 服务",
          "inject-leaderboard-text": "今日注入排行榜：\n{0}",
        },
      },
      [config.commandList.command7]: {
        description: "查看牛牛排行榜",
        messages: {
          "leaderboard-text": "牛牛排行榜：\n{0}",
        },
      },
      [config.commandList.command8]: {
        description: "查看牛牛",
        messages: {
          "user-not-initialized": "暂时没有{0} 的记录。快输入【生成牛牛】进行初始化吧",
          "user-info": "{0} 的牛牛长度为 {1} cm，成长系数为 {2} 。<p>剩余点数为：{3}",
        },
      },
      [config.commandList.command9]: {
        description: "开启/禁止牛牛大作战",
        messages: {
          "permission-denied": "你没有权限执行此操作。",
          "user-locked": "用户 {0} 已被禁止触发牛牛大作战。",
          "user-unlocked": "用户 {0} 已可以触发牛牛大作战。",
          "channel-locked": "牛牛大作战已在本频道被禁止。",
          "channel-unlocked": "牛牛大作战已在本频道开启。",
        },
      }
    }
  });

  // apply all commands
  applyInjectCommand(ctx, config);
  applyMaintenanceCommand(ctx, config);
  applyExerciseCommand(ctx, config);
  applyDuelCommand(ctx, config);
  applyResetCommand(ctx, config);
  applyLeaderboardCommands(ctx, config);
  applyQueryCommand(ctx, config);
  applyLockCommand(ctx, config);
}