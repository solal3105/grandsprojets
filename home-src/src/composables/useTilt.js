import { ref, reactive } from 'vue'

/**
 * Effet 3D tilt + glare sur un tableau de cards.
 * @param {number} count - Nombre d'éléments
 * @param {{ perspective?: number, rotateMax?: number, lift?: number }} options
 */
export function useTilt(count, { perspective = 700, rotateMax = 7, lift = 10 } = {}) {
  const els = ref(Array.from({ length: count }, () => null))
  const shines = reactive(Array.from({ length: count }, () => ({})))

  function onMove(e, i) {
    const el = els.value[i]
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    el.style.transition = 'transform 0.08s ease'
    el.style.transform = `perspective(${perspective}px) rotateX(${-y * rotateMax}deg) rotateY(${x * rotateMax}deg) translateZ(${lift}px)`
    shines[i] = {
      background: `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.2) 0%, transparent 60%)`,
    }
  }

  function onLeave(i) {
    const el = els.value[i]
    if (!el) return
    el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
    el.style.transform = ''
    shines[i] = {}
  }

  return { els, shines, onMove, onLeave }
}
