import { Context } from 'koishi'
import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { logInfo } from './logger'

// 会话数据结构
interface SessionData {
  chatId: string
  modelName: string
  lastUsed: number
}

// 会话存储结构
interface SessionStorage {
  sessions: Record<string, SessionData>
}

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map()
  private tempFilePath: string
  private saveTimeout: NodeJS.Timeout | null = null
  private disposed = false

  constructor(
    private ctx: Context,
    private dataDir: string
  ) {
    this.tempFilePath = join(dataDir, 'temp.json')
    this.ensureDataDir()
    this.loadSessions()
  }

  // 确保数据目录存在
  private async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true })
      logInfo('数据目录已确保存在:', this.dataDir)
    } catch (error) {
      this.ctx.logger.error('创建数据目录失败:', error)
    }
  }

  // 从文件加载会话数据
  private async loadSessions() {
    try {
      const data = await fs.readFile(this.tempFilePath, 'utf-8')
      const storage: SessionStorage = JSON.parse(data)
      this.sessions = new Map(Object.entries(storage.sessions || {}))
      logInfo('会话数据加载成功，共', this.sessions.size, '个会话')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logInfo('会话文件不存在，将创建新文件')
        this.sessions = new Map()
      } else {
        this.ctx.logger.error('加载会话数据失败:', error)
        this.sessions = new Map()
      }
    }
  }

  // 保存会话数据到文件（带防抖）
  private scheduleSave() {
    if (this.disposed) return

    // 清除之前的定时器
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    // 设置新的定时器，500ms 后保存
    this.saveTimeout = setTimeout(() => {
      this.saveSessions()
    }, 500)
  }

  // 实际保存到文件
  private async saveSessions() {
    if (this.disposed) return

    try {
      const storage: SessionStorage = {
        sessions: Object.fromEntries(this.sessions)
      }
      await fs.writeFile(
        this.tempFilePath,
        JSON.stringify(storage, null, 2),
        'utf-8'
      )
      logInfo('会话数据已保存')
    } catch (error) {
      this.ctx.logger.error('保存会话数据失败:', error)
    }
  }

  // 获取会话 ID
  getSession(key: string): string | null {
    const session = this.sessions.get(key)
    if (session) {
      // 更新最后使用时间
      session.lastUsed = Date.now()
      this.scheduleSave()
      logInfo('获取已存在的会话:', key, '->', session.chatId)
      return session.chatId
    }
    logInfo('未找到会话:', key)
    return null
  }

  // 设置会话 ID
  setSession(key: string, chatId: string, modelName: string) {
    this.sessions.set(key, {
      chatId,
      modelName,
      lastUsed: Date.now()
    })
    this.scheduleSave()
    logInfo('保存新会话:', key, '->', chatId)
  }

  // 删除会话
  deleteSession(key: string) {
    const deleted = this.sessions.delete(key)
    if (deleted) {
      this.scheduleSave()
      logInfo('删除会话:', key)
    }
    return deleted
  }

  // 清理过期会话（超过 24 小时未使用）
  cleanExpiredSessions() {
    const now = Date.now()
    const expireTime = 24 * 60 * 60 * 1000 // 24 小时
    let cleaned = 0

    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastUsed > expireTime) {
        this.sessions.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.scheduleSave()
      logInfo('清理了', cleaned, '个过期会话')
    }
  }

  // 清空所有会话
  clearAll() {
    this.sessions.clear()
    this.scheduleSave()
    logInfo('已清空所有会话')
  }

  // 销毁时保存并清理
  dispose() {
    this.disposed = true
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    // 立即保存
    this.saveSessions()
  }
}