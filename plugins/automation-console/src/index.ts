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
<p><strong>Automation Console</strong> - 通过指令自动化操作 Koishi 控制台</p>

<h2>主要功能</h2>
<ul>
<li><strong>配置插件</strong> - 搜索并操作插件（启用/停用、重命名、移除等）</li>
<li><strong>软重启</strong> - 重启 Koishi 控制台</li>
<li><strong>小火箭更新依赖</strong> - 一键更新所有依赖</li>
<li><strong>查看日志</strong> - 截图查看最新日志</li>
</ul>

<h2>快速开始</h2>
<p><code>配置插件 commands 1 1</code> - 快速开启/关闭 commands 插件</p>

<h2>注意事项</h2>
<ul>
<li>需要安装并配置 <code>puppeteer</code> 插件</li>
<li>如需插件市场搜索功能，请使用 <a href="https://www.npmjs.com/package/koishi-plugin-screenshot-console" target="_blank">koishi-plugin-screenshot-console</a></li>
<li>开启 <code>enable_auth</code> 时请确保用户名密码正确</li>
</ul>
`;

// 导出配置
export const Config = ConfigSchema;

/**
 * 插件主函数
 */
export async function apply(ctx: Context, config: ConfigType) {
  // 注册所有命令
  registerAllCommands(ctx, config);
}
