# koishi-plugin-steam-friend-status-fork

[![npm](https://img.shields.io/npm/v/koishi-plugin-steam-friend-status-fork?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-steam-friend-status-fork)

自动播报好友steam状态插件

## 灵感来源

- [koishi-plugin-steam-friend-status](https://github.com/MomoiAiri/Koishi-Plugin-Steam-Friend-Status)

- [nonebot-plugin-steam-info](https://github.com/zhaomaoniu/nonebot-plugin-steam-info)

## 指令说明

| 指令                            | 功能说明                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 绑定steam <steam好友码/steamID> | 将用户的steam账号绑定至发送指令的群                                                                                                                                      |
| 绑定steam <steamID> @用户       | 为其他用户绑定steam账号至当前群                                                                                                                                          |
| 解绑steam                       | 解除用户在发送指令的群的绑定记录                                                                                                                                         |
| 解绑steam @用户                 | 为其他用户解绑当前群的steam账号                                                                                                                                          |
| 解绑全部steam                   | 解绑当前频道所有用户的steam账号                                                                                                                                          |
| steam信息                       | 返回用户自己的好友码和Steam ID                                                                                                                                           |
| steam信息 @用户                 | 查看其他用户的好友码和Steam ID                                                                                                                                           |
| 看看steam                       | 查看当前群所有绑定用户的状态                                                                                                                                             |
| steam群报 on/off                | 开启/关闭群播报功能，需要管理员权限，<span style="color:red">如果平台是`red`或者`chronocat`可能会因为无法获取到权限，需要手动在数据库的channel表中开启，默认`off</span>` |
| 更新steam                       | 更新所有绑定用户的头像                                                                                                                                                   |

## 配置说明

| 配置项             | 默认值 | 说明                                                                                                                               |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| SteamApiKey        | 无     | 用户查询信息的apikey，可以从 -> [这里](https://partner.steamgames.com/doc/webapi_overview/auth) 获取                               |
| interval           | 300    | 单位（秒），自动查询信息的时间间隔                                                                                                 |
| useSteamName       | true   | 播报时使用玩家昵称，false为QQ昵称，true为steam昵称 <span style="color:red">red/satori适配器暂时无法获取到用户昵称，建议打开</span> |
| broadcastWithImage | true   | 播报时附带好友列表图片，关闭可以减少因长图片导致的刷屏                                                                             |

## 其他说明

- 需要启用koishi的`puppeteer`功能才能正常加载，如需调整字体格式，可以在node_modules中找到插件的位置，修改`/css/steamFriendList.css`文件。
- 考虑到隐私，每个群的绑定信息独立，别人无法看到你在未绑定的群中的状态，因此需要再多个群使用时需要多次绑定
- 有时候提示绑定失败可能是因为网络原因导致没有将用户头像保存下来，实际上数据库中已经绑定，可使用`<steam更新>`指令来更新一次所有用户的头像
- 不支持QQ官方机器人
