import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
  {
    path: '/fonctionnalites',
    name: 'fonctionnalites',
    component: () => import('@/views/FeaturesView.vue'),
  },
  {
    path: '/a-propos',
    name: 'a-propos',
    component: () => import('@/views/AboutView.vue'),
  },
  {
    path: '/contact',
    name: 'contact',
    component: () => import('@/views/ContactView.vue'),
  },
  {
    path: '/aide',
    name: 'aide',
    component: () => import('@/views/HelpView.vue'),
  },
  {
    path: '/aide/guide-:role',
    name: 'guide-print',
    component: () => import('@/views/HelpPrintView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory('/home/'),
  routes,
  scrollBehavior() {
    return { top: 0, behavior: 'smooth' }
  },
})

export default router
