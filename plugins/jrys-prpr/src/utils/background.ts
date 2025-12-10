import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { Config } from '../types'

/**
 * 随机获取背景图片 URL
 * 支持多种格式：txt文件、文件夹、网络URL、本地文件
 */
export function getRandomBackground(config: Config): string {
  // 随机选择一个背景路径
  let backgroundPath = config.BackgroundURL[Math.floor(Math.random() * config.BackgroundURL.length)]

  // 如果是 file:/// 开头的 URL
  if (backgroundPath.startsWith('file:///')) {
    try {
      // 将 file:/// URL 转换为本地文件路径
      const localPath = fileURLToPath(backgroundPath)

      // 如果是 txt 文件
      if (localPath.endsWith('.txt')) {
        let lines = fs.readFileSync(localPath, 'utf-8').split('\n').filter(Boolean)
        let randomLine = lines[Math.floor(Math.random() * lines.length)].trim().replace(/\\/g, '/')
        return randomLine
      }

      // 如果是图片文件
      if (/\.(jpg|png|gif|bmp|webp)$/i.test(localPath)) {
        return backgroundPath // 直接返回 file:/// URL
      }

      // 如果是文件夹路径
      if (fs.existsSync(localPath) && fs.lstatSync(localPath).isDirectory()) {
        const files = fs.readdirSync(localPath)
          .filter(file => /\.(jpg|png|gif|bmp|webp)$/i.test(file))
        if (files.length === 0) {
          throw new Error("文件夹中未找到有效图片文件")
        }
        let randomFile = files[Math.floor(Math.random() * files.length)]
        let fullPath = path.join(localPath, randomFile).replace(/\\/g, '/')
        return pathToFileURL(fullPath).href // 转换为 file:/// URL
      }

      // 如果既不是 txt 文件，也不是图片文件或文件夹
      throw new Error(`file:/// URL 指向的文件类型无效: ${backgroundPath}`)
    } catch (error) {
      throw new Error(`处理 file:/// URL 失败: ${backgroundPath}, 错误: ${error.message}`)
    }
  }

  // 如果是网络 URL（http:// 或 https://），直接返回
  if (backgroundPath.startsWith('http://') || backgroundPath.startsWith('https://')) {
    return backgroundPath
  }

  // 如果是 txt 文件路径
  if (backgroundPath.endsWith('.txt')) {
    try {
      let lines = fs.readFileSync(backgroundPath, 'utf-8').split('\n').filter(Boolean)
      let randomLine = lines[Math.floor(Math.random() * lines.length)].trim().replace(/\\/g, '/')
      return randomLine
    } catch (error) {
      throw new Error(`读取 txt 文件失败: ${backgroundPath}, 错误: ${error.message}`)
    }
  }

  // 如果是文件夹路径
  if (fs.existsSync(backgroundPath) && fs.lstatSync(backgroundPath).isDirectory()) {
    try {
      const files = fs.readdirSync(backgroundPath)
        .filter(file => /\.(jpg|png|gif|bmp|webp)$/i.test(file))
      if (files.length === 0) {
        throw new Error("文件夹中未找到有效图片文件")
      }
      let randomFile = files[Math.floor(Math.random() * files.length)]
      let fullPath = path.join(backgroundPath, randomFile).replace(/\\/g, '/')
      return pathToFileURL(fullPath).href // 转换为 file:/// URL
    } catch (error) {
      throw new Error(`读取文件夹失败: ${backgroundPath}, 错误: ${error.message}`)
    }
  }

  // 如果是图片文件绝对路径
  if (fs.existsSync(backgroundPath) && fs.lstatSync(backgroundPath).isFile()) {
    try {
      if (/\.(jpg|png|gif|bmp|webp)$/i.test(backgroundPath)) {
        return pathToFileURL(backgroundPath).href // 转换为 file:/// URL
      } else {
        throw new Error("文件不是有效的图片格式")
      }
    } catch (error) {
      throw new Error(`读取图片文件失败: ${backgroundPath}, 错误: ${error.message}`)
    }
  }

  // 如果以上条件都不满足，抛出错误
  throw new Error(`无效的背景路径: ${backgroundPath}`)
}