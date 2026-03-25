import { Schema } from 'koishi'
import type { Config as PluginConfig, SendStep } from './types'

export const usage = `
<div>
<p>本插件可帮助你自定义QQ官方机器人按钮菜单，支持以下三种类型的菜单配置：</p>
<ol>
<li><strong>JSON 按钮</strong>：可以发送带有交互按钮的JSON消息。</li>
<li><strong>被动模板 Markdown</strong>：适用于发送自定义的Markdown模板消息。</li>
<li><strong>原生 Markdown</strong>：支持发送更复杂的原生Markdown消息。</li>
</ol>

<h3>如何配置</h3>
<ul>
<li>在左侧活动栏找到【资源管理器】>【data】>【qq-markdown-button】>【按钮菜单配置】目录，在该目录下，你会看到对应的文件夹下有 <code>.md</code> 和 <code>.json</code> 文件。</li>
<li>根据你选择的菜单类型，编辑对应的 <code>.md</code> 和 <code>.json</code> 文件，修改你的菜单配置。</li>
</ul>

<h3>关于变量替换</h3>
<p>在配置文件（例如 <code>.json</code>）中，你可能会看到一些变量占位符，如：</p>
<ul>
<li><code>\${session.messageId}</code>：运行时会替换为当前会话的消息ID。</li>
<li><code>\${INTERACTION_CREATE}</code>：运行时会替换为当前回调按钮的interaction_id。</li>
<li><code>\${markdown}</code>：会被替换为从对应 <code>.md</code> 文件读取的Markdown内容。</li>
<li><code>\${0}</code>, <code>\${1}</code>, ...：这些数字占位符用于获取命令参数。例如，如果命令是 <code>/mycommand arg1 arg2</code>，那么 <code>\${0}</code> 会被替换为 <code>arg1</code>，<code>\${1}</code> 会被替换为 <code>arg2</code>。</li>
<li>当命令没有提供足够的参数时（例如，命令是 <code>/mycommand arg1</code>，但模板中使用了 <code>\${1}</code>），未提供的数字占位符将自动被替换为字符串 <code>"undefined"</code>。</li>
</ul>
<p>无需手动修改这些变量，它们将在运行时自动替换为对应的真实值。</p>

---

<p>支持复用，你可以开多个这个插件，然后改成不同的指令名称/文件夹名称，以注册多个按钮菜单功能。</p>
<p>本插件会自动使用对应的文件夹下的 json / markdown 文件来发送消息。<br>使用多重配置时，你通常只需要修改 <code>按钮菜单配置1</code> 那一行。</p>
<p>不要手动重命名 json/md 文件。</p>
<hr>
<p>赶快选择你需要的配置，开始自定义你的菜单吧！</p>
<p>更多说明 <a href="https://github.com/shangxueink/koishi-shangxue-apps/tree/main/plugins/qq-markdown-button" target="_blank">详见项目README</a></p>

<p>相关链接：</p>
<ul>
<li><a href="https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/qq-markdown-button" target="_blank">https://github.com/koishi-shangxue-plugins/koishi-shangxue-apps/tree/main/plugins/qq-markdown-button</a></li>
<li><a href="https://forum.koishi.xyz/t/topic/10439" target="_blank">https://forum.koishi.xyz/t/topic/10439</a></li>
</ul>
</div>
`

const sendStepSchema: Schema<SendStep> = Schema.object({
  type: Schema.union([
    Schema.const('json').description('json按钮（./json/json.json）'),
    Schema.const('markdown').description('被动md，模板md（./markdown/markdown.json）'),
    Schema.const('raw').description('原生md（./raw/raw_markdown.json、./raw/raw_markdown.md）'),
  ]).role('radio').required().description('选择本步骤要发送的模板类型'),
})

export const Config: Schema<PluginConfig> = Schema.intersect([
  Schema.object({
    command_name: Schema.string().default('按钮菜单').description('注册的指令名称'),
    markdown_id: Schema.string().default('123456789_1234567890').description('markdown模板的ID'),
    json_button_id: Schema.string().default('123456789_1234567890').description('按钮模板的ID'),
  }).description('基础设置'),
  Schema.object({
    file_name: Schema.array(String).role('table').description('存储文件的文件夹名称<br>请依次填写 相对于koishi根目录的 **文件夹** 路径<br>本插件会自动使用对应的文件夹下的 json / markdown 文件来发送消息<br>使用多重配置时，你通常只需要修改 `按钮菜单配置1` 那一行')
      .default([
        'data',
        'qq-markdown-button',
        '按钮菜单配置1',
      ]),
    send_sequence: Schema.array(sendStepSchema).role('table').description('按顺序发送多个模板，支持重复和排序').default([
      { type: 'json' },
    ]),
  }).description('发送设置'),
  Schema.object({
    Allow_INTERACTION_CREATE: Schema.boolean().default(false).description('是否自动执行所有回调按钮内容（通过`session.execute`）'),
  }).description('高级设置'),
  Schema.object({
    consoleinfo: Schema.boolean().default(false).description('日志调试模式，推荐主动广播时开启，用于查看日志错误'),
  }).description('调试设置'),
])
