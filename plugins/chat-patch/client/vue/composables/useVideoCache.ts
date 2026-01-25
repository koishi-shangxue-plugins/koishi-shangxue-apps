import { ref, onUnmounted } from 'vue'
import { send } from '@koishijs/client'

/**
 * 视频按需加载 composable
 * 只在用户点击播放时才加载视频，避免内存占用
 */
export function useVideoCache() {
  // 当前加载的视频 URL（原始 URL -> blob URL）
  const loadedVideos = ref<Record<string, string>>({})
  // 正在加载的视频
  const loadingVideos = ref<Set<string>>(new Set())
  // 当前的 blob URL，用于清理
  const currentBlobUrl = ref<string | null>(null)

  /**
   * 按需加载视频
   * @param url 原始视频 URL
   * @returns blob URL 或 null
   */
  async function loadVideo(url: string): Promise<string | null> {
    // 如果已经加载过，直接返回
    if (loadedVideos.value[url]) {
      return loadedVideos.value[url]
    }

    // 如果正在加载，等待加载完成
    if (loadingVideos.value.has(url)) {
      // 等待加载完成
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (loadedVideos.value[url]) {
            clearInterval(checkInterval)
            resolve(loadedVideos.value[url])
          }
          if (!loadingVideos.value.has(url)) {
            clearInterval(checkInterval)
            resolve(null)
          }
        }, 100)
      })
    }

    // 开始加载
    loadingVideos.value.add(url)

    try {
      const result = await (send as any)('fetch-video-temp', { url })

      if (result.success) {
        // 如果返回 Vite @fs 路径，直接使用，不需要转换为 blob
        if (result.viteUrl) {
          loadedVideos.value[url] = result.viteUrl
          return result.viteUrl
        }

        // 兼容旧的 dataUrl 格式（如果有的话）
        if (result.dataUrl) {
          // 清理上一个 blob URL
          if (currentBlobUrl.value) {
            URL.revokeObjectURL(currentBlobUrl.value)
          }

          // 从 data URL 创建 blob
          const response = await fetch(result.dataUrl)
          const blob = await response.blob()
          const blobUrl = URL.createObjectURL(blob)

          currentBlobUrl.value = blobUrl
          loadedVideos.value[url] = blobUrl
          return blobUrl
        }

        return null
      }

      return null
    } catch (error) {
      console.error('加载视频失败:', error)
      return null
    } finally {
      loadingVideos.value.delete(url)
    }
  }

  /**
   * 检查视频是否正在加载
   */
  function isVideoLoading(url: string): boolean {
    return loadingVideos.value.has(url)
  }

  /**
   * 检查视频是否已加载
   */
  function isVideoLoaded(url: string): boolean {
    return !!loadedVideos.value[url]
  }

  /**
   * 清空所有已加载的视频
   */
  function clearAllVideos() {
    // 清理所有 blob URLs
    Object.values(loadedVideos.value).forEach(blobUrl => {
      if (blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl)
      }
    })
    loadedVideos.value = {}
    currentBlobUrl.value = null
  }

  // 组件卸载时清理
  onUnmounted(() => {
    clearAllVideos()
  })

  return {
    loadVideo,
    isVideoLoading,
    isVideoLoaded,
    clearAllVideos
  }
}
