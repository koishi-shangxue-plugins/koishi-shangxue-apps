import { clone, Context, h, Logger, Schema, sleep, Session } from 'koishi';
import { } from '@koishijs/assets';
import { } from 'koishi-plugin-puppeteer';
import { } from "D:/QQbots/QQ_bots/koishing/coding/koishi-b/koishi-mipp/koishi-app/external/adapter-github/";
import { } from "koishi-plugin-canvas";

export const name = 'testplugin';
export const inject = {
  required: ['http', 'logger', 'puppeteer', 'database'],
  optional: ['assets', 'cache']
};
const logger = new Logger(name);
export interface Config { }

export const Config: Schema<Config> =
  Schema.intersect([
    Schema.object({
      value1: Schema.union([]).description('在这里添加说明'),
      value2: Schema.union([
        Schema.const('foo'),
        Schema.const('bar').description('选项 2'),
        Schema.const('baz').description('选项 3'),
      ]).role('radio'),
    }).description('分组 1'),
    Schema.object({
    }).description('分组 2'),
  ]);


export function apply(ctx: Context) {
  // write your plugin here
  const commandName = "消息";

  const command = ctx.command(commandName);

  ctx.platform("yunhu").on('guild-role-updated', async (session) => {
    ctx.logger.info(session);

  });

  command
    .subcommand('.selfrole')
    .action(async ({ session }) => {

      if (!session) return;
      // @ts-ignore
      ctx.logger.info(session.bot.user.role);
      return;
    });


  command
    .subcommand('.下班提醒')
    .action(async ({ session }) => {

      if (!session) return;
      if (session.platform !== 'onebot') return;
      await session.send(h("at", { type: "all" }) + " 下班！打卡！日报！");
      return;
    });

  command
    .subcommand('.上班提醒')
    .action(async ({ session }) => {

      if (!session) return;
      if (session.platform !== 'onebot') return;
      await session.send(h("at", { type: "all" }) + " 上班！打卡！");
      return;
    });

  command
    .subcommand('.updatedrole')
    .action(async ({ session }) => {

      if (!session) return;
      await session.bot.updateGuildRole(`${session.guildId}`, 'koishi测试2', { name: 'SVIP' });
      return;
    });

  // ctx.platform("pbhh").on('guild-member-added', async (session) => {
  //   ctx.logger.info('added', session)
  // })

  const cmd = ctx.command('room', 'PBHH 聊天室测试');
  // 加入房间（建立持久 WS，开始接收消息）
  cmd.subcommand('.join <roomId:number>', '加入聊天室')
    .example('room.join 6')
    .action(async ({ session }, roomId) => {

      if (!session) return;
      if (!roomId) return '请输入房间 ID';
      const bot = session.bot.internal;
      bot.joinRoom(roomId);
      return `已发起加入房间 ${roomId}，等待 WS 连接建立…`;
    });
  // 离开房间（断开 WS）
  cmd.subcommand('.leave <roomId:number>', '离开聊天室')
    .example('room.leave 6')
    .action(async ({ session }, roomId) => {

      if (!session) return;
      if (!roomId) return '请输入房间 ID';
      const bot = session.bot.internal;
      bot.leaveRoom(roomId);
      return `已离开房间 ${roomId}`;
    });

  // // 切换房间（离开旧的，加入新的）
  // cmd.subcommand('.switch <fromId:number> <toId:number>', '切换聊天室')
  //   .example('room.switch 1 6')
  //   .action(async ({ session }: { session: Session }, fromId, toId) => {
  //     if (!toId) return '请输入要切换到的房间 ID'
  //     const bot = session.bot.internal
  //     if (fromId) {
  //       bot.leaveRoom(fromId)
  //     }
  //     bot.joinRoom(toId)
  //     return fromId
  //       ? `已从房间 ${fromId} 切换到房间 ${toId}`
  //       : `已加入房间 ${toId}`
  //   })

  // 列出所有房间
  cmd.subcommand('.list', '列出所有聊天室')
    .action(async ({ session }) => {

      if (!session) return;
      const list = await session.bot.getGuildList();
      const rooms = list.data.filter((g) => g.id.startsWith('room:'));
      if (!rooms.length) return '暂无聊天室';
      return rooms.map((r) => `[${r.id}] ${r.name}`).join('\n');
    });

  // 查看某个房间的历史消息（最近 10 条）
  cmd.subcommand('.history <roomId:number>', '查看聊天室历史消息')
    .example('room.history 6')
    .action(async ({ session }, roomId) => {

      if (!session) return;
      if (!roomId) return '请输入房间 ID';
      const list = await session.bot.getMessageList(`room:${roomId}`);
      if (!list.data.length) return '暂无历史消息';
      const lines = list.data.slice(-10).map((m) => {
        const who = m.user?.name ?? m.user?.id ?? '?';
        return `[${who}] ${m.content}`;
      });
      return lines.join('\n');
    });

  // 创建新聊天室
  cmd.subcommand('.create <name:text>', '创建聊天室')
    .example('room.create 新房间')
    .action(async ({ session }, name) => {

      if (!session) return;
      if (!name) return '请输入房间名称';
      const bot = session.bot.internal;
      const room = await bot.createRoom(name);
      return `已创建聊天室：ID=${room.id}  名称=${room.name}  创建者=${room.createdBy}`;
    });

  // 向指定房间发消息（无需加入）
  cmd.subcommand('.send <roomId:number> <content:text>', '向聊天室发送消息（无需加入）')
    .example('room.send 6 你好')
    .action(async ({ session }, roomId, content) => {

      if (!session) return;
      if (!roomId || !content) return '请输入房间 ID 和消息内容';
      const bot = session.bot.internal;
      await bot.sendRoomMessage(roomId, content);
      return `已向房间 ${roomId} 发送：${content}`;
    });

  // command
  //   .subcommand('.历史记录')
  //   .action(async ({ session }: { session: Session }, id) => {
  //     const aaa = await session.bot.internal.getFriendMsgHistory(session.userId)
  //     ctx.logger.info(aaa)
  //     return
  //   })

  ctx.command('test-timeout', '测试页面渲染超时')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send('开始测试，页面将在1分钟后渲染完成...');

      const page = await ctx.puppeteer.page();
      try {
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>超时测试</title>
        </head>
        <body>
          <h1>正在加载...</h1>
          <div id="content"></div>
        </body>
        </html>
      `;

        await page.setContent(html);

        // 使用 waitForFunction 等待1分钟
        await page.waitForFunction(() => {
          return new Promise(resolve => {
            setTimeout(() => resolve(true), 60000);
          });
        });

        const screenshot = await page.screenshot();
        await session.send(h.image(screenshot, 'image/png'));
        return '✅ 测试完成';
      } catch (error) {
        // catch 里的错误默认是 unknown，需要先做类型收窄
        ctx.logger.info(error);
        const message = error instanceof Error ? error.message : String(error);
        return `❌ 测试失败: ${message}`;
      } finally {
        await page.close();
      }
    });



  // ctx.platform('qq').on('message', async (session) =>
  // {
  //   ctx.logger.info(session);
  //   ctx.logger.info(session.selfId);
  // });

  // ctx.platform('qq').on("before-send", async (session) =>
  // {
  //   ctx.logger.info(session);
  // });

  ctx.platform('qq').on("message", async (session) => {
    ctx.logger.info("quote内容： ", session.quote);
  });

  ctx.platform('qq').on('guild-member-request', async (session) => {
    if (!session.messageId) return;

    try {
      // 自动同意入群申请
      await session.bot.handleGuildMemberRequest(session.messageId, true);
      ctx.logger.info('已自动同意入群申请: %s', session.messageId);
    } catch (error) {
      ctx.logger.warn('自动同意入群申请失败: %o', error);
    }
  });

  // ctx.platform('onebot').on('guild-member-added', async (session) => {
  //   ctx.logger.info('[guild-member-added] %o', session);
  //   ctx.logger.info(session.guildId);
  //   ctx.logger.info(session.userId);
  //   ctx.logger.info(session.bot.muteGuildMember);
  //   await (session.bot).muteGuildMember((session.guildId),(session.userId),60000);
  // });




  ctx.platform('qq').on('guild-member-added', async (session) => {
    ctx.logger.info('[guild-member-added] %o', JSON.stringify(session));
    //  await session.send(h.text("欢迎新成员！"));
  });
  ctx.platform('qq').on("guild-added", async (session) => {
    ctx.logger.info('[guild-added] %o', JSON.stringify(session));
  });
  ctx.platform('bilibili').on("message", async (session) => {
    ctx.logger.info('[message] %o', JSON.stringify(session));
  });
  // ctx.platform('qq').on('guild-member-updated', async (session) => {
  //   ctx.logger.info('[guild-member-updated] %o', session);
  // });

  // ctx.platform('qq').on('guild-member-removed', async (session) => {
  //   ctx.logger.info('[guild-member-removed] %o', session);
  // });

  // ctx.on('message', async (session) => {
  //   ctx.logger.info(session.content)
  // })

  // ctx.on('iirose/broadcast' as any, async (session, data) => {
  //   ctx.logger.info(session, data)
  // })

  // ctx.platform("iirose").on('guild-member-added', async (session) => {
  //   ctx.logger.info('added', session)
  // })

  // ctx.platform("iirose").on('guild-member-removed', async (session) => {
  //   ctx.logger.info('removed', session)
  // })

  // ctx.platform("iirose").on('guild-member-updated', async (session) => {
  //   ctx.logger.info('updated', session)
  // })

  // ctx.cache.set('foo', 'bar', 114514)


  // let testInterval: NodeJS.Timeout | null = null;
  // ctx.command('log-test', '压力测试日志输出')
  //   .action(async ({ session }: { session: Session }) => {
  //     if (testInterval) {
  //       clearInterval(testInterval);
  //       testInterval = null;
  //       return '日志压力测试已停止。';
  //     } else {
  //       let i = 0;
  //       testInterval = setInterval(() => {
  //         const loggers = ['test', 'database', 'adapter-onebot', 'http-server', 'plugin-a', 'plugin-b'];
  //         const loggerName = loggers[i % loggers.length];
  //         ctx.logger(loggerName).info(`压力测试日志 #${i++} - 这是一个为了测试长文本而生成的随机字符串: ${Math.random().toString(36).substring(7)}`);
  //       }, 10); // 每 10 毫秒输出一次以产生高压力
  //       return '日志压力测试已开始。再次运行命令以停止。';
  //     }
  //   });

  // command
  //   .subcommand('.@')
  //   .action(async ({ session }) =>
  //   {

  //     if (!session) return;
  //     await session.send("你好啊，你被艾特了！" + h.at(session.userId) + "你好啊，你被艾特了！");
  //     return;
  //   });


  ctx.command('这是一个超级长的测试指令这是一个超级长的测试指令这是一个超级长的测试指令这是一个超级长的测试指令', "这是一个超级长的测试指令这是一个超级长的测试指令这是一个超级长的测试指令这一个超级长的测试指令")
    .action(async ({ session }) => {

      if (!session) return;
      ctx.assets.transform("");
      ctx.logger.info("===");
      return;
    });
  command
    .subcommand('.按钮2')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("qq:button", {
        "render_data": {
          "label": "再来一次",
          "style": 2
        },
        "action": {
          "type": 2,
          "permission": {
            "type": 2
          },
          "data": "消息 按钮2",
          "enter": true
        }
      }));
      return;
    });

  command
    .subcommand('.canvas')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = await ctx.canvas.loadImage("file://D:/Pictures/koishi/moving_square_loop.webp");
      ctx.logger.info(aaa);
      await session.send("已经打印");
      return;
    });

  command
    .subcommand('.按钮')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send([
        h("markdown", "# 你好"),
        h("button", {
          text: "消息 按钮"
        })]);
      return;
    });

  async function sendMenuMessage(session: Session, message: unknown): Promise<void> {
    const sess = session as any;
    const guildId = sess.event.guild?.id;
    const userId = sess.event.user?.id;

    if (guildId) {
      if (sess.qq) {
        await sess.qq.sendMessage(sess.channelId, message);
        return;
      }

      if (sess.qqguild) {
        await sess.qqguild.sendMessage(sess.channelId, message);
        return;
      }
    }

    if (userId && sess.qq) {
      await sess.qq.sendPrivateMessage(userId, message);
      return;
    }

    throw new Error('当前会话没有可用的发送目标。');
  }
  ctx.on('interaction/button', async (session: Session) => {
    ctx.logger.info(`接收到回调按钮内容： `, session);
  });

  command
    .subcommand('.QQ回调按钮')
    .action(async ({ session }) => {
      if (!session) return 'no session';
      if (session.platform !== 'qq') return 'only qq';

      const message = {
        msg_type: 2,
        msg_id: session.messageId || '', // 普通markdown消息用这个消息id，响应回调按钮的markdown消息用event_id
        // event_id: 'INTERACTION_CREATE',
        // event_id是只有响应回调按钮的markdown消息才能加上，普通markdown消息不能加这个参数
        markdown: {
          content: '## 按钮测试\n### 这是一个 QQ 回调按钮测试',
        },
        keyboard: {
          content: {
            rows: [
              {
                buttons: [
                  {
                    render_data: {
                      label: '再来一次',
                      style: 2,
                    },
                    action: {
                      type: 1,
                      permission: { type: 2 },
                      data: '/jrysprpr',
                      enter: true,
                    },
                  },
                ],
              },
            ],
          },
        },
      };

      await sendMenuMessage(session, message as any);
      return;
    });

  command
    .subcommand('.fork')
    .action(async ({ session }, id) => {

      if (!session) return;
      // 手动创建一个新对象，复制 session 的主要属性
      // 这样可以避免复制不可克隆的属性（如 Proxy、函数等）
      let forksession = {
        ...session,
        content: session.content,  // 显式复制 content 字符串
      };

      ctx.logger.info("修改前 forksession.content:", forksession.content);
      ctx.logger.info("修改前 session.content:", session.content);

      forksession.content = "123123";

      ctx.logger.info("修改后 forksession.content:", forksession.content);
      ctx.logger.info("修改后 session.content:", session.content);
      return;
    });

  command
    .subcommand('.rea')
    .action(async ({ session }) => {

      if (!session) return;
      // channelId 也可能为空，这里单独收窄
      const channelId = session.channelId;
      if (!channelId) return;
      const parts = channelId.split(':');
      const [repoPrefix, type, numberStr] = parts;
      const [owner, repo] = repoPrefix.split('/');
      const issueNumber = parseInt(numberStr);

      let reactionId: number;

      // 判断是评论还是 Issue/PR 本身
      if (session.messageId !== 'issue' && session.messageId !== 'pull' && session.messageId !== 'discussion') {
        // 评论消息的 messageId 需要先确认存在
        const messageId = session.messageId;
        if (!messageId) return;
        const commentId = parseInt(messageId);

        // 创建反应
        reactionId = await session.bot.internal.createIssueCommentReaction(
          owner, repo, commentId, '+1'
        );

        await session.send(`已添加反应 👍，反应 ID: ${reactionId}，5秒后自动删除...`);

        // 等待 5 秒
        await new Promise(resolve => setTimeout(resolve, 5 * 1000));

        // 删除反应
        await session.bot.internal.deleteIssueCommentReaction(
          owner, repo, commentId, reactionId
        );

        return `已删除反应 ID: ${reactionId}`;
      } else {
        // 这是 Issue/PR 本身
        reactionId = await session.bot.internal.createIssueReaction(
          owner, repo, issueNumber, '+1'
        );

        await session.send(`已添加反应 👍，反应 ID: ${reactionId}，5秒后自动删除...`);

        // 等待 5 秒
        await new Promise(resolve => setTimeout(resolve, 5 * 1000));

        // 删除反应
        await session.bot.internal.deleteIssueReaction(
          owner, repo, issueNumber, reactionId
        );

        return `已删除反应 ID: ${reactionId}`;
      }
    });


  command
    .subcommand('logger')
    .action(async ({ session }, id) => {

      if (!session) return;
      logger.info("123123");
      ctx.logger.info("123123");
      return;
    });

  ctx.command('trans')
    .action(async ({ session }) => {

      if (!session) return;
      ctx.assets.transform("");
      ctx.logger.info("===");
      return;
    });

  ctx.command('aauth')
    .userFields(["authority"])
    .action(async ({ session }: { session?: Session<'authority'>; }) => {
      // 这里的 session 需要显式声明 authority 字段，并处理可空类型
      if (!session) return;
      const user = session.user;
      if (!user) return;
      const auth = user.authority;
      ctx.logger.info(auth);
      await session.send(h.text(auth.toString()));
      return;
    });

  command
    .subcommand('.prompt [id]')
    .action(async ({ session }, id) => {

      if (!session) return;
      const file = await ctx.http.file("file:///D:/Pictures/meme/fox/0242a0f2d7ca7bcbe9cc0c3af8096b63f624a83b.jpg");
      const filedata = await file.data;
      const filemime = await file.type;
      const base64data = await Buffer.from(filedata).toString("base64");
      await session.send([
        h.image(`data:${filemime};base64,` + base64data),
        "请发送文本"
      ]);

      const a = await session.prompt(30 * 1000);
      await session.send(a);
      return;
    });

  command
    .subcommand('.base [id]')
    .action(async ({ session }, id) => {

      if (!session) return;
      const file = await ctx.http.file("file:///D:/Pictures/meme/fox/0242a0f2d7ca7bcbe9cc0c3af8096b63f624a83b.jpg");
      const filedata = await file.data;
      const filemime = await file.type;
      const base64data = await Buffer.from(filedata).toString("base64");
      await session.send(h.image(`data:${filemime};base64,` + base64data));
      return;
    });

  command
    .subcommand('.bot [id]')
    .action(async ({ session }, id) => {

      if (!session) return;
      const guildId = session.guildId;
      if (!guildId) return;
      const aaa = session.bot.getGuildMemberIter(guildId);
      ctx.logger.info(aaa);
      return;
    });

  command
    .subcommand('.sendPrivateMessage [id]')
    .action(async ({ session }, id) => {

      if (!session) return;
      const userId = session.userId;
      if (!userId) return;
      const aaa = session.bot.sendPrivateMessage(userId, "你好啊！私聊消息！");
      ctx.logger.info(aaa);
      return;
    });

  command
    .subcommand('.撤回')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = await session.send("即将执行撤回。。。");
      ctx.logger.info(aaa);
      const channelId = session.channelId;
      if (!channelId) return;
      const bbb = await session.bot.deleteMessage(channelId, aaa[0]);
      ctx.logger.info(bbb);
      return;
    });

  command
    .subcommand('.getGuild')
    .action(async ({ session }) => {

      if (!session) return;
      const channelId = session.channelId;
      ctx.logger.info(channelId);
      if (!channelId) return;
      const aaa = await session.bot.getGuild(channelId);
      ctx.logger.info(aaa);
      return;
    });

  command
    .subcommand('.编辑消息.md')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = await session.send(h.text("你好，这是编辑之前的消息。"));
      await sleep(3 * 1000);
      const channelId = session.channelId;
      if (!channelId) return;
      await session.bot.editMessage(channelId, aaa[0], h("markdown", "# 你好\n## 你好啊"));
      await session.send(h.text("我已经编辑完毕"));
      return;
    });

  command
    .subcommand('.编辑消息.图片')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = await session.send(h.text("你好，这是编辑之前的消息。"));
      await sleep(3 * 1000);
      const channelId = session.channelId;
      if (!channelId) return;
      await session.bot.editMessage(channelId, aaa[0], h.image("https://i1.hdslb.com/bfs/archive/ea9dc9d2d716280b673a3bd5eb21023b3a2ed2b3.jpg"));
      await session.send(h.text("我已经编辑完毕"));
      return;
    });

  command
    .subcommand('.编辑消息.文字')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = await session.send(h.text("你好，这是编辑之前的消息。"));
      await sleep(3 * 1000);
      const channelId = session.channelId;
      if (!channelId) return;
      await session.bot.editMessage(channelId, aaa[0], "你好，这是编辑以后的消息。");
      await session.send(h.text("我已经编辑完毕"));
      return;
    });

  command
    .subcommand('.html')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("yunhu:html", "<h1>你好</h1>"));
      await session.send(h("html", "<h1>你好</h1>"));
      return;
    });

  command
    .subcommand('.a')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("a", "https://iirose.com/"));
      return;
    });

  command
    .subcommand('.del')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("del", "你好这是del"));
      return;
    });

  command
    .subcommand('.sharp')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send([
        h.text("猜您在找，这个频道："),
        h("sharp", { id: session.guildId ?? session.channelId ?? '' })
      ]);
      return;
    });

  command
    .subcommand('.md [text:text]')
    .action(async ({ session }, text) => {

      if (!session) return;
      if (!text) {
        /*
[蓝字按钮](mqqapi://aio/inlinecmd?command=消息 md&enter=false&reply=false)
[点我私聊](https://ti.qq.com/new_open_qq/index.html?appid=64&url=mqqapi%3A%2F%2Fqqrobotaio%2Fopen%3Fuin%3D2854197108)

        */
        await session.send(h('markdown', {
          content: `
https://ti.qq.com/new_open_qq/index.html?appid=64&url=mqqapi%3A%2F%2Fqqrobotaio%2Fopen%3Fuin%3D2854197108
`,
          stream: true,
        }));
      } else {
        await session.send(h("markdown", text));
      }
      return;
    });

  command
    .subcommand('.ark24')
    .action(async ({ session }) => {

      if (!session) return;
      const msg = h('qq:ark24', {
        desc: '描述文本',
        prompt: '提示文本',
        title: '标题',
        metaDesc: '详情描述',
        img: 'https://forum.koishi.xyz/uploads/default/original/1X/72b32c99d52e391ce7dfc08d7fff86bd50ae1d03.png',
        link: 'mqqapi://openhalfscreenweb/?height=1920&url=https://forum.koishi.xyz/latest',
        subTitle: '来源',
      });
      await session.send(msg);
    });

  command
    .subcommand('.name')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(session.username);
      const rawData = session.event._data;
      const username = rawData?.d?.author?.username;
      ctx.logger.info(username);
      // ctx.logger.info(session.bot.ctx.root.config.autoAuthorize);
      return;
    });

  command
    .subcommand('.username')
    .action(async ({ session }) => {
      if (!session) return;
      const rawData = session.username;
      ctx.logger.info(rawData);
      await session.send(rawData);
      return;
    });

  command
    .subcommand('.按钮')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send([
        h.text("你好啊"),
        h("button", { id: 1, type: "action", text: "action按钮" }),
        h("button", { id: 2, type: "link", text: "link按钮", href: "bilibili.com" }),
        h("button", { id: 3, type: "input", text: "input按钮" }),
      ]);
      return;
    });

  command
    .subcommand('.quote')
    .action(async ({ session }) => {
      await session.send(h.quote(session.messageId ?? '') + "你好啊，我在回复你！你好啊，我在回复你！你好啊，我在回复你！");
      return;
    });


  command
    .subcommand('.session')
    .action(async ({ session }) => {
      ctx.logger.info(session);
      await session.send("已经打印！");
      return;
    });


  command
    .subcommand('.元素 [text:text]')
    .action(async ({ session }, text) => {

      if (!session) return;
      if (text) {
        ctx.logger.info("直接输入", h.parse(text));
        await session.send("已经打印！");
        return;
      }
      if (session.quote) {
        ctx.logger.info("引用输入", session.quote.elements);
        await session.send("已经打印！");
        return;
      }
      if (!text) {
        await session.send("请发送元素：");
        const aaa = await session.prompt(30 * 1000);
        ctx.logger.info("交互输入", h.parse(aaa));
        await session.send("已经打印！");
      }
      return;
    });

  // command
  //   .subcommand('.log [content:text]')
  //   .action(async ({ session }: { session: Session }, content) => {
  //     // 权限检查
  //     if (!content || !(
  //       session.userId.includes("7756242") ||
  //       session.userId.includes("1919892171") ||
  //       session.userId.includes("679a51f1d4893") ||
  //       session.platform.includes("sandbox")
  //     )) {
  //       return "不符合要求"
  //     }
  //     try {
  //       const contextNames = ['ctx', 'h', 'session', 'inspect'];
  //       const contextValues = [ctx, h, session, inspect];
  //       const dynamicFunction = new Function(...contextNames, `return ${content}`);
  //       const result = dynamicFunction(...contextValues);
  //       const loggerstr = inspect(result, { depth: null, colors: true })
  //       ctx.logger.info(loggerstr);
  //       await session.send("已经打印！")
  //       return;
  //     } catch (e) {
  //       ctx.logger.warn(`执行代码时出错: ${e.stack}`);
  //       return `执行代码时出错：${e.message}`;
  //     }
  //   });

  command
    .subcommand('.log')
    .action(async ({ session }) => {

      if (!session) return;
      ctx.logger.info("测试打印！！！");
      ctx.logger.info("++++++++++++++++++++");
      await session.send("已经打印！");
      return;
    });


  command
    .subcommand('.引用')
    .action(async ({ session }) => {

      if (!session) return;
      const messageId = session.messageId;
      if (!messageId) return;
      await session.send(h.quote(messageId) + "你好啊，我在回复你！你好啊，我在回复你！你好啊，我在回复你！");
      return;
    });
  command
    .subcommand('.剧透')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("spl", "你好啊"));
      return;
    });
  command
    .subcommand('.粗体')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("b", "这是粗体文本"));
      return;
    });
  command
    .subcommand('.斜体')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("i", "这是斜体文本"));
      return;
    });
  command
    .subcommand('.下划线')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("u", "这是下划线文本"));
      return;
    });

  command
    .subcommand('.删除线')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("s", "这是删除线文本"));
      return;
    });
  command
    .subcommand('.代码')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("code", "console.log('Hello World')"));
      return;
    });
  command
    .subcommand('.上标')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("sup", "2"));
      return;
    });
  command
    .subcommand('.下标')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h("sub", "2"));
      return;
    });
  command
    .subcommand('.换行')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send([
        "第一行<br>",
        "第二行<br>",
        "第三行",
      ]);
      return;
    });

  command
    .subcommand('.段落')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send([
        h("p", "这是第一段"),
        h("p", "这是第二段")
      ]);
      return;
    });

  command
    .subcommand('.assets.视频')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`正在处理中...`);
      const videourl = "file:///D:/Music/%E5%8D%95%E6%9B%B2%E5%BE%AA%E7%8E%AF/1601237804-1-16.mp4";
      const videoElement = `${h.video(videourl)}`;
      await session.send(`即将转换： ${videourl}`);
      const videoElement2 = await ctx.assets.transform(videoElement);
      await session.send(`${videoElement2}`);
      return;
    });

  command
    .subcommand('.assets.大视频')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`正在处理中...`);
      const videourl = "file:///D:/Music/%E5%A4%9A%E5%B9%B8%E8%BF%90.mp4";
      const videoElement = `${h.video(videourl)}`;
      await session.send(`即将转换： ${videourl}`);
      const videoElement2 = await ctx.assets.transform(videoElement);
      await session.send(`${videoElement2}`);
      return;
    });


  command
    .subcommand('.assets.音频')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`正在处理中...`);
      const audiourl = "file:///D:/Music/%E4%B8%8D%E5%86%8D%E6%9B%BC%E6%B3%A2.mp3";
      const audioElement = `${h.audio(audiourl)}`;
      await session.send(`即将转换： ${audiourl}`);
      const audioElement2 = await ctx.assets.transform(audioElement);
      await session.send(`${audioElement2}`);
      return;
    });
  command
    .subcommand('.assets.图片')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`正在处理中...`);
      const audiourl = "file:///D:/Pictures/meme/2024-12-06-11-32-51-760.png";
      const audioElement = `${h.image(audiourl)}`;
      await session.send(`即将转换： ${audiourl}`);
      const audioElement2 = await ctx.assets.transform(audioElement);
      await session.send(`${audioElement2}`);
      return;
    });

  command
    .subcommand('.合并转发')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`<message forward>` +
        h("message", [h.text("你好啊"), h.image("file:///D:/Pictures/%E7%B4%A0%E6%9D%90%E5%9B%BE%E7%89%87/%E5%A4%B4%E5%83%8F/3bc929916c8e45a53fb79dd77d3349cb.jpg")])
        + h("message", [h.text("第二条消息")])
        + h("message", [h.image("file:///D:/Pictures/%E7%B4%A0%E6%9D%90%E5%9B%BE%E7%89%87/%E5%A4%B4%E5%83%8F/3bc929916c8e45a53fb79dd77d3349cb.jpg")])
        + `</message>`);
      return;
    });

  command
    .subcommand('.音频')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`正在处理中...`);
      await session.send(h.audio("file:///D:/Music/%E4%B8%8D%E5%86%8D%E6%9B%BC%E6%B3%A2.mp3"));
      return;
    });

  command
    .subcommand('.视频')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`正在处理中...`);
      await session.send(h.video("file:///D:/Music/%E5%8D%95%E6%9B%B2%E5%BE%AA%E7%8E%AF/1601237804-1-16.mp4"));
      return;
    });

  command
    .subcommand('.文件')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(`正在处理中...`);
      await session.send(h.file("file:///D:/Music/%E5%8D%95%E6%9B%B2%E5%BE%AA%E7%8E%AF/1601237804-1-16.zip"));
      return;
    });

  command
    .subcommand('.文件名称')
    .action(async ({ session }) => {

      if (!session) return;
      const url = "file:///D:/Music/%E5%8D%95%E6%9B%B2%E5%BE%AA%E7%8E%AF/1601237804-1-16.zip";
      await session.send(`正在处理中...`);
      await session.send(h("file", {
        name: "特定的文件名称",
        url,
      }));
      return;
    });

  command
    .subcommand('.语音')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h.audio("https://api.injahow.cn/meting/?type=url&id=2748727454"));
      return;
    });
  command
    .subcommand('.本地语音')
    .action(async ({ session }) => {

      if (!session) return;
      await session.send(h.audio("file:///D:/Music/%E4%B8%8D%E5%86%8D%E6%9B%BC%E6%B3%A2.mp3"));
      return;
    });
  command
    .subcommand('.回显')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = await session.send(`你好哦`);
      ctx.logger.info(aaa);

      return;
    });


  command
    .subcommand('.图文')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = h.image("file:///D:/Pictures/%E7%B4%A0%E6%9D%90%E5%9B%BE%E7%89%87/%E5%A4%B4%E5%83%8F/3bc929916c8e45a53fb79dd77d3349cb.jpg");
      const bbb = h.text("123" + "456" + "\n" + "789");

      await session.send([h.text("一串文字\n\n"), aaa, bbb]);
      return;
    });

  command
    .subcommand('.图片')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = h.image("file:///D:/Pictures/%E7%B4%A0%E6%9D%90%E5%9B%BE%E7%89%87/%E5%A4%B4%E5%83%8F/3bc929916c8e45a53fb79dd77d3349cb.jpg");
      ctx.logger.info(aaa);
      await session.send(aaa);
      return;
    });

  command
    .subcommand('.网络图片')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = h.image("https://koishi.chat/logo.png");
      ctx.logger.info(aaa);
      await session.send(aaa);
      return;
    });

  command
    .subcommand('.html视频')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = h("yunhu:html", `
        <video controls preload="metadata" style="max-width:100%;height:auto;">
  <source src="https://chat-video1.jwznb.com/9cdd0c79f8495e946c8ca7a3a77779ed.mp4" type="video/mp4" />
</video>
        `);
      await session.send(aaa);
      return;
    });

  command
    .subcommand('.html语音')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = h("yunhu:html", `
    <audio controls preload="metadata" style="max-width:100%;">
      <source src="https://m701.music.126.net/20260719153646/26d88c566e4ceeaee605513d41da3a02/jdymusic/obj/wo3DlMOGwrbDjj7DisKw/31051165276/3841/8a5d/244f/6383fbc8fc516e53fdaac969390dda46.mp3?vuutv=GpSMVKpcGALtdkJ1Ujg25q0ZTMQhwuFHtyQhZK29gXX/bFcs08e9ARdO3s/bjtYyHNc82FlejMzy6p/2Et2jNHYSWgYOeo/FDcYSbf25jwU=" type="audio/mpeg" />

  `);
      await session.send(aaa);
      return;
    });

  command
    .subcommand('.文本')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = h.text("123");
      ctx.logger.info(aaa);
      await session.send(aaa);
      return;
    })

    .action(async ({ session }) => {

      if (!session) return;
      const aaa = h.text("456");
      ctx.logger.info(aaa);
      await session.send(aaa);
      return;
    });

  command
    .subcommand('.消息 [type]')
    .action(async ({ session }, type) => {

      if (!session) return;
      if (type === "user") {
        const userId = session.userId;
        if (!userId) return;
        await session.bot.sendPrivateMessage(userId, "怎么了嘛");
      } else {
        const channelId = session.channelId;
        if (!channelId) return;
        await session.bot.sendMessage(channelId, "怎么了嘛");
      }
      return;
    });

  command
    .subcommand('.att [id]')
    .action(async ({ session }, id) => {

      if (!session) return;
      await session.send(h.at("679A51F1D4893"));
      return;
    });

  command
    .subcommand('.回显')
    .action(async ({ session }) => {

      if (!session) return;
      const aaa = await session.send(`你好哦`);
      ctx.logger.info(aaa);
      return;
    });

  command
    .subcommand('.禁言')
    .action(async ({ session }) => {
      // 只处理群聊场景
      if (!session?.guildId || !session.userId) {
        return '请先在群聊中使用';
      }

      try {
        await session.bot.muteGuildMember(session.guildId, session.userId, 30_000);
        return '已禁言 30 秒';
      } catch (error) {
        return `禁言失败：${error.message}`;
      }
    });
  command
    .subcommand('.at [...at]')
    .action(async ({ session }, ...at) => {

      if (!session) return;
      const userId = session.userId;
      if (!userId) return;
      const aaa = h.at(userId);
      ctx.logger.info(at);
      // content 可能为空，解析前提供空字符串兜底
      ctx.logger.info(h.parse(session.content ?? ''));
      ctx.logger.info(`${aaa}`);
      await session.send(aaa + "你好啊！我at你了");
      return;
    });

  command
    .subcommand('.emoji')
    .action(async ({ session }) => {

      if (!session) return;
      ctx.logger.info(session);
      await session.send("请发送emoji：");
      const aaa = await session.prompt(30 * 1000);
      await session.send(aaa);
      return;
    });

  // yunhu platform
  command
    .subcommand('这是直接发的指令')
    .action(async ({ session }) => {

      if (!session) return;
      ctx.logger.info(session);
      return 'Hello from 直接指令!';
    });

  command
    .subcommand('这是普通指令 [...args]')
    .action(async ({ session }, ...args) => {

      if (!session) return;
      ctx.logger.info('用户输入的参数为：', args);
      return 'Hello from 普通指令!';
    });

  command
    .subcommand('这是自定义输入指令 [jsoninput]')
    .action(async ({ session }, jsoninput) => {

      if (!session) return;
      ctx.logger.info('用户输入的json表单内容为：', jsoninput);
      return 'Hello from !';
    });

  // iirose API 测试指令
  const iiroseCmd = ctx.command('iirose');

  iiroseCmd
    .subcommand('.join <roomId:text> [password:text]')
    .action(async ({ session }, roomId, password) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!roomId) return '请输入 roomId';
      await session.bot.internal.joinRoom({ roomId, roomPassword: password });
      return `已发送加入房间: ${roomId}`;
    });

  iiroseCmd
    .subcommand('.move <roomId:text> [password:text]')
    .action(async ({ session }, roomId, password) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!roomId) return '请输入 roomId';
      await session.bot.internal.moveRoom(roomId, password);
      return `已发送移动房间: ${roomId}`;
    });

  iiroseCmd
    .subcommand('.requestUserList')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      session.bot.internal.requestUserList();
      return '已请求用户列表';
    });

  iiroseCmd
    .subcommand('.self')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getSelfInfo();
      return data ? JSON.stringify(data, null, 2) : '未获取到自身信息';
    });

  iiroseCmd
    .subcommand('.getUserByName <name:text>')
    .action(async ({ session }, name) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!name) return '请输入用户名';
      const user = await session.bot.internal.getUserByName(name);
      return user ? JSON.stringify(user, null, 2) : '未找到用户';
    });

  iiroseCmd
    .subcommand('.getProfile <name:text>')
    .action(async ({ session }, name) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!name) return '请输入用户名';
      const data = await session.bot.internal.getUserProfileByName(name);
      return data ? JSON.stringify(data, null, 2) : '未获取到用户资料';
    });

  iiroseCmd
    .subcommand('.getFullProfile <name:text>')
    .action(async ({ session }, name) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!name) return '请输入用户名';
      const data = await session.bot.internal.getFullUserProfileByName(name);
      return data ? JSON.stringify(data, null, 2) : '未获取到完整用户资料';
    });

  iiroseCmd
    .subcommand('.getUserList')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getUserListFile();
      return data ? JSON.stringify(data, null, 2) : '用户列表为空';
    });

  iiroseCmd
    .subcommand('.getRoomId')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      return session.bot.internal.getRoomId();
    });

  iiroseCmd
    .subcommand('.getRoomList')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getRoomList();
      return data ? JSON.stringify(data, null, 2) : '房间列表为空';
    });

  iiroseCmd
    .subcommand('.getRoomState')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getRoomStateFile();
      return data ? JSON.stringify(data, null, 2) : '房间状态为空';
    });

  iiroseCmd
    .subcommand('.broadcast <message:text>')
    .action(async ({ session }, message) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!message) return '请输入广播内容';
      session.bot.internal.broadcast({ message, color: 'ffffff' });
      return '已发送广播';
    });

  iiroseCmd
    .subcommand('.sendLike <uid:text> [message:text]')
    .action(async ({ session }, uid, message) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!uid) return '请输入 uid';
      session.bot.internal.sendLike(uid, message);
      return `已给 ${uid} 点赞`;
    });

  iiroseCmd
    .subcommand('.follow <uid:text>')
    .action(async ({ session }, uid) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!uid) return '请输入 uid';
      session.bot.internal.followUser(uid);
      return `已关注 ${uid}`;
    });

  iiroseCmd
    .subcommand('.grade <uid:text> <score:number>')
    .action(async ({ session }, uid, score) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!uid || !score) return '请输入 uid 和分数';
      const data = await session.bot.internal.gradeUser(uid, score);
      return data ? JSON.stringify(data, null, 2) : '打分失败';
    });

  iiroseCmd
    .subcommand('.getBalance')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getBalance();
      return data === null ? '余额为空' : `余额: ${data}`;
    });

  iiroseCmd
    .subcommand('.stock')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.stockGet();
      return data ? JSON.stringify(data, null, 2) : '股票信息为空';
    });

  iiroseCmd
    .subcommand('.bank')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.bankGet();
      return data ? JSON.stringify(data, null, 2) : '银行信息为空';
    });

  iiroseCmd
    .subcommand('.getForum')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getForum();
      return data ? JSON.stringify(data, null, 2) : '论坛信息为空';
    });

  iiroseCmd
    .subcommand('.getTasks')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getTasks();
      return data ? JSON.stringify(data, null, 2) : '任务信息为空';
    });

  iiroseCmd
    .subcommand('.getMoments')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getMoments();
      return data ? JSON.stringify(data, null, 2) : '动态信息为空';
    });

  iiroseCmd
    .subcommand('.getLeaderboard')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getLeaderboard();
      return data ? JSON.stringify(data, null, 2) : '排行榜为空';
    });

  iiroseCmd
    .subcommand('.getStore')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getStore();
      return data ? JSON.stringify(data, null, 2) : '商店信息为空';
    });

  iiroseCmd
    .subcommand('.getSellerCenter')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getSellerCenter();
      return data ? JSON.stringify(data, null, 2) : '卖家中心为空';
    });

  iiroseCmd
    .subcommand('.getMusicList')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getMusicList();
      return data ? JSON.stringify(data, null, 2) : '歌单为空';
    });

  iiroseCmd
    .subcommand('.summonDice <diceId:number>')
    .action(async ({ session }, diceId) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      session.bot.internal.summonDice(diceId);
      return `已投掷骰子: ${diceId}`;
    });

  iiroseCmd
    .subcommand('.getChangelog')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getChangelog();
      return data ? JSON.stringify(data, null, 2) : '更新日志为空';
    });

  iiroseCmd
    .subcommand('.subscribe <roomId:text>')
    .action(async ({ session }, roomId) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!roomId) return '请输入 roomId';
      session.bot.internal.subscribeRoom(roomId);
      return `已订阅房间: ${roomId}`;
    });

  iiroseCmd
    .subcommand('.unsubscribe <roomId:text>')
    .action(async ({ session }, roomId) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!roomId) return '请输入 roomId';
      session.bot.internal.unsubscribeRoom(roomId);
      return `已取消订阅房间: ${roomId}`;
    });

  iiroseCmd
    .subcommand('.getMediaWhitelist')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getMediaWhitelist();
      return data ? JSON.stringify(data, null, 2) : '媒体白名单为空';
    });

  iiroseCmd
    .subcommand('.getMuteList')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getMuteList();
      return data ? JSON.stringify(data, null, 2) : '禁言列表为空';
    });

  iiroseCmd
    .subcommand('.getBlacklist')
    .action(async ({ session }) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      const data = await session.bot.internal.getBlacklist();
      return data ? JSON.stringify(data, null, 2) : '黑名单为空';
    });

  iiroseCmd
    .subcommand('.mute <userId:text> [duration:number] [reason:text]')
    .action(async ({ session }, userId, duration, reason) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!userId) return '请输入 userId';
      if (!session.guildId) return '缺少 guildId';
      const muteDuration = duration === undefined ? 30 * 60 * 1000 : duration;
      await session.bot.muteGuildMember(session.guildId, userId, muteDuration, reason);
      return muteDuration === 0
        ? `已解除禁言: ${userId}`
        : `已禁言 ${userId} ${muteDuration}ms`;
    });

  iiroseCmd
    .subcommand('.whitelist <username:text> [duration:number] [intro:text]')
    .action(async ({ session }, username, duration, intro) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!username) return '请输入用户名';
      session.bot.internal.whiteList({
        username,
        time: duration === undefined ? 30 * 60 * 1000 : duration,
        intro,
      });
      return `已添加白名单: ${username}`;
    });

  iiroseCmd
    .subcommand('.blacklist <username:text> [duration:number] [intro:text]')
    .action(async ({ session }, username, duration, intro) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!username) return '请输入用户名';
      await session.bot.internal.addBlacklist(
        username,
        duration === undefined ? 30 * 60 * 1000 : duration,
        intro ?? '',
      );
      return `已添加黑名单: ${username}`;
    });

  iiroseCmd
    .subcommand('.mediaWhitelist <username:text> [duration:number] [intro:text]')
    .action(async ({ session }, username, duration, intro) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!username) return '请输入用户名';
      await session.bot.internal.addMediaWhitelist(
        username,
        duration === undefined ? 30 * 60 * 1000 : duration,
        intro ?? '',
      );
      return `已添加媒体白名单: ${username}`;
    });

  iiroseCmd
    .subcommand('.call <method:text> [...args:text]')
    .action(async ({ session }, method, ...args) => {
      if (!session || session.bot.platform !== 'iirose') return '仅支持 iirose';
      if (!method) return '请输入方法名';

      const internal = session.bot.internal as unknown as Record<string, (...args: unknown[]) => unknown>;
      const fn = internal[method];
      if (typeof fn !== 'function') return `未找到方法: ${method}`;

      const parsed = args.map((arg) => {
        try {
          return JSON.parse(arg);
        } catch {
          return arg;
        }
      });
      const result = await fn(...parsed);
      return result === undefined ? '调用成功' : JSON.stringify(result, null, 2);
    });
}
