import { Logger, h } from "koishi";
import fs from 'node:fs';
import path from "node:path";
import { Config } from "./config";

const logger = new Logger('emojihub-bili');

export function logInfoformat(config: Config, USER, command, message) {
  if (config.consoleinfo) {
    if (USER) {
      logger.info(`\n${USER} 频道触发表情包\n使用指令： ${command}\n${message}`);
    } else {
      logger.info(message);
    }
  }
}

export function logError(message) {
  logger.error(message);
}

export function logInfo(config: Config, ...args: any[]) {
  if (config.consoleinfo) {
    (logger.info as (...args: any[]) => void)(...args);
  }
}

export function replacePlaceholders(content, context, isRawMode = false) {
  // 如果 content 是字符串，直接替换占位符
  if (typeof content === 'string') {
    if (!/\{\{\.([^}]+)\}\}|\$\{([^}]+)\}/.test(content)) {
      return isRawMode ? content : [content];
    }

    const value = content.replace(/\{\{\.([^}]+)\}\}|\$\{([^}]+)\}/g, (match, p1, p2) => {
      const key = p1 || p2;
      // 从 context 中查找占位符对应的值
      const replacement = key.split('.').reduce((obj, k) => obj?.[k], context) || match;
      return replacement;
    });

    return isRawMode ? value : [value];
  }

  // 如果 content 是对象或数组，递归处理
  if (typeof content === 'object' && content !== null) {
    if (Array.isArray(content)) {
      return content.map(item => replacePlaceholders(item, context, isRawMode));
    } else {
      const result = {};
      for (const key in content) {
        result[key] = replacePlaceholders(content[key], context, isRawMode);
      }
      return result;
    }
  }

  // 其他情况直接返回
  return content;
}

export function getAllFiles(dir, fileList: string[] = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      fileList = getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

export function getVirtualFilename(filePath, rootFolderPath) {
  const relativePath = path.relative(rootFolderPath, filePath);
  const parts = relativePath.split(path.sep);
  const filename = parts.join(''); // 使用点号连接路径部分
  return filename;
}

export { logger };