import { Dialogue } from './types'

// 这是解决所有 ".vue" 文件导入错误的关键
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '@koishijs/client' {
  // 为所有自定义的后端事件提供准确的类型签名
  interface Events {
    'dialogue/list'(): Promise<Dialogue[]>
    'dialogue/create'(dialogue: Partial<Dialogue>): Promise<{ success: boolean; message?: string }>
    'dialogue/update'(dialogue: Partial<Dialogue>): Promise<{ success: boolean; message?: string }>
    'dialogue/delete'(id: number): Promise<{ success: boolean; message?: string }>
  }
}