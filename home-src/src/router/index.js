import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { alternatives } from '@/data/alternatives.js'

const BASE = 'https://openprojets.com/home'
const DEFAULT_TITLE = 'Open Projets - La carte interactive pour votre collectivité'
const DEFAULT_DESC = 'Open Projets transforme vos projets urbains en carte interactive. Publiez vos projets, informez vos habitants - sans une ligne de code.'

// Pages SEO « Alternative à … » générées depuis data/alternatives.js
const alternativeRoutes = Object.entries(alternatives).map(([key, alt]) => ({
  path: `/${alt.slug}`,
  name: `alternative-${key}`,
  component: () => import('@/views/AlternativeView.vue'),
  meta: {
    altKey: key,
    title: alt.seo.title,
    description: alt.seo.description,
    canonical: alt.seo.canonical,
  },
}))

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
      canonical: `${BASE}/`,
    },
  },
  {
    path: '/fonctionnalites',
    name: 'fonctionnalites',
    component: () => import('@/views/FeaturesView.vue'),
    meta: {
      title: 'Fonctionnalités - Open Projets',
      description: 'Contributions, module travaux, catégories personnalisées, branding, gestion d\'équipe - découvrez toutes les fonctionnalités d\'Open Projets.',
      canonical: `${BASE}/fonctionnalites`,
    },
  },
  {
    path: '/tarifs',
    redirect: '/',
  },
  {
    path: '/a-propos',
    name: 'a-propos',
    component: () => import('@/views/AboutView.vue'),
    meta: {
      title: 'À propos - Open Projets',
      description: 'Open Projets transforme les données publiques en information citoyenne, accessible et transparente pour tous.',
      canonical: `${BASE}/a-propos`,
    },
  },
  {
    path: '/contact',
    name: 'contact',
    component: () => import('@/views/ContactView.vue'),
    meta: {
      title: 'Contact - Open Projets',
      description: 'Demandez une démo d\'Open Projets. On configure votre espace ensemble, en moins d\'une heure.',
      canonical: `${BASE}/contact`,
    },
  },
  {
    path: '/confidentialite',
    name: 'confidentialite',
    component: () => import('@/views/ConfidentialiteView.vue'),
    meta: {
      title: 'Confidentialité et mesure d\'audience - Open Projets',
      description: 'Ce qu\'Open Projets mesure sur ses espaces, ce qu\'il ne mesure pas, et comment refuser cette mesure en un clic depuis votre navigateur.',
      canonical: `${BASE}/confidentialite`,
    },
  },
  {
    path: '/ressources',
    name: 'ressources',
    component: () => import('@/views/RessourcesView.vue'),
    meta: {
      title: 'Ressources : communiquer sur les projets de sa collectivité | Open Projets',
      description: 'Guides pratiques pour les communes : plan de mandat, carte des travaux, information des riverains. Des méthodes concrètes issues du terrain, sans jargon.',
      canonical: `${BASE}/ressources`,
    },
  },
  {
    // Metas posées par la vue (title/canonical propres à chaque article)
    path: '/ressources/:slug',
    name: 'ressource-article',
    component: () => import('@/views/RessourceArticleView.vue'),
  },
  {
    path: '/aide',
    name: 'aide',
    component: () => import('@/views/HelpView.vue'),
    meta: {
      title: 'Aide - Open Projets',
      description: 'Guides d\'utilisation et documentation pour administrateurs et contributeurs Open Projets.',
      canonical: `${BASE}/aide`,
    },
  },
  {
    path: '/aide/guide-:role',
    name: 'guide-print',
    component: () => import('@/views/HelpPrintView.vue'),
    meta: {
      title: 'Guide - Open Projets',
      description: 'Guide d\'utilisation détaillé pour Open Projets.',
      robots: 'noindex',
    },
  },
  {
    path: '/helios',
    name: 'helios',
    component: () => import('@/views/HeliosView.vue'),
    meta: { standalone: true, robots: 'noindex' },
  },
  ...alternativeRoutes,
]

const router = createRouter({
  history: createWebHistory('/home/'),
  routes,
  scrollBehavior(to) {
    // Ancre inter-page (ex. /fonctionnalites#diagnostic) : viser l'élément, en
    // laissant le temps à la route lazy de se monter, et compenser le header fixe.
    if (to.hash) {
      return new Promise((resolve) => {
        setTimeout(() => resolve({ el: to.hash, top: 90, behavior: 'smooth' }), 300)
      })
    }
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

// Mettre à jour les balises <head> SEO à chaque navigation
// (exportées : les vues à routes dynamiques comme /ressources/:slug les réutilisent)
export function setMeta(name, content, attr = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el) }
  el.setAttribute('content', content)
}
export function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', 'canonical'); document.head.appendChild(el) }
  el.setAttribute('href', href)
}
router.afterEach((to) => {
  const { title, description, canonical, robots } = to.meta
  if (title) {
    document.title = title
    setMeta('og:title', title, 'property')
    setMeta('twitter:title', title, 'name')
  }
  if (description) {
    setMeta('description', description)
    setMeta('og:description', description, 'property')
    setMeta('twitter:description', description)
  }
  if (canonical) {
    setCanonical(canonical)
    setMeta('og:url', canonical, 'property')
  }
  if (robots) {
    setMeta('robots', robots)
  }
  // Tracking SPA - envoie une page_view GA4 à chaque navigation
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_title: title || document.title,
      page_location: window.location.href,
      page_path: to.fullPath,
    })
  }
  // Idem pour PostHog : la balise est en mode manuel (voir vite.config.js),
  // sans cet appel seule la toute première page serait comptée.
  window.OPAnalytics?.pageview({ route: to.name || to.path })
})

export default router
