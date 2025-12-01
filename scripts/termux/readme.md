# Koishi Manager for Termux

这是一个用于在 Termux 上管理 Koishi 实例的脚本工具。

通过这个工具，你可以轻松安装依赖、创建和管理 Koishi 实例。

现已加入 Koimux全家桶： -> https://github.com/initialencounter/koimux_bot/blob/master/script/koimuxTUI.sh

> 使用以下指令以运行！

```
 bash -c "$(curl -L https://gitee.com/initencunter/koimux_bot/raw/master/script/koimuxTUI.sh)"
```

> 本仓库是为了存放备份（？）

---

## 推荐环境

建议使用 **Zero Termux**，它提供了更好的 Termux 体验和快捷功能。

- 下载 Zero Termux：[GitHub 发布页](https://github.com/hanxinhao000/ZeroTermux/releases)

---

## 初始设置

1. **切换源**：
   - 打开 Zero Termux。
   - 按音量上键，进入 **Zero Termux 快捷交互菜单**。
   - 依次选择【切换源】→【清华源】。

2. **更新包管理器**：
   - 在 Termux 中运行以下命令：
     ```bash
     apt update -y
     ```

3. **安装 Koishi Manager**：
   - 运行以下命令下载并运行脚本：
     ```bash
     bash -c "$(curl -L https://raw.githubusercontent.com/koishi-shangxue-plugins/koishi-shangxue-apps/main/scripts/termux/koimuxTUI.sh)"
     ```

---

## 使用步骤

### 1. 安装依赖
- 在脚本的主菜单中，选择【1 安装依赖】。
- 依次安装所有依赖项（x11-repo、tur-repo、libexpat、chromium、ffmpeg、nodejs-lts 等）。

### 2. 创建 Koishi 实例
- 在主菜单中，选择【2 创建 Koishi 实例】。
- 推荐小白用户一路回车，使用默认选项。
- 完成创建后，Koishi 会自动启动，并在浏览器中打开 Web UI。

> **注意**：除非你需要多开实例，否则不要修改默认选项。如果多开实例，请确保实例目录名称唯一。

### 3. 实例目录
- Koishi 实例默认存储在 `~/koishi/*/` 目录下。
- 默认实例目录为 `~/koishi/koishi-app/`。

---

## 备份与恢复

### 首次创建后务必备份
1. **结束所有进程**：
   - 多次按下 `Ctrl + C`，确保所有 Koishi 进程已结束。

2. **备份实例**：
   - 按音量上键，进入 **Zero Termux 快捷交互菜单**。
   - 依次选择【备份/恢复】→【tar.gz】→【确定】。

---

## 再次启动 Koishi

1. **运行脚本**：
   - 运行以下命令：
     ```bash
     bash -c "$(curl -L https://raw.githubusercontent.com/koishi-shangxue-plugins/koishi-shangxue-apps/main/scripts/termux/koimuxTUI.sh)"
     ```

2. **管理实例**：
   - 在主菜单中，选择【3 管理 Koishi 实例】。
   - 选择对应的实例名称。
   - 选择【1 启动 Koishi (yarn start)】。

---

## 注意事项

- **确保网络畅通**：安装依赖和创建实例时需要联网。
- **备份数据**：定期备份 Koishi 实例，防止数据丢失。
- **多开实例**：如果需要多开实例，请确保实例目录名称唯一。

---

## 反馈与支持

如果遇到问题，请截图完整日志并反馈至项目仓库：
[GitHub Issues](https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/issues)
