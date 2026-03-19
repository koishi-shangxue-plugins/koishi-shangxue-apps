import { rm, readdir, stat } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Dialogue } from '.'

export interface CleanupLogger {
  debug: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
}

/**
 * 从所有问答的 answer 字段中，提取 {{h.image("file://...")}} 格式里引用的本地路径集合
 * 返回 normalize 过的绝对路径（小写，Windows 大小写兼容）
 */
function extractReferencedPaths(dialogues: Dialogue[]): Set<string> {
  // 匹配 h.image("file://...") 或 h.image('file://...')
  const pattern = /h\.image\(["']?(file:\/\/[^\s"')]+)["']?\)/g
  const result = new Set<string>()

  for (const dialogue of dialogues) {
    const answer = dialogue.answer || ''
    let match: RegExpExecArray | null
    pattern.lastIndex = 0
    while ((match = pattern.exec(answer)) !== null) {
      try {
        // fileURLToPath 在 Windows 会还原为 C:\... 形式
        const absPath = fileURLToPath(match[1])
        result.add(normalize(absPath).toLowerCase())
      } catch {
        // URL 格式不合法则跳过
      }
    }
  }

  return result
}

/**
 * 递归收集目录下所有图片文件（png/jpg/gif/webp/bmp）
 * 返回 { original: 原始路径, normalized: 小写 normalize 路径 }
 */
async function collectImageFiles(dir: string): Promise<{ original: string; normalized: string }[]> {
  const files: { original: string; normalized: string }[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    // 目录不存在时直接返回空
    return files
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    try {
      const s = await stat(fullPath)
      if (s.isDirectory()) {
        const nested = await collectImageFiles(fullPath)
        files.push(...nested)
      } else if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(entry)) {
        files.push({
          original: fullPath,
          normalized: normalize(fullPath).toLowerCase(),
        })
      }
    } catch {
      // 无法访问的条目跳过
    }
  }

  return files
}

/**
 * 插件启动时：扫描图片目录，删除不被任何问答引用的本地图片
 * @param baseDir  ctx.baseDir
 * @param dialogues  数据库中全部问答
 * @param logger   日志回调（由 index.ts 注入）
 * @param debugMode 是否输出调试日志
 */
export async function cleanupUnreferencedImages(
  baseDir: string,
  dialogues: Dialogue[],
  logger: CleanupLogger,
  debugMode: boolean,
): Promise<void> {
  const imageRootDir = join(baseDir, 'data', 'dialogue-webui', '对话')

  // 1. 收集磁盘上所有图片
  const allFiles = await collectImageFiles(imageRootDir)
  if (allFiles.length === 0) {
    if (debugMode) logger.debug('[cleanup] 图片目录为空或不存在，无需清理。')
    return
  }

  // 2. 从数据库取出全部被引用的路径（normalize 小写）
  const referencedPaths = extractReferencedPaths(dialogues)

  if (debugMode) {
    logger.debug(`[cleanup] 磁盘图片: ${allFiles.length} 张，引用中: ${referencedPaths.size} 条引用`)
  }

  // 3. 逐一检查、删除未被引用的图片
  let deletedCount = 0
  for (const file of allFiles) {
    if (!referencedPaths.has(file.normalized)) {
      try {
        await rm(file.original)
        deletedCount++
        if (debugMode) logger.debug(`[cleanup] 已删除未引用图片: ${file.original}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`[cleanup] 删除图片失败: ${file.original} -> ${message}`)
      }
    }
  }

  if (deletedCount > 0) {
    logger.info(`[cleanup] 启动清理完成，共删除 ${deletedCount} 张未被引用的本地图片。`)
  } else if (debugMode) {
    logger.debug('[cleanup] 所有图片均有引用，无需删除。')
  }
}
