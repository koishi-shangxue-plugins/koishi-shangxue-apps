---

## 使用指南

开启插件之后，[请前往这里](/dialogue-webui) 进行问答设置。

---

## 注意事项

1. 【回复内容】支持使用js变量
比如

```md
你好啊！{{h.at(session.userId)}} ~
```

支持访问的变量有：`ctx`、 `config`、 `h`、 `session`

1. 作用范围的【群组ID】【用户ID】支持使用逗号分隔多个ID。
（支持全角、半角逗号）
比如【群组ID】

```md
#,123456,114514
```

---

## 所需依赖

'database'、'console'、'server'、'logger'

---
