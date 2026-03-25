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

- 在你配置的 `file_name_v2` 目录下生成默认模板文件
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
- `raw/raw_markdown`
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

---
---
---

## 关于 `msg_id` 和 `event_id`

在 JSON 配置文件中，你会看到：

```json
{
  "msg_id": "${session.messageId}",
  "event_id": "${INTERACTION_CREATE}"
}
```

说明如下：

- `msg_id`：用于被动消息回复
- `event_id`：用于交互事件场景

这两个字段在实际发送时是互斥的，本插件会根据会话情况自动删除不需要的字段。

## 变量替换

模板文件里支持这些占位符：

- `${session.messageId}`
- `${INTERACTION_CREATE}`
- `${markdown}`
- `${0}`、`${1}`、`${2}`...

## 示例配置

### 默认 JSON 按钮模板示例

以下是一个默认的 JSON 按钮指令按钮模板示例。

用于申请 QQ 开放平台的 json 按钮模板，或者用于原生 markdown 按钮。

<details>
<summary>点击此处————查看源码</summary>

```json
{
  "rows": [
    {
      "buttons": [
        {
          "render_data": {
            "label": "再来一张😽",
            "style": 2
          },
          "action": {
            "type": 2,
            "permission": {
              "type": 2
            },
            "data": "/再来一张",
            "enter": true
          }
        },
        {
          "render_data": {
            "label": "随机一张😼",
            "style": 2
          },
          "action": {
            "type": 2,
            "permission": {
              "type": 2
            },
            "data": "/随机表情包",
            "enter": true
          }
        }
      ]
    },
    {
      "buttons": [
        {
          "render_data": {
            "label": "返回列表😸",
            "style": 2
          },
          "action": {
            "type": 2,
            "permission": {
              "type": 2
            },
            "data": "/表情包列表",
            "enter": true
          }
        }
      ]
    }
  ]
}
```

以下是本插件的 JSON 按钮类型配置文件 `json/json.json` 示例：

```json
{
  "msg_id": "${session.messageId}",
  "event_id": "${INTERACTION_CREATE}",
  "msg_type": 2,
  "content": "",
  "keyboard": {
    "id": "引号内容请修改为你的json模板ID"
  }
}
```

</details>

---

### 默认 Markdown 模板示例

以下是一个默认的 Markdown 模板示例。

用于申请 QQ 开放平台的被动 markdown 模板。

<details>
<summary>点击此处————查看源码</summary>

```markdown
{{.text1}}
{{.text2}}
{{.img}}{{.url}}
```

**配置模板参数示例：**

| 参数 | 示例值 |
| --- | --- |
| `text1` | 这是第一段文字 |
| `text2` | 这是第二段文字 |
| `img` | `![img]` |
| `url` | `(https://koishi.chat/logo.png)` |

</details>

以下是本插件的 Markdown 模板类型配置文件 `markdown/markdown.json` 示例：

<details>
<summary>点击此处————查看源码</summary>

```json
{
  "msg_type": 2,
  "msg_id": "${session.messageId}",
  "event_id": "${INTERACTION_CREATE}",
  "markdown": {
    "custom_template_id": "引号内容请修改为你的markdown模板ID",
    "params": [
      {
        "key": "text1",
        "values": [
          "第一个文字参数"
        ]
      },
      {
        "key": "text2",
        "values": [
          "第二个文字参数"
        ]
      },
      {
        "key": "img",
        "values": [
          "![img#338px #250px]"
        ]
      },
      {
        "key": "url",
        "values": [
          "(https://i0.hdslb.com/bfs/note/457c42064e08c44ffef1b047478671db3f06412f.jpg)"
        ]
      }
    ]
  },
  "keyboard": {
    "id": "引号内容请修改为你的json模板ID"
  }
}
```

</details>

---

### 默认原生 Markdown 示例

以下是一个默认的原生 Markdown 类型示例。

<details>
<summary>点击此处————查看源码</summary>

**JSON 配置文件 `raw/raw_markdown.json`：**

```json
{
  "msg_type": 2,
  "msg_id": "${session.messageId}",
  "event_id": "${INTERACTION_CREATE}",
  "markdown": {
    "content": "${markdown}"
  },
  "keyboard": {
    "content": {
      "rows": [
        {
          "buttons": [
            {
              "render_data": {
                "label": "再来一次",
                "style": 2
              },
              "action": {
                "type": 2,
                "permission": {
                  "type": 2
                },
                "data": "${config.command_name}",
                "enter": true
              }
            }
          ]
        }
      ]
    }
  }
}
```

**Markdown 文件 `raw/raw_markdown.md`：**

```markdown
# 你好啊

这是一个 markdown 消息哦~
```

</details>

---

### 默认原生 Markdown（无按钮）示例

以下是 `raw-without-keyboard` 的默认示例。

<details>
<summary>点击此处————查看源码</summary>

**JSON 配置文件 `raw/raw-without-keyboard.json`：**

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

**Markdown 文件 `raw/raw-without-keyboard.md`：**

```markdown
# 你好啊

这是第一个markdown消息哦~
```

</details>

---

## NPM

详细更新和安装方式请查看：

- [https://www.npmjs.com/package/@shangxueink/koishi-plugin-qq-markdown-button](https://www.npmjs.com/package/@shangxueink/koishi-plugin-qq-markdown-button)

## 许可证

本项目采用 `MIT` 许可证。
