import { defineComponent, h, resolveComponent } from 'vue'
import { Context } from '@koishijs/client'
import blocker from './vue/index.vue'
import './index.scss'
import './icons'

export default (ctx: Context) => {
  ctx.page({
    name: 'keyword-blocker',
    path: '/keyword-blocker',
    desc: '关键词屏蔽管理',
    authority: 4,
    icon: 'activity:blocker',
    component: defineComponent({
      setup() {
        return () => h(resolveComponent('k-layout'), {}, {
          default: () => h(blocker)
        })
      },
    }),
  })
}
