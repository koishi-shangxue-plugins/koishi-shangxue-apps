# koishi-plugin-adapter-github

[![npm](https://img.shields.io/npm/v/koishi-plugin-adapter-github?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-adapter-github)

## 1. 生成 Personal Access Token (PAT)

为了让 Koishi 机器人能够代表你的 GitHub 账号进行操作（例如读取事件、发表评论），你需要创建一个 Personal Access Token。

![alt text](./readme/2026-02-11_14-43-48.png)

1. 访问 GitHub 的 [Personal Access Token 设置页面](https://github.com/settings/tokens)。
2. 点击右侧 **"Generate new token"**，然后从弹出的菜单中选择 **"Generate new token (classic) `For general use`"**。
3. 在 **"Note"** 字段中，为你的 Token 取一个容易识别的名字，例如 `koishi-bot-adapter-github-token`。
4. 在 **"Select scopes"** 部分，勾选以下权限：
    * `repo` (完全控制私有仓库)
    * `read:user` (读取用户信息)
    * `read:discussion` (读取 Discussions)
    * `write:discussion` (发表和修改 Discussions)
5. 点击页面底部的 **"Generate token"**。
6. **立即复制生成的 Token**。这个 Token 只会显示一次，请妥善保管。

---

## 2. 插件配置

在 Koishi 的插件市场中找到 `adapter-github` 并进行配置。

### 基础配置

* **`token`**: 粘贴你刚刚生成的 Personal Access Token
* **`repositories`**: 监听的仓库列表
  * **`owner`**: 仓库所有者的用户名或组织名
  * **`repo`**: 仓库名称

### 通信模式

#### Pull 模式（轮询模式）

适合没有公网 IP 或无法配置 Webhook 的场景。

* **`mode`**: 选择 `pull`
* **`interval`**: 轮询间隔（单位：秒，默认 60 秒）

#### Webhook 模式（推送模式）

实时性更好，推荐有公网 IP 的用户使用。

* **`mode`**: 选择 `webhook`
* **`webhookPath`**: Webhook 路径（默认 `/github/webhook`）
* **`webhookSecret`**: Webhook 密钥（可选，用于验证请求安全性）

**Webhook 配置步骤：**

![alt text](./readme/2026-02-11_15-34-09.png)

1. 在 GitHub 仓库设置中找到 **Settings** → **Webhooks** → **Add webhook**
2. 填写配置：
   * **Payload URL**: `http://你的服务器地址:端口/github/webhook`
   * **Content type**: 选择 `application/json`
   * **Secret**: 填写你在插件中配置的密钥（如果有）
   * **Which events would you like to trigger this webhook?**: 选择 `Let me select individual events`，勾选：
     * Issues
     * Issue comments
     * Pull requests
     * Pull request reviews
     * Pull request review comments
     * Discussions
     * Discussion comments
3. 点击 **Add webhook** 完成配置

---

### 高级配置

* **代理配置**
  * **`useProxy`**: 是否使用代理
  * **`proxyUrl`**: 代理地址（例如 `http://localhost:7890` 或 `socks://localhost:7897`）

* **调试设置**
  * **`loggerinfo`**: 开启后会输出详细的调试日志

### 多仓库支持

可以在"监听的仓库列表"中添加多个仓库，适配器会同时监听所有配置的仓库。

---

## GitHub 特殊事件

除了标准的 Koishi 消息事件，本适配器还会派发 GitHub 特有的事件，方便其他插件监听特定的 GitHub 操作。

### 事件列表

#### Issue 相关事件

* `github/issue` - 所有 Issue 事件
* `github/issue-opened` - Issue 被创建
* `github/issue-closed` - Issue 被关闭
* `github/issue-reopened` - Issue 被重新打开
* `github/issue-comment` - 所有 Issue 评论事件
* `github/issue-comment-created` - Issue 评论被创建

#### Pull Request 相关事件

* `github/pull-request` - 所有 PR 事件
* `github/pull-request-opened` - PR 被创建
* `github/pull-request-closed` - PR 被关闭
* `github/pull-request-reopened` - PR 被重新打开
* `github/pull-request-review-comment` - PR 审查评论

#### Discussion 相关事件

* `github/discussion` - 所有 Discussion 事件
* `github/discussion-created` - Discussion 被创建
* `github/discussion-comment` - Discussion 评论

#### 通用事件

* `github/event` - 所有 GitHub 事件（包含上述所有类型）

### 使用示例

```typescript
export function apply(ctx: Context) {
  // 监听 Issue 被创建事件
  ctx.on('github/issue-opened', (data) => {
    const { owner, repo, issue, actor } = data
    ctx.logger.info(`新 Issue: ${owner}/${repo}#${issue.number} - ${issue.title}`)
    ctx.logger.info(`创建者: ${actor.login}`)
  })

  // 监听 PR 被创建事件
  ctx.on('github/pull-request-opened', (data) => {
    const { owner, repo, pullRequest, actor } = data
    ctx.logger.info(`新 PR: ${owner}/${repo}#${pullRequest.number} - ${pullRequest.title}`)
  })

  // 监听所有 Issue 评论
  ctx.on('github/issue-comment', (data) => {
    const { owner, repo, issue, comment, action } = data
    ctx.logger.info(`Issue 评论 (${action}): ${owner}/${repo}#${issue.number}`)
    ctx.logger.info(`内容: ${comment.body}`)
  })

  // 监听所有 GitHub 事件
  ctx.on('github/event', (data) => {
    const { type, owner, repo, action } = data
    ctx.logger.info(`GitHub 事件: ${type} - ${owner}/${repo} (${action})`)
  })
}
```

### 事件数据结构

所有事件都包含以下基础字段：

```typescript
{
  owner: string          // 仓库所有者
  repo: string           // 仓库名称
  repoKey: string        // 完整仓库标识 (owner/repo)
  actor: object          // 触发事件的用户信息
  payload: object        // 原始事件载荷
  type: string           // 事件类型
  action: string         // 事件动作 (opened, closed, created 等)
  timestamp: number      // 事件时间戳
}
```

根据不同的事件类型，还会包含额外的字段：

* Issue 事件：`issue` 对象
* PR 事件：`pullRequest` 对象
* Discussion 事件：`discussion` 对象
* 评论事件：`comment` 对象

---

## 常见问题

### 为什么收不到消息？

1. 检查 Token 权限是否正确
2. 检查仓库配置是否正确
3. 如果使用 Webhook 模式，检查 Webhook 是否配置成功
4. 开启调试日志查看详细信息

### Webhook 模式无法接收消息？

1. 确保服务器有公网 IP 且端口可访问
2. 检查 Webhook 路径是否正确
3. 在 GitHub Webhook 设置页面查看推送记录和错误信息

### 如何测试 Webhook 是否正常？

访问 `http://你的服务器地址:端口/github/webhook`，如果看到提示信息说明路由已注册成功。
