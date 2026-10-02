import { defineAsyncComponent } from 'vue'
import type { Ability } from '../../main/ui/ability'

export default {
  id: 'refraction',
  name: '折光航标',
  icon: 'default/crystal-ball/padding',
  category: '游戏',
  keepAlive: false,
  component: defineAsyncComponent(() => import('./View.vue'))
} satisfies Ability
