import { onMounted, onUnmounted } from 'vue'

/* Parallaxe des planches : chaque section publie sa progression dans la
 * fenetre, de -1 quand elle arrive par le bas a 1 quand elle sort par le haut,
 * plus sa centralite, 0 aux deux bords et 1 au passage du milieu.
 *
 * Le CSS des planches en tire toutes les translations : aucune position n'est
 * calculee ici, une seule variable par section suffit. La mesure suit le
 * defilement image par image, sans seuil ni declenchement, pour que le
 * mouvement soit continu de l'entree a la sortie.
 *
 * `conteneur` est une ref sur l'element qui contient les planches. */
export function useParallaxe(conteneur) {
  let planches = []
  let enAttente = false

  function mesurer() {
    if (enAttente) return
    enAttente = true
    requestAnimationFrame(() => {
      const hauteur = window.innerHeight
      planches.forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.bottom < -300 || r.top > hauteur + 300) return
        const centre = r.top + r.height / 2
        const p = Math.max(-1, Math.min(1, (hauteur / 2 - centre) / (hauteur / 2 + r.height / 2)))
        el.style.setProperty('--p', p.toFixed(4))
        el.style.setProperty('--c', (1 - Math.abs(p)).toFixed(4))
      })
      enAttente = false
    })
  }

  onMounted(() => {
    // Un defilement anime impose est un declencheur connu de gene vestibulaire :
    // sans mouvement demande, la parallaxe ne s'installe meme pas.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    planches = Array.from(conteneur.value?.querySelectorAll('.planche') || [])
    if (!planches.length) return
    window.addEventListener('scroll', mesurer, { passive: true })
    window.addEventListener('resize', mesurer)
    mesurer()
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', mesurer)
    window.removeEventListener('resize', mesurer)
  })
}
