import { Schema } from "koishi";
import path from "node:path";

export const usage = `
<h2><a href="https://www.npmjs.com/package/koishi-plugin-emojihub-bili" target="_blank">如何额外添加自己喜欢的表情包</a></h2>
<p>添加额外的表情包到 <strong>EmojiHub-bili</strong> 中非常简单！只需按照以下步骤操作：</p>
<ol>
<li><strong>安装扩展（用户脚本管理器）</strong>：<br>在浏览器中添加扩展：<a href="https://docs.scriptcat.org/" target="_blank">ScriptCat---脚本猫</a>。</li>
<li><strong>安装脚本</strong>：<br>在用户脚本管理器中添加脚本：<a href="https://greasyfork.org/zh-CN/scripts/521666-bilibili%E4%B8%93%E6%A0%8F%E5%8E%9F%E5%9B%BE%E9%93%BE%E6%8E%A5%E6%8F%90%E5%8F%962024%E6%94%B9%E7%89%88" target="_blank">（点击右侧文字查看）Bilibili专栏原图链接提取2024改版</a>。</li>
<li><strong>搜索表情包</strong>：<br>开启扩展后，打开<a href="https://search.bilibili.com/article/" target="_blank">哔哩哔哩专栏搜索</a>，在专栏中搜索您需要的表情包。</li>
<li><strong>提取链接</strong>：<br>点击进入具体的某个专栏帖子，屏幕靠近右下角会有一个绿色的【提取链接】按钮。点击该按钮，即可下载包含当前专栏所有图片的 URL 的 txt 文件。并且按下一次后会变成红色，防止误触，不可二次触发。如需再次下载，请刷新页面。</li>
<li><strong>配置 EmojiHub-bili</strong>：<br>将同一类表情包图片的 URL 整合到同一个 txt 文件中。然后，在 Koishi 的配置项中填入相应的指令名称与 txt 文件路径。（无需像自带的txt一样省略前缀，写完整URL即可）</li>
<li><strong>保存并重载</strong>：<br>完成配置后，保存您的配置并重载插件，您就可以使用自定义的指令发送表情包啦！🌟📚</li>
</ol>
<p> </p>
<h2>温馨提示：</h2>
<p><br>请勿将自定义的txt文件与本插件放置在同一目录下，以免插件更新导致文件丢失。</p>
<p>目前EmojiHub-bili默认提供 <code>43套</code> 表情包。若您的配置内容有误差，请点击 <code>MoreEmojiHubList</code> 表格右上角按钮内的 <code>恢复默认值</code>。</p>
<p>若开启插件后，指令不出现，<a href="/market?keyword=commands">请重新开关commands插件</a></p>
`;

const defaultMoreEmojiHubList = [
  // 下面实际有效为 43套
  { command: '随机emojihub表情包', source_url: "无效路径/内容会调用随机表情包。注意与【随机表情包】指令的功能一致，但【随机表情包】不可被填入表格使用，【随机emojihub表情包】可以，因为在这个配置项里。" },
  { command: '本地图库示例', source_url: path.join(__dirname, 'txts') },
  { command: '网络图片示例', source_url: 'https://i0.hdslb.com/bfs/article/afc31d0e398204d94478473a497028e6352074746.gif' },
  { command: '2233娘小剧场表情包', source_url: path.join(__dirname, '../txts/2233娘小剧场.txt') },
  { command: 'acomu414表情包', source_url: path.join(__dirname, '../txts/acomu414.txt') },
  { command: 'ba表情包', source_url: path.join(__dirname, '../txts/ba.txt') },
  { command: 'capoo表情包', source_url: path.join(__dirname, '../txts/capoo.txt') },
  { command: 'chiikawa表情包', source_url: path.join(__dirname, '../txts/chiikawa.txt') },
  { command: 'downvote表情包', source_url: path.join(__dirname, '../txts/Downvote.txt') },
  { command: 'doro表情包', source_url: path.join(__dirname, '../txts/doro.txt') },
  { command: 'eveonecat表情包', source_url: path.join(__dirname, '../txts/eveonecat.txt') },
  { command: 'fufu表情包', source_url: path.join(__dirname, '../txts/fufu.txt') },
  { command: 'girlsbandcry', source_url: path.join(__dirname, '../txts/GirlsBandCry.txt') },
  { command: 'kemomimi表情包', source_url: path.join(__dirname, '../txts/kemomimi酱表情包.txt') },
  { command: 'koishi-meme表情包', source_url: path.join(__dirname, '../txts/koimeme.txt') },
  { command: 'mygo表情包', source_url: path.join(__dirname, '../txts/mygo.txt') },
  { command: 'seseren表情包', source_url: path.join(__dirname, '../txts/seseren.txt') },
  { command: '阿夸表情包', source_url: path.join(__dirname, '../txts/阿夸.txt') },
  { command: '阿尼亚表情包', source_url: path.join(__dirname, '../txts/阿尼亚.txt') },
  { command: '白圣女表情包', source_url: path.join(__dirname, '../txts/白圣女.txt') },
  { command: '白圣女漫画表情包', source_url: path.join(__dirname, '../txts/白圣女黑白.txt') },
  { command: '败犬女主表情包', source_url: path.join(__dirname, '../txts/败犬女主.txt') },
  { command: '柴郡表情包', source_url: path.join(__dirname, '../txts/柴郡.txt') },
  { command: '初音Q版表情包', source_url: path.join(__dirname, '../txts/初音未来Q.txt') },
  { command: '甘城猫猫表情包', source_url: path.join(__dirname, '../txts/甘城猫猫.txt') },
  { command: '孤独摇滚表情包', source_url: path.join(__dirname, '../txts/孤独摇滚.txt') },
  { command: '狗妈表情包', source_url: path.join(__dirname, '../txts/狗妈.txt') },
  { command: '滑稽表情包', source_url: path.join(__dirname, '../txts/滑稽.txt') },
  { command: '疾旋鼬表情包', source_url: path.join(__dirname, '../txts/疾旋鼬.txt') },
  { command: '卡拉彼丘表情包', source_url: path.join(__dirname, '../txts/卡拉彼丘.txt') },
  { command: '流萤表情包', source_url: path.join(__dirname, '../txts/流萤.txt') },
  { command: '龙图表情包', source_url: path.join(__dirname, '../txts/龙图.txt') },
  { command: '鹿乃子表情包', source_url: path.join(__dirname, '../txts/鹿乃子.txt') },
  { command: '玛丽猫表情包', source_url: path.join(__dirname, '../txts/玛丽猫.txt') },
  { command: '小c表情包', source_url: path.join(__dirname, '../txts/蜜汁工坊.txt') },
  { command: '男娘武器库表情包', source_url: path.join(__dirname, '../txts/男娘武器库.txt') },
  { command: '千恋万花表情包', source_url: path.join(__dirname, '../txts/0721.txt') },
  { command: '赛马娘表情包', source_url: path.join(__dirname, '../txts/赛马娘.txt') },
  { command: '瑟莉亚表情包', source_url: path.join(__dirname, '../txts/瑟莉亚.txt') },
  { command: '藤田琴音表情包', source_url: path.join(__dirname, '../txts/藤田琴音.txt') },
  { command: '小黑子表情包', source_url: path.join(__dirname, '../txts/小黑子.txt') },
  { command: '心海表情包', source_url: path.join(__dirname, '../txts/心海.txt') },
  { command: '绪山真寻表情包', source_url: path.join(__dirname, '../txts/绪山真寻.txt') },
  { command: '亚托莉表情包', source_url: path.join(__dirname, '../txts/亚托莉表情包.txt') },
  { command: '永雏小菲表情包', source_url: path.join(__dirname, '../txts/永雏小菲.txt') },
  { command: '宇佐紀表情包', source_url: path.join(__dirname, '../txts/宇佐紀.txt') },
  // { command: '', source_url: path.join(__dirname, '../txts/.txt') },
  // 以后添加其他的命令...未完待续
];

export interface Config {
  emojihub_bili_command: string;
  emojihub_onemore: string;
  emojihub_randompic: string;
  MoreEmojiHubList: { command: string; source_url: string }[];
  deleteMsg: boolean;
  deleteMsgtime?: number;
  optionsname: string;
  maxexecutetime: number;
  repeatCommandDifferentiation: 'channelId' | 'userId';
  searchSubfolders: boolean;
  searchSubfoldersWithfilename: boolean;
  localPictureToName: string;
  autoEmoji: "取消应用" | '定量消息发送' | '定时发送';
  middleware?: boolean;
  triggerprobability?: number;
  groupListmapping?: { groupList: string; defaultemojicommand: string; count?: number; cronTime?: string; enable: boolean }[];
  allgroupautoEmoji?: boolean;
  count?: number;
  allgroupemojicommand?: string;
  botId?: string;
  markdown_button_mode: 'unset' | 'json' | 'markdown' | 'markdown_raw_json' | 'raw';
  markdown_button_mode_initiative?: boolean;
  markdown_button_mode_keyboard?: boolean;
  markdown_button_mode_without_emojilist_keyboard?: boolean;
  nested?: any;
  nestedlist?: any;
  LocalSendNetworkPicturesList?: string;
  deletePictime?: number;
  localPicToBase64?: boolean;
  QQPicToChannelUrl?: boolean;
  QQchannelId?: string;
  consoleinfo: boolean;
  allfileinfo?: boolean;
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    emojihub_bili_command: Schema.string().default('emojihub-bili').description('`父级指令`的指令名称').pattern(/^\S+$/),
    emojihub_onemore: Schema.string().default('再来一张').description('`再来一张`的指令名称').pattern(/^\S+$/),
    emojihub_randompic: Schema.string().default('随机表情包').description('`随机表情包`的指令名称').pattern(/^\S+$/),

    MoreEmojiHubList: Schema.array(Schema.object({
      command: Schema.string().description('注册的指令名称'),
      source_url: Schema.string().description('表情包文件地址'),
    })).role('table').default(defaultMoreEmojiHubList)
      .description('表情包指令映射表<br>▶ 若丢失了旧版本`MoreEmojiHub`配置 请先回退到 1.3.0 版本<br>▶ 若出现配置问题 请点击右方按钮 可以恢复到默认值<br>右列`文件地址`可以填入`txt绝对路径`、`文件夹绝对路径`、`图片直链`、`图片文件绝对路径`。支持格式 详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)'),

    deleteMsg: Schema.boolean().description("`开启后`自动撤回表情").default(false),

    optionsname: Schema.string().description('多图返回的 选项名称').default("n"),
    maxexecutetime: Schema.number().description('`-n 选项`指定 允许单次返回的 表情包最大数<br>例如默认10 ：`ba表情包 -n 30`，可以返回10张').default(10),
  }).description('表情包设置'),

  Schema.union([
    Schema.object({
      deleteMsg: Schema.const(true).required(),
      deleteMsgtime: Schema.number().default(30).description('若干`秒`后 撤回表情').min(1),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    repeatCommandDifferentiation: Schema.union([
      Schema.const('channelId').description('按频道ID区分'),
      Schema.const('userId').description('按用户ID区分'),
    ]).role('radio').default("channelId").description('`再来一张`指令的区分逻辑。<br>按频道ID区分：触发指令后发送当前频道最后触发的表情包<br>按用户ID区分：触发指令后发送当前用户最后触发的表情包'),

    searchSubfolders: Schema.boolean().description("本地发图，输入文件名称参数时，是否递归搜索文件夹。<br>`开启后 对于本地文件夹地址 会搜索其子文件夹内全部的图片`").default(true),
    searchSubfoldersWithfilename: Schema.boolean().description("递归搜索时，是否把`子文件夹`的名称纳入名称匹配范围<br>例如：`C:/中文/456.png`被视作`中文456.png`文件名处理匹配").default(false),
    localPictureToName: Schema.string().role('textarea', { rows: [4, 4] })
      .description("对于本地图片/文件，是否输出文件名<br>仅图片：`${IMAGE}`<br>图+文件名：`${IMAGE}\\n${NAME}`<br>文件名+图：`${NAME}\\n${IMAGE}`<br>文本+变量：`今天你的幸运神：${NAME}\\n${IMAGE}`<br>全部变量示例：`${IMAGE}\\n文件名称：${NAME}\\n文件大小：${SIZE}\\n修改日期：${TIME}\\n文件路径：${PATH}`<br>其中`\\n`就是换行，可以写字也可以直接回车。<br>可用替换变量有：IMAGE、 NAME、 SIZE、 TIME、 PATH<br>仅对指令发送本地图片有效。<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)")
      .default("${IMAGE}"),
  }).description('进阶设置'),

  Schema.object({
    autoEmoji: Schema.union(["取消应用", '定量消息发送', '定时发送']).description("打开后，开启自动表情包功能 <br>▶ 定量消息发送: `达到一定消息数量 自动触发表情包`<br>▶ 定时发送: `使用cron表达式定时触发表情包`此项需要`cron`服务").default("取消应用"),
  }).description('自动表情包设置'),
  Schema.union([
    Schema.object({
      autoEmoji: Schema.const("定量消息发送").required(),
      middleware: Schema.boolean().description('开启后使用前置中间件').default(true),
      triggerprobability: Schema.percent().default(0.8).description('达到消息数量阈值时，发送表情包的概率 `范围为 0 到 1 `'),
      groupListmapping: Schema.array(Schema.object({
        groupList: Schema.string().description('开启自动表情包的群组ID'),
        defaultemojicommand: Schema.string().description('表情包指令名称 `应与上方指令表格对应`'),
        count: Schema.number().description('触发自动表情包的消息数量的阈值').default(30),
        enable: Schema.boolean().description('勾选后 屏蔽该群 的自动表情包').default(false),
      })).role('table').description('表情包指令映射 `注意群组ID不要多空格什么的`<br>私聊频道有`private:`前缀<br>表情包名称请通过逗号分隔')
        .default([
          {
            "groupList": "114514",
            "defaultemojicommand": "koishi-meme，白圣女表情包，男娘武器库",
            "count": 30,
            "enable": false
          },
          {
            "groupList": "private:1919810",
            "defaultemojicommand": "随机emojihub表情包",
            "count": 30,
            "enable": true
          }
        ]),
      allgroupautoEmoji: Schema.boolean().description("`全部群组` 开启自动表情包").default(false),
      count: Schema.number().description('`全部群组` 触发自动表情包的消息数量的阈值').default(30),
      allgroupemojicommand: Schema.string().role('textarea', { rows: [2, 4] })
        .description('`全部群组的` 表情包指令映射`一行一个指令 或者 逗号分隔`   <br> 可以同时在`groupListmapping`指定群组的表情包内容').default(`宇佐紀表情包\n白圣女表情包\n白圣女漫画表情包`),
    }),
    Schema.object({
      autoEmoji: Schema.const("定时发送").required(),
      botId: Schema.string().description('定时消息由哪个bot发出？▶ 填入bot对应的Id'),
      triggerprobability: Schema.percent().default(0.8).description('达到预定时间时，发送表情包的概率 `范围为 0 到 1 `'),
      groupListmapping: Schema.array(Schema.object({
        groupList: Schema.string().description('开启自动表情包的群组ID'),
        defaultemojicommand: Schema.string().description('表情包指令名称 `应与上方指令表格对应`'),
        cronTime: Schema.string().description('定时设置:cron语法'),
        enable: Schema.boolean().description('勾选后 屏蔽该群 的自动表情包').default(false),
      })).role('table').description('表情包指令映射 `注意群组ID不要多空格什么的`<br>私聊频道有`private:`前缀<br>表情包名称请通过逗号分隔<br>▶ cron 定时语法 见 https://cron.koishi.chat/')
        .default([
          {
            "groupList": "114514",
            "defaultemojicommand": "白圣女表情包，白圣女漫画表情包",
            "enable": false,
            "cronTime": "15,45 * * * *"
          },
          {
            "groupList": "private:1919810",
            "defaultemojicommand": "白圣女表情包",
            "enable": true,
            "cronTime": "15,45 * * * *"
          }
        ]),
    }),
    Schema.object({}),
  ]),


  Schema.object({
    markdown_button_mode: Schema.union([
      Schema.const('unset').description('取消应用此配置项'),
      Schema.const('json').description('json按钮-----------20 群（频道不可用）'),
      Schema.const('markdown').description('被动md模板--------2000 DAU / 私域'),
      Schema.const('markdown_raw_json').description('被动md模板--------2000 DAU - 原生按钮'),
      Schema.const('raw').description('原生md------------10000 DAU'),
    ]).role('radio').description('markdown/按钮模式选择').default("unset"),
  }).description('QQ官方按钮设置'),
  Schema.union([
    Schema.object({
      markdown_button_mode: Schema.const("json").required(),
      markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").default(false),
      markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
      markdown_button_mode_without_emojilist_keyboard: Schema.boolean().description("开启后，表情包列表使用下方`nestedlist`配置的表情包列表按钮。关闭后，仅发送普通的文字列表").default(true).experimental(),

      nested: Schema.object({
        json_button_template_id: Schema.string().description("模板ID<br>形如 `123456789_1234567890` 的ID编号<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)").pattern(/^\d+_\d+$/),
      }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
      nestedlist: Schema.object({
        json_button_template_id: Schema.string().description("模板ID<br>形如 `123456789_1234567890` 的ID编号<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)").pattern(/^\d+_\d+$/),
      }).collapse().description('➣表情包列表--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
    }),
    Schema.object({
      markdown_button_mode: Schema.const("markdown").required(),
      markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").default(false),
      markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
      markdown_button_mode_without_emojilist_keyboard: Schema.boolean().description("开启后，表情包列表使用下方`nestedlist`配置的表情包列表按钮。关闭后，仅发送普通的文字列表").default(true).experimental(),

      nested: Schema.object({
        markdown_button_template_id: Schema.string().description("md模板ID<br>形如 `123456789_1234567890` 的ID编号，发送markdown").pattern(/^\d+_\d+$/),
        markdown_button_keyboard_id: Schema.string().description("按钮模板ID<br>形如 `123456789_1234567890` 的ID编号，发送按钮").pattern(/^\d+_\d+$/),
        markdown_button_content_table: Schema.array(Schema.object({
          raw_parameters: Schema.string().description("原始参数名称"),
          replace_parameters: Schema.string().description("替换参数名称"),
        })).role('table').default([
          {
            "raw_parameters": "your_markdown_text_1",
            "replace_parameters": "表情包来啦！"
          },
          {
            "raw_parameters": "your_markdown_text_2",
            "replace_parameters": "这是你的表情包哦😽"
          },
          {
            "raw_parameters": "your_markdown_img",
            "replace_parameters": "${img_pxpx}"
          },
          {
            "raw_parameters": "your_markdown_url",
            "replace_parameters": "${img_url}"
          }
        ]).description("替换参数映射表<br>本插件会替换模板变量，请在左侧填入模板变量，右侧填入真实变量值。<br>本插件提供的参数有`command`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`，其中img_pxpx参数需要使用`canvas`服务<br>▶比如你可以使用`{{.session.userId}}`，这会被本插件替换为`真实的userId值`，若无匹配变量，则视为文本<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)"),

      }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
      nestedlist: Schema.object({
        markdown_button_template_id: Schema.string().description("md模板ID<br>形如 `123456789_1234567890` 的ID编号，发送markdown").pattern(/^\d+_\d+$/),
        markdown_button_keyboard_id: Schema.string().description("按钮模板ID<br>形如 `123456789_1234567890` 的ID编号，发送按钮").pattern(/^\d+_\d+$/),
        markdown_button_content_table: Schema.array(Schema.object({
          raw_parameters: Schema.string().description("原始参数名称"),
          replace_parameters: Schema.string().description("替换参数名称"),
        })).role('table').default([
          {
            "raw_parameters": "your_markdown_text_1",
            "replace_parameters": "表情包列表~"
          },
          {
            "raw_parameters": "your_markdown_text_2",
            "replace_parameters": "点击下面的按钮触发哦！"
          }
        ]).description("替换参数映射表<br>本插件会替换模板变量，请在左侧填入模板变量，右侧填入真实变量值。<br>本插件提供的参数有`command`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`，其中img_pxpx参数需要使用`canvas`服务<br>▶比如你可以使用`{{.session.userId}}`，这会被本插件替换为`真实的userId值`，若无匹配变量，则视为文本<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)"),

      }).collapse().description('➣表情包列表--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
    }),

    Schema.object({
      markdown_button_mode: Schema.const("markdown_raw_json").required(),
      markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").default(false),
      markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
      markdown_button_mode_without_emojilist_keyboard: Schema.boolean().description("开启后，表情包列表使用下方`nestedlist`配置的表情包列表按钮。关闭后，仅发送普通的文字列表").default(true).experimental(),

      nested: Schema.object({
        markdown_raw_json_button_template_id: Schema.string().description("markdown模板ID。**注意不是按钮模板ID**<br>形如 `123456789_1234567890` 的ID编号，发送markdown").pattern(/^\d+_\d+$/),
        markdown_raw_json_button_content_table: Schema.array(Schema.object({
          raw_parameters: Schema.string().description("原始参数名称"),
          replace_parameters: Schema.string().description("替换参数名称"),
        })).role('table').default([
          {
            "raw_parameters": "your_markdown_text_1",
            "replace_parameters": "表情包来啦！"
          },
          {
            "raw_parameters": "your_markdown_text_2",
            "replace_parameters": "这是你的表情包哦😽"
          },
          {
            "raw_parameters": "your_markdown_img",
            "replace_parameters": "${img_pxpx}"
          },
          {
            "raw_parameters": "your_markdown_url",
            "replace_parameters": "${img_url}"
          }
        ]).description("替换参数映射表<br>本插件会替换模板变量，请在左侧填入模板变量，右侧填入真实变量值。<br>本插件提供的参数有`command`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`，其中img_pxpx参数需要使用`canvas`服务<br>▶比如你可以使用`{{.session.userId}}`，这会被本插件替换为`真实的userId值`，若无匹配变量，则视为文本<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)"),
        markdown_raw_json_button_keyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse()
          .default(`{
    "rows": [
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "再来一张😺",
                        "style": 2
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/\${command}",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "返回列表😽",
                        "style": 2
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/\${config.emojihub_bili_command}",
                        "enter": true
                    }
                }
            ]
        }
    ]
}`)
          .description('实现QQ官方bot的按钮效果<br>在这里填入你的按钮内容，注意保持json格式，推荐在编辑器中编辑好后粘贴进来'),
      }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
      nestedlist: Schema.object({
        markdown_raw_json_button_template_id: Schema.string().description("markdown模板ID。**注意不是按钮模板ID**<br>形如 `123456789_1234567890` 的ID编号，发送markdown").pattern(/^\d+_\d+$/),
        markdown_raw_json_button_content_table: Schema.array(Schema.object({
          raw_parameters: Schema.string().description("原始参数名称"),
          replace_parameters: Schema.string().description("替换参数名称"),
        })).role('table').default([
          {
            "raw_parameters": "your_markdown_text_1",
            "replace_parameters": "表情包列表~"
          },
          {
            "raw_parameters": "your_markdown_text_2",
            "replace_parameters": "点击下面的按钮触发哦！"
          }
        ]).description("替换参数映射表<br>本插件会替换模板变量，请在左侧填入模板变量，右侧填入真实变量值。<br>本插件提供的参数有`command`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`，其中img_pxpx参数需要使用`canvas`服务<br>▶比如你可以使用`{{.session.userId}}`，这会被本插件替换为`真实的userId值`，若无匹配变量，则视为文本<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)"),
        markdown_raw_json_button_keyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse()
          .default(`{
    "rows": [
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "随机emojihub表情包",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/随机emojihub表情包",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "acomu414",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/acomu414",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "ba表情包",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/ba表情包",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "downvote",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/downvote",
                        "enter": true
                    }
                }
            ]
        },
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "doro",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/doro",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "eveonecat",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/eveonecat",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "fufu",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/fufu",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "mygo",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/mygo",
                        "enter": true
                    }
                }
            ]
        },
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "seseren",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/seseren",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "白圣女",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/白圣女",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "白圣女漫画",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/白圣女漫画",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "柴郡",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/柴郡",
                        "enter": true
                    }
                }
            ]
        },
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "初音Q版",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/初音Q版",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "甘城猫猫",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/甘城猫猫",
                        "enter": true
                    }
                },
                {\n                    "render_data": {\n                        "label": "疾旋鼬",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/疾旋鼬",\n                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "流萤",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/流萤",\n                        "enter": true\n                    }\n                }\n            ]\n        },\n        {\n            "buttons": [\n                {\n                    "render_data": {\n                        "label": "赛马娘",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/赛马娘",\n                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "瑟莉亚",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/瑟莉亚",\n                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "藤田琴音",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/藤田琴音",\n                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "亚托莉",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/亚托莉",\n                        "enter": true\n                    }\n                }\n            ]\n        }
    ]\n}`)
          .description('实现QQ官方bot的按钮效果<br>在这里填入你的按钮内容，注意保持json格式，推荐在编辑器中编辑好后粘贴进来'),
      }).collapse().description('➣表情包列表--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
    }),

    Schema.object({
      markdown_button_mode: Schema.const("raw").required(),
      markdown_button_mode_initiative: Schema.boolean().description("开启后，使用 主动消息 发送markdown。<br>即开启后不带`messageId`发送<br>适用于私域机器人频道使用。私域机器人需要使用`被动md模板、json模板`并且开启此配置项").default(false),
      markdown_button_mode_keyboard: Schema.boolean().description("开启后，markdown加上按钮。关闭后，不加按钮内容哦<br>不影响markdown发送，多用于调试功能使用").default(true).experimental(),
      markdown_button_mode_without_emojilist_keyboard: Schema.boolean().description("开启后，表情包列表使用下方`nestedlist`配置的表情包列表按钮。关闭后，仅发送普通的文字列表").default(true).experimental(),

      nested: Schema.object({
        raw_markdown_button_content: Schema.string().role('textarea', { rows: [6, 6] }).collapse().default("## **表情包~😺**\n### 😽来了哦！\n![${img_pxpx}](${img_url})")
          .description('实现QQ官方bot的按钮效果，需要`canvas`服务。<br>在这里填入你的markdown内容。本插件会替换形如`{{.xxx}}`或`${xxx}`的参数为`xxx`。<br>本插件提供的参数有`command`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)'),
        raw_markdown_button_keyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse()
          .default(`{
    "rows": [
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "再来一张😺",
                        "style": 2
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/\${command}",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "返回列表😽",
                        "style": 2
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/\${config.emojihub_bili_command}",
                        "enter": true
                    }
                }
            ]
        }
    ]
}`)
          .description('实现QQ官方bot的按钮效果<br>在这里填入你的按钮内容，注意保持json格式，推荐在编辑器中编辑好后粘贴进来'),
      }).collapse().description('➢表情包--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
      nestedlist: Schema.object({
        raw_markdown_button_content: Schema.string().role('textarea', { rows: [6, 6] }).collapse().default("## **表情包列表**\n### 😻列表如下：点击按钮触发哦！")
          .description('实现QQ官方bot的按钮效果，需要`canvas`服务。<br>在这里填入你的markdown内容。本插件会替换形如`{{.xxx}}`或`${xxx}`的参数为`xxx`。<br>本插件提供的参数有`command`、`img_pxpx`、`img_url`、`ctx`、`session`、`config`<br>`img_pxpx`会被替换为`img#...px #...px`<br>`img_url`会被替换为`一个链接`更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)'),
        raw_markdown_button_keyboard: Schema.string().role('textarea', { rows: [12, 12] }).collapse()
          .default(`{
    "rows": [
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "随机emojihub表情包",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/随机emojihub表情包",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "acomu414",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/acomu414",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "ba表情包",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/ba表情包",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "downvote",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/downvote",
                        "enter": true
                    }
                }
            ]
        },
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "doro",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/doro",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "eveonecat",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/eveonecat",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "fufu",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/fufu",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "mygo",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/mygo",
                        "enter": true
                    }
                }
            ]
        },
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "seseren",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/seseren",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "白圣女",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/白圣女",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "白圣女漫画",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/白圣女漫画",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "柴郡",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/柴郡",
                        "enter": true
                    }
                }
            ]
        },
        {
            "buttons": [
                {
                    "render_data": {
                        "label": "初音Q版",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/初音Q版",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "甘城猫猫",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/甘城猫猫",
                        "enter": true
                    }
                },
                {
                    "render_data": {
                        "label": "疾旋鼬",
                        "style": 1
                    },
                    "action": {
                        "type": 2,
                        "permission": {
                            "type": 2
                        },
                        "data": "/疾旋鼬",
                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "流萤",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/流萤",\n                        "enter": true\n                    }\n                }\n            ]\n        },\n        {\n            "buttons": [\n                {\n                    "render_data": {\n                        "label": "赛马娘",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/赛马娘",\n                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "瑟莉亚",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/瑟莉亚",\n                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "藤田琴音",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/藤田琴音",\n                        "enter": true\n                    }\n                },\n                {\n                    "render_data": {\n                        "label": "亚托莉",\n                        "style": 1\n                    },\n                    "action": {\n                        "type": 2,\n                        "permission": {\n                            "type": 2\n                        },\n                        "data": "/亚托莉",\n                        "enter": true\n                    }\n                }\n            ]\n        }
    ]\n}`)
          .description('实现QQ官方bot的按钮效果<br>在这里填入你的按钮内容，注意保持json格式，推荐在编辑器中编辑好后粘贴进来'),
      }).collapse().description('➣表情包列表--按钮设置<br>更多说明，详见[➩项目README](https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/emojihub-bili)<hr style="border: 2px solid red;"><hr style="border: 2px solid red;">'),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    LocalSendNetworkPicturesList: Schema.string().role('textarea', { rows: [2, 4] }).description('将`下列指令`对应的内容下载至本地，作为本地图片发送<br>请使用逗号分隔指令').default("").experimental(),
    deletePictime: Schema.number().default(10).description('若干`秒`后 删除下载的本地临时文件').experimental(),
    localPicToBase64: Schema.boolean().description("`开启后`本地图片以base64发出 `日常使用无需开启，且不建议发送markdown的时候使用（直接发图还是可以考虑的）`").experimental().default(false),
    QQPicToChannelUrl: Schema.boolean().description("`开启后`， `img_url`会先上传QQ频道，拿到频道URL，用于发送markdown<br>被动md需要URL白名单，仅对原生发本地文件夹的图有意义。").experimental().default(false),
    QQchannelId: Schema.string().description('`填入QQ频道的频道ID`，将该ID的频道作为中转频道 <br> 频道ID可以用[inspect插件来查看](/market?keyword=inspect) `频道ID应为纯数字`').experimental().pattern(/^\S+$/),
  }).description('调试选项'),

  Schema.object({
    consoleinfo: Schema.boolean().default(false).description("日志调试模式`日常使用无需开启`"),
  }).description('日志调试选项'),
  Schema.union([
    Schema.object({
      consoleinfo: Schema.const(true).required(),
      allfileinfo: Schema.boolean().description("输出allfile调试内容`MoreEmojiHubList 列表详细内容`"),
    }),
    Schema.object({})
  ]),
]) as any;