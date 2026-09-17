import { defineComponent, h, resolveComponent } from 'vue'
import { Context, icons } from '@koishijs/client'
import Page from './page.vue'
import TableIcon from './table-icon.vue'

icons.register('activity:curriculum-table', TableIcon)

export default (ctx: Context) => {
  ctx.page({
    name: '课程表',
    path: '/curriculum-table',
    icon: 'activity:curriculum-table',
    authority: 4,
    component: defineComponent({
      setup() {
        return () => h(resolveComponent('k-layout'), { main: 'darker' }, {
          default: () => h(Page),
        })
      },
    }),
  })
}
