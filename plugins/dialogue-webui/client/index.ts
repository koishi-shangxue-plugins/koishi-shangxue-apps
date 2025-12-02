import { Context } from '@koishijs/client'
import Page from './page.vue'

export default (ctx: Context) => {
  // 在控制台的侧边栏添加一个名为 "Dialogue WebUI" 的页面
  ctx.page({
    name: 'Dialogue WebUI',
    path: '/dialogue-webui',
    component: Page,
  })
}