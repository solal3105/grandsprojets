/* Adresses hors application vitrine.
 *
 * Centralisées ici parce qu'elles sortent du routeur Vue : la vitrine est
 * servie sous /home/, ces pages non. Les recopier dans un composant, c'est se
 * garantir d'en oublier une le jour où le domaine bouge. */

const SITE_URL = 'https://openprojets.com'

// Démo salon : le visiteur tape sa commune, la carte se construit sous ses yeux.
export const DEMO_KIOSK_URL = `${SITE_URL}/demo/`

// Espace de démonstration Métropole de Lyon, alimenté pour de vrai.
export const MAP_LYON_URL = `${SITE_URL}/default`

/* Espaces publics montres en direct dans la vitrine.
 *
 * `?module=` ouvre la carte directement sur le bon module (voir main.js,
 * phase 5) : sans ce parametre l'iframe atterrit sur le module par defaut et
 * le visiteur doit chercher. La cle est ignoree si le module n'est pas actif
 * sur la ville, donc un espace mal choisi se voit tout de suite.
 *
 * metropole-lyon est servi sous /default. Participer n'y est pas active, cet
 * espace pointe donc sur une autre ville de demonstration. */
export const spaceUrl = (city, moduleKey) =>
  `${SITE_URL}/${city}${moduleKey ? `?module=${moduleKey}` : ''}`
