import { Logger } from 'koishi'
import type { Config } from './types'

const logger = new Logger('Development:adapter-nextchat-dev')

// 全局日志函数
export let loggerError: (message: any, ...args: any[]) => void;
export let loggerInfo: (message: any, ...args: any[]) => void;
export let logInfo: (message: any, ...args: any[]) => void;
export let logDebug: (message: any, ...args: any[]) => void;

// 初始化日志函数
export function initLogger(ctx: any, config: Config) {
  logInfo = (message: any, ...args: any[]) => {
    if (config.loggerInfo) {
      logger.info(message, ...args);
    }
  };
  loggerInfo = (message: any, ...args: any[]) => {
    ctx.logger.info(message, ...args);
  };
  loggerError = (message: any, ...args: any[]) => {
    ctx.logger.error(message, ...args);
  };
  logDebug = (message: any, ...args: any[]) => {
    if (config.loggerDebug) {
      logger.info(message, ...args);
    }
  };
}