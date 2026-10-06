/* Le moteur de la roue des lots (/roue) : la répartition des cases, la physique
 * de la roue et de sa languette. Rien ici ne touche au navigateur, ce qui permet
 * de le vérifier en pur JS (tests/unauth.roue.spec.js).
 *
 * Le résultat n'est jamais choisi d'avance. La roue part avec une vitesse, ralentit
 * sous l'effet des frottements et des picots, et le lot gagné est celui de la case
 * sur laquelle elle s'arrête. Toutes les cases ont la même taille : la chance d'un
 * lot est exactement la part de la roue qu'il occupe, celle que le visiteur voit.
 *
 * Les angles sont en radians. `angle` est la rotation de la roue dans le sens des
 * aiguilles d'une montre, la languette est en haut. Dans le repère de la roue, la
 * case i va de i·pas à (i+1)·pas, comptés depuis le haut dans le même sens. */

export const TOUR = Math.PI * 2

export const REGLAGES = {
  // Frottement de l'axe : une part proportionnelle à la vitesse, une part fixe.
  frottementVisqueux: 0.25,
  frottementSec: 0.3,
  // Raideur de la languette contre un picot (inertie 1). C'est elle qui fait
  // hésiter la roue sur les derniers picots, et parfois repartir en arrière.
  raideur: 0.55,
  // Part de l'intervalle entre deux picots où la languette touche le picot qui
  // arrive.
  contact: 0.18,
  // Une fois le picot passé, la languette revient en appui sur son autre face
  // et pousse encore la roue sur cette part de l'intervalle, en lui rendant
  // cette part de l'énergie prise. C'est ce qui empêche la roue de s'arrêter
  // pile sur une séparation.
  retour: 0.12,
  restitution: 0.35,
  // Pas de calcul : assez fin pour qu'un picot ne soit jamais sauté.
  pas: 1 / 480,
  // Une roue lancée trop mollement repart avec une vitesse tirée dans cette plage,
  // pour qu'aucun geste ne puisse viser une case.
  vitesseMin: 9,
  vitesseMax: 24,
  // En dessous, le geste n'est pas un lancer : la roue se repose.
  seuilLancer: 2.5,
}

export const mod = (a, b) => ((a % b) + b) % b

/* Les cases de la roue : chaque lot en occupe autant que ses parts, et les lots
 * sont entrelacés pour que deux cases voisines portent, autant que possible, deux
 * lots différents (tourniquet pondéré lissé). */
export function repartirCases(lots) {
  const actifs = lots.filter((l) => l.parts > 0)
  const total = actifs.reduce((n, l) => n + l.parts, 0)
  const courant = actifs.map(() => 0)
  const cases = []
  for (let k = 0; k < total; k++) {
    let meilleur = 0
    for (let i = 0; i < actifs.length; i++) {
      courant[i] += actifs[i].parts
      if (courant[i] > courant[meilleur]) meilleur = i
    }
    courant[meilleur] -= total
    cases.push(actifs[meilleur])
  }
  return cases
}

/* La case sous la languette, pour un angle de roue donné. */
export function caseSousLanguette(angle, nbCases) {
  const pas = TOUR / nbCases
  return Math.min(nbCases - 1, Math.floor(mod(-angle, TOUR) / pas))
}

export function creerRoue(nbCases, angle = 0) {
  return { nbCases, angle, vitesse: 0, contact: 0, arretee: true }
}

/* L'appui de la languette sur un picot. `contact` vaut :
 *   1 quand la roue, tournant dans le sens des aiguilles d'une montre, pousse
 *     la languette avec le picot qui arrive ;
 *   2 quand ce picot vient de passer et que la languette revient en appui
 *     sur son autre face ;
 *  -1 et -2 pour les mêmes situations dans l'autre sens ;
 *   0 quand la languette est libre.
 * Renvoie l'enfoncement (de 0 à 1) et le couple rendu à la roue. */
const borne = (x) => Math.min(1, Math.max(0, x))
function appui(roue, r) {
  const pas = TOUR / roue.nbCases
  const q = mod(roue.angle / pas, 1)
  const k = r.raideur
  switch (roue.contact) {
    case 1: { const d = borne((q - (1 - r.contact)) / r.contact); return { d, couple: -k * d / (r.contact * pas) } }
    case -1: { const d = borne((r.contact - q) / r.contact); return { d, couple: k * d / (r.contact * pas) } }
    case 2: { const d = borne((r.retour - q) / r.retour); return { d, couple: r.restitution * k * d / (r.retour * pas) } }
    case -2: { const d = borne((q - (1 - r.retour)) / r.retour); return { d, couple: -r.restitution * k * d / (r.retour * pas) } }
    default: return { d: 0, couple: 0 }
  }
}

/* Après un déplacement de la roue, met à jour le contact avec les picots et
 * renvoie le nombre de picots franchis (signé : positif dans le sens des
 * aiguilles d'une montre). */
function suivrePicots(roue, avant, r) {
  const pas = TOUR / roue.nbCases
  const yAvant = avant / pas
  const yApres = roue.angle / pas
  const franchis = Math.floor(yApres) - Math.floor(yAvant)
  const q = mod(yApres, 1)
  const sens = Math.sign(roue.angle - avant)
  if (franchis > 0) {
    // Le picot est passé : la languette retombe en appui sur son autre face.
    roue.contact = q <= r.retour ? 2 : 0
  } else if (franchis < 0) {
    roue.contact = q >= 1 - r.retour ? -2 : 0
  } else if (
    (roue.contact === 1 && q < 1 - r.contact) ||
    (roue.contact === -1 && q > r.contact) ||
    (roue.contact === 2 && q > r.retour) ||
    (roue.contact === -2 && q < 1 - r.retour)
  ) {
    roue.contact = 0
  }
  if (roue.contact === 0) {
    if (sens > 0 && q >= 1 - r.contact) roue.contact = 1
    else if (sens < 0 && q <= r.contact) roue.contact = -1
  }
  return franchis
}

/* Lance la roue. Un geste plus faible que le minimum est relancé à une vitesse
 * tirée au hasard, dans le même sens. */
export function lancer(roue, vitesse, hasard = Math.random, r = REGLAGES) {
  const sens = vitesse < 0 ? -1 : 1
  let v = Math.abs(vitesse)
  if (v < r.vitesseMin) v = r.vitesseMin + hasard() * 4
  v = Math.min(r.vitesseMax, v * (0.94 + hasard() * 0.12))
  roue.vitesse = sens * v
  roue.arretee = false
}

/* Fait avancer la roue lancée de `duree` secondes. Renvoie les picots franchis
 * pendant ce temps, avec la vitesse au moment du passage, pour le son. */
export function avancer(roue, duree, r = REGLAGES) {
  const passages = []
  if (roue.arretee) return passages
  let reste = duree
  while (reste > 1e-9 && !roue.arretee) {
    const dt = Math.min(r.pas, reste)
    reste -= dt
    const ressort = appui(roue, r).couple
    let v = roue.vitesse + (ressort - r.frottementVisqueux * roue.vitesse) * dt
    const sec = r.frottementSec * dt
    if (Math.abs(v) > sec) v -= Math.sign(v) * sec
    else v = Math.abs(ressort) > r.frottementSec ? (ressort - Math.sign(ressort) * r.frottementSec) * dt : 0
    const avant = roue.angle
    roue.vitesse = v
    roue.angle += v * dt
    const franchis = suivrePicots(roue, avant, r)
    if (franchis !== 0) passages.push({ sens: Math.sign(franchis), vitesse: Math.abs(v) })
    if (v === 0 && Math.abs(ressort) <= r.frottementSec) roue.arretee = true
  }
  return passages
}

/* Déplace la roue à la main (doigt, ou rotation lente au repos), sans physique. */
export function deplacer(roue, angle) {
  const avant = roue.angle
  roue.angle = angle
  const franchis = suivrePicots(roue, avant, REGLAGES)
  return franchis
}

/* L'angle de la languette, en radians. Un ressort amorti la ramène au centre,
 * et le picot qui l'appuie l'empêche d'y revenir : elle plie devant le picot,
 * claque quand il passe, puis l'accompagne jusqu'à le lâcher. Dans le sens des
 * aiguilles d'une montre, le haut de la roue va vers la droite et pousse la
 * pointe vers la droite, soit un angle négatif. */
export function creerLanguette() {
  return { angle: 0, vitesse: 0 }
}
export function avancerLanguette(languette, roue, dt, amplitude = 0.55) {
  const { d } = appui(roue, REGLAGES)
  const cote = roue.contact > 0 ? -1 : roue.contact < 0 ? 1 : 0
  const butee = cote * d * amplitude * (Math.abs(roue.contact) === 2 ? 0.6 : 1)
  const raideur = 900
  const amorti = 22
  let t = dt
  while (t > 0) {
    const h = Math.min(t, 1 / 240)
    t -= h
    languette.vitesse += (-raideur * languette.angle - amorti * languette.vitesse) * h
    languette.angle += languette.vitesse * h
    if (butee < 0 && languette.angle > butee) {
      languette.angle = butee
      if (languette.vitesse > 0) languette.vitesse = 0
    } else if (butee > 0 && languette.angle < butee) {
      languette.angle = butee
      if (languette.vitesse < 0) languette.vitesse = 0
    }
  }
  if (Math.abs(languette.angle) < 1e-4 && Math.abs(languette.vitesse) < 1e-3) {
    languette.angle = 0
    languette.vitesse = 0
  }
  return languette.angle
}
