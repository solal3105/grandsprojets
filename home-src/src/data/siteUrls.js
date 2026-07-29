/* Adresses hors application vitrine.
 *
 * Centralisées ici parce qu'elles sortent du routeur Vue : la vitrine est
 * servie sous /home/, ces pages non. Les recopier dans un composant, c'est se
 * garantir d'en oublier une le jour où le domaine bouge. */

export const SITE_URL = 'https://openprojets.com'

// Démo salon : le visiteur tape sa commune, la carte se construit sous ses yeux.
export const DEMO_KIOSK_URL = `${SITE_URL}/demo/`

// Espace de démonstration Métropole de Lyon, alimenté pour de vrai.
export const MAP_LYON_URL = `${SITE_URL}/default`
