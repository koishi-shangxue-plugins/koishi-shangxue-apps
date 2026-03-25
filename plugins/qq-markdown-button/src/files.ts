import fs from 'node:fs'
import path from 'node:path'
import { MenuType } from './types'

const templateFiles: Record<MenuType, readonly string[]> = {
  json: ['json.json'],
  markdown: ['markdown.json'],
  raw: ['raw-markdown.json', 'raw-markdown.md', 'raw-without-keyboard.json', 'raw-without-keyboard.md'],
}

const LEGACY_ROOT_NAME = 'qq-markdown-button'
const CURRENT_ROOT_NAME = 'qq-markdown-button-v2'

export function resolveBaseDir(rootDir: string, fileName: string[]): string {
  const normalizedFileName = fileName.map((segment, index) => {
    if (index === 1 && segment === LEGACY_ROOT_NAME) {
      return CURRENT_ROOT_NAME
    }
    return segment
  })

  return path.join(rootDir, ...normalizedFileName)
}

export function ensureTemplateFiles(baseDir: string, templateRoot: string): void {
  // 确保用户配置目录存在。
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }

  for (const [type, files] of Object.entries(templateFiles) as [MenuType, readonly string[]][]) {
    for (const file of files) {
      const sourcePath = path.join(templateRoot, type, file)
      const targetPath = path.join(baseDir, type, file)
      const targetDir = path.dirname(targetPath)

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(sourcePath, targetPath)
      }
    }
  }
}

export function ensureTemplateDirs(baseDir: string): void {
  for (const type of Object.keys(templateFiles) as MenuType[]) {
    const dirPath = path.join(baseDir, type)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }
}
