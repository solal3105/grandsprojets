/**
 * v-tilt-btn — Directive Vue pour l'effet 3D subtil sur les boutons.
 *
 * Ce qu'elle fait :
 * - Légère inclinaison 3D suivant la position de la souris (±6° X, ±4° Y)
 * - Glare translucide qui suit la souris
 * - Légère élévation (translateZ) au hover
 * - Retour au repos avec spring (cubic-bezier élastique)
 * - Enfoncement tactile au mousedown
 */

export const tiltBtn = {
  mounted(el) {
    // --- Glare layer ---
    const glare = document.createElement('span')
    glare.className = '__tilt-glare'
    glare.style.cssText = `
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      z-index: 2;
      transition: background 0.15s ease;
    `
    // On s'assure que le parent est en position relative pour le glare
    const pos = getComputedStyle(el).position
    if (pos === 'static') el.style.position = 'relative'
    el.style.overflow = 'hidden'
    el.appendChild(glare)

    const TILT_X = 10   // degrés max rotation latérale
    const TILT_Y = 6    // degrés max rotation verticale
    const LIFT   = 4    // px translateZ

    function onMove(e) {
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width - 0.5   // -0.5 → 0.5
      const y = (e.clientY - rect.top)  / rect.height - 0.5

      el.style.transition = 'transform 0.08s ease'
      el.style.transform  = `
        perspective(560px)
        rotateY(${x * TILT_X}deg)
        rotateX(${-y * TILT_Y}deg)
        translateZ(${LIFT}px)
        scale(1.0)
      `

      // Glare : cercle lumineux côté de la lumière (opposé à la position)
      glare.style.background = `
        radial-gradient(
          circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%,
          rgba(255,255,255,0.22) 0%,
          transparent 65%
        )
      `
    }

    function onLeave() {
      el.style.transition = 'transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)'
      el.style.transform  = ''
      glare.style.background = ''
    }

    function onDown() {
      el.style.transition = 'transform 0.06s ease'
      el.style.transform  = `
        perspective(560px)
        translateZ(-2px)
        scale(0.977)
      `
    }

    function onUp() {
      // Laisse le onLeave ou le onMove reprendre le relais
      onLeave()
    }

    el.addEventListener('mousemove',  onMove)
    el.addEventListener('mouseleave', onLeave)
    el.addEventListener('mousedown',  onDown)
    el.addEventListener('mouseup',    onUp)

    // Stocke les handlers pour cleanup
    el.__tiltHandlers = { onMove, onLeave, onDown, onUp }

    // Applique le style 3D de base
    el.style.willChange      = 'transform'
    el.style.transformStyle  = 'preserve-3d'
    el.style.backfaceVisibility = 'hidden'
  },

  unmounted(el) {
    const h = el.__tiltHandlers
    if (!h) return
    el.removeEventListener('mousemove',  h.onMove)
    el.removeEventListener('mouseleave', h.onLeave)
    el.removeEventListener('mousedown',  h.onDown)
    el.removeEventListener('mouseup',    h.onUp)
    delete el.__tiltHandlers
  },
}
