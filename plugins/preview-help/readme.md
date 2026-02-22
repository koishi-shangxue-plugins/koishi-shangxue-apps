# koishi-plugin-preview-help

[![npm](https://img.shields.io/npm/v/koishi-plugin-preview-help?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-preview-help)

一个风格化、丝滑且可爱的 Koishi 图片菜单生成插件。

## 🎨 预览

<a href="https://i0.hdslb.com/bfs/openplatform/7cfeb33745f63bb290f4f50982d3a1d22aca644c.jpg" target="_blank">点我查看预览图</a>

## ⚙️ 配置项

| 配置项              | 类型       | 默认值             | 说明                             |
| :------------------ | :--------- | :----------------- | :------------------------------- |
| `commandName`       | `string`   | `preview-help`     | 触发图片菜单的指令名称           |
| `screenshotQuality` | `number`   | `80`               | 截图质量 (1-100)，仅对 JPEG 有效 |
| `excludeCommands`   | `string[]` | `['preview-help']` | 不希望在菜单图中显示的指令列表   |

## 💡 致谢

本插件的设计与实现参考了以下优秀项目：

- **UI 背景图灵感**：来自 [astrbot_plugin_custom_menu](https://github.com/shskjw/astrbot_plugin_custom_menu/tree/master)
- **功能设计灵感**：来自 [help-pro](https://github.com/initialencounter/2022-12-24/tree/neat/plugins/Manager/help-pro)
