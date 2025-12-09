# koishi-plugin-dialogue-webui

## 使用指南

开启插件之后，[请前往这里](/dialogue-webui) 进行问答设置。

## 效果预览

[-> 点我预览效果图1](https://i0.hdslb.com/bfs/openplatform/51e9d6494d7c7c8dbf011469e55ffdb660f77709.png)
[-> 点我预览效果图2](https://i0.hdslb.com/bfs/openplatform/65704a5debfae5d927f0ccc1a44ea6c805bf6596.png)

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
