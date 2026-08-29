import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import { moduleByKey } from './data/modules.js'

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: 'Open Projets - La plateforme cartographique des collectivités' } },
  // L'index des modules n'existe plus : l'accueil deroule une section par
  // module, avec sa capture. L'adresse reste redirigee pour les liens deja
  // partages.
  { path: '/modules', redirect: '/' },
  {
    path: '/modules/:key',
    name: 'module',
    component: () => import('./views/ModuleView.vue'),
  },
  {
    path: '/ressources',
    name: 'ressources',
    component: () => import('./views/RessourcesView.vue'),
    meta: { title: 'Ressources - Open Projets' },
  },
  {
    // Pas de meta.title : la vue partagée pose ses metas elle-même, comme en v1.
    path: '/ressources/:slug',
    name: 'ressource-article',
    component: () => import('./views/RessourceArticleView.vue'),
  },
  {
    path: '/a-propos',
    name: 'a-propos',
    component: () => import('./views/AboutView.vue'),
    meta: { title: 'À propos - Open Projets' },
  },
  // La page de contact n'existe plus : le formulaire est en bas de chaque
  // page, l'adresse reste vivante pour les liens deja partages.
  { path: '/contact', redirect: { path: '/', hash: '#contact' } },
  {
    // La v2 charge la mesure d'audience : la page qui documente le refus doit
    // etre atteignable depuis la v2, pas seulement depuis le site v1.
    path: '/confidentialite',
    name: 'confidentialite',
    component: () => import('@/views/ConfidentialiteView.vue'),
    meta: { title: "Confidentialité et mesure d'audience - Open Projets" },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory('/home2/'),
  routes,
  scrollBehavior(to) {
    // Un defilement anime impose est un declencheur connu de gene vestibulaire
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (to.hash) {
      // Laisser la route paresseuse se monter avant de viser l'ancre, et
      // compenser l'en-tête fixe.
      return new Promise((resolve) => {
        setTimeout(() => resolve({ el: to.hash, top: 88, behavior: doux ? 'smooth' : 'auto' }), 300)
      })
    }
    return { top: 0, behavior: doux ? 'smooth' : 'auto' }
  },
})

router.afterEach((to) => {
  const mod = to.params.key ? moduleByKey[to.params.key] : null
  document.title = mod ? `${mod.name} - Open Projets` : (to.meta.title || 'Open Projets')
  // La balise est en mode manuel : sans cet appel, seule la première page
  // serait comptée.
  window.OPAnalytics?.pageview({ route: to.name || to.path })
})

export default router
