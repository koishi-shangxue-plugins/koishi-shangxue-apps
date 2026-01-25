import { Context } from "koishi";
import {} from 'koishi-plugin-puppeteer';
import {} from '@koishijs/plugin-server';
import type { Config as ConfigType } from "./types";
import { ConfigSchema } from "./config";
import { registerAllCommands } from "./commands";

export const reusable = false;
export const name = "automation-console";
export const inject = {
  required: ['puppeteer'],
  optional: ['server']
};

export const usage = `

<p><strong>Automation Console</strong> 是一个 Koishi 插件，

用于通过指令来自动化操作 Koishi 的 Web 控制台界面。

通过此插件，用户可以启动、控制、截图和管理控制台页面。</p>

---

<h2>功能列表</h2>

<ul>
<li>启动和登录控制台页面</li>
<li>控制台页面截图功能</li>
<li>关闭控制台页面</li>
<li>重启 Koishi 控制台</li>
<li>插件配置和管理功能</li>
<li>刷新插件市场</li>
<li>更新依赖管理</li>
<li>查看日志截图</li>
</ul>

---

<h2>使用说明</h2>

<p>该插件主要通过指令来控制 Koishi 的 Web UI 界面，具体使用步骤如下：</p>

<ol>
<li>使用 <code>打开UI控制</code> 打开并登录控制台页面。</li>
<li>使用 <code>查看UI控制</code> 查看页面截图，确保操作完成。</li>
<li>可根据需要使用其他指令如 <code>配置插件</code>、<code>刷新插件市场</code>、<code>查看日志</code> 等操作。</li>
<li>完成操作后，可使用 <code>退出UI控制</code> 关闭控制台页面。</li>
</ol>

其中的 <code>配置插件</code> 支持快速指定操作，操作如 <code>配置插件 commands  1  1</code>

这样可以快速指定搜索 commands 插件的第一个匹配项，并且按下第1个操作按钮

这个示例实现了快速开启/关闭 commands 插件

---

<h2>注意事项</h2>

<ul>
<li>确保 <code>puppeteer</code> 已正确配置并可用。</li>
<li>当 <code>enable_auth</code> 配置为 <code>true</code> 时，请确保用户名和密码正确。</li>
<li>使用指令前请确认权限等级 与<code>command_authority</code>是否匹配。</li>
</ul>

<h2>日志调试</h2>

<p>启用 <code>loggerinfo</code> 配置项后，插件将会记录调试日志，帮助排查问题。</p>


---
`;

// 导出配置
export const Config = ConfigSchema;

/**
 * 插件主函数
 */
export async function apply(ctx: Context, config: ConfigType) {
  // 页面实例引用
  const pageRef: { current: Awaited<ReturnType<Context['puppeteer']['page']>> | null } = {
    current: null
  };

  // 注册所有命令
  registerAllCommands(ctx, config, pageRef);
}
