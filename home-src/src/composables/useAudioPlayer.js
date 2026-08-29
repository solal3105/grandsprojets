import { ref, computed, onUnmounted } from 'vue'

/**
 * Lecteur audio minimal : lecture, pause, barre de progression cliquable et
 * déplaçable. Le composant fournit le markup, ce composable tient l'état.
 *
 * `src` est un chemin relatif à la base Vite : un chemin absolu tombe en 404
 * dès que la vitrine est servie sous une autre base.
 */
export function useAudioPlayer(src) {
  const audio = new Audio(`${import.meta.env.BASE_URL}${src}`)
  audio.preload = 'metadata'

  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const progressBar = ref(null)
  let isDragging = false

  audio.addEventListener('loadedmetadata', () => { duration.value = audio.duration })
  audio.addEventListener('timeupdate', () => { if (!isDragging) currentTime.value = audio.currentTime })
  audio.addEventListener('ended', () => { isPlaying.value = false; currentTime.value = 0 })

  const progress = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))

  function togglePlay() {
    if (isPlaying.value) audio.pause()
    else audio.play()
    isPlaying.value = !isPlaying.value
  }

  function seekToPosition(clientX) {
    const bar = progressBar.value
    if (!bar || !duration.value) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    audio.currentTime = ratio * duration.value
    currentTime.value = audio.currentTime
  }

  function seek(e) { seekToPosition(e.clientX) }

  function startDrag(e) {
    isDragging = true
    const onMove = (ev) => seekToPosition(ev.clientX)
    const onUp = () => {
      isDragging = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    seekToPosition(e.clientX)
  }

  function formatTime(s) {
    if (!s || Number.isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  onUnmounted(() => { audio.pause() })

  return { isPlaying, currentTime, duration, progress, progressBar, togglePlay, seek, startDrag, formatTime }
}
