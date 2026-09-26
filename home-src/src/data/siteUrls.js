/* Adresses hors du site vitrine.
 *
 * Centralisées ici parce qu'elles sortent du routeur Vue : le site est servi à
 * la racine, ces pages sont d'autres applications du même domaine. Les
 * recopier dans un composant, c'est se garantir d'en oublier une le jour où
 * une adresse bouge. */

export const SITE_URL = 'https://openprojets.com'

// Démo salon : le visiteur tape sa commune, la carte se construit sous ses yeux.
export const DEMO_KIOSK_URL = `${SITE_URL}/demo/`

// Index de toutes les villes qui ont une page de projets (pré-rendu edge ville-hub).
export const VILLES_URL = `${SITE_URL}/ville/`

// Les cartes des communes construites par la démo (pré-rendu edge cartes).
export const CARTES_URL = `${SITE_URL}/cartes/`

// Le même écran en mode stand : /kiosk redirige vers /cartes/?kiosk=1 (_redirects).
export const KIOSK_URL = `${SITE_URL}/kiosk`

/* L'application d'une collectivité : /ville/{ville}/{module}.
 *
 * Les trois modules publics ont chacun leur adresse, et la carte est le
 * module par défaut. Une clé qui n'est pas un module public retombe sur la
 * carte : l'application ignore de toute façon un module qui n'est pas actif
 * sur la ville, donc un espace mal choisi se voit tout de suite. */
export const PUBLIC_MODULES = ['carte', 'travaux', 'participer']
export const spaceUrl = (city, moduleKey = 'carte') =>
  `${SITE_URL}/ville/${city}/${PUBLIC_MODULES.includes(moduleKey) ? moduleKey : 'carte'}`

// Espace de démonstration Métropole de Lyon, alimenté pour de vrai.
export const MAP_LYON_URL = spaceUrl('metropole-lyon')
