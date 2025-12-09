import { Dialogue } from './types'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '@koishijs/client' {
  interface Events {
    'webdialogue/list'(): Promise<Dialogue[]>
    'webdialogue/create'(dialogue: Partial<Dialogue>): Promise<{ success: boolean; message?: string }>
    'webdialogue/update'(dialogue: Partial<Dialogue>): Promise<{ success: boolean; message?: string }>
    'webdialogue/delete'(id: number): Promise<{ success: boolean; message?: string }>
  }
}