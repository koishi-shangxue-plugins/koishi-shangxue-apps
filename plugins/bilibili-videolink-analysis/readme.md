# koishi-plugin-bilibili-videolink-analysis

[![npm](https://img.shields.io/npm/v/koishi-plugin-bilibili-videolink-analysis?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bilibili-videolink-analysis)

## Bilibili 视频链接解析插件说明 📺✨

本插件为用户提供便捷的视频链接解析服务，让聊天体验更加丰富多彩。

---

**使用协议**

本插件为第三方提供的解析服务，解析结果仅供娱乐。

使用本插件解析的任何链接所引起的问题，包括但不限于数据准确性、版权问题等，均与本插件开发者无关。

用户在使用本插件解析链接时应自行承担风险，并需遵守相关法律法规及平台规定。

本插件开发者不对由于使用本插件而引起的任何直接或间接损失承担责任。

如有任何疑问或建议，请联系插件开发者。

email：<1919892171@qq.com>

---

**特别提醒**

请注意，对于B站的大会员专属视频和付费视频/充电专属视频，本插件暂不支持使用登录账号的cookie来获取视频内容。

这意味着，本插件目前无法解析或提供此类视频的观看服务。

如果您尝试解析这类视频，会收到错误提示或无法获取视频信息。

我们建议您直接在B站官网来观看这些视频。

---

## 📌 链接信息解析设置

### 基础设置

| 设置项                  | 描述                                                                 | 默认值                     |
| ----------------------- | -------------------------------------------------------------------- | -------------------------- |
| `waitTip_Switch`        | 是否返回等待提示语句。开启后，会发送自定义的等待提示语。             | 不返回文字提示             |
| `linktextParsing`       | 是否返回视频图文数据。开启后，发送视频数据的图文解析。               | `true`                     |
| `VideoParsing_ToLink`   | 是否返回视频/视频直链。可以选择不同的返回策略。                      | 仅返回视频                 |
| `Video_ClarityPriority` | 发送视频时清晰度的优先策略。                                         | 低清晰度优先               |
| `BVnumberParsing`       | 是否允许根据独立的BV号解析视频。开启后，可以通过视频的BV号解析视频。 | `true`                     |
| `Maximumduration`       | 允许解析的视频最大时长（分钟）。超过此时长则不会发送视频。           | `25`                       |
| `Maximumduration_tip`   | 对过长视频的文字提示内容。                                           | 视频太长啦！还是去B站看吧~ |
| `MinimumTimeInterval`   | 若干秒内不再处理相同链接，防止多bot互相触发导致的刷屏/性能浪费。     | `180`秒                    |

### 链接的图文解析设置

| 设置项               | 描述                                              | 默认值  |
| -------------------- | ------------------------------------------------- | ------- |
| `parseLimit`         | 单对话多链接解析上限。                            | `3`     |
| `useNumeral`         | 是否使用格式化数字。                              | `true`  |
| `showError`          | 当链接不正确时提醒发送者。                        | `false` |
| `bVideoIDPreference` | ID偏好，选择视频ID类型，BV号或AV号。              | `"bv"`  |
| `bVideoImage`        | 是否显示视频封面。                                | `true`  |
| `bVideoOwner`        | 是否显示视频UP主信息。                            | `true`  |
| `bVideoDesc`         | 是否显示视频简介。                                | `false` |
| `bVideoStat`         | 是否显示视频状态（如三连数据）。                  | `true`  |
| `bVideoExtraStat`    | 是否显示额外状态（如弹幕和观看人数）。            | `true`  |
| `bVideoShowLink`     | 是否显示视频链接。开启可能会导致其他bot循环解析。 | `false` |

### 调试设置

| 设置项       | 描述                                     | 默认值                 |
| ------------ | ---------------------------------------- | ---------------------- |
| `userAgent`  | 所有API请求所用的User-Agent。            | 默认的User-Agent字符串 |
| `loggerinfo` | 是否开启日志调试输出。日常使用无需开启。 | `false`                |

---

## 交互示例

基本上用户需要像这样交互

---

```log
用户：

看看看，这个视频好有趣啊！【Omg it's 金钱焊机（完整版）】 https://www.bilibili.com/video/BV1ii421Q7oj
```

```log
机器人：（如果有开启相关配置项）

等待提示的文字
```

```log
机器人： （如果有开启相关配置项）

UP主： 我王小桃要上一档
金钱焊机纯享版：BV1T142197Ai
原音频：https://www.youtube.com/watch?v=Xu4ZLNfiTq8&feature=youtu.be
好听~~~~
点赞：1.1万  投币：1226
收藏：4973  转发：1703
https://www.bilibili.com/video/BV1ii421Q7oj
```

```log
机器人：（如果有开启相关配置项）

视频内容
```

其实不止链接，在实际的聊天平台中，例如onebot平台，如果用户发送的是bilibili小程序卡片，也是可以解析的哦~

## BV号解析设置说明

有关配置项内容`BV号解析设置`，

如果开启了`BV号解析`，那么可以通过一个`独立的BV号`解析一个视频。

- 注意：仅会处理独立的 BV 号，而不会处理被包含在其他字符中的 BV 号

例如：

- 输入 `BV1pG411p7qj`

  - `正常解析视频 https://www.bilibili.com/video/BV1pG411p7qj`

- 输入 `你们快看这个视频  BV1pG411p7qj`

  - `正常解析视频 https://www.bilibili.com/video/BV1pG411p7qj`

- 输入 `你们快看这个视频  BV1pG411p7qj  这个真的好好看`

  - `正常解析视频 https://www.bilibili.com/video/BV1pG411p7qj`

- 输入 `123456BV18y411h7Sh`

  - `不解析`

- 输入 `*/BV1pG411p7qj--`

  - `不解析`

- 输入 `BV18y411h7Sh123465789`

  - `不解析`

- 输入 `你们快看这个视频BV1pG411p7qj这个真的好好看`

  - `不解析`

- 输入 `你们快看这个视频  BV1pG411p7qj这个真的好好看`

  - `不解析`

---

## 鸣谢 💖

特别鸣谢以下项目的支持：

- [@summonhim/koishi-plugin-bili-parser](https://www.npmjs.com/package/@summonhim/koishi-plugin-bili-parser)
- [koishi-plugin-iirose-media-request](https://www.npmjs.com/package/koishi-plugin-iirose-media-request)

感谢您使用我们的插件，尽情体验吧！
