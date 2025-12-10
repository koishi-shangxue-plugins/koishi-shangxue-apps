import { Context, Schema, Logger, h, Universal, Bot } from "koishi";
import type { } from 'koishi-plugin-glyph'
import fs from 'node:fs';
import path from 'node:path';
import * as url from 'node:url';

export interface CurriculumTable {
  id: number
  channelId: string
  userid: string
  username: string
  useravatar: string
  curriculumndate: string[]
  curriculumname: string
  curriculumtime: string
  startDate: string
  endDate: string
}

declare module 'koishi' {
  interface Tables {
    curriculumtable: CurriculumTable
  }
  interface Context {
    cron?: (expression: string, callback: () => void) => void
  }
}

export const name = "curriculum-table";
export const inject = {
  required: ['puppeteer', "database"],
  optional: ["glyph"]
};

export const usage = `
<p>
这是一个群组课表插件，允许用户添加、移除和查看课程表，并支持从 WakeUp 课程表应用导入课程。
此外，插件还支持定时自动发送课程表图片到指定群组。
</p>

<h2>指令说明</h2>
<details>
<summary>点击此处————查看指令说明</summary>
<h3>1. 手动添加课程</h3>

<p>
使用以下指令手动添加课程：
</p>

<pre>
<code>
群友课表.添加 &lt;星期几&gt; &lt;课程名称&gt; &lt;上课时间-下课时间&gt;
</code>
</pre>
<ul>
<li><code>星期几</code>: 支持 "周一"、"周二"... "周日"，也支持 "周一周三" 这种格式。</li>
<li><code>课程名称</code>: 课程的名称。</li>
<li><code>上课时间-下课时间</code>: 课程的上课和下课时间，使用 24 小时制，例如 "8:00-9:30"。</li>
</ul>

<p>
<strong>可选参数：</strong>
</p>

<ul>
<li><code>-i, --userid &lt;userid&gt;</code>: 指定用户的 QQ 号码（不指定则为当前用户）。</li>
<li><code>-n, --username &lt;username&gt;</code>: 指定用户的昵称（不指定则为当前用户的昵称）。</li>
</ul>

<p>
<strong>示例：</strong>
</p>

<pre>
<code>
群友课表.添加 周一周三 高等数学 8:00-9:30
群友课表.添加 周四周五 9:55-12:15 大学英语 -i 114514 -n 上学大人
</code>
</pre>

<h3>2. WakeUp 课程表导入</h3>

<p>
使用以下指令从 WakeUp 课程表分享链接导入课程：
</p>

<pre>
<code>
群友课程表/wakeup &lt;WakeUp分享的文本&gt;
</code>
</pre>

<p>
<code>WakeUp分享的文本</code>: 从 WakeUp 课程表应用中复制的分享文本（包含分享口令）。
</p>

<p>
<strong>可选参数：</strong>
</p>

<ul>
<li><code>-i, --userid &lt;userid&gt;</code>: 指定用户的 QQ 号码（不指定则为当前用户）。</li>
<li><code>-n, --username &lt;username&gt;</code>: 指定用户的昵称（不指定则为当前用户的昵称）。</li>
</ul>

<p>
<strong>示例：</strong>
</p>

<pre>
<code>
群友课表.wakeup 这是来自「WakeUp课程表」的课表分享......分享口令为「PaJ_8Kj_zeelspJs2HBL1」
</code>
</pre>

<h3>3. 查看课程表</h3>
<p>
使用以下指令渲染并发送当前群组的课程表图片：
</p>
<pre>
<code>
群友课表.看看
</code>
</pre>

<h3>4. 移除课程</h3>

<p>使用以下指令移除已添加的课程：</p>

<pre>
<code>
群友课表.移除
</code>
</pre>

<p>
指令会列出当前用户在本群已添加的所有课程，并提示用户选择要移除的课程序号。
</p>

<p>
<strong>可选参数：</strong>
</p>

<ul>
<li><code>-i, --userid &lt;userid&gt;</code>: 指定用户的 QQ 号码（不指定则为当前用户）。</li>
<li><code>-n, --username &lt;username&gt;</code>: 指定用户的昵称（不指定则为当前用户的昵称）。</li>
</ul>

<h3>5. 定时发送设置 (配置项)</h3>

<p>
通过插件的配置项 <code>subscribe</code> 来设置定时发送课程表。
需要配置以下内容：
</p>

<ul>
<li><code>channelId</code>: 要发送课程表的群组 ID。</li>
<li>
<code>subscribetime</code>:  Cron 表达式，定义发送课程表的时间。
例如：
<ul>
<li><code>"0 12 * * *"</code>：每天中午 12:00 发送。</li>
<li><code>"10 16 * * *"</code>：每天下午 4:10 发送。</li>
<li><code>"0 8 * * 1"</code>：每周一早上 8:00 发送。</li>
</ul>
</li>
</ul>
</details>

---

<li><a href="https://i0.hdslb.com/bfs/article/a80a8b5ea7f4a3053b3f0b24520a84d9312276085.png" target="_blank" referrerpolicy="no-referrer">wakeup课程表导入</a></li>

<li><a href="https://i0.hdslb.com/bfs/article/df4c68e2ad6406d2fd27b6bf8d1c5322312276085.png" target="_blank" referrerpolicy="no-referrer">插件效果预览1</a></li>

<li><a href="https://i0.hdslb.com/bfs/article/3cd43011f330ee77f9cf6ac7f8d8308a312276085.png" target="_blank" referrerpolicy="no-referrer">插件效果预览2</a></li>

---

本插件只适合一些互相熟悉的小团体玩。

输入 <code>群友课表.看看 1</code> 即可查看明日课程，输入 <code>群友课表.看看 2</code> 即可查看后天课程，

输入 <code>群友课表.看看 -1</code> 即可查看昨天课程，
`;
const logger = new Logger(`DEV:${name}`);

export const Config = Schema.intersect([
  Schema.object({
    command: Schema.string().default("群友课表").description("注册的`父级指令`的名称"),
    command11: Schema.string().default("添加").description("实现 `添加课程` 的指令名称"),
    command12: Schema.string().default("移除").description("实现 `移除课程` 的指令名称"),
    command13: Schema.string().default("wakeup").description("实现 `wakeup快速导入课表` 的指令名称"),
    command14: Schema.string().default("去重").description("实现 `课程去重` 的指令名称"),
    command21: Schema.string().default("看看").description("实现 `查看当前群组的课表` 的指令名称"),
  }).description('基础设置'),

  Schema.object({
    waittimeout: Schema.number().description("等待用户交互的超时时间。（单位：秒）").default(30),
    autocommand14: Schema.boolean().default(true).description("添加课程时，自动执行`课程去重`"),
  }).description('进阶设置'),

  Schema.object({
    cronPush: Schema.boolean().default(false).description("是否开启自动推送功能。**需要cron服务！**<br>指定机器人，并定时推送到指定频道"),
  }).description('定时推送'),
  Schema.union([
    Schema.object({
      cronPush: Schema.const(true).required(),
      subscribe: Schema.array(Schema.object({
        bot: Schema.string().description('机器人ID'),
        channelId: Schema.string().description("群组ID"),
        time: Schema.string().role('time').description("每日推送时间").default("07:30:00"),
      })).role('table').description("在指定群组订阅课表 定时主动推送<br>例如：`07:30:55` 代表每天早上7:30推送（秒数无效）"),
    }),
    Schema.object({
      cronPush: Schema.const(false),
    }),
  ]),

  Schema.object({
    screenshotquality: Schema.number().role('slider').min(0).max(100).step(1).default(60).description('设置图片压缩 保留质量（%）'),
    backgroundcolor: Schema.string().role('color').description("渲染的课表底色背景色").default("rgba(234, 228, 225, 1)"),
    footertext: Schema.string().role('textarea', { rows: [2, 4] }).description("页脚描述文字。换行请用`\<br\>`").default("输入 群友课程表 以查看指令帮助<br>Bot of koishi & koishi-plugin-curriculum-table"),
  }).description('渲染设置'),

  Schema.object({
    useGlyph: Schema.boolean().default(false).description('是否启用 `glyph` 字体服务。<br>启用后，将优先使用 `glyph` 服务提供的字体。'),
  }).description('字体设置'),
  Schema.union([
    Schema.object({
      useGlyph: Schema.const(true).required(),
      fontFamily: Schema.dynamic('glyph.fonts').description('选择字体'),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("日志调试模式 `非必要不开启`"),
    pageclose: Schema.boolean().default(true).description("puppeteer自动page.close<br>非开发者请勿改动"),
  }).description('开发者选项'),
]);

export async function apply(ctx: Context, config) {
  const logger = new Logger(`DEV:${name}`);

  // 字体加载逻辑
  async function getFontFaceRule() {
    const fontName = '千图马克手写体lite';
    const localFontPath = path.join(__dirname, './../font/方正像素12.ttf');

    // 优先使用 glyph 服务
    if (config.useGlyph && ctx.glyph && config.fontFamily) {
      const fontDataUrl = ctx.glyph.getFontDataUrl(config.fontFamily);
      if (fontDataUrl) {
        logger.info(`使用 glyph 字体: ${config.fontFamily}`);
        return `@font-face { font-family: '${fontName}'; src: url('${fontDataUrl}'); }`;
      }
      logger.warn(`从 glyph 获取字体 ${config.fontFamily} 失败，将回退到本地字体。`);
    }

    // 回退到本地字体
    try {
      const fontBuffer = await fs.promises.readFile(localFontPath);
      const base64Font = fontBuffer.toString('base64');
      logger.info('使用本地字体。');
      return `@font-face { font-family: '${fontName}'; src: url('data:font/ttf;base64,${base64Font}') format('truetype'); }`;
    } catch (error) {
      logger.error('加载本地字体文件失败:', error);
      return `/* 无法加载本地字体 */`;
    }
  }


  ctx.on('ready', async () => {
    // 如果 glyph 服务存在，则检查并注册本地字体
    if (ctx.glyph) {
      const fontName = '千图马克手写体lite';
      const fontPath = path.join(__dirname, './../font/方正像素12.ttf');
      const fontFileUrl = url.pathToFileURL(fontPath).href;

      try {
        const fontExists = await ctx.glyph.checkFont(fontName, fontFileUrl);
        if (fontExists) {
          logger.info(`字体 '${fontName}' 已通过 glyph 服务准备就绪。`);
        } else {
          logger.warn(`字体 '${fontName}' 未能通过 glyph 服务成功加载。`);
        }
      } catch (error) {
        logger.error(`通过 glyph 检查字体 '${fontName}' 时出错:`, error);
      }
    }

    ctx.model.extend('curriculumtable', {
      id: 'unsigned',
      channelId: 'string',
      userid: 'string',
      username: 'string',
      useravatar: 'string',
      curriculumndate: { type: 'json', nullable: true },
      curriculumname: 'string',
      curriculumtime: 'string',
      startDate: 'string',
      endDate: 'string',
    }, {
      primary: 'id',
      autoInc: true,
    });

    ctx.command(`${config.command}`)

    ctx.command(`${config.command}.${config.command11} <param1:string> <param2:string> <param3:string>`)
      .option('userid', '-i <userid:string> 指定用户ID (QQ号)')
      .option('username', '-n <username:string> 指定用户的名称')
      .example(`${config.command11} 周一周三 高等数学 8:00-9:30`)
      .example(`${config.command11} 周四周五 9:55-12:15 大学英语 -i 114514 -n 上学大人`)
      .action(async ({ session, options }, param1, param2, param3) => {
        let weekday, classname, time;

        function identifyParams(p1, p2, p3) {
          let identified = { weekday: null, classname: null, time: null };
          const params = [p1, p2, p3];

          // 查找时间（包含':'和'-'）
          const timeParam = params.find(p => /[:：]/.test(p) && /-/.test(p));
          if (timeParam) {
            identified.time = timeParam;
          }

          // 查找星期（包含“周”或“星期”）
          const weekdayParam = params.find(p => /周|星期/.test(p));
          if (weekdayParam) {
            identified.weekday = weekdayParam;
          }

          // 剩下的参数是课程名称
          const classnameParams = params.filter(p => p !== timeParam && p !== weekdayParam);
          if (classnameParams.length > 0) {
            identified.classname = classnameParams.join(' '); // 可能是多个参数，合并
          }

          return identified;
        }

        if (!param1 || !param2 || !param3) {
          return "请提供所有必需的参数：日期、课程名称和时间。";
        }

        const identifiedParams = identifyParams(param1, param2, param3);
        weekday = identifiedParams.weekday;
        classname = identifiedParams.classname;
        time = identifiedParams.time;

        if (!weekday || !time || !classname) {
          return "参数解析后仍然不完整，请检查输入的参数是否符合规范。";
        }

        const userId = options.userid || session.userId;
        const username = options.username || session.username || userId;
        const channelId = session.channelId;
        let useravatar = session.event.user.avatar;
        if (options.userid) {
          useravatar = `http://q.qlogo.cn/headimg_dl?dst_uin=${options.userid}&spec=640`
        }

        const normalizedTime = time.replace(/：/g, ':').replace(/——/g, '-');
        const normalizedWeekday = weekday.replace(/，/g, ',').split(/[,、，]/).flatMap(dayGroup => {
          const individualDays = [];
          let currentDay = "";
          for (let i = 0; i < dayGroup.length; i++) {
            currentDay += dayGroup[i];
            if (dayGroup[i] === '周' || dayGroup[i] === '星') {
              continue;
            }
            if (['一', '二', '三', '四', '五', '六', '日', '天'].includes(dayGroup[i])) {
              individualDays.push(currentDay);
              currentDay = "";
            }
          }
          if (currentDay) {
            individualDays.push(currentDay);
          }
          return individualDays.map(day => {
            if (day.startsWith('周')) return day;
            if (day === '一') return '周一';
            if (day === '二') return '周二';
            if (day === '三') return '周三';
            if (day === '四') return '周四';
            if (day === '五') return '周五';
            if (day === '六') return '周六';
            if (day === '日' || day === '天') return '周日';
            return day;
          });
        });

        try {
          const otherChannelCourses = await ctx.database.get('curriculumtable', { userid: userId, channelId: { $ne: channelId } });
          if (otherChannelCourses.length > 0) {
            await session.send(`您已在其他群组添加过课表，是否将其他群组的课表拷贝到本群？(Y/N)`);
            const confirmCopy = await session.prompt(config.waittimeout * 1000);
            if (confirmCopy.toLowerCase() === 'y') {
              const oldChannelId = otherChannelCourses[0].channelId;
              await session.execute(`${config.command31} ${oldChannelId} ${channelId}`);
              return "已尝试拷贝其他群组课表到本群。";
            }
          }

          // 计算 startDate 和 endDate (手动添加的课程)
          const now = new Date();
          const startDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
          const endDate = new Date(now.setDate(now.getDate() + (5 * 31))).toISOString().split('T')[0];

          await ctx.database.create('curriculumtable', {
            channelId: channelId,
            userid: userId,
            username: username,
            useravatar: useravatar,
            curriculumndate: normalizedWeekday,
            curriculumname: classname,
            curriculumtime: normalizedTime,
            startDate: startDate,
            endDate: endDate,
          });

          if (config.autocommand14) {
            await session.execute(`${config.command14}`)
          }
          return `已为 ${username} 添加课程：${classname} ${normalizedWeekday.join(',')} ${normalizedTime}`;

        } catch (error) {
          ctx.logger.error('添加课程失败:', error);
          return `添加课程失败，请重试或检查日志。`;
        }
      });

    // wakeup快速导入
    ctx.command(`${config.command}.${config.command13} <param:text>`)
      .option('userid', '-i <userid:string> 指定用户ID (QQ号)')
      .option('username', '-n <username:string> 指定用户的名称')
      .example(`输入示例：\n${config.command13} 这是来自「WakeUp课程表」的课表分享......分享口令为「PaJ_8Kj_zeelspJs2HBL1」`)
      .action(async ({ session, options }, param) => {
        if (!param) {
          await session.send("请输入wakeup课程表分享口令：")
          param = await session.prompt(config.waittimeout * 1000)
        }
        const keyMatch = param.match(/分享口令为「(.*?)」/);
        if (!keyMatch) return "未检测到分享口令，请检查输入格式。";
        const shareKey = keyMatch[1];

        const apiUrl = `https://i.wakeup.fun/share_schedule/get?key=${shareKey}`;
        const headers = { 'Connection': 'keep-alive', 'Accept-Encoding': 'gzip', 'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json', 'version': '248', 'Host': 'i.wakeup.fun' };

        try {
          const response = await ctx.http.get(apiUrl, { headers });
          logInfo(apiUrl);
          logInfo(response);

          if (response?.status !== 1 || !response?.data) {
            return `WakeUp API 请求失败: ${response?.message || '未知错误'}`;
          }

          const dataString = response.data.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          const jsonStrings = dataString.trim().split('\n');

          if (jsonStrings.length < 5) {
            return "API响应数据格式错误，缺少必要的JSON部分。";
          }

          let timeTable, courseInfos, courseDetails, tableInfo;

          try {
            timeTable = JSON.parse(jsonStrings[1]);
            tableInfo = JSON.parse(jsonStrings[2]);
            courseInfos = JSON.parse(jsonStrings[3]);
            courseDetails = JSON.parse(jsonStrings[4]);
          } catch (parseError) {
            ctx.logger.error('解析JSON失败:', parseError);
            return "API响应数据解析失败，请检查数据格式。";
          }
          const termStartDate = tableInfo.startDate; // "2024-2-26" 格式
          if (!termStartDate) {
            return "API响应数据中缺少学期开始日期 (startDate)。";
          }

          let userId = options.userid || session.userId;
          let userName = options.username || session.username;
          if (!userId) return "无法获取用户ID，请使用 -i 参数指定用户ID。";
          let useravatar = options.userid ? `http://q.qlogo.cn/headimg_dl?dst_uin=${options.userid}&spec=640` : session.event.user.avatar;

          const coursesToInsert = [];
          const uniqueCourseKeys = new Set();

          for (const detail of courseDetails) {
            if (detail.ownTime) continue;

            const courseInfo = courseInfos.find(info => info.id === detail.id);
            if (!courseInfo) continue;

            const courseName = courseInfo.courseName;
            const weekdayMap = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };
            const weekday = weekdayMap[detail.day];

            let startTime = '';
            let endTime = '';
            for (let i = detail.startNode; i < detail.startNode + detail.step; i++) {
              const timeSlot = timeTable.find(slot => slot.node === i);
              if (timeSlot) {
                if (!startTime) startTime = timeSlot.startTime;
                endTime = timeSlot.endTime;
              }
            }
            const curriculumtime = `${startTime.split(':')[0]}:${startTime.split(':')[1]}-${endTime.split(':')[0]}:${endTime.split(':')[1]}`;

            // 计算课程的起止日期
            const courseStartDate = calculateDate(termStartDate, detail.startWeek);
            const courseEndDate = calculateDate(termStartDate, detail.endWeek, true);

            const courseData = {
              channelId: session.channelId,
              userid: userId,
              username: userName,
              useravatar: useravatar,
              curriculumname: courseName,
              curriculumndate: [weekday],
              curriculumtime: curriculumtime,
              startDate: courseStartDate,  // 课程开始日期
              endDate: courseEndDate,      // 课程结束日期
            };

            // 去重
            const courseKey = `${userId}-${courseName}-${weekday}-${curriculumtime}-${courseStartDate}-${courseEndDate}`;
            if (!uniqueCourseKeys.has(courseKey)) {
              uniqueCourseKeys.add(courseKey);
              coursesToInsert.push(courseData);
            }
          }

          let successMessageDetails = '';
          let importedCourseCount = 0;

          for (const courseData of coursesToInsert) {
            try {
              await ctx.database.create('curriculumtable', courseData);
              importedCourseCount++;
              successMessageDetails += `\n课程名称：${courseData.curriculumname}， ${courseData.curriculumndate[0]}， ${courseData.curriculumtime}`;
            } catch (dbError) {
              ctx.logger.error('添加课程到数据库失败:', dbError);
            }
          }

          if (importedCourseCount > 0) {
            if (config.autocommand14) {
              await session.execute(`${config.command14}`)
            }
            return `已成功导入来自WakeUp的课程表，共导入 ${importedCourseCount} 门课程：${successMessageDetails}`;
          } else {
            return "课程表导入完成，但没有发现可导入的新课程 (可能已全部导入或数据异常)。";
          }

        } catch (apiError) {
          ctx.logger.error('WakeUp API 请求或处理失败:', apiError);
          return "导入课程表失败，请检查网络或稍后重试。";
        }
      });

    ctx.command(`${config.command}.${config.command12}`)
      .option('userid', '-i <userid:string> 指定用户ID (QQ号)')
      .option('username', '-n <username:string> 指定用户的名称')
      .action(async ({ session, options }) => {
        const userId = options.userid || session.userId;
        const channelId = session.channelId;

        try {
          const courses = await ctx.database.get('curriculumtable', { userid: userId, channelId: channelId });
          if (courses.length === 0) {
            return "您在本群还没有添加任何课程。";
          }

          let courseListText = "你目前在本群的课程有：\n";
          courses.forEach((course, index) => {
            courseListText += `${index + 1}. ${course.curriculumname} ${course.curriculumndate?.join(',')} ${course.curriculumtime}\n`;
          });
          courseListText += "请选择要移除的课程序号 (输入数字):";
          await session.send(h.text(courseListText));
          const input = await session.prompt(config.waittimeout * 1000);
          const selectedIndex = parseInt(input) - 1;

          if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= courses.length) {
            return "无效的课程序号。";
          }

          const selectedCourse = courses[selectedIndex];
          await ctx.database.remove('curriculumtable', {
            channelId: channelId,
            userid: userId,
            curriculumname: selectedCourse.curriculumname,
            curriculumtime: selectedCourse.curriculumtime,
          });

          await session.send(`已删除课程：${selectedCourse.curriculumname} ${selectedCourse.curriculumndate?.join(',')} ${selectedCourse.curriculumtime}`);
          return session.execute(`${config.command21}`);
        } catch (error) {
          ctx.logger.error('移除课程失败:', error);
          return "移除课程失败，请重试或检查日志。";
        }
      });

    ctx.command(`${config.command}.${config.command14}`)
      .action(async ({ session }) => {
        const userId = session.userId;
        const channelId = session.channelId;

        try {
          const courses = await ctx.database.get('curriculumtable', { userid: userId, channelId: channelId });
          if (courses.length === 0) {
            return "您在本群还没有添加任何课程。";
          }

          const uniqueCoursesMap = new Map();
          const duplicates = [];

          for (const course of courses) {
            const courseDays = Array.isArray(course.curriculumndate) ? course.curriculumndate : [course.curriculumndate];
            const courseTime = typeof course.curriculumtime === 'string' ? course.curriculumtime : String(course.curriculumtime);

            const courseKey = `${course.curriculumname}-${courseDays.join(',')}-${courseTime}`;

            if (uniqueCoursesMap.has(courseKey)) {
              duplicates.push(course);
            } else {
              uniqueCoursesMap.set(courseKey, course);
            }
          }

          if (duplicates.length === 0) {
            return "没有检测到重复的课程。";
          }

          // 删除重复的课程
          let removedCount = 0;
          for (const duplicate of duplicates) {
            const result = await ctx.database.remove('curriculumtable', {
              id: duplicate.id,
            });
            logInfo(result)
            removedCount += Number(result.removed);
          }

          return `已成功移除 ${removedCount} 门重复的课程。`;

        } catch (error) {
          ctx.logger.error('课程去重失败:', error);
          return "课程去重失败，请重试或检查日志。";
        }
      });

    // 渲染课程表
    ctx.command(`${config.command}.${config.command21} [day:string]`)
      .action(async ({ session, options }, day) => {
        let dayOffset = 0;
        if (day) {
          const num = Number(day);
          if (!isNaN(num)) {
            dayOffset = num;
          } else {
            const dayMap = {
              '今天': 0, '明天': 1, '后天': 2, '大后天': 3,
              '昨天': -1, '前天': -2, '大前天': -3,
            };

            if (day in dayMap) {
              dayOffset = dayMap[day];
            } else {
              const futureMatch = day.match(/^(大+)(后天)$/);
              const pastMatch = day.match(/^(大+)(前天)$/);

              if (futureMatch) {
                dayOffset = futureMatch[1].length + 2;
              } else if (pastMatch) {
                dayOffset = -(pastMatch[1].length + 2);
              } else {
                return `无法识别的日期描述: "${day}"。请输入数字或 "今天"、"明天"、"昨天" 等。`;
              }
            }
          }
        }

        await session.send(await renderCourseTable(ctx, config, session.channelId, dayOffset));
      });
  });

  ctx.on('ready', async () => {
    // 确保 cronPush 为 true 且存在订阅时才执行
    if (!config.cronPush || !config.subscribe || config.subscribe.length === 0) {
      return;
    }

    // 注入 cron 服务
    ctx.inject(['cron'], (ctx) => {
      // 遍历所有订阅
      for (const subscription of config.subscribe) {
        const { bot: botId, channelId, time } = subscription;

        // 如果没有提供时间，则跳过
        if (!time) continue;

        // 将时间字符串 "HH:mm:ss" 转换成 cron 表达式
        const [hour, minute] = time.split(':');
        const cronExpression = `${minute} ${hour} * * *`;

        try {
          // 设置定时任务
          ctx.cron(cronExpression, async () => {
            // 在任务执行时查找 bot 实例并检查状态
            const bot = (Object.values(ctx.bots) as Bot[]).find(b => b.selfId === botId || b.user?.id === botId);

            if (!bot || bot.status !== Universal.Status.ONLINE) {
              ctx.logger.warn(`定时消息发送失败: 未找到ID为 ${botId} 的bot或bot不在线`);
              return; // 仅跳过本次执行
            }
            const allCourses = await ctx.database.get('curriculumtable', { channelId });

            if (allCourses.length === 0) {
              ctx.logger.info(`群组 ${channelId} 没有课程数据，跳过定时任务执行。`);
              return;
            }

            const now = new Date();
            const currentDate = now.toISOString().split('T')[0];

            const validCourses = allCourses.filter(course => {
              return currentDate >= course.startDate && currentDate <= course.endDate;
            });

            if (validCourses.length === 0) {
              ctx.logger.info(`群组 ${channelId} 在当前日期没有有效课程，跳过定时任务执行。`);
              return;
            }

            try {
              const renderedImage = await renderCourseTable(ctx, config, channelId); // 调用渲染函数
              if (renderedImage) {
                await bot.sendMessage(channelId, renderedImage);
                ctx.logger.info(`已根据定时任务为群组 ${channelId} 发送课程表图片。`);
              }
            } catch (error) {
              ctx.logger.error(`群组 ${channelId} 定时任务执行失败:`, error);
            }
          });

          ctx.logger.info(`已为群组 ${channelId} 设置定时任务，cron 表达式：${cronExpression}`);
        } catch (error) {
          ctx.logger.error(`为群组 ${channelId} 设置定时任务失败，cron 表达式可能无效：${cronExpression}`, error);
        }
      }
    });
  });

  // 渲染课程表的函数
  async function renderCourseTable(ctx, config, channelId, dayOffset = 0) {
    if (!ctx.puppeteer) {
      logger.error("没有开启 puppeteer 服务，无法生成图片。");
      return null;
    }

    let page;
    try {
      page = await ctx.puppeteer.page();
      const allCourses = await ctx.database.get('curriculumtable', { channelId });

      if (allCourses.length === 0) {
        logger.warn(`群组 ${channelId} 没有课程数据，无法渲染。`);
        return null; // 没有课程数据
      }

      const now = new Date();
      now.setDate(now.getDate() + dayOffset);
      const currentDate = now.toISOString().split('T')[0];

      // 获取今天的星期几
      const dayOfWeekIndex = now.getDay(); // 0 (周日) 到 6 (周六)
      const dayOfWeekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const currentDayOfWeekName = dayOfWeekNames[dayOfWeekIndex];

      const validCourses = allCourses.filter(course => {
        return currentDate >= course.startDate && currentDate <= course.endDate && course.curriculumndate.includes(currentDayOfWeekName);
      });

      if (validCourses.length === 0) {
        logInfo(`群组 ${channelId} 在今天（${currentDayOfWeekName}）没有有效课程，开始渲染无课程课表。`);
      } else {
        logInfo(`群组 ${channelId} 在今天（${currentDayOfWeekName}）有 ${validCourses.length} 门课程，开始渲染课表。`);
      }

      const courseList = [];
      validCourses.forEach(course => {
        course.curriculumndate.forEach(day => {
          if (day === currentDayOfWeekName) { // 只处理今天的课程
            const [startTime, endTime] = course.curriculumtime.split('-');
            const dayOfWeek = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'].indexOf(day);
            const [startHour, startMinute] = startTime.split(':').map(Number);

            courseList.push({
              type: 'start',
              timestamp: dayOfWeek * 24 * 60 + startHour * 60 + startMinute,
              day: day,
              time: startTime,
              endTime: endTime,
              courseName: course.curriculumname,
              username: course.username,
              useravatar: course.useravatar,
              userid: course.userid,
            });
          }
        });
      });

      courseList.sort((a, b) => a.timestamp - b.timestamp);

      const currentDayOfWeek = now.getDay();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      let currentTimestamp;
      if (dayOffset === 0) {
        currentTimestamp = currentDayOfWeek * 24 * 60 + currentHour * 60 + currentMinute;
      } else {
        currentTimestamp = currentDayOfWeek * 24 * 60; // 使用指定日期的 0:00 时刻
      }

      const mergedCourseList = [];
      const noCourseMap = new Map();
      const usersWithCoursesToday = new Set();

      for (const course of courseList) {
        let status = "nocourse";
        const [endHour, endMinute] = course.endTime.split(':').map(Number);
        const endTimestamp = course.timestamp + (endHour * 60 + endMinute) - (parseInt(course.time.split(':')[0]) * 60 + parseInt(course.time.split(':')[1]))

        if (course.timestamp <= currentTimestamp && currentTimestamp <= endTimestamp) {
          status = "ongoing";
          usersWithCoursesToday.add(course.userid);
          mergedCourseList.push(course);
        } else if (course.timestamp > currentTimestamp) {
          status = "next";
          usersWithCoursesToday.add(course.userid);
          mergedCourseList.push(course);
        } else {
        }
      }

      // 获取所有在该群组有课表的用户
      const allUsersInChannel = new Set(allCourses.map(course => course.userid));

      // 遍历所有用户，检查今天是否有课
      for (const userid of allUsersInChannel) {
        if (!usersWithCoursesToday.has(userid)) {
          const userCourseInfo = allCourses.find(course => course.userid === userid);

          if (userCourseInfo) {
            noCourseMap.set(userid, {
              ...userCourseInfo,
              noCourseDetails: [],
              timestamp: Infinity,
            });

            // 获取该用户本周所有的课程
            const userAllCoursesThisWeek = allCourses.filter(c => c.userid === userid);
            userAllCoursesThisWeek.forEach(course => {
              noCourseMap.get(userid).noCourseDetails.push(`${course.curriculumname} (${course.curriculumndate.join(',')} ${course.curriculumtime})`);
            });
          }
        }
      }

      for (const [userid, noCourseInfo] of noCourseMap) {
        let truncatedDetails = noCourseInfo.noCourseDetails.join('; ').substring(0, 20);
        if (noCourseInfo.noCourseDetails.join('; ').length > 20) {
          truncatedDetails += '...';
        }
        mergedCourseList.push({
          ...noCourseInfo,
          noCourseDetails: truncatedDetails,
        });
      }

      mergedCourseList.sort((a, b) => {
        if (a.noCourseDetails && !b.noCourseDetails) return 1;
        if (!a.noCourseDetails && b.noCourseDetails) return -1;
        return a.timestamp - b.timestamp;
      });

      const fontFaceRule = await getFontFaceRule();
      // HTML 模板
      const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>群友课表</title>
<style>
/* 嵌入式 CSS 样式 */
body {
font-family: '千图马克手写体lite', sans-serif; /* 优先使用自定义字体，如果加载失败则使用 sans-serif */
background-color: ${config.backgroundcolor};
color: #333;
margin: 0;
padding: 0; /* 移除body的padding */
display: flex;
flex-direction: column;
align-items: center;
}

${fontFaceRule}

#container {
width: 95%; /* 扩展宽度 */
max-width: 600px; /* 限制最大宽度 */
background-color: ${config.backgroundcolor}; /* 背景颜色 */
border: 2px solid #ddd;
border-radius: 8px;
overflow: hidden;
padding: 20px; /* 内部间距 */
box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); /* 阴影效果 */
}

h1 {
font-family: '千图马克手写体lite', sans-serif; /* 优先使用自定义字体 */
font-size: 2.5em;
text-align: center;
margin-bottom: 30px;
position: relative;
}
h1::before, h1::after {
content: '';
position: absolute;
border-color: #ddd;
}

h1::before {
top: -10px;
left: -10px;
border-top: 20px solid;
border-left: 20px solid;
}

h1::after {
bottom: -10px;
right: -10px;
border-bottom: 20px solid;
border-right: 20px solid;
}

#course-container {
width: 100%; /* 扩展宽度 */
border-radius: 8px;    /* 圆角边框 */
overflow: hidden;     /* 隐藏溢出内容 */
}

.course-item {
background-color: ${config.backgroundcolor};
border-bottom: 1px solid #ddd; /* 使用边框作为分隔线 */
padding: 15px;
display: flex; /* Flex 布局 */
align-items: stretch; /* 垂直方向拉伸 */
}
.course-item:last-child {
border-bottom: none; /* 移除最后一个元素的下边框 */
}

.avatar-info {
display: flex;
flex-direction: column; /* 垂直排列头像和昵称 */
align-items: center; /* 水平居中头像和昵称 */
width: 70px; /* 固定头像昵称列宽度 */
margin-right: 15px; /* 与课程信息列间隔 */
}

.avatar {
width: 50px; /* 稍大的头像 */
height: 50px;
border-radius: 50%;
margin-bottom: 5px; /* 昵称间距 */
object-fit: cover;
}

.nickname {
font-weight: bold;
text-align: center; /* 确保昵称居中 */
word-break: normal; /* 不换行 */
white-space: nowrap; /* 不换行 */
overflow: hidden;
text-overflow: ellipsis;
font-size: 0.9em; /* 稍小字体 */
}

.course-separator {
width: 1px;
background-color: #ddd;
margin: 0 15px; /* 分隔线左右间距 */
align-self: stretch; /* 分隔线高度拉伸 */
}

.course-details {
flex-grow: 1; /* 课程详情占据剩余空间 */
display: flex;
flex-direction: column; /* 内部垂直排列 */
}

.status-and-course {
display: flex;
align-items: baseline; /* 状态和课程名基线对齐 */
margin-bottom: 5px;
}

.status {
font-size: 1.0em; /* 放大状态文字 */
color: #777;
margin-right: 10px; /* 状态和课程名间距 */
white-space: nowrap;
}

.status.ongoing {
color: #00a000; /* 进行中绿色 */
}

.status.next {
color: #007bff; /* 下一节蓝色 */
}

.status.nocourse {
color: #dc3545; /* 无课程红色 */
}

.course-name {
font-size: 1.2em; /* 稍大课程名 */
margin: 0;
}
.course-name-placeholder{
font-size: 1.2em;
visibility: hidden;
margin: 0;
}

.time-remaining {
font-size: 0.9em;
color: #555;
margin: 0;
}

.no-course-details {
flex-grow: 1; /* 无课程信息占据剩余空间 */
display: flex;
flex-direction: column;
justify-content: center; /* 垂直居中 */
}

.no-course-details .status.nocourse {
font-size: 1em;
margin-bottom: 5px;
text-align: left; /* 状态左对齐 */
}

.no-course-text {
font-size: 0.9em;
color: #777;
text-align: left; /* 文字左对齐 */
}

footer {
margin-top: 30px; /* 减小页脚边距 */
padding: 5px;    /* 减小页脚内边距 */
text-align: center;
color: #777;
font-size: 0.8em; /* 减小页脚字体大小 */
position: relative;
}

footer::before, footer::after {
content: '';
position: absolute;
border-color: #ddd;
}

footer::before {
top: -5px;  /* 减小页脚边框偏移 */
left: -5px; /* 减小页脚边框偏移 */
border-top: 10px solid; /* 减小页脚边框大小 */
border-left: 10px solid;/* 减小页脚边框大小 */
}

footer::after {
bottom: -5px;  /* 减小页脚边框偏移 */
right: -5px; /* 减小页脚边框偏移 */
border-bottom: 10px solid; /* 减小页脚边框大小 */
border-right: 10px solid;  /* 减小页脚边框大小 */
}

/* CSS 箭头样式 */
.status::before {
content: '';
display: inline-block;
width: 0;
height: 0;
border-left: 6px solid transparent;
border-right: 6px solid transparent;
border-bottom: 8px solid #777; /* 默认箭头颜色 */
margin-right: 5px;
vertical-align: middle; /* 与文字垂直居中 */
opacity: 0.7; /* 箭头透明度 */
}

.status.ongoing::before {
border-bottom-color: #00a000; /* 进行中绿色箭头 */
}

.status.next::before {
border-bottom-color: #007bff; /* 下一节蓝色箭头 */
border-top: 8px solid #007bff; /* 更改为向上箭头 */
border-bottom: none;
}

.status.nocourse::before {
border-bottom-color: #dc3545; /* 无课程红色箭头 */
border-left: 6px solid transparent;
border-right: 6px solid transparent;
border-top: 8px solid #dc3545; /* 更改为向上箭头 */
border-bottom: none;
}
</style>
</head>
<body>
<div id="container">
<header>
<h1>群友在上什么课？</h1>
</header>

<main id="course-container">
${mergedCourseList.map(course => {
        let status = "nocourse";
        let statusText = "[无课程]";
        const hasEndTime = course.endTime !== undefined && course.time !== undefined;
        let endTimestamp;

        if (hasEndTime) {
          const [endHour, endMinute] = course.endTime.split(':').map(Number);
          endTimestamp = course.timestamp + (endHour * 60 + endMinute) - (parseInt(course.time.split(':')[0]) * 60 + parseInt(course.time.split(':')[1]));
        }

        let timeRemainingText = '';
        if (hasEndTime && course.timestamp <= currentTimestamp && currentTimestamp <= endTimestamp) {
          status = "ongoing";
          statusText = "[进行中]";

          // 计算剩余时间
          const remainingMinutes = Math.floor(endTimestamp - currentTimestamp);
          const remainingHours = Math.floor(remainingMinutes / 60);
          const remainingMins = remainingMinutes % 60;

          timeRemainingText = `距离下课还有 ${remainingHours > 0 ? remainingHours + '小时' : ''}${remainingMins}分钟`;

        } else if (hasEndTime && course.timestamp > currentTimestamp) {
          status = "next";
          statusText = "[下一节]";

          // 计算距离上课时间
          const timeDiffMinutes = Math.floor(course.timestamp - currentTimestamp);
          const timeToStartHours = Math.floor(timeDiffMinutes / 60);
          const timeToStartMins = timeDiffMinutes % 60;
          course.timeToStartText = `距离上课还有 ${timeToStartHours > 0 ? timeToStartHours + '小时' : ''}${timeToStartMins}分钟`;

          //mergedCourseList.push(course); // 已经在外层循环处理
        }

        return `
<li class="course-item">
<div class="avatar-info">
<img src="${course.useravatar}" alt="${course.username}" class="avatar">
<div class="nickname">${course.username}</div>
</div>
<div class="course-separator"></div>
<div class="course-details">
<div class="status-and-course">
<div class="status ${status}">${statusText}</div>
${status === 'nocourse' ? `<p class="no-course-text">${course.noCourseDetails}</p>` : `<h3 class="course-name">${course.courseName} (${course.day} ${course.time} - ${course.endTime})</h3>`}
</div>
${timeRemainingText ? `<p class="time-remaining">${timeRemainingText}</p>` : ''}
${status === 'next' && course.timeToStartText ? `<p class="time-remaining">${course.timeToStartText}</p>` : ''}
</div>
</li>
`;
      }).join('')}
</main>

<footer>
<p>更新/渲染时间：${now.toLocaleString()}</p>
<p>${config.footertext}</p>
</footer>
</div>
</body>
</html>
`;

      await page.setContent(htmlTemplate, { waitUntil: 'domcontentloaded' });

      const containerBoundingBox = await page.evaluate(() => {
        const container = document.getElementById('container');
        const rect = container.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, };
      });

      const image = await page.screenshot({
        clip: containerBoundingBox,
        quality: config.screenshotquality,
        type: 'jpeg'
      });

      if (page && config.pageclose) await page.close();
      return h.image(image, 'image/jpeg');

    } catch (e) {
      if (page && config.pageclose) await page.close();
      logger.error('生成课程表图片失败:', e);
      return null;
    }
  }

  // 计算日期的辅助函数
  function calculateDate(startDate, week, isEnd = false) {
    const start = new Date(startDate);
    let dayOffset = (week - 1) * 7; // 周数转换为天数
    if (isEnd) {
      dayOffset += 6; // 如果是结束日期，则加 6 天 (周日)
    }
    start.setDate(start.getDate() + dayOffset);
    return start.toISOString().split('T')[0]; // 返回 YYYY-MM-DD 格式
  }

  function logInfo(...args: any[]) {
    if (config.loggerinfo) {
      (logger.info as (...args: any[]) => void)(...args);
    }
  }
}