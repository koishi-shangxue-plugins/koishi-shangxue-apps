# koishi-plugin-deer-pipe

[![npm](https://img.shields.io/npm/v/koishi-plugin-deer-pipe?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-deer-pipe)

## 📖 介绍

一个🦌管签到小插件

> ➡️ 源想法和代码都来自这两个项目：
>
> <https://github.com/SamuNatsu/nonebot-plugin-deer-pipe>
>
> <https://gitee.com/kyrzy0416/yunzai-plugin-deer-pipe/tree/master>
>
> ⚠️ 注：我们只是大自然的搬运工

## 📸 效果展示

![img](https://i0.hdslb.com/bfs/article/496e02d92547d2a74c17ff9280e8ab55312276085.png)

## 📦 命令合集

<details>
<summary>详细的命令合集列表 </summary>
<h3>签到</h3>
<ul>
<li><strong>指令</strong>: <code>🦌 [艾特用户]</code> 或 <code>鹿管 [艾特用户]</code></li>
<li><strong>作用</strong>: 签到当天。</li>
<li><strong>示例</strong>: <code>🦌</code>（自己签到） / <code>🦌 @猫猫</code>（帮他鹿）</li>
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

</body>
</html>
</details>

# 插件配置说明

<details>
<summary>详细的配置项功能列表 </summary>

该插件的配置项分为四大部分

## 1. 签到设置

- **`enable_deerpipe`**: 是否允许重复签到。  
- 说明: 开启后，允许用户多次签到。关闭后，用户只能签到一次。
- **`maximum_times_per_day`**: 每日签到次数上限。
- 说明: 用户每天最多签到的次数，最低设置为 2 次。
- **`enable_blue_tip`**: 是否开启补签提示。
- 说明: 开启后，签到时会加上【提示用户可以进行补签】的文字。

## 2. 排行榜设置

- **`leaderboard_people_number`**: 排行榜显示人数。
- 类型: `number`
- 默认值: `15`
- 说明: 排行榜上展示的用户数量，最低可以设置为 3。
- **`enable_allchannel`**: 是否展示全频道用户排名。
- 类型: `boolean`
- 默认值: `false`
- 说明: 开启后，排行榜将展示所有频道用户的排名。关闭后，仅展示当前频道用户排名。
- **`Reset_Cycle`**: 排行榜重置周期。
- 类型: `string`
- 可选值: `每月` 或 `不重置`
- 默认值: `每月`
- 说明: 每月重置签到排行榜，重置后重新开始排名。如果选择“不重置”，则不会重置排行榜。

## 3. 货币设置

- **`currency`**: 货币单位名称。
- 类型: `string`
- 默认值: `deerpipe`
- 说明: 用于显示货币单位的字段，代表用户获得或花费的货币名称。
- **`cost.checkin_reward`**: 签到时的货币变动。
- 类型: `array`
- 说明: 该字段控制不同签到相关命令的货币奖励或扣除。每个命令对应的 `cost` 表示执行该命令时货币的增减。
- **`cost.store_item`**: 商店道具价格表。
- 类型: `array`
- 说明: 用户可以在商店中购买的道具及其对应的价格（以货币为单位）。

## 4. 调试设置

- **`calendarimage`**: 每日签到日历图像的 路径。
- 类型: `string`
- 说明: 用于显示每日签到的图片，需填入图片的 路径。
- **`loggerinfo`**: 是否启用 debug 日志模式。
- 类型: `boolean`
- 默认值: `false`
- 说明: 开启后，输出更多的 debug 日志信息，用于调试插件行为。

</details>

---

## monetary · 通用货币设置

这个配置项可以自定义 `monetary 的 currency 字段`

这是一个通用货币数据库，你可以让其他支持此功能的插件一起连通后互动数据。

如果你需要与  [koishi-plugin-monetary](https://www.npmjs.com/package/koishi-plugin-monetary) 插件联动

根据此插件的默认` currency `字段为 ` default `

那你需要修改本插件配置项为 ` default ` ， 然后重载本插件即可。

## calendarpngimagepath 配置项说明

这里需要填入一个图片的base64编码后的内容。

我们推荐你前往这里寻找PNG图片 -> <https://www.stickpng.com/zh>

在找到心仪的PNG图片后，

请把图片放到 koishi 的 `/data`这样的数据文件夹下，

以便`calendarpngimagepath`配置项可以选中

---

## 🚀 声明

- 文件借鉴了很多插件，精简个人认为可以精简的内容。
- 素材来源于网络，仅供交流学习使用
- 严禁用于任何商业用途和非法行为

## 注意事项

- 请根据你的需求调整配置项和数据库表结构。
- 如果遇到问题，请查看插件代码或寻求社区支持。
