import { ref, onMounted, onUnmounted } from 'vue'
import { send } from '@koishijs/client'

// 图片缓存 - IndexedDB
interface ImageCacheItem {
  url: string
  blob: Blob
  timestamp: number
  size: number
  channelKey: string
}

export function useImageCache() {
  const imageBlobUrls = ref<Record<string, string>>({})
  const loadingImages = new Map<string, Promise<string | null>>()

  // 内存管理配置 - 减少内存占用
  const MAX_MEMORY_USAGE = 50 * 1024 * 1024 // 50MB（从100MB降低）
  const MAX_BLOB_COUNT = 30 // 从50降低到30
  let currentMemoryUsage = 0
  let blobCount = 0

  // IndexedDB 配置
  let imageDB: IDBDatabase | null = null
  const DB_NAME = 'ChatImageCache'
  const DB_VERSION = 2
  const STORE_NAME = 'images'
  const MAX_DB_SIZE = 50 * 1024 * 1024 // 50MB
  const MAX_TOTAL_IMAGES = 500
  const MAX_IMAGE_SIZE = 12 * 1024 * 1024 // 12MB

  // 清理 IndexedDB
  async function clearIndexedDB(): Promise<boolean> {
    return new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => {
        console.log('[ImageCache] IndexedDB 已清空')
        resolve(true)
      }
      request.onerror = () => {
        console.error('[ImageCache] 清空 IndexedDB 失败')
        resolve(false)
      }
    })
  }

  // 初始化数据库
  async function initDB(shouldClear: boolean = false): Promise<boolean> {
    // 如果需要清空，先删除数据库
    if (shouldClear) {
      await clearIndexedDB()
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
          store.createIndex('channelKey', 'channelKey', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
      request.onsuccess = () => {
        imageDB = request.result
        resolve(true)
      }
      request.onerror = () => resolve(false)
    })
  }

  // 清理内存中的 Blob URLs
  function cleanupMemoryBlobs() {
    if (blobCount > MAX_BLOB_COUNT || currentMemoryUsage > MAX_MEMORY_USAGE) {
      // 按时间戳排序，删除最旧的
      const entries = Object.entries(imageBlobUrls.value)
      const toRemove = Math.ceil(entries.length * 0.3) // 删除30%最旧的

      for (let i = 0; i < toRemove && entries.length > 0; i++) {
        const [url, blobUrl] = entries[i]
        URL.revokeObjectURL(blobUrl)
        delete imageBlobUrls.value[url]
        blobCount--
      }

      currentMemoryUsage = Math.floor(currentMemoryUsage * 0.7)
      console.log(`[ImageCache] 清理内存，剩余 ${blobCount} 个图片`)
    }
  }

  // 获取缓存图片
  async function getCachedImageUrl(channelKey: string, url: string): Promise<string | null> {
    // 先检查内存缓存
    if (imageBlobUrls.value[url]) return imageBlobUrls.value[url]
    if (loadingImages.has(url)) return loadingImages.get(url)!

    const promise = (async () => {
      try {
        if (!imageDB) await initDB()
        const item = await getImageFromDB(url)
        if (item) {
          // 从 IndexedDB 加载到内存
          const blobUrl = URL.createObjectURL(item.blob)
          imageBlobUrls.value[url] = blobUrl
          currentMemoryUsage += item.size
          blobCount++
          cleanupMemoryBlobs() // 检查是否需要清理
          return blobUrl
        }
        return null
      } finally {
        loadingImages.delete(url)
      }
    })()

    loadingImages.set(url, promise)
    return promise
  }

  async function getImageFromDB(url: string): Promise<ImageCacheItem | null> {
    if (!imageDB) return null
    return new Promise((resolve) => {
      const transaction = imageDB!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(url)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
    })
  }

  async function cacheImage(channelKey: string, url: string): Promise<string | null> {
    // 先检查是否已缓存
    const existing = await getCachedImageUrl(channelKey, url)
    if (existing) return existing

    try {
      // 通过后端获取图片
      const result = await (send as any)('fetch-image', { url })
      if (!result.success) return null

      const response = await fetch(result.dataUrl)
      const blob = await response.blob()

      // 检查图片大小
      if (blob.size > MAX_IMAGE_SIZE) {
        console.warn(`[ImageCache] 图片过大 (${blob.size} bytes)，不缓存`)
        return result.dataUrl // 直接返回 dataUrl，不缓存
      }

      const item: ImageCacheItem = {
        url,
        blob,
        timestamp: Date.now(),
        size: blob.size,
        channelKey
      }

      // 保存到 IndexedDB
      await saveToDB(item)

      // 保存到内存
      const blobUrl = URL.createObjectURL(blob)
      imageBlobUrls.value[url] = blobUrl
      currentMemoryUsage += blob.size
      blobCount++
      cleanupMemoryBlobs() // 检查是否需要清理

      return blobUrl
    } catch (e) {
      console.error('[ImageCache] 缓存图片失败:', e)
      return null
    }
  }

  async function saveToDB(item: ImageCacheItem) {
    if (!imageDB) return

    try {
      // 检查数据库大小，如果超过限制则清理旧数据
      const count = await getDBCount()
      if (count >= MAX_TOTAL_IMAGES) {
        await cleanupOldestImages(Math.floor(MAX_TOTAL_IMAGES * 0.2)) // 清理20%最旧的
      }

      const transaction = imageDB.transaction([STORE_NAME], 'readwrite')
      transaction.objectStore(STORE_NAME).put(item)
    } catch (e) {
      console.error('[ImageCache] 保存到 IndexedDB 失败:', e)
    }
  }

  // 获取数据库中的图片数量
  async function getDBCount(): Promise<number> {
    if (!imageDB) return 0
    return new Promise((resolve) => {
      const transaction = imageDB!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(0)
    })
  }

  // 清理最旧的图片
  async function cleanupOldestImages(count: number) {
    if (!imageDB) return

    return new Promise<void>((resolve) => {
      const transaction = imageDB!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('timestamp')
      const request = index.openCursor()

      let deleted = 0
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result
        if (cursor && deleted < count) {
          cursor.delete()
          deleted++
          cursor.continue()
        } else {
          console.log(`[ImageCache] 清理了 ${deleted} 张旧图片`)
          resolve()
        }
      }
      request.onerror = () => resolve()
    })
  }

  async function clearChannelCache(channelKey: string) {
    // 清理内存中的 Blob URLs
    Object.keys(imageBlobUrls.value).forEach(url => {
      URL.revokeObjectURL(imageBlobUrls.value[url])
      delete imageBlobUrls.value[url]
    })
    blobCount = 0
    currentMemoryUsage = 0
  }

  // 初始化时检查是否需要清空 IndexedDB
  onMounted(async () => {
    try {
      // 获取插件配置
      const configResult = await (send as any)('get-plugin-config')
      const shouldClear = configResult?.success && configResult?.config?.clearIndexedDBOnStart

      if (shouldClear) {
        console.log('[ImageCache] 配置要求清空 IndexedDB，正在清理...')
        await initDB(true) // 清空并重新初始化
      } else {
        await initDB(false) // 正常初始化
      }
    } catch (e) {
      console.error('[ImageCache] 初始化失败:', e)
      await initDB(false)
    }
  })

  onUnmounted(() => {
    // 清理所有内存中的 Blob URLs
    Object.values(imageBlobUrls.value).forEach(URL.revokeObjectURL)
    if (imageDB) imageDB.close()
  })

  return {
    getCachedImageUrl,
    cacheImage,
    clearChannelCache,
    clearIndexedDB // 导出清理函数供外部使用
  }
}
