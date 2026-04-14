<template>
  <section class="py-24 bg-gray-bg overflow-hidden">
    <div class="max-w-container mx-auto px-6">

      <!-- Heading -->
      <div class="max-w-[680px] mb-16">
        <span class="inline-flex items-center gap-2.5 text-xs font-semibold text-primary uppercase tracking-widest mb-5">
          <span class="w-5 h-px bg-primary inline-block" />
          On en parle
        </span>
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
          Open Projets dans les médias
        </h2>
      </div>

      <!-- Cards -->
      <div class="flex flex-col gap-5 max-w-4xl">

        <!-- Card: Lyon Demain Radio -->
        <article class="bg-white rounded-2xl border border-gray-border overflow-hidden shadow-sm flex flex-col sm:flex-row">

          <!-- Logo pane -->
          <div class="sm:w-52 shrink-0 bg-gray-bg border-b sm:border-b-0 sm:border-r border-gray-border flex flex-col items-center justify-center gap-5 px-8 py-8">
            <img
              src="/img/press/lyon-demain-radio.png"
              alt="Lyon Demain Radio"
              class="w-28 h-auto object-contain"
            />
            <div class="flex flex-col items-center gap-2 text-center">
              <span class="inline-flex items-center gap-1.5 bg-primary-10 text-primary text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full">
                <Radio class="w-3 h-3 shrink-0" />
                Radio
              </span>
              <span class="text-[11px] text-gray-text">14 avril 2026</span>
            </div>
          </div>

          <!-- Content pane -->
          <div class="flex-1 p-7 sm:p-8 flex flex-col gap-5">

            <!-- Quote -->
            <blockquote>
              <p class="text-[15px] text-dark/75 leading-relaxed italic">
                « Les travaux en ville, tout le monde les subit. Mais les comprendre, c'est une autre histoire. La start-up villeurbannaise Vazy s'attaque à ce problème avec <strong class="text-dark font-semibold not-italic">un outil cartographique interactif baptisé Open Projets</strong>. »
              </p>
              <cite class="not-italic text-[11px] text-gray-text mt-2 block">— Noham Mouret · Le Quart d'Heure Lyonnais</cite>
            </blockquote>

            <!-- Audio player -->
            <div class="bg-gray-bg rounded-xl border border-gray-border p-4">
              <div class="flex items-center gap-3 mb-3">
                <button
                  @click="togglePlay"
                  class="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center shrink-0 shadow-md shadow-primary/20 hover:bg-red-700 active:scale-95 transition-all duration-200"
                  :aria-label="isPlaying ? 'Pause' : 'Écouter'"
                >
                  <Pause v-if="isPlaying" class="w-3.5 h-3.5" />
                  <Play v-else class="w-3.5 h-3.5 ml-px" />
                </button>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-medium text-dark truncate">L'actualité du mardi 14 avril — Le Quart d'Heure Lyonnais</div>
                  <div class="text-[11px] text-gray-text mt-0.5">Invités : Solal Gendrin &amp; Loïc Robbiani (Vazy)</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-[11px] text-gray-text font-mono tabular-nums w-8 text-right shrink-0">{{ formatTime(currentTime) }}</span>
                <div
                  ref="progressBar"
                  class="relative flex-1 h-1 bg-dark/10 rounded-full cursor-pointer group"
                  @click="seek"
                  @mousedown="startDrag"
                >
                  <div class="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-100" :style="{ width: progress + '%' }" />
                  <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" :style="{ left: `calc(${progress}% - 6px)` }" />
                </div>
                <span class="text-[11px] text-gray-text font-mono tabular-nums w-8 shrink-0">{{ formatTime(duration) }}</span>
              </div>
            </div>

            <!-- Link -->
            <a
              href="https://www.lyondemain.fr/actualite-du-mardi-14-avril-lyon-info-vazy-open-projets/"
              target="_blank"
              rel="noopener noreferrer"
              class="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-red-700 transition-colors duration-200 group"
            >
              Lire l'article sur Lyon Demain
              <ExternalLink class="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>

          </div>
        </article>

        <!-- Card: La Gazette des Communes — Webinaire -->
        <article class="bg-white rounded-2xl border border-gray-border overflow-hidden shadow-sm flex flex-col sm:flex-row">

          <!-- Logo pane -->
          <div class="sm:w-52 shrink-0 bg-gray-bg border-b sm:border-b-0 sm:border-r border-gray-border flex flex-col items-center justify-center gap-5 px-8 py-8">
            <img
              src="/img/press/logo-gazette-live-nj.png"
              alt="La Gazette des Communes"
              class="w-28 h-auto object-contain"
            />
            <div class="flex flex-col items-center gap-2 text-center">
              <span class="inline-flex items-center gap-1.5 bg-primary-10 text-primary text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full">
                <Video class="w-3 h-3 shrink-0" />
                Webinaire
              </span>
              <span class="text-[11px] text-gray-text">28 avril 2026</span>
            </div>
          </div>

          <!-- Content pane -->
          <div class="flex-1 p-7 sm:p-8 flex flex-col gap-5">

            <!-- Title + quote -->
            <div>
              <h3 class="text-[15px] font-semibold text-dark leading-snug mb-3">
                Travaux et projets urbains : comment mieux informer pour réduire les tensions ?
              </h3>
              <blockquote>
                <p class="text-[14px] text-dark/70 leading-relaxed italic">
                  « À partir de retours d'expérience, une réponse concrète à une contrainte structurelle pour les collectivités : <strong class="text-dark font-semibold not-italic">informer avec rigueur, en répondant aux attentes d'accès continu à l'information de manière centralisée et interactive</strong>. »
                </p>
                <cite class="not-italic text-[11px] text-gray-text mt-2 block">— La Gazette des Communes · Proposé par Vazy</cite>
              </blockquote>
            </div>

            <!-- Date badge + CTA -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <div class="inline-flex items-center gap-2 text-[11px] font-semibold rounded-lg px-3.5 py-2 shrink-0" style="background: rgba(242,179,39,0.10); color: #a0760a; border: 1px solid rgba(242,179,39,0.30);">
                <CalendarClock class="w-3.5 h-3.5 shrink-0" />
                Mardi 28 avril · 11h00 · 45 min
              </div>
              <a
                href="https://www.lagazettedescommunes.com/nos-webinaires/travaux-et-projets-urbains-comment-mieux-informer-pour-reduire-les-tensions-100078624/"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 bg-primary text-white text-xs font-semibold px-5 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 shadow-sm shadow-primary/20 group shrink-0"
              >
                S'inscrire gratuitement
                <ExternalLink class="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>

          </div>
        </article>

      </div>

    </div>
  </section>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { Play, Pause, Radio, Video, CalendarClock, ExternalLink } from 'lucide-vue-next'

const audio = new Audio('/home/audio/lyon-demain-open-projets.mp3')
audio.preload = 'metadata'

const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
let isDragging = false

audio.addEventListener('loadedmetadata', () => {
  duration.value = audio.duration
})

audio.addEventListener('timeupdate', () => {
  if (!isDragging) currentTime.value = audio.currentTime
})

audio.addEventListener('ended', () => {
  isPlaying.value = false
  currentTime.value = 0
})

const progress = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

function togglePlay() {
  if (isPlaying.value) {
    audio.pause()
  } else {
    audio.play()
  }
  isPlaying.value = !isPlaying.value
}

const progressBar = ref(null)

function seekToPosition(clientX) {
  const bar = progressBar.value
  if (!bar || !duration.value) return
  const rect = bar.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  audio.currentTime = ratio * duration.value
  currentTime.value = audio.currentTime
}

function seek(e) {
  seekToPosition(e.clientX)
}

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
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

onUnmounted(() => {
  audio.pause()
  audio.src = ''
})
</script>
