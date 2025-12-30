import { defineComponent, h, resolveComponent } from 'vue'
import { Context } from '@koishijs/client'
import ChatOnebot from './page.vue'
import './icons'

export default (ctx: Context) => {
  ctx.page({
    name: 'Stapxs-QQ-Lite',
    path: '/chat-onebot',
    desc: '集成 Stapxs QQ Lite 2.0',
    authority: 4,
    icon: 'activity:chat-onebot',
    component: defineComponent({
      setup() {
        return () => h(resolveComponent('k-layout'), {}, {
          default: () => h(ChatOnebot)
        })
      },
    }),
  })
}