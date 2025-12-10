import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { Config } from '../types'

/**
 * 随机获取背景图片 URL
 * 支持多种格式：txt文件、文件夹、网络URL、本地文件
 */
export function getRandomBackground(config: Config): string {
  const rawPath = config.BackgroundURL[Math.floor(Math.random() * config.BackgroundURL.length)]

  // 首先检查是否为网络 URL
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath
  }

  // 否则，视为本地路径（可能是 file:/// URL 或普通文件系统路径）
  try {
    return handleLocalPath(rawPath)
  } catch (error) {
    throw new Error(`处理本地背景路径失败: "${rawPath}". 错误: ${error.message}`)
  }
}

/**
 * 处理本地文件路径（可以是普通路径或 file:/// URL）
 */
function handleLocalPath(filePath: string): string {
  let localPath: string;
  // 如果是 file:/// URL，转换为普通路径
  if (filePath.startsWith('file:///')) {
    try {
      localPath = fileURLToPath(filePath)
    } catch (error) {
      throw new Error(`无效的 file URL: ${filePath}`)
    }
  } else {
    localPath = filePath
  }

  // 检查路径是否存在
  if (!fs.existsSync(localPath)) {
    throw new Error(`路径不存在: ${localPath}`)
  }

  const stats = fs.lstatSync(localPath)

  // 如果是文件夹
  if (stats.isDirectory()) {
    const files = fs.readdirSync(localPath)
      .filter(file => /\.(jpg|png|gif|bmp|webp)$/i.test(file))
    if (files.length === 0) {
      throw new Error(`文件夹 "${localPath}" 中未找到有效图片文件`)
    }
    const randomFile = files[Math.floor(Math.random() * files.length)]
    const fullPath = path.join(localPath, randomFile)
    return pathToFileURL(fullPath).href
  }

  // 如果是文件
  if (stats.isFile()) {
    // 如果是 .txt 文件
    if (localPath.endsWith('.txt')) {
      const lines = fs.readFileSync(localPath, 'utf-8').split('\n').filter(Boolean)
      if (lines.length === 0) {
        throw new Error(`.txt 文件为空: ${localPath}`)
      }
      // 从文件中随机选择一行并返回
      return lines[Math.floor(Math.random() * lines.length)].trim()
    }

    // 如果是图片文件
    if (/\.(jpg|png|gif|bmp|webp)$/i.test(localPath)) {
      return pathToFileURL(localPath).href
    }
  }

  throw new Error(`不支持的本地路径格式: ${localPath}`)
}