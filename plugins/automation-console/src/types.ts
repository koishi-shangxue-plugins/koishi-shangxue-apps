import { Context } from "koishi";
import {} from 'koishi-plugin-puppeteer';

// 配置接口
export interface Config {
  accessPort: number
  commandTable: Array<{
    command: string
    commandname: string
    command_authority: number
  }>
  enable_auth: boolean
  text: string
  secret: string
  wait_for_prompt: number
  maxlist: number
  resolvetimeout: number
  loggerinfo: boolean
}

// 页面实例类型
export type PageInstance = Awaited<ReturnType<Context['puppeteer']['page']>> | null;
