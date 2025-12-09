import { Context, Schema, h } from 'koishi';

import { } from 'koishi-plugin-puppeteer';
import { } from 'koishi-plugin-monetary';
import { fontlist } from './../../../../service-more/packages/glyph';
import type { } from './../../../../service-more/packages/glyph';

import fs from 'node:fs';
import path from 'node:path';

export const name = 'deer-pipe';
export const inject = {
  required: ['database', 'puppeteer', 'monetary'],
  optional: ['glyph']
};

export const usage = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Deer Pipe 插件使用指南</title>
</head>
<body>
<h1>Deer Pipe 插件使用指南</h1>
<h2><a href="https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/deer-pipe" target="_blank">点我查看README</a></h2>
<details>
<summary>详细的配置项功能列表 </summary>
<h3>签到</h3>
<ul>
<li><strong>指令</strong>: <code>🦌 [艾特用户]</code> 或 <code>鹿管 [艾特用户]</code></li>
<li><strong>作用</strong>: 签到当天，可重复签到，默认上限五次。</li>
<li><strong>示例</strong>: <code>🦌</code>（自己签到） / <code>🦌 @猫猫</code>（帮他鹿）</li>
</ul>
<h3>允许/禁止被鹿</h3>
<ul>
<li><strong>指令</strong>: <code>戴锁</code> 或 <code>脱锁</code></li>
<li><strong>作用</strong>: 允许/禁止别人帮你鹿</li>
<li><strong>示例</strong>: <code>戴锁</code> / <code>脱锁</code></li>
</ul>
<h3>查看签到日历</h3>
<ul>
<li><strong>指令</strong>: <code>看看日历 [艾特用户]</code> 或 <code>查看日历 [艾特用户]</code></li>
<li><strong>作用</strong>: 查看自己或指定用户的签到日历。</li>
<li><strong>示例</strong>: <code>看看日历</code>（查看自己的日历） / <code>看看日历 @猫猫</code>（查看猫猫的日历）</li>
</ul>
<h3>查看排行榜</h3>
<ul>
<li><strong>指令</strong>: <code>鹿管排行榜</code> 或 <code>🦌榜</code></li>
<li><strong>作用</strong>: 查看谁签到最多。</li>
<li><strong>示例</strong>: <code>鹿管排行榜</code></li>
</ul>
<h3>补签</h3>
<ul>
<li><strong>指令</strong>: <code>补🦌 [日期]</code></li>
<li><strong>作用</strong>: 补签到指定日期。例如补签当月的15号。</li>
<li><strong>示例</strong>: <code>补🦌 15</code></li>
</ul>
<h3>取消签到</h3>
<ul>
<li><strong>指令</strong>: <code>戒🦌 [日期]</code></li>
<li><strong>作用</strong>: 取消某天的签到。例如取消签到当月的10号。</li>
<li><strong>示例</strong>: <code>戒🦌 10</code> （若省略<code>10</code>，会取消签到今天的）</li>
</ul>
<h3>购买</h3>
<ul>
<li><strong>指令</strong>: <code>购买</code></li>
<li><strong>作用</strong>: 用于买道具。</li>
<li><strong>示例</strong>: <code>购买 锁</code> 、 <code>购买 钥匙</code></li>
锁可以禁止别人帮你鹿，钥匙可以强制鹿戴锁的人
(暂时就这两个道具 有想法从上面的【问题反馈】提)
</ul>
</details>

---

本插件理想的艾特元素内容是<code>< at id="114514" name="这是名字"/></code>
如果你的适配器的艾特元素是<code>< at id="114514"/></code> 那么排行榜功能就会出现用户ID的内容。
这个时候只需要让用户自己签到一次即可恢复，并且在不同的群签到，会存为对应的用户名称。

---

不支持QQ官方机器人是因为无法收到<code>< at id="ABCDEFG"/></code> 的消息元素

---

本插件支持 monetary·通用货币设置 
你可以把对应的配置项，与其他插件设置为一样的值，以联动使用货币
>  比如你可以[安装 jrys-prpr](/market?keyword=jrys-prpr) ，
>  
>  然后把 currency 配置项改为 jrys-prpr 一样的值（默认jrysprpr），
>  
>  以实现【在 jrys-prpr 签到获得的可以在本插件使用】的效果。
</body>
</html>

---

本插件的排行榜用户昵称可以通过 [callme](/market?keyword=callme) 插件自定义
在未指定 callme 插件的名称的时候，默认使用 适配器的username，或者userid
`;

export const Config: Schema = Schema.intersect([
  Schema.object({
    maximum_helpsignin_times_per_day: Schema.number().description('每日帮助别人签到次数上限（不受重复签到开关控制）').default(5).min(1),
    enable_deerpipe: Schema.boolean().description('开启后，允许重复签到<br>关闭后就没有重复签到的玩法').default(false),
    maximum_times_per_day: Schema.number().description('每日签到次数上限`小鹿怡..什么伤身来着`').default(3).min(1),
    enable_blue_tip: Schema.boolean().description('开启后，签到后会返回补签玩法提示').default(false),
  }).description('基础设置'),

  Schema.object({
    delete_message_after_signin: Schema.boolean().description('开启后，会撤回签到消息。').default(false),
  }).description('进阶设置'),
  Schema.union([
    Schema.object({
      delete_message_after_signin: Schema.const(true).required(),
      delete_message_time: Schema.number().description('发送消息若干秒后撤回。（单位：秒）').default(30).min(10).max(120).step(1).role('slider'),
    }),
    Schema.object({
      delete_message_after_signin: Schema.const(false),
    }),
  ]),

  Schema.object({
    leaderboard_people_number: Schema.number().description('签到次数·排行榜显示人数').default(15).min(3),
    enable_allchannel: Schema.boolean().description('开启后，排行榜将展示全部用户排名`关闭则仅展示当前频道的用户排名`').default(false),
    Reset_Cycle: Schema.union(['每月', '不重置']).default("每月").description("签到数据重置周期。（相当于重新开始排名）"),
  }).description('签到次数·排行榜设置'),

  Schema.object({
    currency: Schema.string().default('default').description('monetary 的 currency 字段'),
    cost: Schema.object({
      checkin_reward: Schema.array(Schema.object({
        command: Schema.union(['鹿', "鹿@用户", '补鹿', '戒鹿', "补鹿@用户", "戴锁"]).description("交互指令"),
        cost: Schema.number().description("货币变动"),
      })).role('table').description('【获取硬币】本插件指令的货币变动').default(
        [
          {
            "command": "鹿",
            "cost": 100
          },
          {
            "command": "鹿@用户",
            "cost": 150
          },
          {
            "command": "补鹿",
            "cost": -100
          },
          {
            "command": "戒鹿",
            "cost": -100
          },
          {
            "command": "补鹿@用户",
            "cost": -500
          },
          {
            "command": "戴锁",
            "cost": -100
          }
        ]
      ),
      store_item: Schema.array(Schema.object({
        item: Schema.string().description("物品名称"),
        cost: Schema.number().description("货币变动"),
      })).role('table').default([{ "item": "锁", "cost": -50 }, { "item": "钥匙", "cost": -250 }]).description('【购买】商店道具货价表'),
    }).collapse().description('货币平衡设置——**默认价格表**<br>涉及游戏平衡，谨慎修改'),
    special_cost: Schema.dict(Schema.object({
      checkin_reward: Schema.array(Schema.object({
        command: Schema.union(['鹿', "鹿@用户", '补鹿', '戒鹿', "补鹿@用户", "戴锁"]).description("交互指令"),
        cost: Schema.number().description("货币变动"),
      })).role('table').description('【获取硬币】本插件指令的货币变动').default(
        [
          {
            "command": "鹿",
            "cost": 100
          },
          {
            "command": "鹿@用户",
            "cost": 150
          },
          {
            "command": "补鹿",
            "cost": -100
          },
          {
            "command": "戒鹿",
            "cost": -100
          },
          {
            "command": "补鹿@用户",
            "cost": -500
          },
          {
            "command": "戴锁",
            "cost": -100
          }
        ]
      ),
      store_item: Schema.array(Schema.object({
        item: Schema.string().description("物品名称"),
        cost: Schema.number().description("货币变动"),
      })).role('table').default([{ "item": "锁", "cost": -50 }, { "item": "钥匙", "cost": -250 }]).description('【购买】商店道具货价表'),
    })).role('table').description('货币平衡设置——**特殊价格表**<br>需在`store_item`右侧白框填入`用户ID`或者`频道ID`<br>涉及游戏平衡，谨慎修改')
  }).description('monetary·通用货币设置'),

  Schema.object({
    fontName: Schema.union(fontlist).description("渲染排行榜使用的字体（包含emoji）。<br>选择要使用的字体，若渲染功能正常，请不要修改此项！<br>需要安装 koishi-plugin-glyph 插件才能使用此功能"),
    calendarImagePreset1: Schema.union([
      Schema.const('0').description('自定义路径（参见下方的路径选择配置项）'),
      Schema.const('1').description('鹿管（默认-预设1）'),
      Schema.const('2').description('心奈（预设2）'),
    ]).role('radio').description("日历图片预设1-背景图").default("1"),
    calendarImagePreset2: Schema.union([
      Schema.const('0').description('自定义路径（参见下方的路径选择配置项）'),
      Schema.const('1').description('红勾（默认-预设1）'),
      Schema.const('2').description('壹佰分盖章（预设2）'),
    ]).role('radio').description("日历图片预设2-完成符号").default("1"),
  }).description('调试设置'),
  Schema.union([
    Schema.object({
      calendarImagePreset1: Schema.const("0").required(),
      calendarImagePath1: Schema.path({ filters: ['file'] }).description('日历每日背景图像路径（请选择图片）<br>使用方法详见[readme](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/deer-pipe)').experimental(),
    }),
    Schema.object({
    }),
  ]),
  Schema.union([
    Schema.object({
      calendarImagePreset2: Schema.const("0").required(),
      calendarImagePath2: Schema.path({ filters: ['file'] }).description('日历每日完成标志路径（请选择图片）<br>使用方法详见[readme](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/deer-pipe)').experimental(),
    }),
    Schema.object({
    }),
  ]),

  Schema.object({
    logInfo: Schema.boolean().description('启用调试日志输出模式').default(false).experimental(),
  }).description('开发者选项'),
]);

interface DeerPipeTable {
  userid: string;
  username: string;
  channelId: string[];
  recordtime: string;
  checkindate: string[];
  totaltimes: number;
  helpsignintimes: string;
  allowHelp: boolean;
  itemInventory: string[];
}

declare module 'koishi' {
  interface Tables {
    deerpipe: DeerPipeTable;
  }
}

export async function apply(ctx: Context, config) {
  ctx.on('ready', async () => {
    ctx.model.extend('deerpipe', {
      userid: 'string', // 用户ID
      username: 'string', // 名字。用于排行榜
      channelId: 'list', // 频道ID数组，用于支持多个群组
      recordtime: 'string', // 最新签到的年月，用于记录更新
      allowHelp: 'boolean', // 是否允许被别人帮助签到，默认为 true
      checkindate: 'list', // 当前月份的签到的日期号
      helpsignintimes: 'string', // 每日签到帮助人数，格式【日期=人数】
      totaltimes: 'integer', // 鹿管签到总次数。用于排行榜
      itemInventory: 'list',    // 道具清单，记录该玩家拥有的道具
    }, {
      primary: ['userid'],
    });
    // 读取图片并转换为Base64
    async function readFileAsBase64(filePath: string): Promise<string> {
      const data = await fs.promises.readFile(filePath);
      return data.toString('base64');
    }
    // 根据预设值选择对应的图片路径
    const presetPaths = {
      '1': path.join(__dirname, '../png/1/1.png'),
      '2': path.join(__dirname, '../png/2/1.png'),
    };
    const presetPaths2 = {
      '1': path.join(__dirname, '../png/1/2.png'),
      '2': path.join(__dirname, '../png/2/2.png'),
    };
    const calendarImagePath1 = config.calendarImagePreset1 === '0' ? config.calendarImagePath1 : presetPaths[config.calendarImagePreset1];
    const calendarImagePath2 = config.calendarImagePreset2 === '0' ? config.calendarImagePath2 : presetPaths2[config.calendarImagePreset2];
    const calendarpngimagebase64_1 = await readFileAsBase64(calendarImagePath1);
    const calendarpngimagebase64_2 = await readFileAsBase64(calendarImagePath2);
    // 获取字体 Data URL
    let fontBase64 = '';
    try {
      // 如果安装了 glyph 插件，使用 glyph 服务获取字体
      if (ctx.glyph && config.fontName) {
        const fontDataUrl = ctx.glyph.getFontDataUrl(config.fontName);
        if (fontDataUrl) {
          // Data URL 格式: data:font/truetype;charset=utf-8;base64,xxxxx
          // 提取 base64 部分
          fontBase64 = fontDataUrl.split(',')[1];
          logInfo(`使用 glyph 字体：${config.fontName}`);
        } else {
          ctx.logger.warn(`未找到字体: ${config.fontName}，将使用系统默认字体`);
        }
      }
    } catch (error) {
      ctx.logger.error(`获取字体失败: ${error}`);
    }

    const zh_CN_default = {
      commands: {
        "戴锁": {
          description: "允许/禁止别人帮你鹿",
          messages: {
            "tip": "你已经{0}别人帮助你签到。",
            "notfound": "用户未找到，请先进行签到。",
            "no_item": "你没有道具【锁】，无法执行此操作。\n请使用指令：购买 锁",
            "no_balance": "余额不足，无法执行此操作。当前余额为 {0}。",
            "successtip": "操作成功！{0}别人帮你鹿，消耗道具【锁】，当前余额为 {1}。",
          }
        },
        "鹿": {
          description: "鹿管签到",
          messages: {
            "Already_signed_in": "今天已经签过到了，请明天再来签到吧~",
            "Help_sign_in": "你成功帮助 {0} 签到！获得 {1} 点货币。",
            "invalid_input_user": "请艾特指定用户。\n示例： 🦌  @用户",
            "invalid_userid": "不可用的用户，请换一个用户帮他签到吧~",
            "enable_blue_tip": "还可以帮助未签到的人签到，以获取补签次数哦！\n使用示例： 鹿  @用户",
            "Sign_in_success": " 你已经签到{0}次啦~ 继续加油咪~\n本次签到获得 {1} 点货币。",
            "not_allowHelp": "该用户已禁止他人帮助签到。",
            "use_key_to_help": "你使用了一个【钥匙】打开了 {0} 的锁！（仅本次）"
          }
        },
        "帮鹿": {
          description: "鹿管签到",
          messages: {
            "Already_signed_in": "今天已经签过到了，请明天再来签到吧~",
            "Help_sign_in": "你成功帮助 {0} 签到！获得 {1} 点货币。",
            "invalid_input_user": "请艾特指定用户。\n示例： 🦌  @用户",
            "invalid_userid": "不可用的用户，请换一个用户帮他签到吧~",
            "enable_blue_tip": "还可以帮助未签到的人签到，以获取补签次数哦！\n使用示例： 鹿  @用户",
            "Sign_in_success": " 你已经签到{0}次啦~ 继续加油咪~\n本次签到获得 {1} 点货币。",
            "not_allowHelp": "该用户已禁止他人帮助签到。",
            "use_key_to_help": "你使用了一个【钥匙】打开了{0}的锁！"
          }
        },
        "看鹿": {
          description: "查看用户签到日历",
          messages: {
            "invalid_input_user": "请艾特指定用户。\n示例： 🦌  @用户",
            "invalid_userid": "不可用的用户，请换一个用户帮他签到吧~",
            "notfound": "未找到该用户的签到记录。",
            "balance": "你当前的货币点数余额为：{0}"
          }
        },
        "鹿管排行榜": {
          description: "查看签到排行榜",
          messages: {
            //"Leaderboard_title": "{0}月鹿管排行榜"
          }
        },
        "补鹿": {
          description: "补签某日",
          messages: {
            "No_record": "暂无你的签到记录哦，快去签到吧~",
            "invalid_day": "日期不正确或未到，请输入有效的日期。\n示例： 补🦌  1",
            "Already_resigned": "你已经补签过{0}号了。",
            "Resign_success": " 你已成功补签{0}号。点数变化：{1}",
            "help_others_Resign_success": " 你已成功补签{0}号。",
            "help_others_Resign_success_cost": " 点数变化：{0}",
            "Insufficient_balance": "货币点数不足。快去帮别人签到获取点数吧",
            "maximum_times_per_day": "{0}号的签到次数已经达到上限 {1} 次，请换别的日期补签吧\~"
          }
        },
        "戒鹿": {
          description: "取消某日签到",
          messages: {
            //"Cancel_sign_in_confirm": "你确定要取消{0}号的签到吗？请再次输入命令确认。",
            "invalid_day": "日期不正确，请输入有效的日期。\n示例： 戒🦌  1",
            "Cancel_sign_in_success": " 你已成功取消{0}号的签到。点数变化：{1}",
            "No_sign_in": "你没有在{0}号签到。",
            "insufficient_currency": "你的余额不足以戒鹿。"
          }
        }
      }
    };
    ctx.i18n.define("zh-CN", zh_CN_default);
    ctx.command('鹿管签到', '鹿管签到')
      .alias('deerpipe')
    ctx.command('鹿管签到/鹿管购买 [item]', '购买签到道具', { authority: 1 })
      .example("鹿管购买 锁")
      .example("鹿管购买 钥匙")
      .userFields(["id", "name", "permissions"])
      .action(async ({ session }, item) => {
        const userId = session.userId;
        const costTable = getCostTable(config, session); // 获取合适的价格表
        const storeItems = costTable.store_item; // 从配置中获取商店商品列表

        const targetItem = storeItems.find(i => i.item === item);
        if (!targetItem) {
          const availableItems = storeItems.map(i => `${i.item}（${i.cost}点）`).join('\n');
          await session.execute(`鹿管购买 -h`);
          await session.send(`未找到商品：${item}，你可以购买以下商品：\n${availableItems}`);
          return;
        }
        const { cost } = targetItem;
        // 获取用户余额
        const balance = await getUserCurrency(ctx, session.user.id);
        if (balance < Math.abs(cost)) {
          await session.send(`余额不足，无法购买 ${item}，当前余额为 ${balance}。`);
          return;
        }
        try {
          // 执行货币扣除
          await updateUserCurrency(ctx, session.user.id, cost);
          // 检查用户记录是否存在
          let [userRecord] = await ctx.database.get('deerpipe', { userid: userId });
          if (!userRecord) {
            // 初始化用户记录
            userRecord = {
              userid: userId,
              username: session.user.name || session.username,
              channelId: await updateChannelId(session.userId, session.channelId),
              recordtime: '',
              checkindate: [],
              helpsignintimes: "",
              totaltimes: 0,
              allowHelp: true,
              itemInventory: [item], // 添加购买的物品
            };
            await ctx.database.create('deerpipe', userRecord);
          } else {
            // 如果用户记录存在，更新道具清单
            if (!userRecord.itemInventory) {
              userRecord.itemInventory = []; // 避免 itemInventory 为 null
            }
            userRecord.itemInventory.push(item);
            await ctx.database.set('deerpipe', { userid: userId }, { itemInventory: userRecord.itemInventory });
          }
          // 返回购买成功的提示和余额信息
          const newBalance = balance - Math.abs(cost);
          await session.send(`购买成功！已购买 ${item}，剩余点数为 ${newBalance}。`);
        } catch (error) {
          ctx.logger.error(`用户 ${userId} 购买 ${item} 时出错: ${error}`);
          await session.send(`购买 ${item} 时出现问题，请稍后再试。`);
        }
      });
    ctx.command('鹿管签到/戴锁', '允许/禁止别人帮你鹿', { authority: 1 })
      .alias('脱锁')
      .alias('带锁')
      .userFields(["id", "name", "permissions"])
      .action(async ({ session }) => {
        const userId = session.userId;
        const [user] = await ctx.database.get('deerpipe', { userid: userId });
        if (!user) {
          await session.send(session.text(`.notfound`));
          return;
        }
        if (!user.itemInventory || !user.itemInventory.includes('锁')) {
          await session.send(session.text('.no_item'));
          return;
        }
        const costTable = getCostTable(config, session); // 获取合适的价格表
        const cost = costTable.checkin_reward.find(c => c.command === '戴锁').cost;
        const balance = await getUserCurrency(ctx, session.user.id);
        if (balance + cost < 0) {
          await session.send(session.text(`.no_balance`, [balance]));
          return;
        }
        user.allowHelp = !user.allowHelp;
        await ctx.database.set('deerpipe', { userid: userId }, { allowHelp: user.allowHelp });
        const status = user.allowHelp ? '允许' : '禁止';
        const index = user.itemInventory.indexOf('锁');
        if (index !== -1) {
          user.itemInventory.splice(index, 1);
        }
        await ctx.database.set('deerpipe', { userid: userId }, { itemInventory: user.itemInventory });
        await updateUserCurrency(ctx, session.user.id, cost);
        await session.send(session.text(`.successtip`, [status, balance + cost]));
      });
    //看看日历
    ctx.command('鹿管签到/看鹿 [user]', '查看用户签到日历', { authority: 1 })
      .alias('看🦌')
      .alias('看看日历')
      .userFields(["id", "name", "permissions"])
      .example('看鹿 @用户')
      .action(async ({ session }, user) => {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        let targetUserId = session.userId;
        let targetUsername = session.user.name || session.username;
        if (user) {
          const parsedUser = h.parse(user)[0];
          if (parsedUser?.type === 'at') {
            const { id, name } = parsedUser.attrs;
            if (!id) {
              await session.send(session.text('.invalid_userid'));
              return;
            }
            targetUserId = id;
            targetUsername = name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(targetUserId))?.name || targetUserId) : targetUserId);
          } else {
            await session.send(session.text('.invalid_input_user'));
            return;
          }
        }
        const [targetRecord] = await ctx.database.get('deerpipe', { userid: targetUserId });
        if (!targetRecord) {
          await session.send(session.text('.notfound'));
          return;
        }
        // 获取用户余额
        const targetUserIduid = await updateIDbyuserId(targetUserId, session)
        if (targetUserIduid === null) return
        const balance = await getUserCurrency(ctx, targetUserIduid); // 使用 targetUserId 对应的 aid 获取余额
        const imgBuf = await renderSignInCalendar(ctx, targetUserId, targetUsername, currentYear, currentMonth);
        const calendarImage = h.image(imgBuf, 'image/png');
        await sendWithDelete(session, h.at(targetUserId) + ` ` + h.text(session.text(`.balance`, [balance])));
        await sendWithDelete(session, calendarImage);
      });
    // 【鹿 [user]】指令，仅对 session.userId 进行签到
    ctx.command('鹿管签到/鹿 [user]', '鹿管签到', { authority: 1 })
      .alias('🦌')
      .userFields(["id", "name", "permissions"])
      .example('鹿')
      .action(async ({ session }, user) => {
        if (user) {
          // 如果检测到 user 参数，自动执行帮鹿指令
          await session.execute(`帮鹿 ${user}`);
          return;
        }
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const currentDay = currentDate.getDate();
        const recordtime = `${currentYear}-${currentMonth}`;

        const costTable = getCostTable(config, session); // 获取合适的价格表
        const cost = costTable.checkin_reward.find(c => c.command === '鹿').cost;

        const sessionUserId = session.userId;
        const sessionUsername = session.user.name || session.username;
        // 获取目标用户的签到记录
        let [sessionRecord] = await ctx.database.get('deerpipe', { userid: sessionUserId });
        // 检查是否需要重置数据
        if (sessionRecord && config.Reset_Cycle === '每月') {
          const [recordYear, recordMonth] = sessionRecord.recordtime.split('-').map(Number);
          if (currentYear > recordYear || (currentYear === recordYear && currentMonth > recordMonth)) {
            // 重置用户数据
            await ctx.database.set('deerpipe', { userid: sessionUserId }, {
              username: sessionUsername,
              channelId: await updateChannelId(sessionUserId, session.channelId), // 更新 channelId 数组
              recordtime,
              checkindate: [],
              helpsignintimes: "",
              totaltimes: 0,
            });
            await session.execute("鹿");
            return;
          }
        }
        if (!sessionRecord) {
          // 初始化记录
          sessionRecord = {
            userid: sessionUserId,
            username: sessionUsername,
            channelId: await updateChannelId(sessionUserId, session.channelId),
            recordtime,
            checkindate: [`${currentDay}=1`],
            helpsignintimes: "",
            totaltimes: 1,
            allowHelp: true,
            itemInventory: [],
          };
          await ctx.database.create('deerpipe', sessionRecord);
        } else {
          // 更新已有记录
          sessionRecord.channelId = await updateChannelId(sessionUserId, session.channelId);
          if (sessionRecord.recordtime !== recordtime) {
            sessionRecord.recordtime = recordtime;
            sessionRecord.checkindate = [];
          }
          const dayRecordIndex = sessionRecord.checkindate.findIndex(date => date.startsWith(`${currentDay}`));
          const dayRecord = dayRecordIndex !== -1 ? sessionRecord.checkindate[dayRecordIndex] : `${currentDay}=0`;
          const [day, count] = dayRecord.includes('=') ? dayRecord.split('=') : [dayRecord, '1'];
          const currentSignInCount = parseInt(count) || 0;
          if (currentSignInCount >= config.maximum_times_per_day) {
            const imgBuf = await renderSignInCalendar(ctx, sessionUserId, sessionUsername, currentYear, currentMonth);
            const calendarImage = h.image(imgBuf, 'image/png');
            if (config.enable_blue_tip) {
              await session.send(calendarImage + `<p>` + session.text('.Already_signed_in') + session.text('.enable_blue_tip')); // + `<p>`
            } else {
              await session.send(calendarImage + `<p>` + session.text('.Already_signed_in'));
            }
            return;
          }
          const newCount = currentSignInCount + 1;
          if (config.enable_deerpipe || newCount === 1) {
            if (dayRecordIndex !== -1) {
              sessionRecord.checkindate[dayRecordIndex] = `${day}=${newCount}`;
            } else {
              sessionRecord.checkindate.push(`${day}=${newCount}`);
            }
            sessionRecord.totaltimes += 1;
          }
          await ctx.database.set('deerpipe', { userid: sessionUserId }, {
            checkindate: sessionRecord.checkindate,
            totaltimes: sessionRecord.totaltimes,
            recordtime: sessionRecord.recordtime,
            channelId: sessionRecord.channelId,
            username: sessionUsername,
          });
          if (!config.enable_deerpipe && newCount > 1) {
            const imgBuf = await renderSignInCalendar(ctx, sessionUserId, sessionUsername, currentYear, currentMonth);
            const calendarImage = h.image(imgBuf, 'image/png');
            if (config.enable_blue_tip) {
              await session.send(calendarImage + `<p>` + session.text('.Already_signed_in') + session.text('.enable_blue_tip')); // + `<p>`
            } else {
              await session.send(calendarImage + `<p>` + session.text('.Already_signed_in'));
            }
            return;
          }
        }
        const imgBuf = await renderSignInCalendar(ctx, sessionUserId, sessionUsername, currentYear, currentMonth);
        const calendarImage = h.image(imgBuf, 'image/png');
        await updateUserCurrency(ctx, session.user.id, cost);
        if (config.enable_blue_tip) {
          await sendWithDelete(session, calendarImage + `<p>` + h.at(sessionUserId) + session.text('.Sign_in_success', [sessionRecord.totaltimes, cost]) + session.text('.enable_blue_tip'));
        } else {
          await sendWithDelete(session, calendarImage + `<p>` + h.at(sessionUserId) + session.text('.Sign_in_success', [sessionRecord.totaltimes, cost]));
        }
        return;
      });
    // 【帮鹿 [user]】指令，仅允许对输入的 user 进行签到
    ctx.command('鹿管签到/帮鹿 [user]', '帮助用户签到', { authority: 1 })
      .alias('帮🦌')
      .userFields(["id", "name", "permissions"])
      .example('帮鹿 @用户')
      .action(async ({ session }, user) => {
        if (!user) {
          // 如果未检测到 user 参数，自动执行鹿指令
          await session.execute("鹿");
          return;
        }
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const currentDay = currentDate.getDate();
        const recordtime = `${currentYear}-${currentMonth}`;

        const parsedUser = h.parse(user)[0];
        if (!parsedUser || parsedUser.type !== 'at' || !parsedUser.attrs.id) {
          await session.send(session.text('.invalid_input_user'));
          return;
        }
        const targetUserId = parsedUser.attrs.id;
        let targetUsername = parsedUser.attrs.name ||
          (typeof session.bot.getUser === 'function' ?
            ((await session.bot.getUser(targetUserId))?.name || targetUserId) :
            targetUserId);

        const costTable1 = getCostTable(config, session, targetUserId); // 获取合适的价格表 // 被@的 // user
        const costTable2 = getCostTable(config, session); // 获取合适的价格表  //  session.userId
        const cost1 = costTable1.checkin_reward.find(c => c.command === '鹿').cost; // +100 为 targetUser 增加签到奖励 // 被@的用户  // user
        const cost2 = costTable2.checkin_reward.find(c => c.command === '鹿@用户').cost;// -150 为【帮助者】增加货币奖励 //  session.userId

        let [targetRecord] = await ctx.database.get('deerpipe', { userid: targetUserId });

        // 检查是否需要重置数据
        if (targetRecord && config.Reset_Cycle === '每月') {
          const [recordYear, recordMonth] = targetRecord.recordtime.split('-').map(Number);
          if (currentYear > recordYear || (currentYear === recordYear && currentMonth > recordMonth)) {
            // 重置用户数据
            await ctx.database.set('deerpipe', { userid: targetUserId }, {
              username: targetUsername,
              channelId: await updateChannelId(targetUserId, session.channelId),
              recordtime,
              checkindate: [],
              helpsignintimes: "",
              totaltimes: 0,
              allowHelp: targetRecord.allowHelp, // 保持原有的 allowHelp 设置
              itemInventory: targetRecord.itemInventory, // 保持原有的道具
            });
            targetRecord = await ctx.database.get('deerpipe', { userid: targetUserId })[0];
          }
        }

        if (!targetRecord) {
          targetRecord = {
            userid: targetUserId,
            username: targetUsername,
            channelId: await updateChannelId(targetUserId, session.channelId),
            recordtime,
            checkindate: [],
            helpsignintimes: "",
            totaltimes: 0,
            allowHelp: true,
            itemInventory: [],
          };
          await ctx.database.create('deerpipe', targetRecord);
        }
        let [helperRecord] = await ctx.database.get('deerpipe', { userid: session.userId });
        if (!helperRecord) { // 初始化
          helperRecord = {
            userid: session.userId,
            username: session.user.name || session.username,
            channelId: await updateChannelId(targetUserId, session.channelId),
            recordtime,
            checkindate: [],
            helpsignintimes: "",
            totaltimes: 0,
            allowHelp: true,
            itemInventory: [],
          };
          await ctx.database.create('deerpipe', helperRecord);
        }
        if (!targetRecord.allowHelp) {
          const hasKey = helperRecord.itemInventory.includes("钥匙");
          if (hasKey) {
            const keyIndex = helperRecord.itemInventory.indexOf("钥匙");
            if (keyIndex !== -1) {
              helperRecord.itemInventory.splice(keyIndex, 1);
              await ctx.database.set("deerpipe", { userid: session.userId }, {
                itemInventory: helperRecord.itemInventory
              });
              await session.send(session.text(".use_key_to_help", [targetUserId]));
            }
          } else {
            await session.send(session.text(".not_allowHelp"));
            return;
          }
        }
        const helpsignintimes = {};
        if (helperRecord.helpsignintimes) {
          const entries = helperRecord.helpsignintimes.split(',').map(entry => entry.split('='));
          for (const [date, count] of entries) {
            helpsignintimes[date] = parseInt(count) || 0;
          }
        }
        helpsignintimes[currentDay] = helpsignintimes[currentDay] || 0;
        // 检查帮助签到逻辑
        if (helpsignintimes[currentDay] >= config.maximum_helpsignin_times_per_day) {
          await session.send(`你今天已经帮助别人签到 ${config.maximum_helpsignin_times_per_day} 次，抵达上限，无法继续帮助~`);
          return;
        }
        if (!config.enable_deerpipe) {
          config.maximum_times_per_day = 1
        }
        const dayRecordIndex = targetRecord.checkindate.findIndex(date => date.startsWith(`${currentDay}`));
        if (dayRecordIndex !== -1 && targetRecord.checkindate[dayRecordIndex].split('=')[1] >= config.maximum_times_per_day) {
          const imgBuf = await renderSignInCalendar(ctx, targetUserId, targetUsername, currentYear, currentMonth);
          const calendarImage = h.image(imgBuf, 'image/png');
          if (config.enable_blue_tip) {
            await session.send(calendarImage + `<p>` + session.text('.Already_signed_in') + session.text('.enable_blue_tip')); // + `<p>`
          } else {
            await session.send(calendarImage + `<p>` + session.text('.Already_signed_in'));
          }
          return;
        }
        helpsignintimes[currentDay] += 1;
        await ctx.database.set('deerpipe', { userid: session.userId }, {
          helpsignintimes: Object.entries(helpsignintimes).map(([date, count]) => `${date}=${count}`).join(','),
        });
        if (dayRecordIndex !== -1) {
          const [day, count] = targetRecord.checkindate[dayRecordIndex].split('=');
          targetRecord.checkindate[dayRecordIndex] = `${day}=${parseInt(count) + 1}`;
        } else {
          targetRecord.checkindate.push(`${currentDay}=1`);
        }
        targetRecord.totaltimes += 1;
        await ctx.database.set('deerpipe', { userid: targetUserId }, {
          checkindate: targetRecord.checkindate,
          totaltimes: targetRecord.totaltimes,
        });
        // 更新货币奖励
        const targetUserIduid = await updateIDbyuserId(targetUserId, session)
        if (targetUserIduid === null) return
        await updateUserCurrency(ctx, targetUserIduid, cost1); //+100 为 targetUser 增加签到奖励
        await updateUserCurrency(ctx, session.user.id, cost2); // -150 为【帮助者】增加货币奖励 
        // 渲染图片
        const imgBuf = await renderSignInCalendar(ctx, targetUserId, targetUsername, currentYear, currentMonth);
        const calendarImage = h.image(imgBuf, 'image/png');
        // 发送带图片的消息
        const message = `${calendarImage}\n` + `${session.text('.Sign_in_success', [targetRecord.totaltimes, cost1])} `;
        await sendWithDelete(session, `${h.at(session.userId)} ${session.text('.Help_sign_in', [targetUsername, cost2])}`);
        if (config.enable_blue_tip) {
          await sendWithDelete(session, message + session.text('.enable_blue_tip'));
        } else {
          await sendWithDelete(session, message);
        }
      });
    ctx.command('鹿管签到/鹿榜', '查看签到排行榜', { authority: 1 })
      .alias('🦌榜')
      .action(async ({ session }) => {
        const enableAllChannel = config.enable_allchannel;
        // 获取所有记录，如果不启用跨群组，则过滤 channelId
        const records = await ctx.database.get('deerpipe', {});
        const filteredRecords = enableAllChannel
          ? records
          : records.filter(record => record.channelId?.includes(session.channelId));
        logInfo(filteredRecords)
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const currentRecordtime = `${currentYear}-${currentMonth}`;
        // 筛选出当月有签到记录的用户
        let validRecords = filteredRecords.filter(record => {
          return record.recordtime === currentRecordtime && record.totaltimes > 0;
        });
        // 按签到次数排序
        validRecords.sort((a, b) => b.totaltimes - a.totaltimes);
        const topRecords = validRecords.slice(0, config.leaderboard_people_number);
        // 构造排行榜数据
        const rankData = topRecords.map((record, index) => ({
          order: index + 1,
          card: record.username,
          channels: record.channelId?.join(', ') || '未知', // 展示所在群组
          sum: record.totaltimes,
        }));
        const leaderboardHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>鹿管排行榜</title>
<style>
@font-face {
  font-family: 'MiSans';
  src: url(data:font/truetype;charset=utf-8;base64,${fontBase64}) format('truetype');
}
* { 
  font-family: 'MiSans', sans-serif;
}
body {
font-family: 'Microsoft YaHei', Arial, sans-serif;
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
.channels {
font-size: 14px;
color: #7f8c8d;
margin-left: 10px;
}
.count {
font-weight: bold;
color: #e74c3c;
font-size: 18px;
}
.count::after {
content: ' 次';
font-size: 14px;
color: #95a5a6;
}
</style>
</head>
<body>
<div class="container">
<h1>🦌 ${currentMonth}月鹿管排行榜 🦌</h1>
<ol class="ranking-list">
${rankData.map(deer => `
<li class="ranking-item">
<span class="ranking-number">${deer.order}</span>
${deer.order === 1 ? '<span class="medal">🥇</span>' : ''}
${deer.order === 2 ? '<span class="medal">🥈</span>' : ''}
${deer.order === 3 ? '<span class="medal">🥉</span>' : ''}
<span class="name">${deer.card}</span>
<!--span class="channels">${deer.channels}</span-->
<span class="count">${deer.sum}</span>
</li>
`).join('')}
</ol>
</div>
</body>
</html>
`;
        const page = await ctx.puppeteer.page();
        await page.setContent(leaderboardHTML, { waitUntil: 'networkidle2' });
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
        return;
      });
    ctx.command('鹿管签到/补鹿 [day] [user]', '补签某日', { authority: 1 })
      .alias('补🦌')
      .userFields(["id", "name", "permissions"])
      .example('补鹿 1')
      .example('补鹿 1 @用户')
      .action(async ({ session }, day: string, user) => {
        const dayNum = parseInt(day, 10);
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const currentDay = currentDate.getDate();
        let targetUserId = session.userId;
        let targetUsername = session.user.name || session.username;
        const costTable = getCostTable(config, session); // 获取合适的价格表
        // const costTable2 = getCostTable(config, session); // 获取合适的价格表
        // 默认消耗货币为补签自己
        let cost = costTable.checkin_reward.find(c => c.command === '补鹿').cost;
        // 处理用户输入
        if (user) {
          const parsedUser = h.parse(user)[0];
          if (parsedUser?.type === 'at') {
            const { id, name } = parsedUser.attrs;
            if (!id) {
              await session.send(session.text('.invalid_userid'));
              return;
            }
            // 如果是为他人补签，调整目标用户和消耗
            targetUserId = id;
            // targetUsername = name || id; // 使用名字或ID
            targetUsername = name || (typeof session.bot.getUser === 'function' ? ((await session.bot.getUser(targetUserId))?.name || targetUserId) : targetUserId);
            cost = costTable.checkin_reward.find(c => c.command === '补鹿@用户').cost;
          } else {
            await session.send(session.text('.invalid_input_user'));
            return;
          }
        }
        // 校验输入日期
        if (isNaN(dayNum) || dayNum < 1 || dayNum > 31 || dayNum > currentDay) {
          await session.send(session.text('.invalid_day'));
          return;
        }
        // 获取用户记录
        let [record] = await ctx.database.get('deerpipe', { userid: targetUserId });
        if (!record) {
          await session.send(session.text('.No_record'));
          return;
        }
        // 检查目标用户余额
        const targetUserIduid = await updateIDbyuserId(session.userId, session)
        if (targetUserIduid === null) return
        const balance = await getUserCurrency(ctx, targetUserIduid);
        if (balance < Math.abs(cost)) { // 使用绝对值进行检查
          await session.send(session.text('.Insufficient_balance'));
          return;
        }
        // 更新用户名
        const username = session.user.name || session.username;
        if (record.username !== username) {
          record.username = username;
        }
        // 查找指定日期记录
        const dayRecordIndex = record.checkindate.findIndex(date => {
          const [dayStr] = date.split('=');
          return parseInt(dayStr, 10) === dayNum;
        });
        let dayRecord = dayRecordIndex !== -1 ? record.checkindate[dayRecordIndex] : `${dayNum}=0`;
        const [dayStr, count] = dayRecord.includes('=') ? dayRecord.split('=') : [dayRecord, '0'];
        const currentSignInCount = parseInt(count) || 0;
        // 检查是否超过签到次数上限
        if (currentSignInCount >= config.maximum_times_per_day) {
          await session.send(session.text('.maximum_times_per_day', [dayStr, config.maximum_times_per_day]));
          return;
        }
        // 更新签到次数
        let newCount = currentSignInCount + 1;
        if (dayRecordIndex !== -1 && !config.enable_deerpipe && currentSignInCount > 0) {
          await session.send(`${h.at(targetUserId)} ${session.text('.Already_resigned', [dayNum])}`);
          return;
        }
        // 更新或插入签到记录
        if (dayRecordIndex !== -1) {
          record.checkindate[dayRecordIndex] = `${dayStr}=${newCount}`;
        } else {
          record.checkindate.push(`${dayNum}=1`);
        }
        // 更新总签到次数
        record.totaltimes += 1;
        // 扣除货币
        await updateUserCurrency(ctx, targetUserIduid, -Math.abs(cost));
        // 更新数据库
        await ctx.database.set('deerpipe', { userid: targetUserId }, {
          username: record.username,
          checkindate: record.checkindate,
          totaltimes: record.totaltimes,
        });
        // 渲染签到日历
        const imgBuf = await renderSignInCalendar(ctx, targetUserId, targetUsername, currentYear, currentMonth);
        const calendarImage = h.image(imgBuf, 'image/png');
        // 发送签到成功信息
        if (user) {
          await sendWithDelete(session, calendarImage + `<p>` + h.at(targetUserId) + session.text('.help_others_Resign_success', [dayNum]) + `<p>` + h.at(session.userId) + session.text('.help_others_Resign_success_cost', [cost]));
        } else {
          await sendWithDelete(session, calendarImage + `<p>` + h.at(targetUserId) + session.text('.Resign_success', [dayNum, cost]));
        }
        return;
      });
    ctx.command('鹿管签到/戒鹿 [day]', '取消某日签到', { authority: 1 })
      .alias('戒🦌')
      .alias('寸止')
      .userFields(["id", "name", "permissions"])
      .example('戒鹿 1')
      .action(async ({ session }, day?: string) => {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;
        const currentDay = currentDate.getDate();
        const recordtime = `${currentYear}-${currentMonth}`;
        const dayNum = day ? parseInt(day, 10) : currentDay;
        if (isNaN(dayNum) || dayNum < 1 || dayNum > 31 || dayNum > currentDay) {
          await session.send(session.text('.invalid_day'));
          return;
        }
        let [record] = await ctx.database.get('deerpipe', { userid: session.userId });
        if (record) {
          const costTable = getCostTable(config, session); // 获取合适的价格表
          // 从配置中获取取消签到的奖励或费用
          const cost = costTable.checkin_reward.find(c => c.command === '戒鹿').cost;
          // 检查用户是否有足够的货币
          const userCurrency = await getUserCurrency(ctx, session.user.id);
          if (userCurrency < Math.abs(cost)) {
            await session.send(`${h.at(session.userId)} ${session.text('.insufficient_currency')}`);
            return;
          }
          // 更新用户名
          const username = session.user.name || session.username;
          if (record.username !== username) {
            record.username = username;
          }
          // 查找并更新签到记录
          const dayRecordIndex = record.checkindate.findIndex(date => date.startsWith(`${dayNum}`));
          if (dayRecordIndex !== -1) {
            const [dayStr, count] = record.checkindate[dayRecordIndex].split('=');
            let newCount = (parseInt(count) || 0) - 1;
            if (newCount > 0) {
              record.checkindate[dayRecordIndex] = `${dayStr}=${newCount}`;
            } else {
              record.checkindate.splice(dayRecordIndex, 1);
            }
            record.totaltimes -= 1;
            // 更新用户货币
            await updateUserCurrency(ctx, session.user.id, cost);
            await ctx.database.set('deerpipe', { userid: session.userId }, {
              username: record.username,
              checkindate: record.checkindate,
              totaltimes: record.totaltimes,
              recordtime: record.recordtime,
            });
            const imgBuf = await renderSignInCalendar(ctx, session.userId, username, currentYear, currentMonth);
            const calendarImage = h.image(imgBuf, 'image/png');
            await sendWithDelete(session, calendarImage + `<p>` + h.at(session.userId) + session.text('.Cancel_sign_in_success', [dayNum, cost]));
          } else {
            await session.send(`${h.at(session.userId)} ${session.text('.No_sign_in', [dayNum])}`);
          }
        } else {
          await session.send(`${h.at(session.userId)} ${session.text('.No_sign_in', [dayNum])}`);
        }
      });

    function logInfo(message) {
      if (config.logInfo) {
        ctx.logger.info(message);
      }
    }

    async function sendWithDelete(session, content) {
      if (!config.delete_message_after_signin) {
        // 如果未开启撤回功能，直接发送消息
        await session.send(content);
        return
      }
      const messageResult = await session.send(content);
      // 设置定时器在指定时间后撤回消息
      ctx.setTimeout(async () => {
        try {
          if (Array.isArray(messageResult)) {
            // 如果返回的是消息ID数组，撤回所有消息
            for (const messageId of messageResult) {
              await session.bot.deleteMessage(session.channelId, messageId);
            }
          } else if (typeof messageResult === 'number' || typeof messageResult === 'string') {
            // 如果返回的是单个消息ID，撤回该消息
            await session.bot.deleteMessage(session.channelId, messageResult);
          }
          logInfo(`已撤回签到消息，消息ID: ${messageResult}`);
        } catch (error) {
          ctx.logger.error(`撤回消息失败: ${error}`);
        }
      }, config.delete_message_time * 1000);

      return messageResult;
    }

    async function updateUserCurrency(ctx: Context, uid, amount: number, currency: string = config.currency) {
      try {
        const numericUserId = Number(uid); // 将 userId 转换为数字类型
        //  通过 ctx.monetary.gain 为用户增加货币，
        //  或者使用相应的 ctx.monetary.cost 来减少货币
        if (amount > 0) {
          await ctx.monetary.gain(numericUserId, amount, currency);
          logInfo(`为用户 ${uid} 增加了 ${amount} ${currency}`);
        } else if (amount < 0) {
          await ctx.monetary.cost(numericUserId, -amount, currency);
          logInfo(`为用户 ${uid} 减少了 ${-amount} ${currency}`);
        }
        return `用户 ${uid} 成功更新了 ${Math.abs(amount)} ${currency}`;
      } catch (error) {
        ctx.logger.error(`更新用户 ${uid} 的货币时出错: ${error}`);
        return `更新用户 ${uid} 的货币时出现问题。`;
      }
    }
    async function getUserCurrency(ctx, uid, currency = config.currency) {
      try {
        const numericUserId = Number(uid);
        const [data] = await ctx.database.get('monetary', {
          uid: numericUserId,
          currency,
        }, ['value']);
        return data ? data.value : 0;
      } catch (error) {
        ctx.logger.error(`获取用户 ${uid} 的货币时出错: ${error}`);
        return 0; // Return 0 
      }
    }
    async function updateIDbyuserId(userId, session) {
      // 查询数据库的 binding 表
      const [bindingRecord] = await ctx.database.get('binding', {
        pid: userId,
        platform: session.platform,
      });
      // 检查是否找到了匹配的记录
      if (!bindingRecord) {
        await session.send("未找到对应的用户记录，请让目标用户交互此指令。");
        // 返回一个特殊值表示失败
        return null;
      }
      // 返回 aid 字段作为对应的 id
      return bindingRecord.aid;
    }

    async function renderSignInCalendar(ctx: Context, userId: string, username: string, year: number, month: number): Promise<Buffer> {
      const [record] = await ctx.database.get('deerpipe', { userid: userId });
      const checkinDates = record?.checkindate || [];
      const calendarDayData = generateCalendarHTML(checkinDates, year, month, username);
      // ../assets/MiSans-Regular.ttf 这个字体，emmm怎么说呢，无所谓了，不要了
      const fullHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>签到日历</title>
<style>
@font-face {
  font-family: 'MiSans';
  src: url(data:font/truetype;charset=utf-8;base64,${fontBase64}) format('truetype');
}
* {
  font-family: 'MiSans', sans-serif;
}
.calendar {
width: 320px;
margin: 20px;
border: 1px solid #ccc;
padding: 10px;
box-sizing: border-box;
}
.calendar-header {
font-weight: bold;
font-size: 18px;
margin-bottom: 5px;
text-align: left;
}
.calendar-subheader {
text-align: left;
margin-bottom: 10px;
}
.weekdays {
display: grid;
grid-template-columns: repeat(7, 1fr);
text-align: center;
font-size: 12px;
margin-bottom: 5px;
}
.calendar-grid {
display: grid;
grid-template-columns: repeat(7, 1fr);
gap: 5px;
}
.calendar-day {
position: relative;
text-align: center;
}
.deer-image {
width: 100%;
height: auto;
}
.check-image {
position: absolute;
top: 0;
left: 0;
width: 100%;
height: auto;
}
.day-number {
position: absolute;
bottom: 2px;
left: 2px;
font-size: 14px;
color: black;
}
.multiple-sign {
position: absolute;
bottom: -2px;
right: 0px;
font-size: 12px;
color: red;
font-weight: bold;
}
</style>
</head>
<body>
${calendarDayData}
</body>
</html>
`;
      const page = await ctx.puppeteer.page();
      await page.setContent(fullHTML, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.deer-image');
      const calendarElement = await page.$('.calendar');
      const imgBuf = await calendarElement.screenshot({ captureBeyondViewport: false });
      await page.close();
      return imgBuf;
    }
    function generateCalendarHTML(checkinDates, year, month, username) {
      const daysInMonth = new Date(year, month, 0).getDate();
      let calendarHTML = `
<div class="calendar">
<div class="calendar-header">${year}-${month.toString().padStart(2, '0')} 签到</div>
<div class="calendar-subheader">${username}</div>
<div class="weekdays">
<div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
</div>
<div class="calendar-grid">
`;
      const startDay = new Date(year, month - 1, 1).getDay();
      for (let i = 0; i < startDay; i++) {
        calendarHTML += `<div></div>`;
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dayRecord = checkinDates.find(date => date.startsWith(`${day}=`) || date === `${day}`);
        const [dayStr, countStr] = dayRecord ? dayRecord.split('=') : [null, null];
        const count = countStr ? parseInt(countStr) : 1;
        const checkedIn = dayRecord !== undefined;
        calendarHTML += `
<div class="calendar-day">
<img src="data:image/png;base64,${calendarpngimagebase64_1}" class="deer-image" alt="Deer">
${checkedIn ? `<img src="data:image/png;base64,${calendarpngimagebase64_2}" class="check-image" alt="Check">` : ''}
<div class="day-number">${day}</div>
${checkedIn && count > 1 ? `<div class="multiple-sign">×${count}</div>` : ''}
</div>
`;
      }
      calendarHTML += `
</div>
</div>
`;
      return calendarHTML;
    }
    // 更新用户的 channelId 数组，如果不存在则添加
    async function updateChannelId(userId, newChannelId) {
      const [userRecord] = await ctx.database.get('deerpipe', { userid: userId });
      if (!userRecord) {
        return [newChannelId]; // 如果用户不存在，直接返回当前频道ID
      }
      const currentChannels = userRecord.channelId || [];
      if (!currentChannels.includes(newChannelId)) {
        currentChannels.push(newChannelId);
        //await ctx.database.set('deerpipe', { userid: userId }, { channelId: currentChannels });
      }
      return currentChannels;
    }
    function getCostTable(config, session, at_userId?) {

      const specialCost = config.special_cost;
      if (!at_userId) {
        // 优先查找用户特殊价格表
        if (specialCost[session.userId]) {
          return specialCost[session.userId];
        }

        // 其次查找群组特殊价格表
        if (specialCost[session.channelId]) {
          return specialCost[session.channelId];
        }

        // 如果都没有，返回默认价格表
        return config.cost;
      } else {
        // 优先查找用户特殊价格表
        if (specialCost[at_userId]) {
          return specialCost[at_userId];
        }

        // 其次查找群组特殊价格表
        if (specialCost[session.channelId]) {
          return specialCost[session.channelId];
        }

        // 如果都没有，返回默认价格表
        return config.cost;
      }
    }
  })
}
