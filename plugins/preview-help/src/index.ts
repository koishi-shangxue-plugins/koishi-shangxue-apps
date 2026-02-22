import type { } from 'koishi-plugin-puppeteer'
import type { } from '@koishijs/plugin-server'
import { Context, Schema, Logger, h, Command, Session } from 'koishi'
import fs from 'node:fs'
import path from 'node:path'
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export const name = 'preview-help'

export const usage = `
---

<a href="https://i0.hdslb.com/bfs/openplatform/7cfeb33745f63bb290f4f50982d3a1d22aca644c.jpg
" target="_blank" referrerpolicy="no-referrer">点我预览 菜单效果图</a>

---

需要使用puppeteer服务，并且command插件保持开启。

直接触发指令 即可生成图片菜单。

---
`
export const inject = ['puppeteer', 'server']

export const logger = new Logger('preview-help')

export interface Config {
  commandName: string
  screenshotQuality: number
  excludeCommands: string[]
}

export const Config: Schema<Config> = Schema.object({
  commandName: Schema.string().default('preview-help').description('指令名称'),
  screenshotQuality: Schema.number().min(1).max(100).default(80).description('截图质量 (1-100, 仅对 jpeg 有效)'),
  excludeCommands: Schema.array(String).role('table').default([
    "preview-help",
    "command",
    "help",
    "timer",
    "clear",
    "user",
    "channel",
    "inspect",
    "plugin"
  ]).description('不希望在菜单中显示的指令列表'),
})

/**
 * 获取可见指令列表
 */
function getVisibleCommands(session: Session, commands: Command[], excludeCommands: string[]): Command[] {
  const visible: Command[] = []
  for (const cmd of commands) {
    // 过滤隐藏指令、无权限指令以及排除列表中的指令
    if (excludeCommands.includes(cmd.name)) continue
    if (session.resolve(cmd.config['hidden'])) continue
    if (!cmd.match(session)) continue
    visible.push(cmd)
  }
  return visible.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 文件转 Base64
 */
async function toBase64(filePath: string): Promise<string> {
  try {
    const buffer = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    let mime = 'application/octet-stream'
    if (ext === '.png') mime = 'image/png'
    else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg'
    else if (ext === '.otf') mime = 'font/otf'
    else if (ext === '.ttf') mime = 'font/ttf'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch (e) {
    logger.error(`转换 Base64 失败: ${filePath}`, e)
    return ''
  }
}

/**
 * 计算哈希值
 */
function calculateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function apply(ctx: Context, config: Config) {
  // 资源目录路径
  const rootSourcePath = path.resolve(__dirname, '../source')
  // 缓存目录路径
  const cacheDir = path.resolve(ctx.baseDir, 'data/preview-help/hash-picture')

  // 确保缓存目录存在
  ctx.on('ready', async () => {
    try {
      await mkdir(cacheDir, { recursive: true })
    } catch (e) {
      logger.error('创建缓存目录失败:', e)
    }
  })

  ctx.command(config.commandName, '查看图片菜单')
    .action(async ({ session }) => {
      if (!session) return

      // 1. 获取指令数据并计算哈希
      const allCommands = ctx.$commander._commandList.filter(cmd => !cmd.parent)
      const visibleCommands = getVisibleCommands(session, allCommands, config.excludeCommands)

      if (visibleCommands.length === 0) {
        return '暂无可用指令'
      }

      // 构建指令列表字符串用于哈希计算
      const commandDataStr = visibleCommands.map(cmd => {
        const desc = session.text([`commands.${cmd.name}.description`, ''], cmd.config['params'])
        return `${cmd.displayName}:${desc}`
      }).join('|')

      const hash = calculateHash(commandDataStr)
      const cachePath = path.resolve(cacheDir, `${hash}.jpg`)

      // 2. 检查缓存
      if (fs.existsSync(cachePath)) {
        const base64 = await toBase64(cachePath)
        return h.image(base64)
      }

      // 3. 准备资源 (Base64)
      const fontBase64 = await toBase64(path.resolve(rootSourcePath, '荆南麦圆体.otf'))
      const bgBase64 = await toBase64(path.resolve(rootSourcePath, 'qzbknd.png'))

      // 4. 构建 HTML 模板
      const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    @font-face {
      font-family: 'JingNan';
      src: url('${fontBase64}');
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100vh;
    }
    body {
      padding: 40px 20px;
      font-family: 'JingNan', sans-serif;
      background-image: url('${bgBase64}');
      background-size: 100% auto;
      background-position: top center;
      background-repeat: repeat-y;
      background-attachment: scroll;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .title {
      font-size: 64px;
      color: #333;
      margin-bottom: 40px;
      text-shadow: 2px 2px 4px rgba(255,255,255,0.8);
      font-weight: bold;
    }
    /* 使用 columns 布局实现瀑布流效果，解决行高拉伸问题 */
    .container {
      column-count: 3;
      column-gap: 20px;
      width: 100%;
      max-width: 1200px;
    }
    @media (max-width: 900px) {
      .container {
        column-count: 2;
      }
    }
    @media (max-width: 600px) {
      .container {
        column-count: 1;
      }
    }
    .card {
      break-inside: avoid; /* 防止卡片被分页切断 */
      margin-bottom: 20px;
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 20px 25px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.5);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .cmd-name {
      font-size: 36px;
      font-weight: bold;
      color: #ff5e5e;
      word-break: break-all;
    }
    .has-desc .cmd-name {
      margin-bottom: 10px;
      border-bottom: 3px dashed #ffadad;
      padding-bottom: 6px;
      font-size: 32px;
    }
    .cmd-desc {
      font-size: 22px;
      color: #333;
      line-height: 1.4;
      word-break: break-all;
    }
    .no-desc {
      align-items: center;
      text-align: center;
      min-height: 100px;
    }
  </style>
</head>
<body>
  <div class="title">✨ 指令菜单 ✨</div>
  <div class="container">
    ${visibleCommands.map(cmd => {
        const desc = session.text([`commands.${cmd.name}.description`, ''], cmd.config['params'])
        const hasDesc = desc && desc !== '暂无描述'
        return `
        <div class="card ${hasDesc ? 'has-desc' : 'no-desc'}">
          <div class="cmd-name">${cmd.displayName}</div>
          ${hasDesc ? `<div class="cmd-desc">${desc}</div>` : ''}
        </div>
      `
      }).join('')}
  </div>
</body>
</html>
      `

      // 5. 渲染图片
      let page: any
      try {
        page = await ctx.puppeteer.page()
        await page.setViewport({ width: 1280, height: 100, deviceScaleFactor: 1 })
        await page.setContent(html)
        await page.waitForNetworkIdle()

        const image = await page.screenshot({
          type: 'jpeg',
          quality: config.screenshotQuality,
          encoding: 'binary',
          fullPage: true
        })

        // 6. 存入缓存并清理旧缓存
        try {
          const files = await readdir(cacheDir)
          for (const file of files) {
            await unlink(path.resolve(cacheDir, file))
          }
          await writeFile(cachePath, image)
        } catch (e) {
          logger.error('写入缓存失败:', e)
        }

        const base64 = await toBase64(cachePath)
        return h.image(base64)
      } catch (err) {
        logger.error('渲染图片失败:', err)
        return '渲染图片时发生错误，请稍后再试。'
      } finally {
        if (page) await page.close()
      }
    })
}
