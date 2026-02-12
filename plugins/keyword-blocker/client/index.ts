
import { defineComponent, h, resolveComponent } from 'vue'
import { Context } from '@koishijs/client'
import blocker from './vue/index.vue'
// 不导入 Element Plus CSS，Koishi 已经包含了
// import 'element-plus/dist/index.css'
import './index.scss'
import './icons'

export default (ctx: Context) => {
  ctx.page({
    name: 'blocker',
    path: '/keyword-blocker',
    desc: "",
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
