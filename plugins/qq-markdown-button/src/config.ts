import { Schema } from 'koishi'
import { SEND_SEQUENCE_SCHEMA_KEY } from './template-catalog'
import type { Config as PluginConfig } from './types'

export const usage = `
<div>
<p>详细使用说明请查看 npm 页面和 README。</p>
<p>README 中包含模板类型说明、DAU 说明、<code>send_sequence</code> 用法，以及 <code>raw-without-keyboard</code> 推荐方案。</p>
<p><a href="https://www.npmjs.com/package/@shangxueink/koishi-plugin-qq-markdown-button" target="_blank">打开 npm 包页面</a></p>
</div>
`

export const Config: Schema<PluginConfig> = Schema.intersect([
  Schema.object({
    command_name: Schema.string().default('按钮菜单').description('注册的指令名称'),
    file_name_v2: Schema.array(String).role('table').description('存储文件的文件夹名称<br>请依次填写 相对于koishi根目录的 **文件夹** 路径<br>本插件会自动使用对应的文件夹下的 json / markdown / raw 文件来发送消息')
      .default([
        'data',
        'qq-markdown-button-v2',
        '按钮菜单配置1',
      ]),
  }).description('基础设置'),
  Schema.object({
    send_sequence: Schema.dynamic(SEND_SEQUENCE_SCHEMA_KEY).description('启用插件后会按当前目录加载模板候选项，并显示可排序表格；未启用时这里只显示占位项。'),
  }).description('发送设置'),
  Schema.object({
    Allow_INTERACTION_CREATE: Schema.boolean().default(false).description('是否自动执行所有回调按钮内容（通过`session.execute`）'),
  }).description('高级设置'),
  Schema.object({
    consoleinfo: Schema.boolean().default(false).description('日志调试模式，推荐主动广播时开启，用于查看日志错误'),
  }).description('调试设置'),
])
