/* Le modèle de prix, à part de la page qui l'affiche.
 *
 * Tout ce qui est un chiffre de politique tarifaire est ici, en tête, et
 * nulle part ailleurs : la page ne fait que lire `estimer()`. Les règles :
 *
 *  1. Le prix d'un module suit la population en PUISSANCE 0,6 : une commune
 *     dix fois plus peuplée paie quatre fois plus. C'est la forme des grilles
 *     publiées par le marché (étude de marché conservée hors dépôt,
 *     septembre 2026) ; une droite logarithmique, essayée d'abord, était
 *     quatre à six fois trop chère pour les villages et très en dessous du
 *     marché pour les grandes villes. Une seule ancre fixe toute la courbe :
 *     le prix d'une unité de poids pour 12 000 habitants.
 *  2. Chaque module a un POIDS : son prix est l'unité fois son poids. Le
 *     module chantiers est à demi-poids pour les petites communes.
 *  3. Prendre plusieurs modules fait baisser LE PLUS CHER d'entre eux :
 *     10 % par module ajouté (2 modules : -10 % sur le plus cher, 3 : -20 %,
 *     4 : -30 %, 5 : -40 %).
 *  4. L'engagement fait baisser l'abonnement entier, chaque année : 2 ans
 *     -10 %, 3 ans -15 %, 4 ans -20 % (le marché offre trois mois pour deux
 *     ans et six mois pour trois ans).
 *  5. La mise en service coûte trois mois d'abonnement, tel qu'il sort après
 *     toutes les remises, une seule fois. Elle est offerte aux communes de
 *     moins de 2 000 habitants : aucun éditeur à prix public n'en facture sur
 *     ce segment.
 *
 * Tous les montants sont hors taxes. */

/* La courbe : prix mensuel HT d'une unité de poids à l'ancre, et l'exposant
 * qui dit à quelle vitesse il monte avec la population. Ce sont LES deux
 * chiffres à régler pour déplacer toute la grille. */
export const ANCRE = { population: 12000, prix: 300 }
export const EXPOSANT = 0.6

/* La population que la page laisse choisir. En dessous de 500 habitants le
 * curseur n'a plus de sens, au-dessus de 2,5 millions il n'y a plus de
 * commune française. */
export const POPULATION = { min: 500, max: 2500000, defaut: 12000 }

/* Le poids de chaque module, par clé de data/modules.js. Un module absent
 * d'ici n'a pas de prix et n'apparaît pas sur la page. */
export const POIDS = {
  carte: 1,
  travaux: 0.6,
  participer: 2,
  diagnostic: 0.8,
  chantiers: 4,
}

/* Le module chantiers vaut la moitié de son poids sous 5 000 habitants, son
 * poids entier à partir de 20 000, et monte en pente douce entre les deux :
 * au prix plein, une commune de 3 000 habitants paierait ce que Sogelink
 * facture à une ville moyenne. */
export const CHANTIERS_DEMI_POIDS = { sous: 5000, plein: 20000 }

/* La mise en service : trois mois d'abonnement, offerte sous 2 000 habitants */
export const MISE_EN_SERVICE = { mois: 3, offerteSous: 2000 }

/* Remise sur le module le plus cher : ce taux par module ajouté au premier */
export const REMISE_PAR_MODULE_AJOUTE = 0.10

/* Les durées d'engagement proposées, et la remise annuelle de chacune */
export const ENGAGEMENTS = [
  { annees: 1, remise: 0 },
  { annees: 2, remise: 0.10 },
  { annees: 3, remise: 0.15 },
  { annees: 4, remise: 0.20 },
]

/* Les seuils de la commande publique, tels qu'ils s'appliquent aux
 * collectivités pour un achat de services (vérifiés en septembre 2026) :
 *
 *  - la valeur du besoin s'apprécie sur le montant TOTAL hors taxes du marché,
 *    sur toute sa durée, options et reconductions comprises (R2121-1), et
 *    l'acheteur y agrège les services homogènes de l'année (R2121-6) ; un
 *    marché de plus de 48 mois ou sans terme compte pour 48 mois (R2121-7) ;
 *  - sous 60 000 € HT (depuis le 1er avril 2026, décret 2025-1386, R2122-8),
 *    l'acheteur commande sans publicité ni mise en concurrence préalables,
 *    mais doit retenir une offre pertinente, faire bon usage des deniers
 *    publics et ne pas contracter systématiquement avec le même fournisseur ;
 *  - de 60 000 à 90 000 € HT, procédure adaptée : mise en concurrence, avec
 *    une publicité librement adaptée (R2131-12, 1°) ;
 *  - à partir de 90 000 € HT, l'avis de marché paraît au BOAMP ou dans un
 *    journal d'annonces légales (R2131-12, 2°) ;
 *  - à partir de 216 000 € HT (seuil européen 2026-2027 pour les
 *    collectivités), procédure formalisée : appel d'offres publié au JOUE.
 *
 * Un contrat écrit est de toute façon obligatoire dès 25 000 € HT (R2112-1),
 * et un accord-cadre ne dépasse pas quatre ans (L2125-1) : c'est pourquoi la
 * page s'arrête à quatre ans d'engagement. */
export const SOUS_LES_SEUILS = "Sous 60 000 € HT sur toute la durée, mise en service comprise, votre collectivité peut commander sans publicité ni mise en concurrence préalables. Elle doit seulement retenir une offre pertinente, faire bon usage des deniers publics et ne pas contracter systématiquement avec le même fournisseur."

/* Le texte de chaque seuil est celui qu'on lit quand le total le DÉPASSE */
export const SEUILS = [
  {
    montant: 60000,
    nom: 'Procédure adaptée',
    court: '60 000 €',
    texte: "Au-delà de 60 000 € HT sur toute la durée, votre collectivité passe une procédure adaptée : elle met en concurrence et choisit elle-même la publicité qui convient à ce montant.",
  },
  {
    montant: 90000,
    nom: 'Publicité obligatoire',
    court: '90 000 €',
    texte: "À partir de 90 000 € HT sur toute la durée, l'avis de marché doit paraître au BOAMP ou dans un journal d'annonces légales, toujours en procédure adaptée.",
  },
  {
    montant: 216000,
    nom: 'Procédure formalisée',
    court: '216 000 €',
    texte: "À partir de 216 000 € HT sur toute la durée, seuil européen 2026-2027, le marché passe en procédure formalisée : un appel d'offres, publié au Journal officiel de l'Union européenne.",
  },
]

/* Des communes types, pour choisir en un geste plutôt qu'au curseur */
export const REPERES = [
  { nom: 'Village', population: 800 },
  { nom: 'Bourg', population: 3000 },
  { nom: 'Petite ville', population: 12000 },
  { nom: 'Ville moyenne', population: 50000 },
  { nom: 'Grande ville', population: 150000 },
  { nom: 'Métropole', population: 500000 },
]

/* Le curseur de la page va de 0 à 1 et parcourt la population en
 * logarithme : la moitié du curseur est à la moyenne géométrique des bornes,
 * pas à 1,25 million. */
const LOG_MIN = Math.log(POPULATION.min)
const LOG_MAX = Math.log(POPULATION.max)

export function curseurVersPopulation(t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0))
  return Math.round(Math.exp(LOG_MIN + (LOG_MAX - LOG_MIN) * x))
}

export function populationVersCurseur(population) {
  const p = borner(population)
  return (Math.log(p) - LOG_MIN) / (LOG_MAX - LOG_MIN)
}

export function borner(population) {
  const p = Math.round(Number(population) || POPULATION.defaut)
  return Math.min(POPULATION.max, Math.max(POPULATION.min, p))
}

/* Le prix mensuel HT d'une unité de poids pour cette population : la courbe
 * en puissance qui passe par l'ancre. */
export function prixUnitaire(population) {
  const p = borner(population)
  return ANCRE.prix * (p / ANCRE.population) ** EXPOSANT
}

/* Le poids d'un module pour cette population : celui de la table, sauf le
 * module chantiers qui monte de la moitié au plein entre ses deux bornes,
 * en logarithme de la population pour rester régulier au curseur. */
export function poidsDe(cle, population) {
  const base = POIDS[cle]
  if (base == null) return null
  if (cle !== 'chantiers') return base
  const p = borner(population)
  const { sous, plein } = CHANTIERS_DEMI_POIDS
  if (p <= sous) return base / 2
  if (p >= plein) return base
  const x = (Math.log(p) - Math.log(sous)) / (Math.log(plein) - Math.log(sous))
  return base * (0.5 + 0.5 * x)
}

export function remiseEngagement(annees) {
  return ENGAGEMENTS.find((e) => e.annees === Number(annees))?.remise ?? 0
}

/* L'estimation complète. `modules` : les clés retenues. Tous les montants
 * rendus sont mensuels HT, sauf ceux qui portent « annuel », « setup » et
 * « total » dans leur nom. Rien n'est arrondi ici : la page arrondit à
 * l'affichage, pour que les lignes s'additionnent encore. */
export function estimer({ population, modules, annees }) {
  const unite = prixUnitaire(population)
  const retenus = (modules || []).filter((k) => POIDS[k] != null)
  const lignes = retenus.map((cle) => {
    const poids = poidsDe(cle, population)
    return { cle, poids, prix: unite * poids }
  })
  const brut = lignes.reduce((s, l) => s + l.prix, 0)

  // Le plus cher des modules retenus porte la remise multi-modules
  const plusCher = lignes.reduce((max, l) => (max && max.prix >= l.prix ? max : l), null)
  const tauxModules = Math.min(0.9, Math.max(0, lignes.length - 1) * REMISE_PAR_MODULE_AJOUTE)
  const remiseModules = plusCher ? plusCher.prix * tauxModules : 0
  const apresModules = brut - remiseModules

  const tauxEngagement = remiseEngagement(annees)
  const remiseEngagementMontant = apresModules * tauxEngagement
  const mensuel = apresModules - remiseEngagementMontant
  const annuel = mensuel * 12
  const setupOfferte = borner(population) < MISE_EN_SERVICE.offerteSous
  const setup = setupOfferte ? 0 : mensuel * MISE_EN_SERVICE.mois
  const duree = Number(annees) || 1
  const total = setup + annuel * duree

  return {
    population: borner(population),
    unite,
    lignes,
    brut,
    remiseModules: { taux: tauxModules, montant: remiseModules, module: plusCher?.cle || null },
    remiseEngagement: { taux: tauxEngagement, montant: remiseEngagementMontant },
    mensuel,
    annuel,
    setup,
    setupOfferte,
    annees: duree,
    total,
    // Le premier seuil que le total dépasse, du plus haut au plus bas
    seuilDepasse: [...SEUILS].reverse().find((s) => total >= s.montant) || null,
  }
}

const formatEntier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

export function euros(montant) {
  return `${formatEntier.format(Math.round(Number(montant) || 0))} €`
}

export function nombre(n) {
  return formatEntier.format(Math.round(Number(n) || 0))
}

export function pourcent(taux) {
  return `${Math.round((Number(taux) || 0) * 100)} %`
}
