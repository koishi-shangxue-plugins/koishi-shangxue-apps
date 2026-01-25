import { Schema } from "koishi";
import { Config } from "./types";

// 默认指令表
export const defaulttable2 = [
  {
    "command": "automation-console",
    "commandname": "automation-console",
    "command_authority": 4
  },
  {
    "command": "打开UI控制",
    "commandname": "打开UI",
    "command_authority": 4
  },
  {
    "command": "查看UI控制",
    "commandname": "查看UI",
    "command_authority": 4
  },
  {
    "command": "退出UI控制",
    "commandname": "退出UI",
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
    "command": "刷新插件市场",
    "commandname": "刷新插件市场",
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
  },
  {
    "command": "插件市场搜索插件",
    "commandname": "插件市场搜索插件",
    "command_authority": 4
  }
];

// 配置 Schema
export const ConfigSchema: Schema<Config> =
  Schema.intersect([
    Schema.object({
      link: Schema.string().role('link').default('http://127.0.0.1:5140').description("需要控制的koishi控制台地址<br>必须可用访问哦，预期的地址是koishi的【欢迎】页面"),
      table2: Schema.array(Schema.object({
        command: Schema.string().description("备注指令").disabled(),
        commandname: Schema.string().description("实际注册的指令名称"),
        command_authority: Schema.number().default(4).description('允许使用指令的权限等级').experimental(),
      })).role('table').default(defaulttable2).description("指令注册表<br>若要关闭某个指令 可以删掉该行"),
    }).description('基础设置'),

    Schema.object({
      enable_auth: Schema.boolean().description("目标link地址是否开启了auth插件").default(false),
      text: Schema.string().default("admin").description("auth插件的用户名"),
      secret: Schema.string().role('secret').default('password').description("auth插件的登录密码"),
    }).description('auth登录设置'),

    Schema.object({
      auto_execute_openUI: Schema.boolean().default(true).description("开启后，在【UI控制台未打开】时，自动执行【打开UI控制】").experimental(),
      auto_execute_closeUI: Schema.boolean().default(true).description("开启后，在执行对应的指令完毕时，自动执行【退出UI控制】").experimental(),
      wait_for_prompt: Schema.number().default(30).description("等待用户输入内容的超时时间（单位：秒）"),
    }).description('进阶设置'),

    Schema.object({
      maxlist: Schema.number().default(5).description("【找到多个匹配的插件】时，返回的最大数量"),
    }).description('【插件配置】相关指令设置'),

    Schema.object({
      resolvetimeout: Schema.number().default(10).description("【刷新】依赖后需要等待的时间（单位：秒）"),
    }).description('【依赖管理】相关指令设置'),

    Schema.object({
      resolvesetTimeout: Schema.boolean().default(false).description("截图时，等待1.5秒再截图<br>防止截图太快了 没截到").experimental(),
      loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
    }).description('调试设置'),
  ]) as Schema<Config>;
