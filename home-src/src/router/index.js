import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { alternatives } from '@/data/alternatives.js'
import { setMeta, setCanonical } from '@/lib/head.js'

// Ré-exportées : les vues qui les importaient d'ici continuent de marcher.
export { setMeta, setCanonical }

const BASE = 'https://openprojets.com/home'
const DEFAULT_TITLE = 'La carte interactive des projets de votre collectivité | Open Projets'
const DEFAULT_DESC = 'Publiez les projets urbains et les chantiers de votre commune sur une carte interactive à vos couleurs, sans développement. Vos habitants consultent sans compte.'

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
      title: 'Fonctionnalités : carte des projets, travaux, diagnostic | Open Projets',
      description: 'Fiches projet géolocalisées, module travaux pour les riverains, catégories et identité visuelle de votre collectivité, gestion d\'équipe, diagnostic de terrain par l\'IA.',
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
      title: 'À propos : un outil français et open source pour les collectivités | Open Projets',
      description: 'Open Projets est édité à Lyon par VAZY, Société à Mission. Code ouvert, hébergement en Europe, données sous le contrôle de votre collectivité.',
      canonical: `${BASE}/a-propos`,
    },
  },
  {
    path: '/contact',
    name: 'contact',
    component: () => import('@/views/ContactView.vue'),
    meta: {
      title: 'Demander une démo | Open Projets',
      description: 'Demandez une démonstration d\'Open Projets : nous préparons la carte de votre commune avant l\'appel et configurons votre espace ensemble, sans frais caché.',
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
      title: 'Centre d\'aide : guides administrateur et contributeur | Open Projets',
      description: 'Comment publier un projet, gérer les catégories, inviter un agent ou activer le module travaux : les guides d\'utilisation d\'Open Projets, pour administrateurs et contributeurs.',
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
