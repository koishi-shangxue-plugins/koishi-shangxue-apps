import { Schema } from "koishi";
import { Config } from "./types";

// 默认指令表
export const defaultCommandTable = [
  {
    "command": "automation-console",
    "commandname": "automation-console",
    "command_authority": 4
  },
  {
    "command": "软重启",
    "commandname": "软重启",
    "command_authority": 4
  },
  {
    "command": "配置插件",
    "commandname": "配置插件",
    "command_authority": 4
  },
  {
    "command": "小火箭更新依赖",
    "commandname": "小火箭更新依赖",
    "command_authority": 4
  },
  {
    "command": "查看日志",
    "commandname": "查看最新日志",
    "command_authority": 4
  }
];

// 配置 Schema
export const ConfigSchema: Schema<Config> =
  Schema.intersect([
    Schema.object({
      accessPort: Schema.union([
        Schema.const(0).description('自动检测'),
        Schema.natural().description('自定义').default(5140)
      ]).description('访问的控制台端口').default(0),
      commandTable: Schema.array(Schema.object({
        command: Schema.string().description("备注指令").disabled(),
        commandname: Schema.string().description("实际注册的指令名称"),
        command_authority: Schema.number().default(4).description('允许使用指令的权限等级').experimental(),
      })).role('table').default(defaultCommandTable).description("指令注册表<br>若要关闭某个指令 可以删掉该行"),
    }).description('基础设置'),

    Schema.object({
      enable_auth: Schema.boolean().description("目标link地址是否开启了auth插件").default(false),
      text: Schema.string().default("admin").description("auth插件的用户名"),
      secret: Schema.string().role('secret').default('password').description("auth插件的登录密码"),
    }).description('auth登录设置'),

    Schema.object({
      wait_for_prompt: Schema.number().default(30).description("等待用户输入内容的超时时间（单位：秒）"),
      maxlist: Schema.number().default(5).description("【找到多个匹配的插件】时，返回的最大数量"),
      resolvetimeout: Schema.number().default(10).description("【刷新】依赖后需要等待的时间（单位：秒）"),
      extraWaitTimeout: Schema.number().default(30).description("每一步操作至多额外等待的秒数（适用于慢速服务器）"),
      loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
    }).description('进阶设置'),
  ]) as Schema<Config>;
