<template>
  <!-- L'écran de salon : la vidéo tourne en boucle, se met en plein écran d'un
       geste, et hors plein écran deux sorties restent à portée de main, le
       stand des cartes des communes et les pages des cinq modules. Page hors
       du menu, du plan du site et des moteurs. -->
  <div class="page-video relative isolate min-h-[100dvh] bg-dark text-white flex flex-col items-center gap-5 px-4 sm:px-6 py-4 sm:py-6">
    <h1 class="sr-only">{{ videoAvantApres.nom }}</h1>

    <!-- Le fond reprend l'image de la vidéo, en tout petit, agrandie et floutée :
         il en suit les couleurs, en fondu. Un voile l'assombrit vers le bas pour
         que les sorties restent lisibles. -->
    <canvas ref="ambiance" class="ambiance" width="32" height="18" aria-hidden="true" />
    <div class="fixed inset-0 -z-10 bg-gradient-to-b from-dark/10 via-dark/40 to-dark/85 pointer-events-none" aria-hidden="true" />

    <div class="cadre flex flex-col gap-2.5">
      <div ref="ecran" class="ecran relative bg-black overflow-hidden" :class="{ 'is-plein': plein }" @click="toucherEcran">
        <video
          ref="video"
          class="w-full h-full object-contain"
          :src="videoAvantApres.fichier"
          :poster="videoAvantApres.affiche"
          autoplay loop muted playsinline preload="auto"
          :aria-label="videoAvantApres.description"
        />

        <p
          v-if="plein"
          class="aide absolute left-1/2 bottom-8 -translate-x-1/2 rounded-full bg-black/70 px-5 py-2.5 text-sm font-medium pointer-events-none transition-opacity duration-300"
          :class="{ 'is-visible': aide }"
        >
          Touchez l'écran ou appuyez sur Échap pour quitter le plein écran.
        </p>
      </div>

      <!-- Les commandes restent sous l'image : posées dessus, elles cachaient
           la fin des sous-titres de la vidéo. -->
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2.5 text-sm font-medium transition-colors duration-300"
          :aria-pressed="!muet"
          @click="basculerSon"
        >
          <VolumeX v-if="muet" class="w-4 h-4" />
          <Volume2 v-else class="w-4 h-4" />
          {{ muet ? 'Activer le son' : 'Couper le son' }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2.5 text-sm font-medium transition-colors duration-300"
          @click="entrer"
        >
          <Maximize class="w-4 h-4" />
          Passer en plein écran
        </button>
      </div>
    </div>

    <div class="sorties w-full grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,5fr)]">
      <a
        :href="KIOSK_URL"
        class="group flex flex-col justify-between rounded-2xl bg-white text-dark p-5 transition duration-300 hover:-translate-y-1"
      >
        <span class="font-heading font-bold text-lg leading-snug tracking-tight">
          Voyez la carte des projets de votre commune
        </span>
        <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink">
          Chercher ma commune
          <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </a>

      <section aria-labelledby="titre-modules">
        <h2 id="titre-modules" class="font-heading font-semibold text-[15px] text-white/80 mb-2.5">
          Découvrez les cinq modules en détail
        </h2>
        <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          <router-link
            v-for="m in modules" :key="m.key"
            :to="`/${m.key}`"
            class="tuile group relative overflow-hidden rounded-2xl p-5 flex flex-col text-white transition duration-300 hover:-translate-y-1"
            :class="m.tone.socle"
          >
            <SocleFormes :forme="m.forme" />
            <!-- Voile posé sur la figure : il garde le texte blanc lisible sur
                 les cinq couleurs, comme dans le sommaire des pages modules. -->
            <span class="absolute inset-0 bg-black/[0.12]" />
            <span class="relative font-heading font-bold text-[17px] leading-tight tracking-tight">{{ m.name }}</span>
            <span class="relative mt-2 flex-1 text-sm leading-relaxed">{{ m.h1 }}</span>
            <span class="relative mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
              Voir le module
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </router-link>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ArrowRight, Maximize, Volume2, VolumeX } from 'lucide-vue-next'
import SocleFormes from '../components/SocleFormes.vue'
import { modules } from '../data/modules.js'
import { videoAvantApres } from '../data/videoAvantApres.js'
import { KIOSK_URL } from '@/data/siteUrls.js'

const ecran = ref(null)
const video = ref(null)
const plein = ref(false)
const muet = ref(true)
const aide = ref(false)
let minuteur = null

// Le plein écran vise le cadre, pas la vidéo seule : le rappel pour en
// sortir s'affiche par-dessus. L'iPhone ne sait mettre en plein écran que la
// vidéo, avec son propre lecteur.
function entrer() {
  const el = ecran.value
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
  else video.value?.webkitEnterFullscreen?.()
}
function sortir() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else if (document.webkitFullscreenElement) document.webkitExitFullscreen()
}
function toucherEcran() {
  plein.value ? sortir() : entrer()
}
function suivrePleinEcran() {
  plein.value = !!(document.fullscreenElement || document.webkitFullscreenElement)
  clearTimeout(minuteur)
  aide.value = plein.value
  if (plein.value) minuteur = setTimeout(() => { aide.value = false }, 3500)
}
// Les navigateurs refusent la lecture automatique avec le son : la vidéo part
// muette, et le son s'active d'un geste.
function basculerSon() {
  const v = video.value
  v.muted = !v.muted
  muet.value = v.muted
  v.play().catch(() => {})
}

/* Le fond d'ambiance : dix fois par seconde, l'image courante est posée à 20 %
 * sur la précédente dans un canvas de 32 x 18 pixels. Ce mélange fait le fondu
 * d'une scène à l'autre ; l'agrandissement et le flou font le reste. */
const ambiance = ref(null)
let boucle = 0
let derniere = 0
function peindreAmbiance(t) {
  boucle = requestAnimationFrame(peindreAmbiance)
  if (t - derniere < 100 || plein.value) return
  derniere = t
  const v = video.value, c = ambiance.value
  if (!v || !c || v.readyState < 2) return
  const x = c.getContext('2d')
  x.globalAlpha = 0.2
  x.drawImage(v, 0, 0, c.width, c.height)
}

onMounted(() => {
  document.addEventListener('fullscreenchange', suivrePleinEcran)
  document.addEventListener('webkitfullscreenchange', suivrePleinEcran)
  // Le fond de la fenêtre suit aussi, pour les rebonds de défilement.
  document.documentElement.classList.add('bg-dark')
  const v = video.value
  v.muted = true
  v.play().catch(() => {})
  boucle = requestAnimationFrame(peindreAmbiance)
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', suivrePleinEcran)
  document.removeEventListener('webkitfullscreenchange', suivrePleinEcran)
  document.documentElement.classList.remove('bg-dark')
  cancelAnimationFrame(boucle)
  clearTimeout(minuteur)
})
</script>

<style scoped>
/* La vidéo prend toute la place que laissent ses commandes et les sorties,
   sans défilement sur un écran de salon en 1920 x 1080. */
.cadre {
  width: min(100%, 1600px, calc((100dvh - 340px) * 16 / 9));
}
.ecran {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 16px;
  cursor: pointer;
}
.ecran.is-plein {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: 0;
}
.sorties {
  max-width: 1600px;
}
@media (min-width: 640px) {
  .tuile {
    min-height: 180px;
  }
}
.aide {
  opacity: 0;
}
.aide.is-visible {
  opacity: 1;
}
/* Agrandi, le canvas de 32 x 18 pixels donne déjà des aplats fondus ; le flou
   efface les derniers contours et l'échelle cache les bords assombris. */
.ambiance {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -20;
  filter: blur(48px) saturate(1.3);
  opacity: 0.7;
  transform: scale(1.15);
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .ambiance { display: none; }
}
</style>
