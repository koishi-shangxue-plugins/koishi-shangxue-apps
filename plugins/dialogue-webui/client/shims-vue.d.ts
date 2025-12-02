import { Dialogue } from './logic'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '@koishijs/client' {
  interface Events {
    'dialogue/list'(): Promise<Dialogue[]>
    'dialogue/create'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'dialogue/update'(dialogue: Dialogue): Promise<{ success: boolean; message?: string }>
    'dialogue/delete'(id: number): Promise<{ success: boolean; message?: string }>
  }
}