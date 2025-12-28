
import { defineComponent, h, resolveComponent } from 'vue'
import { Context } from '@koishijs/client'
import Chat from './vue/index.vue'
import 'element-plus/dist/index.css'
import './index.scss'
import './icons'

export default (ctx: Context) => {
  ctx.page({
    name: '聊天室',
    path: '/chat-patch',
    desc: "",
    authority: 4,
    icon: 'activity:chat',
    component: defineComponent({
      setup() {
        return () => h(resolveComponent('k-layout'), {}, {
          default: () => h(Chat)
        })
      },
    }),
  })
}