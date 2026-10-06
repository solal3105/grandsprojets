/* Les confettis du gain, dans un canvas plein écran à la définition simple :
 * cent soixante rectangles qui tournent sur eux-mêmes et retombent. La boucle
 * ne tourne que pendant les quatre secondes de la chute, puis s'arrête. */

export function creerConfettis(canvas) {
  let parts = []
  let boucle = 0
  let precedent = 0
  let debut = 0

  function dimensionner() {
    const w = window.innerWidth
    const h = window.innerHeight
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
  }

  function jet(x, y, angle, ouverture, nombre, force, couleurs) {
    for (let i = 0; i < nombre; i++) {
      const a = angle + (Math.random() - 0.5) * ouverture
      const v = force * (0.55 + Math.random() * 0.6)
      parts.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 14,
        bascule: Math.random() * Math.PI * 2,
        vbascule: 6 + Math.random() * 8,
        w: 6 + Math.random() * 7,
        h: 9 + Math.random() * 9,
        couleur: couleurs[i % couleurs.length],
      })
    }
  }

  /* `origine` : le point d'où part la gerbe principale (la languette), en
   * pixels de la fenêtre. Deux canons au bas de l'écran complètent. */
  function lancer(origine, couleurs) {
    dimensionner()
    const h = canvas.height
    const w = canvas.width
    parts = []
    jet(origine.x, origine.y, -Math.PI / 2, Math.PI * 0.9, 70, Math.min(w, h) * 1.25, couleurs)
    jet(0, h, -Math.PI / 3, 0.5, 45, h * 1.5, couleurs)
    jet(w, h, (-Math.PI * 2) / 3, 0.5, 45, h * 1.5, couleurs)
    debut = 0
    precedent = 0
    cancelAnimationFrame(boucle)
    boucle = requestAnimationFrame(image)
  }

  function image(t) {
    if (!debut) debut = t
    const dt = precedent ? Math.min((t - precedent) / 1000, 0.05) : 1 / 60
    precedent = t
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const gravite = canvas.height * 1.1
    const freinage = Math.pow(0.12, dt)
    let vivantes = 0
    for (const p of parts) {
      p.vx *= freinage
      p.vy = p.vy * freinage + gravite * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vrot * dt
      p.bascule += p.vbascule * dt
      if (p.y > canvas.height + 30) continue
      vivantes++
      const c = Math.cos(p.rot)
      const s = Math.sin(p.rot)
      ctx.setTransform(c, s, -s, c, p.x, p.y)
      ctx.fillStyle = p.couleur
      const hauteur = p.h * Math.abs(Math.cos(p.bascule))
      ctx.fillRect(-p.w / 2, -hauteur / 2, p.w, hauteur)
    }
    if (vivantes > 0 && t - debut < 5000) boucle = requestAnimationFrame(image)
    else arreter()
  }

  function arreter() {
    cancelAnimationFrame(boucle)
    boucle = 0
    parts = []
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  return { lancer, arreter }
}
