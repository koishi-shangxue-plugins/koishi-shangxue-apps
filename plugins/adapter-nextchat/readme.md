# koishi-plugin-adapter-nextchat

[![npm](https://img.shields.io/npm/v/koishi-plugin-adapter-nextchat?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-adapter-nextchat)

NextChat 适配器 - 通过 NextChat 界面与 Koishi 对话

## 功能特性

- ✨ 支持 OpenAI API 格式，完全兼容 NextChat 客户端
- 🎨 提供友好的 Web 界面，一键跳转到 NextChat
- 🔐 支持多个 API Key 配置，可设置不同权限等级
- 🤖 支持多模型配置，可控制不同模型的消息渲染方式
- 📝 支持文本、图片、音频、视频、文件等多种消息类型
- 🔄 自动权限同步，根据 API Key 设置用户权限

## 安装

```bash
npm install koishi-plugin-adapter-nextchat
```

或在 Koishi 控制台的插件市场中搜索 `adapter-nextchat` 安装。

## 使用方法

### 1. 启用插件

在 Koishi 控制台中启用 `adapter-nextchat` 插件。

### 2. 配置插件

#### API 设置

- **API 路径**：默认为 `/nextchat/v1/chat/completions`
- **APIkey 权限设置**：配置多个 API Key 及其对应的权限等级（0-5）
- **模型配置**：配置可用的模型及其支持的消息元素类型

#### 模型配置说明

插件默认提供三种模型：

- **koishi**：支持所有消息类型（文本、图片、音频、视频、文件）
- **koishi-text**：仅支持文本消息
- **koishi-image**：支持文本和图片消息

你可以根据需要自定义模型配置，控制不同模型渲染的消息类型。

#### Session 设置

- **机器人 ID**：默认为 `nextchat`
- **机器人昵称**：默认为 `nextchat`
- **用户和机器人的头像**：设置头像 URL，用户和机器人都将使用此头像

#### WebUI 设置

- **NextChat webUI 的 URL 地址**：默认为 `https://chat.bailili.top/#/`

### 3. 访问 NextChat

启用插件后，有两种方式访问 NextChat：

#### 方式一：通过控制台入口（推荐）

在 Koishi 控制台侧边栏找到 **NextChat** 页面，点击即可打开配置好的 NextChat 界面。

#### 方式二：手动配置

在 NextChat 中手动配置以下信息：

1. **接口地址**：`http://你的服务器地址:端口/nextchat/v1/chat/completions`
   - 例如：`http://127.0.0.1:5140/nextchat/v1/chat/completions`

2. **API Key**：使用配置中的任意一个 API Key
   - 例如：`sk-fXzPq8rGjK5tLwMhN7bVcFdE2uIaYxS1oQp0iUjH6yT3eW`

3. **模型名称**：选择配置中的模型
   - 例如：`koishi`、`koishi-text`、`koishi-image`

### 4. 开始对话

配置完成后，在 NextChat 中发送消息，即可与 Koishi 机器人对话。

## 配置示例

```yaml
adapter-nextchat:
  path: /nextchat/v1/chat/completions
  APIkey:
    - token: sk-your-api-key-1
      auth: 5
    - token: sk-your-api-key-2
      auth: 3
  models:
    - modelname: koishi
      element:
        - text
        - image
        - img
        - audio
        - video
        - file
    - modelname: koishi-text
      element:
        - text
    - modelname: koishi-image
      element:
        - text
        - image
        - img
  selfId: nextchat
  selfname: Koishi
  selfavatar: https://avatars.githubusercontent.com/u/153288546
  NextChat_host: https://chat.bailili.top/#/
  loggerInfo: false
  loggerDebug: false
```

## 权限说明

- 权限等级范围：0-5
- 权限等级越高，用户在 Koishi 中的权限越高
- 使用不同的 API Key 登录，会自动同步对应的权限等级

## 注意事项

1. 确保 Koishi 服务器可以被 NextChat 访问
2. 如果使用 HTTPS，需要配置有效的 SSL 证书
3. API Key 请妥善保管，不要泄露给他人
4. 建议为不同用户配置不同的 API Key 和权限等级

## 许可证

MIT License

## 相关链接

- [Koishi 官网](https://koishi.chat/)
- [NextChat 项目](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web)
