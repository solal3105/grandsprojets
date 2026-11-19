/* Le flux produits lu par ChatGPT (spécification « Product feed schema »
 * d'OpenAI : https://developers.openai.com/commerce/specs/file-upload/products).
 *
 * Une ligne par produit, servie à une adresse fixe (/flux-produits.csv et
 * /flux-produits.jsonl, écrits au build par scripts/flux-produits.mjs) : la
 * plateforme d'OpenAI relit le fichier, il suit donc le site à chaque
 * déploiement sans que personne ne le recopie.
 *
 * Rien n'est rédigé ici pour les modules : leurs textes sont ceux des pages
 * de modules (data/modules.js) et leurs prix sortent de la grille
 * (tarification.mjs, tarification-chantiers.mjs). Le prix publié est le
 * plus bas de la grille, celui de la plus petite commune qu'elle chiffre,
 * à l'année et hors taxes : le schéma n'a qu'un prix par ligne, et un prix
 * qui dépend de la population se dit « à partir de » dans la description.
 *
 * OpenArrêté n'est pas un module de la vitrine : c'est le générateur public
 * d'actes, servi par le site de Chantiers. Ses textes reprennent ceux de sa
 * page (dépôt ozon, src/generateur/index.html et src/generateur/marque.ts). */

import { POPULATION, POIDS, MISE_EN_SERVICE, prixUnitaire } from './tarification.mjs'
import { GRILLE_ARRETES } from './tarification-chantiers.mjs'

export const SITE = 'https://openprojets.com'
export const MARQUE = 'Open Projets'
export const PAYS = 'FR'
export const DEVISE = 'EUR'

/* L'ordre des produits dans le flux, et le nom sous lequel chacun y paraît */
const PRODUITS_MODULES = [
  { cle: 'carte', titre: 'Open Projets Carte des projets urbains' },
  { cle: 'travaux', titre: 'Open Projets Travaux du quotidien' },
  { cle: 'participer', titre: 'Open Projets Signalement' },
  { cle: 'diagnostic', titre: 'Open Projets Diagnostic terrain' },
  { cle: 'chantiers', titre: 'Open Projets Chantiers' },
]

export const OPENARRETE = {
  item_id: 'openarrete',
  title: "OpenArrêté, générateur gratuit d'arrêtés de voirie",
  description: "Créez en ligne vos arrêtés de circulation et actes de voirie, gratuitement et sans compte. Arrêtés de circulation, permissions de voirie et permis de stationnement sont rédigés pour vous, avec leurs visas, leurs considérants, leurs articles et leur signalisation. Téléchargez le dossier complet en PDF, Word et ODT : l'avis à afficher, la version à publier et les courriers d'envoi. Sans compte, sans filigrane, gratuit à vie. Offert par Open Projets Chantiers.",
  url: 'https://openprojets-chantiers.com/arrete/',
  image_url: 'https://openprojets-chantiers.com/og-openarrete.png',
  brand: 'OpenArrêté',
  prixAnnuel: 0,
}

const deuxDecimales = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const entier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/* Le montant au format du schéma : point décimal, deux chiffres, code ISO */
export const montant = (euros) => `${(Math.round(euros * 100) / 100).toFixed(2)} ${DEVISE}`

/* Le prix annuel le plus bas de chaque module, hors taxes, hors mise en service */
export function prixPlancher(cle) {
  if (cle === 'chantiers') return GRILLE_ARRETES[0].prix
  if (POIDS[cle] == null) return null
  return prixUnitaire(POPULATION.min) * POIDS[cle] * 12
}

/* La phrase qui dit d'où vient le prix publié */
function phrasePrix(cle, annuel) {
  const prix = `${deuxDecimales.format(annuel)} € HT par an`
  const reste = `Une mise en service unique s'ajoute, égale à ${MISE_EN_SERVICE.mois} mois d'abonnement. Simulez le prix de votre collectivité sur ${SITE}/tarification.`
  if (cle === 'chantiers') {
    const sous = entier.format(GRILLE_ARRETES[0].sous)
    return `À partir de ${prix} : les arrêtés d'une commune de moins de ${sous} habitants. Le prix d'un espace de travail suit les kilomètres de routes du gestionnaire et la population de chaque commune. ${reste}`
  }
  const habitants = entier.format(POPULATION.min)
  return `À partir de ${prix} pour une commune de ${habitants} habitants : le prix suit la population, et prendre plusieurs modules fait baisser le plus cher. ${reste}`
}

const ligne = ({ item_id, title, description, url, image_url, brand, prixAnnuel }) => ({
  item_id,
  title,
  description,
  url,
  brand,
  seller_name: MARQUE,
  seller_url: `${SITE}/`,
  image_url,
  availability: 'in_stock',
  price: montant(prixAnnuel),
  target_countries: [PAYS],
  store_country: PAYS,
})

/* Les lignes du flux. `modules` : le tableau de data/modules.js, passé par
 * l'appelant (il importe des icônes Vue que seul Vite sait résoudre). */
export function construireFlux(modules, { chantiersUrl }) {
  const parCle = Object.fromEntries(modules.map((m) => [m.key, m]))
  const lignes = PRODUITS_MODULES.map(({ cle, titre }) => {
    const m = parCle[cle]
    if (!m) throw new Error(`flux produits : module « ${cle} » absent de data/modules.js`)
    const prixAnnuel = prixPlancher(cle)
    return ligne({
      item_id: `module-${cle}`,
      title: titre,
      description: `${m.problem} ${m.produces} ${phrasePrix(cle, prixAnnuel)}`,
      url: cle === 'chantiers' ? chantiersUrl : `${SITE}/${cle}`,
      image_url: `${SITE}/img/og/${cle}.jpg`,
      brand: MARQUE,
      prixAnnuel,
    })
  })
  return [...lignes, ligne(OPENARRETE)]
}

/* Les deux écritures du même flux. JSONL : celle des exemples de la
 * spécification, tableaux natifs. CSV : cellules entre guillemets quand il le
 * faut, guillemets doublés, tableaux écrits en JSON. */
export const COLONNES = ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'seller_url', 'image_url', 'availability', 'price', 'target_countries', 'store_country']

export const versJsonl = (lignes) => lignes.map((l) => JSON.stringify(l)).join('\n') + '\n'

function cellule(valeur) {
  const texte = Array.isArray(valeur) ? JSON.stringify(valeur) : String(valeur)
  return /[",\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

export const versCsv = (lignes) =>
  [COLONNES.join(','), ...lignes.map((l) => COLONNES.map((c) => cellule(l[c])).join(','))].join('\r\n') + '\r\n'
