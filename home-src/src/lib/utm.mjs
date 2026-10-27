/* La fabrique des liens marqués de la page /lien.
 *
 * Tout est fait ici, sans dépendance et sans réseau : nettoyage de ce qui est
 * saisi, contrôle du domaine, assemblage de l'adresse finale. PostHog lit les
 * paramètres utm_* dès la première page vue, il n'y a donc rien à installer
 * sur la page d'arrivée.
 *
 * Règle : ce qui s'affiche à l'écran reste en français lisible (« Salon des
 * maires »), ce qui part dans l'adresse est mis au propre (« salon-des-maires »).
 * Sans cette mise au propre, la même opération se compte plusieurs fois. */

// Les domaines vers lesquels un lien peut pointer. Un lien marqué sert à
// mesurer NOS pages : si la cible n'est pas à nous, la mesure n'existe pas, et
// l'adresse courte deviendrait une redirection ouverte depuis notre domaine.
export const DOMAINES = ['openprojets.com', 'openprojets-chantiers.com']

/** Le domaine fait-il partie des nôtres, sous-domaines compris ? */
export function domaineConnu(hostname) {
  const h = String(hostname || '').toLowerCase()
  return DOMAINES.some((d) => h === d || h.endsWith(`.${d}`))
}

/** « Salon des Maires 2026 ! » devient « salon-des-maires-2026 ». */
export function normaliser(texte) {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/* Lit une adresse et dit si nous acceptons de la traiter, sans rien y toucher
 * d'autre que le protocole. C'est ce que vérifie l'enregistrement d'une adresse
 * courte : la cible y arrive déjà marquée, et ses marqueurs doivent survivre
 * intacts jusqu'à la redirection. */
export function validerCible(saisie) {
  const brut = String(saisie || '').trim()
  if (!brut) return { url: null, erreur: null }

  let url
  try {
    url = new URL(/^https?:\/\//i.test(brut) ? brut : `https://${brut}`)
  } catch {
    return { url: null, erreur: "Cette adresse n'est pas lisible. Collez-la depuis la barre de votre navigateur." }
  }

  if (!domaineConnu(url.hostname)) {
    return {
      url: null,
      erreur: `Cette page n'est pas la nôtre. Un lien marqué ne se mesure que sur ${DOMAINES.join(' ou ')}.`,
    }
  }

  url.protocol = 'https:'
  return { url, erreur: null }
}

/* Lit l'adresse collée par le commercial, et retire les marqueurs qu'elle
 * porterait déjà : on recolle souvent un lien marqué pour le refaire
 * autrement, et deux jeux de marqueurs empilés fausseraient la mesure. */
export function analyserCible(saisie) {
  const { url, erreur } = validerCible(saisie)
  if (!url) return { url: null, erreur }

  // La liste est figée avant de supprimer : on ne retire pas des clés en
  // parcourant celles de l'objet qu'on modifie.
  const marqueurs = Array.from(url.searchParams.keys()).filter((cle) => cle.startsWith('utm_'))
  for (const cle of marqueurs) url.searchParams.delete(cle)
  return { url, erreur: null }
}

/* Assemble l'adresse à partager. Les paramètres vides sont laissés de côté :
 * un utm_content vide vaut moins que pas d'utm_content du tout. */
export function construire({ cible, source, medium, campagne, contenu }) {
  const { url } = analyserCible(cible)
  if (!url || !source) return ''

  const marqueurs = [
    ['utm_source', normaliser(source)],
    ['utm_medium', normaliser(medium)],
    ['utm_campaign', normaliser(campagne)],
    ['utm_content', normaliser(contenu)],
  ]
  for (const [cle, valeur] of marqueurs) {
    if (valeur) url.searchParams.set(cle, valeur)
  }
  return url.toString()
}

/* La fin proposée pour l'adresse courte : le nom de l'opération, qui se lit et
 * se dicte. Elle reste modifiable à l'écran, et le serveur refuse une fin déjà
 * prise par une autre cible. */
export function codepropose({ campagne, source }) {
  const propose = normaliser(campagne) || normaliser(source)
  return propose.slice(0, 40).replace(/-+$/, '')
}

/** Le format accepté par la base : minuscules, chiffres et tirets, 2 à 40. */
export const CODE_VALIDE = /^[a-z0-9][a-z0-9-]{1,39}$/
