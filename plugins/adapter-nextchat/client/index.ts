
import { Context } from '@koishijs/client'
import Settings from './settings.vue'

export default (ctx: Context) => {
  ctx.slot({
    type: 'plugin-details',
    component: Settings,
    order: 800,
  })
}