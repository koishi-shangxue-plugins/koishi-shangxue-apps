// 共享的数据结构定义
export interface Dialogue {
  id: any
  question: string
  answer: string
  type: 'keyword' | 'regexp'
  scope: 'global' | 'group' | 'private'
  contextId: string
}