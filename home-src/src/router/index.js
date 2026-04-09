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
  {
    path: '/helios',
    name: 'helios',
    component: () => import('@/views/HeliosView.vue'),
    meta: { standalone: true },
  },
]

const router = createRouter({
  history: createWebHistory('/home/'),
  routes,
  scrollBehavior() {
    return { top: 0, behavior: 'smooth' }
  },
})

// Préserver le paramètre embed=true lors de la navigation
router.beforeEach((to, from) => {
  // Si on vient d'une page avec embed=true et que la destination n'a pas embed
  if (from.query.embed === 'true' && to.query.embed !== 'true') {
    // Rediriger vers la même route avec embed=true ajouté
    return {
      path: to.path,
      query: { ...to.query, embed: 'true' },
      hash: to.hash,
      replace: true
    }
  }
})

export default router
