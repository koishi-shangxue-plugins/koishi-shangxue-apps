// src/config.ts

import { Schema } from 'koishi';

// 指令名称列表的类型
interface CommandList {
  command: string;
  command1: string;
  command2: string;
  command3: string;
  command4: string;
  command5: string;
  command6: string;
  command7: string;
  command8: string;
  command9: string;
}

// 概率配置项的类型
interface RateConfigItem {
  minlength: number;
  maxlength: number;
  rate: number;
}

// 权限范围的类型
type PermissionScope = 'all' | 'admin' | 'owner' | 'owner_admin' | 'onlybotowner' | 'onlybotowner_admin_owner';

// 插件主配置接口
export interface Config {
  useCustomFont: boolean;
  font?: string;
  commandList: CommandList;
  randomdrawing: '1' | '2' | '3';
  milliliter_range: number[];
  duelLossCurrency: number;
  maintenanceCostPerUnit: number;
  currency: string;
  duelWinRateFactor: RateConfigItem[];
  exerciseCooldownTime: number;
  imagemode: boolean;
  notallowtip: boolean;
  onlybotowner_list: string[];
  permissionScope: PermissionScope;
  enableAllChannel: boolean;
  leaderboardPeopleNumber: number;
  duelLossReductionRange: number[];
  duelWinGrowthRange: number[];
  duelWinRateFactor2: number;
  duelCooldownTime: number;
  exerciseLossReductionRange: number[];
  exerciseRate: RateConfigItem[];
  loggerinfo: boolean;
  defaultLength: number[];
  exerciseWinGrowthRange: number[];
}

// 插件使用说明
export const usage = `
<h2><a href="https://www.npmjs.com/package/koishi-plugin-impart-pro" target="_blank">点我查看完整README</a></h2>
<hr>
<table>
<thead>
<tr>
<th>指令</th>
<th>说明</th>
</tr>
</thead>
<tbody>
<tr>
<td>开导 [@某人]</td>
<td>长牛牛</td>
</tr>
<tr>
<td>决斗 [@某人]</td>
<td>战斗！爽~</td>
</tr>
<tr>
<td>重开牛牛</td>
<td>牛牛很差怎么办？稳了！直接重开！</td>
</tr>
<tr>
<td>牛牛排行榜</td>
<td>查看牛牛排行榜</td>
</tr>
<tr>
<td>看看牛牛 [@某人]</td>
<td>查询自己或者别人牛牛数据</td>
</tr>
<tr>
<td>锁牛牛 [@某人]</td>
<td>开启/关闭 某人/某频道 的牛牛大作战</td>
</tr>
</tbody>
</table>
<hr>
<h3>配置项里有 形如 10 ± 45% 的数值</h3>
<p>举例说明：<br>
每次锻炼成功后，牛牛长度的增长范围。<br>
以默认值 <code>[10, 45]</code> 为例，表示成功锻炼后牛牛长度增长的基数为 10 厘米，同时允许有 ±45% 的浮动：</p>
<ul>
<li><strong>最大值</strong>: 10 + 10 × 0.45 = 14.5 厘米</li>
<li><strong>最小值</strong>: 10 - 10 × 0.45 = 5.5 厘米</li>
</ul>
<p>因此，锻炼成功时，牛牛的长度会在 5.5 厘米到 14.5 厘米之间随机增长。</p>
<hr>
本插件的排行榜用户昵称可以通过 [callme](/market?keyword=callme) 插件自定义
在未指定 callme 插件的名称的时候，默认使用 适配器的 username，或者userid
---
必需服务：i18n 
必需服务：database 
必需服务：monetary 
可选服务：puppeteer 
---
`;

// 插件配置的 Schema 定义
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    commandList: Schema.object({
      command: Schema.string().default("impartpro").description("父级 指令名称"),
      command1: Schema.string().default("注入").description("注入 指令名称"),
      command2: Schema.string().default("保养").description("保养 指令名称"),
      command3: Schema.string().default("开导").description("开导 令名称"),
      command4: Schema.string().default("牛牛决斗").description("牛牛决斗 指令名称"),
      command5: Schema.string().default("重开牛牛").description("重开牛牛 指令名称"),
      command6: Schema.string().default("注入排行榜").description("注入排行榜 指令名称"),
      command7: Schema.string().default("牛牛排行榜").description("牛牛排行榜 指令名称"),
      command8: Schema.string().default("看看牛牛").description("看看牛牛 指令名称"),
      command9: Schema.string().default("锁牛牛").description("锁牛牛 指令名称"),
    }).collapse().description("指令名称列表<br>自定义指令名称"),
  }).description('指令名称设置'),

  Schema.object({
    defaultLength: Schema.tuple([Number, Number]).description("【初始生成】的牛牛长度（cm）<br>右侧代表最大的偏差百分比（%）（默认在 18 ± 45%）").default([18, 45]),
    exerciseRate: Schema.array(Schema.object({
      minlength: Schema.number().description('区间最小值'),
      maxlength: Schema.number().description('区间最大值'),
      rate: Schema.number().description('成功概率'),
    })).role('table').description("【锻炼成功】每个长度段位对应的概率。<br>找不到对应区间的时候，默认成功率为 50%").default([
      { "rate": 100, "maxlength": 0, "minlength": -999999999999 },
      { "minlength": 0, "maxlength": 100, "rate": 80 },
      { "minlength": 100, "maxlength": 300, "rate": 70 },
      { "minlength": 300, "maxlength": 500, "rate": 60 },
      { "minlength": 500, "maxlength": 1000, "rate": 50 },
      { "minlength": 1000, "maxlength": 2000, "rate": 40 },
      { "minlength": 2000, "maxlength": 10000, "rate": 30 },
      { "minlength": 10000, "maxlength": 50000, "rate": 20 },
      { "minlength": 50000, "maxlength": 100000, "rate": 10 },
      { "minlength": 100000, "maxlength": 999999999999, "rate": 0 }
    ]),
    exerciseWinGrowthRange: Schema.tuple([Number, Number]).description("【锻炼成功】增长的牛牛长度（cm）<br>右侧代表最大的偏差百分比（%）（默认在 10 ± 45%）").default([10, 45]),
    exerciseLossReductionRange: Schema.tuple([Number, Number]).description("【锻炼失败】减少的牛牛长度（cm）<br>右侧代表最大的偏差百分比（%）（默认在 12 ± 45%）").default([12, 45]),
    exerciseCooldownTime: Schema.number().min(0).max(86400).step(1).default(5).description("【锻炼牛牛】间隔休息时间（秒）"),
  }).description('牛牛设置'),

  Schema.object({
    duelWinRateFactor: Schema.array(Schema.object({
      minlength: Schema.number().description('区间最小值'),
      maxlength: Schema.number().description('区间最大值'),
      rate: Schema.number().description('成功概率'),
    })).role('table').description("【获胜概率 和 牛子长度】之间的关联性。<br>双方牛子长度【差值的绝对值】越大，获胜概率越小").default([
      { "rate": 100, "maxlength": 10, "minlength": 0 },
      { "minlength": 10, "maxlength": 50, "rate": 80 },
      { "minlength": 50, "maxlength": 100, "rate": 60 },
      { "minlength": 100, "maxlength": 300, "rate": 40 },
      { "minlength": 300, "maxlength": 1000, "rate": 20 },
      { "minlength": 1000, "maxlength": 999999999999, "rate": 0 }
    ]),
    duelWinRateFactor2: Schema.number().role('slider').min(-100).max(100).step(1).default(-10).description("【获胜概率 和 牛子长度】之间的额外概率。<br>其实就是为某一方单独加一点概率<br>为0时，双方概率按上表。<br>为100时，较长的一方必胜。<br>为-100时，较短的一方必胜。"),
    duelWinGrowthRange: Schema.tuple([Number, Number]).description("【决斗胜利】增长长度（cm）<br>右侧代表最大的偏差百分比（%）（默认在 10 ± 50%）").default([10, 50]),
    duelLossReductionRange: Schema.tuple([Number, Number]).description("【决斗失败】减少长度（cm）<br>右侧代表最大的偏差百分比（%）（默认在 15 ± 50%）").default([15, 50]),
    duelCooldownTime: Schema.number().min(0).step(1).default(15).description("【决斗】间隔休息时间（秒）"),
    duelLossCurrency: Schema.number().role('slider').min(0).max(100).step(1).default(80).description("【决斗】战败方，缩短长度转化为【货币】的比率（百分比）"),
  }).description('对决设置'),

  Schema.object({
    randomdrawing: Schema.union([
      Schema.const('1').description('仅在本群（可能会抽到已经退群的人）'),
      Schema.const('2').description('所有用户（可能遇到不认识的哦）'),
      Schema.const('3').description('必须输入用户（@用户）'),
    ]).role('radio').description('`注入`指令 的 随机抽取时的范围').default("1"),
    milliliter_range: Schema.tuple([Number, Number]).description("注入毫升数的范围<br>默认`10 ± 100%`，即 0 ~ 20 mL").default([10, 100]),
  }).description('注入功能设置'),

  Schema.intersect([
    Schema.object({
      imagemode: Schema.boolean().description('开启后，排行榜将使用 puppeteer 渲染图片发送').default(true),
      leaderboardPeopleNumber: Schema.number().description('排行榜显示人数').default(15).min(3),
      enableAllChannel: Schema.boolean().description('开启后，排行榜将展示全部用户排名`关闭则仅展示当前频道的用户排名`').default(false),
      useCustomFont: Schema.boolean().description('是否为排行榜图片启用自定义字体').default(false),
    }),
    Schema.union([
      Schema.object({
        useCustomFont: Schema.const(true).required(),
        font: Schema.dynamic('glyph.fonts').description('选择用于渲染排行榜图片的字体。需要安装 `koishi-plugin-glyph` 插件才能使用此功能。'),
      }),
      Schema.object({
        useCustomFont: Schema.const(false),
      }),
    ]),
  ]).description('排行设置'),

  Schema.object({
    permissionScope: Schema.union([
      Schema.const('all').description('所有用户'),
      Schema.const('admin').description('仅管理员'),
      Schema.const('owner').description('仅群主'),
      Schema.const('owner_admin').description('仅管理员 + 群主'),
      Schema.const('onlybotowner').description('仅下面的名单可用（onlybotowner_list）'),
      Schema.const('onlybotowner_admin_owner').description('onlybotowner_list + 管理员 + 群主'),
    ]).role('radio').description('允许使用【开始银趴/结束银趴】的人（需要适配器支持获取群员角色）').default("owner_admin"),
    onlybotowner_list: Schema.array(String).role('table').description('允许使用【开始银趴/结束银趴】的用户ID').default(["114514"]),
    notallowtip: Schema.boolean().description('当禁止的对象尝试触发<br>开启后。对禁止的玩家/频道发送提示语<br>关闭，则不做反应').default(false),
  }).description('管理设置'),

  Schema.object({
    currency: Schema.string().default('default').description('monetary 数据库的 currency 字段名称'),
    maintenanceCostPerUnit: Schema.number().role('slider').min(0).max(1).step(0.01).default(0.1).description("【保养】钱币与长度的转化比率。0.1则为`10:1`，十个货币换 1 cm"),
  }).description('monetary·通用货币设置'),

  Schema.object({
    loggerinfo: Schema.boolean().description('debug日志输出模式').default(false),
  }).description('调试设置'),
]);