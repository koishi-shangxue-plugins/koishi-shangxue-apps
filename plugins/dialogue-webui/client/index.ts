import { defineComponent, h, resolveComponent } from 'vue'
import { Context } from '@koishijs/client'
import Page from './page.vue'
import './index.scss'
import './icons'

export default (ctx: Context) => {
  ctx.page({
    name: 'dialogue-webui',
    path: '/dialogue-webui',
    icon: 'activity:dialogue',
    component: defineComponent({
      setup() {
        return () => h(resolveComponent('k-layout'), {}, {
          default: () => h(Page)
        })
      },
    }),
  })
}