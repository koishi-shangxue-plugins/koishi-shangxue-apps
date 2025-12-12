
import { defineComponent, h, ref, resolveComponent } from 'vue'
import { Context } from '@koishijs/client'
import './index.scss'
import './icons'

export default (ctx: Context) => {
  ctx.page({
    name: 'nextchat',
    path: '/nextchat',
    desc: "",
    authority: 4,
    icon: 'activity:nextchat',
    component: defineComponent({
      setup() {
        const iframe = ref<HTMLIFrameElement>()
        return () => h(resolveComponent('k-layout'), {}, {
          default: () => h('iframe', { ref: iframe, src: "/nextchat", class: 'layout-iframe' }),
        })
      },
    }),
  })
}