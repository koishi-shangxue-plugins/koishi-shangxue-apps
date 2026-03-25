# @shangxueink/koishi-plugin-qq-markdown-button

[![npm](https://img.shields.io/npm/v/@shangxueink/koishi-plugin-qq-markdown-button?style=flat-square)](https://www.npmjs.com/package/@shangxueink/koishi-plugin-qq-markdown-button)

QQ 官方机器人 Markdown / 按钮模板插件。

## 模板类型说明

本插件现在把模板分成 4 类：

1. `json` 对应【按钮模板】
2. `markdown` 对应【被动markdown模板】
3. `raw` 对应【原生markdown模板】
4. `raw-without-keyboard` 对应【原生markdown（无按钮）模板】

目录对应关系如下：

- `json/*.json`：按钮模板
- `markdown/*.json`：被动markdown模板
- `raw/*.json + raw/*.md`：原生markdown模板，只有同名 `.json` 和 `.md` 成对出现时，才会被识别为可选模板

默认会生成这些示例模板：

- `json/json.json`
- `markdown/markdown.json`
- `raw/raw-markdown.json`
- `raw/raw-markdown.md`
- `raw/raw-without-keyboard.json`
- `raw/raw-without-keyboard.md`

## QQ DAU 说明

按你当前常用的 QQ 平台能力划分，可以这样理解：

- `0 ~ 2k DAU`：只能使用【按钮模板】
- `2k ~ 1w DAU`：可以使用【按钮模板】和【被动markdown模板】
- `1w+ DAU`：可以使用【按钮模板】、【被动markdown模板】和【原生markdown模板】

最近 QQ 官方放开了部分原生 MD 权限，新增了一种没有按钮的原生 Markdown 用法，这里统一称作：

- `raw-without-keyboard`

它可以理解为：

- 【原生markdown模板】去掉按钮后的版本
- 没有 json 键盘
- 仍然是原生 Markdown 内容

## 使用方式

### 第一步：先启用插件

插件启用后会做两件事：

- 在你配置的 `file_name` 目录下生成默认模板文件
- 扫描本地模板目录，加载 `send_sequence` 的候选项

如果插件还没启用，`send_sequence` 里不会出现完整的候选列表，这是正常现象。

### 第二步：编辑模板文件

模板 ID 不再写在 Koishi 配置项里，而是直接写在模板文件里。

也就是说：

- 按钮模板里的按钮模板 ID，直接改 `json/*.json`
- 被动markdown模板里的 markdown 模板 ID，直接改 `markdown/*.json`

这样编辑多个模板时，不需要在 WebUI 和编辑器之间来回切换。

### 第三步：配置 `send_sequence`

`send_sequence` 用来按顺序发送多个模板。

候选值格式是：

- `json/xxx`
- `markdown/xxx`
- `raw/xxx`

例如：

- `json/json`
- `markdown/markdown`
- `raw/raw-markdown`
- `raw/raw-without-keyboard`

其中 `raw/xxx` 只有在 `raw/xxx.json` 和 `raw/xxx.md` 同时存在时才会出现。

## 推荐方案

目前推荐两种方案。

### 方案一：只发一条 `raw-without-keyboard`

`send_sequence` 只添加一行：

- `raw/raw-without-keyboard`

这样就可以直接通过指令发送【原生markdown（无按钮）模板】。

### 方案二：先发 `raw-without-keyboard`，再发 `json`

`send_sequence` 添加两行：

1. `raw/raw-without-keyboard`
2. `json/json`

这个方案的优点是：

- 不需要 DAU 也能先发原生 Markdown 内容
- 只要申请到高阶能力，就可以继续衔接【按钮模板】
- 用户先看到原生 Markdown，再立即收到按钮，交互会更顺手

## `raw-without-keyboard` 默认内容

`raw/raw-without-keyboard.json`

```json
{
  "msg_type": 2,
  "msg_id": "${session.messageId}",
  "event_id": "${INTERACTION_CREATE}",
  "markdown": {
    "content": "${markdown}"
  }
}
```

`raw/raw-without-keyboard.md`

```md
# 你好啊

这是第一个markdown消息哦~
```

## 变量替换

模板文件里支持这些占位符：

- `${session.messageId}`
- `${INTERACTION_CREATE}`
- `${markdown}`
- `${0}`、`${1}`、`${2}`...

## NPM

详细更新和安装方式请查看：

- [https://www.npmjs.com/package/@shangxueink/koishi-plugin-qq-markdown-button](https://www.npmjs.com/package/@shangxueink/koishi-plugin-qq-markdown-button)
