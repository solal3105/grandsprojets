import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Scroll-reveal via IntersectionObserver.
 * Ajoute la classe `is-visible` aux éléments dans `revealEls` quand ils entrent dans la vue.
 */
export function useScrollReveal() {
  const revealEls = ref([])
  let observer = null

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    )
    revealEls.value.forEach((el) => { if (el) observer.observe(el) })
  })

  onUnmounted(() => { observer?.disconnect() })

  return { revealEls }
}
