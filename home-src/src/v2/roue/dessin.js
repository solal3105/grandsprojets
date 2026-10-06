/* Le dessin de la roue des lots, fait une fois pour toutes dans des canvas.
 *
 * Pendant la partie, rien n'est redessiné : la carte graphique fait seulement
 * tourner l'image du disque et varier l'opacité de deux calques (le flou de
 * vitesse, les ampoules allumées). C'est ce qui tient soixante images par
 * seconde sur une tablette modeste.
 *
 * Géométrie : le cadre fixe a un rayon de 1 (unité `R`), le disque qui tourne
 * un rayon de DISQUE. Dans le repère du disque, les angles se comptent depuis
 * le haut, dans le sens des aiguilles d'une montre. */

export const DISQUE = 0.86
export const NB_AMPOULES = 24
const RAYON_AMPOULES = 0.93

const versCanvas = (lambda) => lambda - Math.PI / 2

/* Un canvas à la bonne définition : la densité de l'écran, plafonnée à 1,5 pour
 * ménager la mémoire de la tablette. */
export function preparerCanvas(canvas, taille) {
  const densite = Math.min(window.devicePixelRatio || 1, 1.5)
  const px = Math.round(taille * densite)
  if (canvas.width !== px) {
    canvas.width = px
    canvas.height = px
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, px, px)
  return { ctx, px }
}

function picto(ctx, chemins, x, y, taille, angle, couleur, epaisseur = 2) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const k = taille / 24
  ctx.scale(k, k)
  ctx.translate(-12, -12)
  ctx.strokeStyle = couleur
  ctx.lineWidth = epaisseur
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of chemins) ctx.stroke(new Path2D(d))
  ctx.restore()
}

/* Le disque : les cases aux couleurs des lots, leurs noms et leurs pictogrammes,
 * le bandeau du bord et ses picots. */
export function dessinerDisque(canvas, cases, taille) {
  const { ctx, px } = preparerCanvas(canvas, taille)
  const R = px / 2
  const n = cases.length
  const pas = (Math.PI * 2) / n
  ctx.translate(R, R)

  // Les cases
  for (let i = 0; i < n; i++) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, R * 0.95, versCanvas(i * pas), versCanvas((i + 1) * pas))
    ctx.closePath()
    ctx.fillStyle = cases[i].teinte
    ctx.fill()
    if (n > 1 && i % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
      ctx.fill()
    }
  }

  // Le modelé : plus clair au centre, plus sombre vers le bord
  const modele = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 0.95)
  modele.addColorStop(0, 'rgba(255, 255, 255, 0.16)')
  modele.addColorStop(0.55, 'rgba(255, 255, 255, 0)')
  modele.addColorStop(1, 'rgba(0, 0, 0, 0.28)')
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2)
  ctx.fillStyle = modele
  ctx.fill()

  // Les séparations
  if (n > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = Math.max(1, R * 0.006)
    for (let i = 0; i < n; i++) {
      const a = versCanvas(i * pas)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * R * 0.26, Math.sin(a) * R * 0.26)
      ctx.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95)
      ctx.stroke()
    }
  }

  // Les noms et les pictogrammes, le long du rayon de chaque case
  const corps = Math.round(R * (n > 14 ? 0.052 : 0.064))
  for (let i = 0; i < n; i++) {
    const lot = cases[i]
    ctx.save()
    ctx.rotate(versCanvas((i + 0.5) * pas))
    picto(ctx, lot.picto, R * 0.84, 0, R * 0.12, Math.PI / 2, '#fff', 2.2)
    ctx.font = `700 ${corps}px "Space Grotesk", sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = R * 0.012
    const lignes = lot.libelle
    const interligne = corps * 1.08
    const haut = -((lignes.length - 1) * interligne) / 2
    // La largeur disponible : du moyeu au pictogramme
    const largeur = R * 0.44
    lignes.forEach((ligne, k) => {
      const mesure = ctx.measureText(ligne).width
      const echelle = mesure > largeur ? largeur / mesure : 1
      ctx.save()
      ctx.translate(R * 0.74, haut + k * interligne)
      ctx.scale(echelle, echelle)
      ctx.fillText(ligne, 0, 0)
      ctx.restore()
    })
    ctx.restore()
  }

  // Le bandeau du bord, sombre et métallique
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.995, 0, Math.PI * 2)
  ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2, true)
  const bord = ctx.createLinearGradient(-R, -R, R, R)
  bord.addColorStop(0, '#4a4a52')
  bord.addColorStop(0.5, '#1b1b20')
  bord.addColorStop(1, '#2c2c33')
  ctx.fillStyle = bord
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = Math.max(1, R * 0.004)
  ctx.stroke()

  // Les picots, un par séparation : ce sont eux qui font claquer la languette
  for (let i = 0; i < n; i++) {
    const a = versCanvas(i * pas)
    const x = Math.cos(a) * R * 0.972
    const y = Math.sin(a) * R * 0.972
    const r = R * 0.02
    ctx.beginPath()
    ctx.arc(x + r * 0.25, y + r * 0.35, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fill()
    const metal = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
    metal.addColorStop(0, '#ffffff')
    metal.addColorStop(0.45, '#d6d6dc')
    metal.addColorStop(1, '#7c7c86')
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = metal
    ctx.fill()
  }

  // Le creux du moyeu
  ctx.beginPath()
  ctx.arc(0, 0, R * 0.26, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.fill()
}

/* Le flou de vitesse : le disque superposé à lui-même sur une demi-case de part
 * et d'autre, en moyenne glissante. Calculé une fois, il n'apparaît qu'en
 * fondu quand la roue va vite. */
export function dessinerFlou(cible, source, nbCases) {
  const px = source.width
  if (cible.width !== px) {
    cible.width = px
    cible.height = px
  }
  const ctx = cible.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, px, px)
  const etendue = (Math.PI * 2) / nbCases * 0.9
  const copies = 14
  for (let k = 0; k < copies; k++) {
    const a = -etendue / 2 + (etendue * k) / (copies - 1)
    ctx.globalAlpha = 1 / (k + 1)
    ctx.setTransform(1, 0, 0, 1, px / 2, px / 2)
    ctx.rotate(a)
    ctx.drawImage(source, -px / 2, -px / 2)
  }
  ctx.globalAlpha = 1
}

/* Le cadre fixe : l'anneau sombre autour du disque, ses ampoules éteintes et
 * l'ombre portée de l'ensemble. */
export function dessinerCadre(canvas, taille) {
  const { ctx, px } = preparerCanvas(canvas, taille)
  const R = px / 2
  ctx.translate(R, R)
  const ext = R * 0.985
  const int = R * DISQUE * 0.99

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = R * 0.05
  ctx.shadowOffsetY = R * 0.02
  ctx.beginPath()
  ctx.arc(0, 0, ext, 0, Math.PI * 2)
  ctx.arc(0, 0, int, 0, Math.PI * 2, true)
  const anneau = ctx.createLinearGradient(0, -R, 0, R)
  anneau.addColorStop(0, '#34343c')
  anneau.addColorStop(0.5, '#18181d')
  anneau.addColorStop(1, '#0c0c10')
  ctx.fillStyle = anneau
  ctx.fill()
  ctx.restore()

  // Deux filets clairs, à l'extérieur et à l'intérieur de l'anneau
  ctx.lineWidth = Math.max(1, R * 0.006)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.beginPath()
  ctx.arc(0, 0, ext - ctx.lineWidth, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.beginPath()
  ctx.arc(0, 0, int + ctx.lineWidth, 0, Math.PI * 2)
  ctx.stroke()

  for (let i = 0; i < NB_AMPOULES; i++) {
    const a = (i / NB_AMPOULES) * Math.PI * 2
    const x = Math.cos(a) * R * RAYON_AMPOULES
    const y = Math.sin(a) * R * RAYON_AMPOULES
    const r = R * 0.021
    const verre = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r)
    verre.addColorStop(0, '#8a7a5a')
    verre.addColorStop(1, '#3a3226')
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = verre
    ctx.fill()
  }
}

/* Une moitié des ampoules allumées (paires ou impaires), avec leur halo. Les
 * deux calques alternent par leur seule opacité. */
export function dessinerAmpoules(canvas, taille, parite) {
  const { ctx, px } = preparerCanvas(canvas, taille)
  const R = px / 2
  ctx.translate(R, R)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = parite; i < NB_AMPOULES; i += 2) {
    const a = (i / NB_AMPOULES) * Math.PI * 2
    const x = Math.cos(a) * R * RAYON_AMPOULES
    const y = Math.sin(a) * R * RAYON_AMPOULES
    const halo = ctx.createRadialGradient(x, y, 0, x, y, R * 0.075)
    halo.addColorStop(0, 'rgba(255, 236, 190, 0.95)')
    halo.addColorStop(0.25, 'rgba(255, 196, 92, 0.55)')
    halo.addColorStop(1, 'rgba(255, 160, 40, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(x, y, R * 0.075, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, R * 0.017, 0, Math.PI * 2)
    ctx.fillStyle = '#fffaf0'
    ctx.fill()
  }
}

/* La case gagnante, dans le repère du disque : son contour et le reste du
 * disque, à assombrir. Chemins SVG dans un carré de -1 à 1. */
export function cheminsCase(indice, nbCases) {
  const pas = (Math.PI * 2) / nbCases
  const a = indice * pas
  const b = (indice + 1) * pas
  const r = 0.95
  const point = (l, rr) => `${(Math.sin(l) * rr).toFixed(4)} ${(-Math.cos(l) * rr).toFixed(4)}`
  const grand = pas > Math.PI ? 1 : 0
  const part = nbCases === 1
    ? `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`
    : `M 0 0 L ${point(a, r)} A ${r} ${r} 0 ${grand} 1 ${point(b, r)} Z`
  const disque = `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`
  return { part, reste: nbCases === 1 ? '' : `${disque} ${part}` }
}
