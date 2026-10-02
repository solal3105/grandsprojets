/* Trouver une collectivité et lire ce qu'il faut pour la chiffrer.
 *
 * Trois sources publiques, lues depuis le navigateur (CORS ouvert) :
 *  - geo.api.gouv.fr : communes, intercommunalités et départements, avec la
 *    population de l'Insee et la composition des intercommunalités ;
 *  - l'OFGL, qui diffuse les critères de répartition de la DGF 2026 : la
 *    longueur de voirie de chaque commune et des routes de chaque département
 *    (mesurée par l'IGN depuis la réforme de 2025) ;
 *  - BANATIC (ministère de l'Intérieur), extrait dans voirie-banatic.json :
 *    la compétence voirie déclarée par chaque intercommunalité
 *    (t = toute, i = intérêt communautaire, n = aucune). Pour le mettre à
 *    jour : export France de banatic.interieur.gouv.fr, colonne « Création,
 *    aménagement, entretien de la voirie communale », par numéro SIREN.
 *
 * Un territoire se désigne par une clé courte, celle qui voyage dans
 * l'adresse : `commune-69110`, `epci-200066587`, `departement-24`. */

const GEO = 'https://geo.api.gouv.fr/'
const OFGL = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/'
const EXERCICE = '2026'

const lire = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`)
  return r.json()
}
const geo = (chemin) => lire(GEO + chemin)
const ofgl = (jeu, select, where) =>
  lire(`${OFGL}${jeu}/exports/json?select=${select}&where=${encodeURIComponent(`${where} and exercice=date'${EXERCICE}'`)}`)

let banatic = null
async function voirieDeclaree(siren) {
  banatic ||= import('./voirie-banatic.json').then((m) => m.default).catch(() => ({}))
  return (await banatic)[siren] || null
}

/* Les propositions pour ce que l'on tape : départements (si demandés),
 * intercommunalités, puis communes, les plus peuplées d'abord */
export async function chercherTerritoires(saisie, { departements = false } = {}) {
  const q = encodeURIComponent(String(saisie || '').trim())
  const [communes, epcis, depts] = await Promise.all([
    geo(`communes?nom=${q}&fields=nom,code,population,departement&boost=population&limit=5`).catch(() => []),
    geo(`epcis?nom=${q}&fields=nom,code,population&limit=3`).catch(() => []),
    departements ? geo(`departements?nom=${q}&fields=nom,code&limit=2`).catch(() => []) : [],
  ])
  return [
    ...depts.map((d) => ({ cle: `departement-${d.code}`, type: 'departement', nom: d.nom, detail: `Département, ${d.code}` })),
    ...epcis.map((e) => ({ cle: `epci-${e.code}`, type: 'epci', nom: e.nom, detail: 'Intercommunalité', population: e.population })),
    ...communes.map((c) => ({ cle: `commune-${c.code}`, type: 'commune', nom: c.nom, detail: c.departement?.nom || 'Commune', population: c.population })),
  ]
}

/* La longueur de voirie communale de chaque commune, en km, par code INSEE */
async function kmDeVoirie(filtre) {
  const lignes = await ofgl('dotations-communes', 'code_insee,valeur', `${filtre} and variable="Longueur de voirie en mètres"`)
  return Object.fromEntries(lignes.map((l) => [l.code_insee, (Number(l.valeur) || 0) / 1000]))
}

async function intercommunalite(code) {
  const [e, voirie] = await Promise.all([geo(`epcis/${code}?fields=nom,code,type`), voirieDeclaree(code)])
  return { code: e.code, nom: e.nom, epciType: e.type, voirie }
}

async function chargerCommune(code) {
  const [c, km] = await Promise.all([
    geo(`communes/${code}?fields=nom,code,population,epci,departement`),
    kmDeVoirie(`code_insee="${code}"`),
  ])
  return {
    cle: `commune-${c.code}`, type: 'commune', code: c.code, nom: c.nom,
    population: c.population || 0, km: km[c.code] || 0,
    epci: c.epci ? await intercommunalite(c.epci.code) : null,
  }
}

async function chargerEpci(code) {
  const [e, membres, km] = await Promise.all([
    intercommunalite(code),
    geo(`epcis/${code}/communes?fields=nom,code,population`),
    kmDeVoirie(`siren_epci="${code}"`),
  ])
  const communes = membres
    .map((m) => ({ code: m.code, nom: m.nom, population: m.population || 0, km: km[m.code] || 0 }))
    .sort((a, b) => b.population - a.population)
  return {
    cle: `epci-${code}`, type: 'epci', ...e, communes,
    population: communes.reduce((s, c) => s + c.population, 0),
    kmReseau: communes.reduce((s, c) => s + c.km, 0),
  }
}

/* L'Alsace : la Collectivité européenne d'Alsace porte les routes des deux
 * départements, les critères de la DGF les regroupent sous 67A */
async function chargerDepartement(code) {
  const codeDgf = ['67', '68'].includes(code) ? '67A' : code
  const [d, lignes] = await Promise.all([
    geo(`departements/${code}?fields=nom,code`),
    ofgl('dotations-departements', 'variable,valeur', `code_departement="${codeDgf}" and variable in ("Longueur de voirie hors montagne en mètres","Longueur de voirie montagne en mètres","Population DGF")`),
  ])
  const v = Object.fromEntries(lignes.map((l) => [l.variable, Number(l.valeur) || 0]))
  return {
    cle: `departement-${d.code}`, type: 'departement', code: d.code, nom: d.nom,
    population: v['Population DGF'] || 0,
    km: ((v['Longueur de voirie hors montagne en mètres'] || 0) + (v['Longueur de voirie montagne en mètres'] || 0)) / 1000,
  }
}

const CHARGEURS = { commune: chargerCommune, epci: chargerEpci, departement: chargerDepartement }

export const cleValide = (cle) => /^(commune|epci|departement)-[0-9AB]{2,9}$/.test(String(cle || ''))

export function chargerTerritoire(cle) {
  if (!cleValide(cle)) return Promise.reject(new Error(`Territoire inconnu : ${cle}`))
  const [type, code] = cle.split('-')
  return CHARGEURS[type](code)
}
