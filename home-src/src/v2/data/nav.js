/* Navigation de la version 2, partagée par l'en-tête et le pied de page.
 *
 * `to` = route du routeur v2, rendue en router-link. `href` + `external` =
 * sortie du site, rendue en lien classique avec une flèche.
 *
 * Chantiers ne figure plus ici : c'est un module, il vit dans le menu des
 * modules avec les quatre autres. Son adresse est dans data/modules.js. */
export const navLinks = [
  // Le retour a l'accueil ailleurs que sur le logo. `exact` : la route racine
  // prefixe toutes les autres, sans lui le lien serait souligne partout.
  { label: 'Accueil', to: '/', exact: true },
  // `menu` : l'en-tête construit son propre déroulant depuis data/modules.js,
  // il ne rend donc pas cette entrée comme un lien simple.
  { label: 'Modules', menu: true },
  { label: 'Ressources', to: '/ressources' },
  { label: 'À propos', to: '/a-propos' },
]

// Les entrées rendues telles quelles, en-tête comme pied de page.
export const flatLinks = navLinks.filter((l) => !l.menu)

/* Le formulaire n'a plus de page a lui : il ferme chaque page du site. Sur
 * une page qui le porte, on y descend ; ailleurs on retourne a celui de
 * l'accueil. L'en-tete n'affiche plus d'entree « Contact » : son bouton
 * « Demander une démo », juste a cote, mene deja la. */
export const CONTACT_ANCRE = { hash: '#contact' }
export const CONTACT_URL = { path: '/', hash: '#contact' }
