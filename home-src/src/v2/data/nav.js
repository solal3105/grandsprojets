/* Navigation de la version 2, partagée par l'en-tête et le pied de page.
 *
 * `to` = route du routeur v2, rendue en router-link. `href` + `external` =
 * sortie du site, rendue en lien classique avec une flèche.
 *
 * Chantiers vit sur son propre domaine. Un regroupement des deux sites reste
 * possible plus tard, pour l'instant le lien sort. */
export const CHANTIERS_URL = 'https://openprojets-chantiers.com/'

export const navLinks = [
  // `menu` : l'en-tête construit son propre déroulant depuis data/modules.js,
  // il ne rend donc pas cette entrée comme un lien simple.
  { label: 'Modules', to: '/modules', menu: true },
  { label: 'Chantiers', href: CHANTIERS_URL, external: true },
  { label: 'Ressources', to: '/ressources' },
  { label: 'À propos', to: '/a-propos' },
  { label: 'Contact', to: '/contact' },
]

// Les entrées rendues telles quelles, en-tête comme pied de page.
export const flatLinks = navLinks.filter((l) => !l.menu)

export const CONTACT_URL = '/contact'
