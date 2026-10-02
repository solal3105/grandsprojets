/* Le prix du module Chantiers et arrêtés, à part du reste de la grille.
 *
 * Chantiers ne se facture pas à la population de l'acheteur comme les autres
 * modules : il se facture par ESPACE DE TRAVAIL. Un espace a un seul
 * gestionnaire des routes (une commune, une intercommunalité ou un
 * département) et les communes qui y prennent leurs arrêtés de circulation.
 *
 *  1. Le gestionnaire paie ses routes au kilomètre, chaque kilomètre au prix
 *     de sa tranche, comme l'impôt sur le revenu, sans plafond.
 *  2. Ce montant suit la densité du territoire : habitants par kilomètre de
 *     route, rapportés à la moyenne nationale, en racine carrée. Une route peu
 *     habitée donne lieu à moins de chantiers.
 *  3. Chaque commune de l'espace paie ses arrêtés selon sa population.
 *
 * Modèle arrêté en octobre 2026 sur le simulateur de discussion. Les montants
 * sont ANNUELS et hors taxes : la page de tarification divise par douze pour
 * ranger Chantiers avec les autres modules, puis lui applique les mêmes
 * remises (multi-modules et engagement) et la même mise en service. */

/* Les routes : le prix d'un kilomètre selon sa tranche */
export const BAREME_ROUTES = [
  { jusqua: 25, prix: 30 },
  { jusqua: 100, prix: 20 },
  { jusqua: 500, prix: 12 },
  { jusqua: 2500, prix: 8 },
  { jusqua: Infinity, prix: 5 },
]

/* Les arrêtés : le prix annuel d'une commune selon sa population */
export const GRILLE_ARRETES = [
  { sous: 500, prix: 100 },
  { sous: 2000, prix: 200 },
  { sous: 5000, prix: 400 },
  { sous: 10000, prix: 800 },
  { sous: 20000, prix: 1500 },
  { sous: 50000, prix: 3000 },
  { sous: 100000, prix: 5000 },
  { sous: 200000, prix: 8000 },
  { sous: 350000, prix: 11000 },
  { sous: 600000, prix: 14000 },
  { sous: 1000000, prix: 18000 },
  { sous: Infinity, prix: 24000 },
]

/* Les densités moyennes de 2026, en habitants par kilomètre : 70,2 millions
 * d'habitants pour 896 624 km de voirie communale, et 72,1 millions pour
 * 387 084 km de routes départementales (critères de répartition de la DGF,
 * diffusés par l'OFGL). */
export const DENSITE_REFERENCE = { communale: 78.3, departementale: 186.3 }
export const EXPOSANT_DENSITE = 0.5

/* Le montant des routes au barème, avant la densité */
export function baremeRoutes(km) {
  const longueur = Math.max(0, Number(km) || 0)
  let total = 0
  let bas = 0
  for (const t of BAREME_ROUTES) {
    if (longueur > bas) total += (Math.min(longueur, t.jusqua) - bas) * t.prix
    bas = t.jusqua
  }
  return total
}

/* Le coefficient de densité, arrondi au centième comme il s'affiche */
export function coefficientDensite(densite, reference) {
  const ref = DENSITE_REFERENCE[reference] || DENSITE_REFERENCE.communale
  if (!(densite > 0)) return 1
  return Math.round((densite / ref) ** EXPOSANT_DENSITE * 100) / 100
}

export function prixArretes(population) {
  const p = Math.max(0, Number(population) || 0)
  return GRILLE_ARRETES.find((t) => p < t.sous).prix
}

/* Le prix d'un ou plusieurs espaces. Un espace :
 *   { nom, routes?: { km, habitants, kmReseau, reference }, arretes: [{ nom, population }] }
 * `km` est ce que le gestionnaire gère ; la densité se mesure sur tout le
 * réseau du territoire (`kmReseau`), pour qu'une intercommunalité qui ne
 * déclare que ses grands axes ne paraisse pas plus dense qu'elle n'est. */
export function chiffrerChantiers(espaces) {
  const detail = (espaces || []).map((e) => {
    let routes = null
    if (e.routes) {
      const bareme = baremeRoutes(e.routes.km)
      const densite = e.routes.kmReseau > 0 ? e.routes.habitants / e.routes.kmReseau : 0
      const coefficient = coefficientDensite(densite, e.routes.reference)
      routes = { km: Number(e.routes.km) || 0, bareme, densite, coefficient, reference: e.routes.reference, montant: bareme * coefficient }
    }
    const arretes = (e.arretes || []).map((c) => ({ nom: c.nom, population: c.population, montant: prixArretes(c.population) }))
    const montantArretes = arretes.reduce((s, c) => s + c.montant, 0)
    return { nom: e.nom, routes, arretes, montantArretes, total: (routes?.montant || 0) + montantArretes }
  })
  const annuel = detail.reduce((s, e) => s + e.total, 0)
  return { espaces: detail, annuel, mensuel: annuel / 12 }
}
