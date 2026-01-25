# koishi-plugin-automation-console

[![npm](https://img.shields.io/npm/v/koishi-plugin-automation-console?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-automation-console)

**Automation Console** - 通过指令自动化操作 Koishi 控制台

## 主要功能

- **配置插件** - 搜索并操作插件（启用/停用、重命名、移除等）
- **软重启** - 重启 Koishi 控制台
- **小火箭更新依赖** - 一键更新所有依赖
- **查看日志** - 截图查看最新日志

## 注意事项

- 需要安装并配置 `puppeteer` 插件
- 如需插件市场搜索功能，请使用 [koishi-plugin-screenshot-console](https://www.npmjs.com/package/koishi-plugin-screenshot-console)
- 开启 `enable_auth` 时请确保用户名密码正确
- 使用指令前请确认权限等级与 `command_authority` 是否匹配

## 许可证

MIT License
