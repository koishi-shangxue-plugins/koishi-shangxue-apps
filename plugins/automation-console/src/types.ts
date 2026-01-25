import { Context } from "koishi";
import {} from 'koishi-plugin-puppeteer';

// 配置接口
export interface Config {
  link: string
  table2: Array<{
    command: string
    commandname: string
    command_authority: number
  }>
  enable_auth: boolean
  text: string
  secret: string
  auto_execute_openUI: boolean
  auto_execute_closeUI: boolean
  wait_for_prompt: number
  maxlist: number
  resolvetimeout: number
  resolvesetTimeout: boolean
  loggerinfo: boolean
}

// 页面实例类型
export type PageInstance = Awaited<ReturnType<Context['puppeteer']['page']>> | null;
