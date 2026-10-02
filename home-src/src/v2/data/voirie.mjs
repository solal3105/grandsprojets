/* Qui délivre les permissions de voirie sur un territoire, au nom de qui
 * l'outil est pris, et ce qu'on en tire pour chiffrer le module Chantiers.
 *
 * Les règles viennent du CGCT (L2213-1 pour la police de la circulation du
 * maire, L3221-4 pour les routes départementales, L5211-9-2 pour le transfert
 * de cette police au président de l'intercommunalité, L5214-16, L5216-5,
 * L5215-20 et L5217-2 pour la compétence voirie selon la catégorie,
 * L5218-2 pour Aix-Marseille-Provence, L3642-2 pour la Métropole de Lyon).
 *
 * Trois organisations possibles, du point de vue des permissions de voirie :
 *  - `toute` : l'intercommunalité les délivre sur toutes les rues ;
 *  - `axes` : elle les délivre sur ses voies d'intérêt communautaire, et
 *    chaque commune sur ses autres rues ;
 *  - `communes` : chaque commune les délivre sur ses rues.
 * La loi tranche pour les métropoles, les communautés urbaines, la Métropole
 * de Lyon, Aix-Marseille et le Grand Paris. Pour une communauté de communes
 * ou d'agglomération, la page demande au nom de qui l'outil est pris, en
 * pré-remplissant la réponse avec BANATIC. */

import { chiffrerChantiers } from './tarification-chantiers.mjs'

export const AIX_MARSEILLE = '200054807'
export const GRAND_PARIS = '200054781'

/* L'intercommunalité qui couvre le territoire, quel qu'il soit */
const intercoDe = (t) => (t.type === 'epci' ? t : t.epci) || null

export function regime(t) {
  if (t.type === 'departement') return 'departement'
  const e = intercoDe(t)
  if (!e) return 'isolee'
  if (e.code === GRAND_PARIS) return 'grand-paris'
  if (e.code === AIX_MARSEILLE) return 'aix'
  if (e.epciType === 'MET69') return 'lyon'
  if (['METRO', 'CU'].includes(e.epciType)) return 'metropole'
  return 'facultative'
}

/* Qui s'abonne, là où la loi ne tranche pas (communauté de communes ou
 * d'agglomération). Pour une intercommunalité, la page le demande :
 * `interco` (un espace) ou `communes` (un par commune). Pour une commune, la
 * réponse vient de BANATIC et se corrige d'un lien : `interco` quand
 * l'intercommunalité délivre ses permissions, `commune` sinon. */
export const nomADemander = (t) => regime(t) === 'facultative' && t.type === 'epci'
export const nomCorrigeable = (t) => regime(t) === 'facultative' && t.type === 'commune'

/* La réponse pré-remplie, d'après la compétence voirie déclarée dans BANATIC
 * (export du 30 septembre 2026 : t = toute, i = intérêt communautaire, n = aucune).
 * Seulement pour les communautés de communes et d'agglomération : pour une
 * métropole ou une communauté urbaine, la loi impose la voirie entière et la
 * base la contredit parfois. */
export function nomPresume(t) {
  if (regime(t) !== 'facultative') return null
  const v = intercoDe(t)?.voirie
  if (!v) return null
  if (t.type === 'epci') return v === 'n' ? 'communes' : 'interco'
  return v === 't' ? 'interco' : 'commune'
}

export const choixNom = (t) => [
  { valeur: 'interco', libelle: `${t.nom}, pour toutes ses communes` },
  { valeur: 'communes', libelle: 'Chaque commune, dans son propre espace' },
]

/* L'organisation qui en découle */
export function organisation(t, nom) {
  switch (regime(t)) {
    case 'lyon':
    case 'metropole':
      return 'toute'
    case 'aix':
      return 'axes'
    case 'grand-paris':
    case 'isolee':
      return 'communes'
    case 'facultative': {
      const choix = nom ?? nomPresume(t)
      if (t.type === 'commune') return choix === 'interco' ? 'toute' : 'communes'
      if (choix === 'communes') return 'communes'
      return intercoDe(t)?.voirie === 'i' ? 'axes' : 'toute'
    }
    default:
      return null
  }
}

/* Qui gère les routes que l'on chiffre. `null` : aucune route à chiffrer
 * (la commune n'a que ses arrêtés dans l'espace de son intercommunalité, ou
 * chaque commune a son propre espace et ses kilomètres officiels). */
export function gestionnaireDesRoutes(t, org) {
  if (t.type === 'departement') return { type: 'departement', nom: 'Le Département' }
  if (t.type === 'commune') return org === 'toute' ? null : { type: 'commune', nom: t.nom }
  return org === 'communes' ? null : { type: 'epci', nom: t.nom }
}

/* Une phrase sur qui fait quoi, pour le récapitulatif */
export function resumeVoirie(t, org) {
  const e = intercoDe(t)
  switch (regime(t)) {
    case 'departement':
      return "Le Département délivre les permissions sur ses routes ; en agglomération, le maire signe l'arrêté de circulation."
    case 'lyon':
      return 'La Métropole délivre les permissions et signe les arrêtés de circulation ; le maire garde le stationnement.'
    case 'metropole':
      return `${e.nom} délivre les permissions et, sauf opposition du maire, signe les arrêtés de circulation.`
    case 'aix':
      return 'La Métropole délivre les permissions sur ses voies ; en agglomération, les maires signent les arrêtés.'
    default:
      if (org === 'toute') return `${e.nom} délivre les permissions et, sauf opposition du maire, signe les arrêtés de circulation.`
      if (org === 'axes') return `${e.nom} délivre les permissions sur ses grands axes, chaque commune sur ses autres rues.`
      return t.type === 'epci' ? 'Chaque commune délivre ses permissions et signe ses arrêtés.' : `${t.nom} délivre ses permissions et signe ses arrêtés.`
  }
}

export const chaqueCommuneASonEspace = (org) => org === 'communes'

/* Ce que l'espace peut faire, au choix : les permissions de voirie, les
 * arrêtés de circulation, ou les deux. Le choix n'a pas de sens pour un
 * Département, qui délivre ses permissions, ni pour une commune dont
 * l'intercommunalité gère les routes, qui n'a que ses arrêtés. */
export const usageAuChoix = (t, org) => t.type !== 'departement' && !(t.type === 'commune' && org === 'toute')

/* Les espaces à chiffrer, au format de chiffrerChantiers().
 * `km` : les kilomètres que gère le gestionnaire, quand il y en a un ;
 * `retenues` : les codes des communes incluses (intercommunalité seulement) ;
 * `usage` : null pour les deux, « permissions » ou « arretes » pour l'un seul. */
export function espacesChantiers(t, { org, km, retenues, usage = null }) {
  const permissions = usage !== 'arretes' || !usageAuChoix(t, org)
  const avecArretes = usage !== 'permissions' || !usageAuChoix(t, org)
  const route = (kmGeres, habitants, kmReseau, reference = 'communale') =>
    (permissions ? { km: kmGeres, habitants, kmReseau, reference } : null)
  const arretesDe = (communes) => (avecArretes ? communes.map((c) => ({ nom: c.nom, population: c.population })) : [])
  if (t.type === 'departement') {
    return [{ nom: t.nom, routes: route(km, t.population, t.km, 'departementale'), arretes: [] }]
  }
  if (t.type === 'commune') {
    if (org === 'toute') return [{ nom: t.epci.nom, arretes: arretesDe([t]) }]
    return [{ nom: t.nom, routes: route(km, t.population, t.km), arretes: arretesDe([t]) }]
  }
  const communes = t.communes.filter((c) => !retenues || retenues.has(c.code))
  if (org === 'communes') {
    return communes.map((c) => ({ nom: c.nom, routes: route(c.km, c.population, c.km), arretes: arretesDe([c]) }))
  }
  return [{ nom: t.nom, routes: route(km, t.population, t.kmReseau), arretes: arretesDe(communes) }]
}

/* Les kilomètres officiels du gestionnaire : ceux de la commune ou des routes
 * du Département, ou tout le réseau d'une intercommunalité */
export const kmOfficiel = (t) => Math.round((t.type === 'epci' ? t.kmReseau : t.km) || 0)

/* Le prix d'un territoire selon les réponses enregistrées
 * ({ nom, usage, km, sans }), les données publiques comblant ce qui manque */
export function chiffrerTerritoire(t, r = {}) {
  const org = organisation(t, r.nom)
  const km = r.km ?? kmOfficiel(t)
  const sans = new Set(r.sans || [])
  const retenues = t.communes ? new Set(t.communes.map((c) => c.code).filter((c) => !sans.has(c))) : null
  const usage = usageAuChoix(t, org) ? r.usage || null : null
  return { org, usage, ...chiffrerChantiers(espacesChantiers(t, { org, km, retenues, usage })) }
}
