/* Les réglages et les compteurs de la roue, gardés dans le navigateur de la
 * tablette du stand : parts de chaque lot, stock restant, lots gagnés, parties
 * jouées. Ils survivent à un rechargement de la page, pas à un changement
 * d'appareil. Sans stockage disponible (navigation privée), la roue marche
 * quand même, avec les réglages d'origine. */

const CLE = 'op-roue-v1'

export function lireStock(lotsDOrigine) {
  let enregistre = null
  try {
    enregistre = JSON.parse(localStorage.getItem(CLE) || 'null')
  } catch {
    enregistre = null
  }
  const reglages = {}
  for (const lot of lotsDOrigine) {
    const r = enregistre?.reglages?.[lot.key]
    reglages[lot.key] = {
      parts: Number.isInteger(r?.parts) ? r.parts : lot.parts,
      stock: r && 'stock' in r ? r.stock : lot.stock,
    }
  }
  return {
    reglages,
    gagnes: { ...enregistre?.gagnes },
    parties: enregistre?.parties || 0,
  }
}

export function ecrireStock(etat) {
  try {
    localStorage.setItem(CLE, JSON.stringify(etat))
  } catch {
    // Pas de stockage : les compteurs vivent le temps de la page.
  }
}

/* Les lots qui ont leur place sur la roue : au moins une part, et du stock. */
export function lotsEnJeu(lotsDOrigine, etat) {
  return lotsDOrigine
    .map((lot) => ({ ...lot, ...etat.reglages[lot.key] }))
    .filter((lot) => lot.parts > 0 && (lot.stock === null || lot.stock > 0))
}

export function enregistrerGain(etat, cle) {
  etat.parties += 1
  etat.gagnes[cle] = (etat.gagnes[cle] || 0) + 1
  const r = etat.reglages[cle]
  if (r && r.stock !== null) r.stock = Math.max(0, r.stock - 1)
  ecrireStock(etat)
}

export function remettreAZero(lotsDOrigine) {
  const etat = { reglages: {}, gagnes: {}, parties: 0 }
  for (const lot of lotsDOrigine) etat.reglages[lot.key] = { parts: lot.parts, stock: lot.stock }
  ecrireStock(etat)
  return etat
}
