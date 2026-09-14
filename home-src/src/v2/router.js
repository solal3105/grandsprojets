import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import ModuleView from './views/ModuleView.vue'
import { alternatives } from '@/data/alternatives.js'
import { setMeta, setCanonical } from '@/lib/head.js'

const BASE = 'https://openprojets.com'
const DEFAULT_TITLE = 'La carte des projets de votre collectivité | Open Projets'
const DEFAULT_DESC = 'Publiez les projets urbains et les chantiers de votre commune sur une carte à vos couleurs, sans développement. Vos habitants consultent sans compte.'

/* Titre (60 caractères au plus, un seul suffixe « | Open Projets ») et
 * description (160 au plus, une phrase entière) de chaque page.
 *
 * Ces textes sont définis DEUX fois : ici, pour le rendu client et le
 * prérendu, et dans netlify/edge-functions/home-seo.js, qui les sert aux
 * robots à la volée. Les deux doivent rester identiques (docs/seo.md, test
 * unauth.seo-snippets). */
const MODULE_PAGES = {
  carte: {
    title: 'Carte des projets urbains de votre commune | Open Projets',
    description: "Chaque projet d'aménagement a sa fiche publique, avec sa propre adresse, sur une carte à vos couleurs. Vos habitants la consultent sans compte ni application.",
  },
  travaux: {
    title: 'Les travaux du quotidien sur une carte | Open Projets',
    description: 'Chaque chantier affiche son emprise, ses dates et son avancement sur la carte de votre commune. Les riverains savent ce qui se passe sans appeler la mairie.',
  },
  chantiers: {
    title: 'Chantiers et arrêtés de voirie en ligne | Open Projets',
    description: "Les entreprises déposent leurs demandes en ligne, vos services instruisent dans un fil daté, et chaque chantier est suivi jusqu'à la réouverture de la rue.",
  },
  participer: {
    title: 'Le signalement des habitants sur une carte | Open Projets',
    description: 'Un habitant signale un problème en deux minutes, sans créer de compte. Vous décidez de ce qui devient public et vous suivez le traitement sur la carte.',
  },
  diagnostic: {
    title: "Le diagnostic de terrain assisté par l'IA | Open Projets",
    description: "Tracez une zone : l'IA lit chaque point qu'elle contient et vous rend une synthèse sourcée, des signalements aux comptages et aux aménagements cyclables.",
  },
}

/* Les cinq pages de modules, en tête d'adresse : /carte, /travaux... La clé
 * du module est portée par la route (meta.moduleKey), la vue la lit là. */
const moduleRoutes = Object.entries(MODULE_PAGES).map(([key, seo]) => ({
  path: `/${key}`,
  name: `module-${key}`,
  component: ModuleView,
  meta: { moduleKey: key, title: seo.title, description: seo.description, canonical: `${BASE}/${key}` },
}))

/* Pages « Alternative à … », générées depuis data/alternatives.js : elles
 * captent les recherches sur les outils que les communes utilisent déjà. */
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
    meta: { title: DEFAULT_TITLE, description: DEFAULT_DESC, canonical: `${BASE}/` },
  },
  ...moduleRoutes,
  // Les anciennes adresses des pages de modules, jamais indexées mais peut-être
  // partagées à la main pendant la refonte.
  { path: '/modules', redirect: '/' },
  { path: '/modules/:key', redirect: (to) => `/${to.params.key}` },
  {
    path: '/tarification',
    name: 'tarification',
    component: () => import('./views/TarificationView.vue'),
    meta: {
      title: 'Estimez le prix pour votre collectivité | Open Projets',
      description: "Estimez le prix d'Open Projets en trois réglages : la taille de votre commune, les modules que vous activez et la durée d'engagement. Montants hors taxes.",
      canonical: `${BASE}/tarification`,
    },
  },
  {
    /* L'estimation budgétaire à envoyer à une collectivité : un document A4,
       imprimé en PDF par le navigateur. `document` : sans en-tête ni pied de
       page du site. Hors des moteurs : c'est un document personnel. */
    path: '/tarification/estimation',
    name: 'estimation',
    component: () => import('./views/EstimationView.vue'),
    meta: { title: 'Estimation budgétaire | Open Projets', document: true, robots: 'noindex, nofollow' },
  },
  // L'ancienne page des tarifs, retirée bien avant la refonte
  { path: '/tarifs', redirect: '/tarification' },
  {
    path: '/ressources',
    name: 'ressources',
    component: () => import('./views/RessourcesView.vue'),
    meta: {
      title: 'Communiquer sur les projets de sa commune | Open Projets',
      description: 'Guides pratiques pour les communes : plan de mandat, carte des travaux, information des riverains. Des méthodes concrètes issues du terrain, sans jargon.',
      canonical: `${BASE}/ressources`,
    },
  },
  {
    // Pas de metas ici : la vue partagée pose les siennes (titre, description
    // et canonical propres à chaque guide).
    path: '/ressources/:slug',
    name: 'ressource-article',
    component: () => import('./views/RessourceArticleView.vue'),
    meta: { ownHead: true },
  },
  {
    path: '/a-propos',
    name: 'a-propos',
    component: () => import('./views/AboutView.vue'),
    meta: {
      title: 'Open Projets, un outil français et open source',
      description: 'Open Projets est édité à Lyon par VAZY, Société à Mission. Code ouvert, hébergement en Europe, données sous le contrôle de votre collectivité.',
      canonical: `${BASE}/a-propos`,
    },
  },
  {
    path: '/aide',
    name: 'aide',
    component: () => import('@/views/HelpView.vue'),
    meta: {
      title: "Centre d'aide : les guides d'utilisation | Open Projets",
      description: "Comment publier un projet, gérer les catégories, inviter un agent ou activer le module travaux : les guides d'Open Projets, administrateur et contributeur.",
      canonical: `${BASE}/aide`,
    },
  },
  {
    // Les guides imprimables : une page par rôle, hors des moteurs
    path: '/aide/guide-:role',
    name: 'guide-print',
    component: () => import('@/views/HelpPrintView.vue'),
    meta: { title: "Guide d'utilisation | Open Projets", robots: 'noindex, nofollow' },
  },
  {
    path: '/confidentialite',
    name: 'confidentialite',
    component: () => import('@/views/ConfidentialiteView.vue'),
    meta: {
      title: "Confidentialité et mesure d'audience | Open Projets",
      description: "Ce qu'Open Projets mesure sur ses espaces, ce qu'il ne mesure pas, et comment refuser cette mesure en un clic depuis votre navigateur.",
      canonical: `${BASE}/confidentialite`,
    },
  },
  ...alternativeRoutes,
  {
    /* La page des clients Hélios : hors du menu, du plan du site et des
       moteurs. Son adresse est donnée par Hélios à ses clients. */
    path: '/helios',
    name: 'helios',
    component: () => import('./views/HeliosView.vue'),
    meta: {
      title: 'Open Projets pour les clients Hélios | Open Projets',
      description: "Client Hélios, retrouvez vos chantiers et vos projets d'aménagement sur une carte publique que vos habitants consultent sans compte ni application.",
      robots: 'noindex, nofollow',
    },
  },
  // Les pages de l'ancien site absorbées par l'accueil, et les liens déjà partagés
  { path: '/fonctionnalites', redirect: '/' },
  { path: '/contact', redirect: { path: '/', hash: '#contact' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory('/'),
  routes,
  scrollBehavior(to, from, savedPosition) {
    // Un defilement anime impose est un declencheur connu de gene vestibulaire
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Même page, seule l'adresse change (l'estimateur y écrit ses réglages à
    // chaque clic) : on ne bouge pas. Un retour arrière reprend sa position.
    if (savedPosition) return savedPosition
    if (from && to.path === from.path && !to.hash) return false
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

/* Les balises <head> de chaque page. Le prérendu les fige dans le HTML servi
 * aux robots ; en navigation, elles suivent la page affichée. Une page qui
 * pose ses propres metas (les guides Ressources) est laissée tranquille. */
router.afterEach((to) => {
  if (!to.meta.ownHead) {
    const title = to.meta.title || DEFAULT_TITLE
    document.title = title
    setMeta('og:title', title, 'property')
    setMeta('twitter:title', title, 'name')
    const description = to.meta.description || DEFAULT_DESC
    setMeta('description', description)
    setMeta('og:description', description, 'property')
    setMeta('twitter:description', description)
    // Une page cachée porte quand même sa propre adresse canonique : sinon
    // elle garderait celle de l'accueil, figée dans le HTML de départ.
    const canonical = to.meta.canonical || `${BASE}${to.path}`
    setCanonical(canonical)
    setMeta('og:url', canonical, 'property')
    setMeta('robots', to.meta.robots || 'index, follow')
  }
  // Google Analytics, en parallèle de PostHog : la balise est chargée sans
  // page vue automatique (index.html), c'est ici qu'elle part.
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: to.fullPath,
    })
  }
  // La balise PostHog est en mode manuel : sans cet appel, seule la première
  // page serait comptée.
  window.OPAnalytics?.pageview({ route: to.name || to.path })
})

export default router
