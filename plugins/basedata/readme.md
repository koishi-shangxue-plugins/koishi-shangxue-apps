# koishi-plugin-basedata

[![npm](https://img.shields.io/npm/v/koishi-plugin-basedata?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-basedata)

为 Koishi 设计的一款强大而灵活的文件下载服务插件。

它允许其他插件按需下载文件，并将其作为 Base64 Data URL 读取，同时内置了可靠的下载重试和作用域隔离机制。

## ✨ 特性

- **按需下载**: 仅在文件不存在时才执行下载，节省带宽和存储空间。
- **Base64 读取**: 方便地将任何文件（图片、字体等）直接以内联形式嵌入到 HTML 或 CSS 中。
- **自动重试**: 内置可靠的 `fetch` 重试机制，提高下载成功率。
- **作用域隔离**: 通过 `scope` API，不同插件可以拥有独立的存储空间，有效避免文件名冲突。
- **动态 MIME 类型**: 自动识别文件类型，生成正确的 Base64 Data URL。

## 📖 API

该插件向 Koishi 的上下文中注入了 `ctx.basedata` 服务，提供以下核心方法：

- `read(fileName: string, downloadsurl?: string): Promise<string>`
  - **缓存优先**。会优先尝试读取本地文件。如果文件不存在，则会自动下载并存入本地，然后返回其 Base64 Data URL。

- `download(fileName: string, downloadsurl?: string): Promise<string>`
  - **强制刷新**。会直接从远端下载文件，覆盖本地已有的同名文件，然后返回其 Base64 Data URL。当你需要确保文件是最新版本时，应使用此方法。

- `scope(scope: string): ScopedDownloadsURL`
  - 获取一个带作用域的 API 实例，其下的 `read` 和 `download` 方法与上述相同，但文件会被存储在隔离的子目录中，以避免插件间的文件名冲突。

### 示例 1: 读取文件 (缓存优先)

这是最常用的方法。插件会自动处理下载逻辑。

```typescript
import { Context } from 'koishi'

export function apply(ctx: Context) {
  ctx.command('show-image', '显示一张网络图片').action(async () => {
    try {
      const imageUrl = 'https://koishi.chat/logo.png'
      // 如果 logo.png 已存在，则直接读取；否则，先下载再读取
      const imageBase64 = await ctx.basedata.read('logo.png', imageUrl)
      return <img src={imageBase64} />
    } catch (error) {
      ctx.logger('my-plugin').error('图片加载失败', error)
      return '图片加载失败。'
    }
  })
}
```

### 示例 2: 强制刷新文件并使用作用域

当你需要确保获取的是最新版本的文件时，应使用 `download` 方法。同时，使用 `scope` 来隔离文件是一种最佳实践。

```typescript
import { Context } from 'koishi'

export const name = 'my-awesome-plugin'

export function apply(ctx: Context) {
  const logger = ctx.logger(name)

  // 使用你的插件名作为 scope
  const downloader = ctx.basedata.scope(name)

  ctx.command('update-asset', '更新并显示资源').action(async () => {
    try {
      const assetUrl = 'https://example.com/my-plugin-asset.jpg'
      // 总是从远端下载最新版本，并覆盖本地文件
      const imageBase64 = await downloader.download('asset.jpg', assetUrl)
      return <img src={imageBase64} />
    } catch (error) {
      logger.error('资源更新失败', error)
      return '资源更新失败。'
    }
  })
}
```

### 获得完整的类型提示

为了在你的插件中获得 `ctx.basedata` 服务的完整 TypeScript 类型提示，你可以从本插件导入 `BaseData` 服务类。

```typescript
import { Context } from 'koishi'
import type { BaseData } from 'koishi-plugin-basedata'

declare module 'koishi' {
  interface Context {
    basedata: BaseData
  }
}

export function apply(ctx: Context) {
  // 现在 ctx.basedata 将拥有完整的类型提示
}
```