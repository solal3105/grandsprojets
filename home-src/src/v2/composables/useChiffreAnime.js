import { ref, watch, onBeforeUnmount } from 'vue'

/* Un nombre qui rejoint sa nouvelle valeur en glissant, au lieu de sauter.
 * Sert aux montants de la page de tarification : un prix qui bouge sous les
 * yeux dit mieux « ce réglage compte » qu'un chiffre qui change d'un coup.
 * Sous « réduire les animations », la valeur est prise telle quelle. */
export function useChiffreAnime(source, duree = 420) {
  const valeur = ref(Number(source.value) || 0)
  let image = 0

  const reduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  watch(source, (cible) => {
    cancelAnimationFrame(image)
    const arrivee = Number(cible) || 0
    if (reduit()) { valeur.value = arrivee; return }
    const depart = valeur.value
    const debut = performance.now()
    const pas = (t) => {
      const x = Math.min(1, (t - debut) / duree)
      const e = 1 - (1 - x) ** 3
      valeur.value = depart + (arrivee - depart) * e
      if (x < 1) image = requestAnimationFrame(pas)
    }
    image = requestAnimationFrame(pas)
  })

  onBeforeUnmount(() => cancelAnimationFrame(image))

  return valeur
}
