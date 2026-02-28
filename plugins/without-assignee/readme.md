# koishi-plugin-without-assignee

[![npm](https://img.shields.io/npm/v/koishi-plugin-without-assignee?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-without-assignee)

## 功能说明

禁用 Koishi 的 assignee 机制，允许同一频道内的多个机器人同时响应无前缀指令。

### 什么是 assignee 机制？

默认情况下，当同一平台的同一频道内有多个机器人时，Koishi 会启用 assignee 机制：

- 只允许被分配的机器人（assignee）响应无前缀指令
- 其他机器人需要通过 `@机器人 指令` 的方式调用
- Koishi 会在数据库的 channel 表中记录 assignee 字段

### 插件作用

启用此插件后：

- 所有机器人都可以响应无前缀指令
- 不会修改数据库中的 assignee 值
- 仅在运行时临时绕过 assignee 检查

## 技术原理

插件通过监听 `attach-channel` 事件，在 Koishi 执行 assignee 检查之前，临时修改 `session.channel.assignee` 的值为当前机器人的 selfId，从而绕过检查。

## 许可证

MIT License
