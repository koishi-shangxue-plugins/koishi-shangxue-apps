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

  // 内存管理配置
  const MAX_MEMORY_USAGE = 100 * 1024 * 1024 // 100MB
  const MAX_BLOB_COUNT = 50
  let currentMemoryUsage = 0

  // IndexedDB 配置
  let imageDB: IDBDatabase | null = null
  const DB_NAME = 'ChatImageCache'
  const DB_VERSION = 2
  const STORE_NAME = 'images'
  const MAX_DB_SIZE = 50 * 1024 * 1024 // 50MB
  const MAX_TOTAL_IMAGES = 500
  const MAX_IMAGE_SIZE = 12 * 1024 * 1024 // 12MB

  // 初始化数据库
  async function initDB(): Promise<boolean> {
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

  // 获取缓存图片
  async function getCachedImageUrl(channelKey: string, url: string): Promise<string | null> {
    if (imageBlobUrls.value[url]) return imageBlobUrls.value[url]
    if (loadingImages.has(url)) return loadingImages.get(url)!

    const promise = (async () => {
      try {
        if (!imageDB) await initDB()
        const item = await getImageFromDB(url)
        if (item) {
          const blobUrl = URL.createObjectURL(item.blob)
          imageBlobUrls.value[url] = blobUrl
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
    const existing = await getCachedImageUrl(channelKey, url)
    if (existing) return existing

    try {
      const result = await (send as any)('fetch-image', { url })
      if (!result.success) return null

      const response = await fetch(result.dataUrl)
      const blob = await response.blob()

      if (blob.size > MAX_IMAGE_SIZE) return null

      const item: ImageCacheItem = {
        url,
        blob,
        timestamp: Date.now(),
        size: blob.size,
        channelKey
      }

      await saveToDB(item)
      const blobUrl = URL.createObjectURL(blob)
      imageBlobUrls.value[url] = blobUrl
      return blobUrl
    } catch (e) {
      return null
    }
  }

  async function saveToDB(item: ImageCacheItem) {
    if (!imageDB) return
    const transaction = imageDB.transaction([STORE_NAME], 'readwrite')
    transaction.objectStore(STORE_NAME).put(item)
  }

  async function clearChannelCache(channelKey: string) {
    // 简化实现
    Object.keys(imageBlobUrls.value).forEach(url => {
      URL.revokeObjectURL(imageBlobUrls.value[url])
      delete imageBlobUrls.value[url]
    })
  }

  onUnmounted(() => {
    Object.values(imageBlobUrls.value).forEach(URL.revokeObjectURL)
    if (imageDB) imageDB.close()
  })

  return {
    getCachedImageUrl,
    cacheImage,
    clearChannelCache
  }
}