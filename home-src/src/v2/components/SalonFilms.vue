<template>
  <!-- Les films des modules, sur l'écran du salon. Deux crans : le choix du
       module, puis son film, qui prend toute la place. Le retour de la barre
       (VideoView) remonte du film au choix, puis du choix à la vidéo. -->
  <div class="absolute inset-0 overflow-y-auto">
    <div v-if="!film" class="choix">
      <ul class="choix__grille" aria-label="Les films des cinq modules">
        <li v-for="f in films" :key="f.key">
          <button type="button" class="carte-film" :class="f.socle" @click="lancer(f)">
            <span class="carte-film__image">
              <img :src="f.affiche" alt="" loading="lazy" decoding="async">
              <span class="carte-film__lecture" aria-hidden="true">
                <Play class="w-7 h-7 translate-x-0.5" />
              </span>
            </span>
            <span class="carte-film__texte">
              <span class="carte-film__nom">{{ f.nom }}</span>
              <span class="carte-film__duree">{{ dureeLisible(f.duree) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div v-else class="lecteur-film">
      <div class="lecteur-film__ecran">
        <video
          ref="video"
          :key="film.key"
          class="w-full h-full object-contain"
          :src="film.fichier"
          :poster="film.affiche"
          autoplay
          playsinline
          preload="auto"
          disablepictureinpicture
          :aria-label="`Film du module ${film.nom}`"
          @click="basculerLecture"
          @play="lecture = true"
          @pause="lecture = false"
          @timeupdate="avancer"
          @loadedmetadata="lireDuree"
          @ended="revenir"
        >
          <track kind="subtitles" srclang="fr" label="Français" :src="film.sousTitres" default>
        </video>
        <button
          v-if="!lecture"
          type="button"
          class="reprise absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-20 h-20 rounded-full bg-black/60 ring-1 ring-white/25 hover:bg-black/75"
          aria-label="Reprendre le film"
          @click="basculerLecture"
        >
          <Play class="w-9 h-9 translate-x-0.5" />
        </button>
      </div>

      <div class="commandes flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap sm:gap-3">
        <button
          type="button"
          class="bouton-rond"
          :aria-label="lecture ? 'Mettre le film en pause' : 'Reprendre le film'"
          @click="basculerLecture"
        >
          <Pause v-if="lecture" class="w-4 h-4" />
          <Play v-else class="w-4 h-4" />
        </button>
        <input
          class="curseur order-first basis-full min-w-0 sm:order-none sm:basis-0 sm:flex-1"
          type="range"
          min="0"
          :max="duree"
          step="0.1"
          :value="temps"
          :style="{ '--avance': duree ? temps / duree : 0 }"
          aria-label="Position dans le film"
          :aria-valuetext="`${horloge(temps)} sur ${horloge(duree)}`"
          @input="chercher"
        >
        <span class="mr-auto text-sm tabular-nums text-white/75 whitespace-nowrap">
          {{ horloge(temps) }} / {{ horloge(duree) }}
        </span>
        <button type="button" class="bouton" :aria-pressed="!muet" @click="basculerSon">
          <VolumeX v-if="muet" class="w-4 h-4" />
          <Volume2 v-else class="w-4 h-4" />
          {{ muet ? 'Activer le son' : 'Couper le son' }}
        </button>
        <button type="button" class="bouton" :aria-pressed="sousTitres" @click="basculerSousTitres">
          <Captions class="w-4 h-4" />
          <span class="sr-only sm:not-sr-only">{{ sousTitres ? 'Masquer les sous-titres' : 'Afficher les sous-titres' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { Captions, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next'
import { modules } from '../data/modules.js'
import { filmsModules } from '../data/filmsModules.js'

/* L'ordre et les noms sont ceux des modules du site ; un module sans film
 * n'apparaît pas. */
const films = modules
  .filter((m) => filmsModules[m.key])
  .map((m) => ({ key: m.key, nom: m.name, socle: m.tone.socle, ...filmsModules[m.key] }))

// `etat` dit à la barre de l'écran où on en est ; `geste` compte comme un
// toucher pour la veille : un film qu'on regarde ne se referme pas.
const emit = defineEmits(['etat', 'geste'])

const film = ref(null)
const video = ref(null)
const lecture = ref(false)
const muet = ref(false)
const sousTitres = ref(true)
const temps = ref(0)
const duree = ref(0)

function lancer(f) {
  film.value = f
  temps.value = 0
  duree.value = f.duree
  lecture.value = true
  emit('etat', { niveau: 1, titre: f.nom, retour: 'Revenir aux films' })
  // Lancé d'un geste du visiteur, le film peut partir avec le son
  nextTick(() => {
    const v = video.value
    if (!v) return
    v.muted = muet.value
    v.play().catch(() => {
      // Le navigateur refuse le son : le film part muet, le son s'active d'un geste
      v.muted = true
      muet.value = true
      v.play().catch(() => {})
    })
  })
}

// Remonte d'un cran : du film au choix. Rend false s'il n'y avait pas de film.
function revenir() {
  if (!film.value) return false
  video.value?.pause()
  film.value = null
  lecture.value = false
  emit('etat', { niveau: 0 })
  return true
}

function basculerLecture() {
  const v = video.value
  if (!v) return
  if (v.paused) v.play().catch(() => {})
  else v.pause()
}
function basculerSon() {
  const v = video.value
  if (!v) return
  v.muted = !v.muted
  muet.value = v.muted
}
function basculerSousTitres() {
  sousTitres.value = !sousTitres.value
  const piste = video.value?.textTracks?.[0]
  if (piste) piste.mode = sousTitres.value ? 'showing' : 'hidden'
}
function avancer() {
  const v = video.value
  if (!v) return
  temps.value = v.currentTime
  if (!v.paused) emit('geste')
}
function lireDuree() {
  if (Number.isFinite(video.value?.duration)) duree.value = video.value.duration
}
function chercher(e) {
  const v = video.value
  if (!v) return
  v.currentTime = Number(e.target.value)
  temps.value = v.currentTime
}
function horloge(s) {
  const t = Math.max(0, Math.floor(s || 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
function dureeLisible(s) {
  const t = Math.round(s || 0)
  const m = Math.floor(t / 60)
  const r = t % 60
  if (!m) return `${r} s`
  return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min`
}

defineExpose({ revenir })
</script>

<style scoped>
/* Le choix : les cinq films en grille, l'image du film puis un aplat de la
   couleur du module qui porte son nom. Trois par ligne sur un écran large, deux
   sur une tablette, un seul sur un téléphone. */
.choix {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 32px;
}
.choix__grille {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 640px) {
  .choix { padding: 32px 24px 40px; }
  .choix__grille { grid-template-columns: repeat(2, 1fr); gap: 20px; }
}
@media (min-width: 1024px) {
  .choix__grille { grid-template-columns: repeat(6, 1fr); gap: 24px; }
  /* Trois films sur la première ligne, deux centrés sur la seconde */
  .choix__grille > li { grid-column: span 2; }
  .choix__grille > li:nth-child(4) { grid-column: 2 / span 2; }
}
.carte-film {
  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  text-align: left;
  color: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  -webkit-tap-highlight-color: transparent;
}
.carte-film:hover { transform: scale(1.02); }
.carte-film:active { transform: scale(0.98); }
.carte-film:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 4px;
}
.carte-film__image {
  position: relative;
  display: block;
  aspect-ratio: 16 / 9;
  background: #000;
}
.carte-film__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.carte-film__lecture {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  transform: translate(-50%, -50%);
}
.carte-film__texte {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 16px;
}
.carte-film__nom {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.2;
}
.carte-film__duree {
  flex-shrink: 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
}

/* Le film : toute la place disponible, les commandes dessous pour ne pas
   cacher les sous-titres. */
.lecteur-film {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}
.lecteur-film__ecran {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
}
.lecteur-film__ecran video {
  cursor: pointer;
}
.lecteur-film__ecran video::cue {
  font-family: Inter, sans-serif;
  font-size: clamp(16px, 2.4vh, 30px);
  line-height: 1.35;
  background: rgba(0, 0, 0, 0.7);
}
.commandes {
  margin-top: 12px;
}
@media (min-width: 640px) {
  .lecteur-film { padding: 20px 24px 24px; }
}

.bouton,
.bouton-rond {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  transition: background-color 0.3s ease-in-out;
}
.bouton { padding: 10px 16px; }
.bouton-rond { width: 40px; height: 40px; }
.bouton:hover,
.bouton-rond:hover { background: rgba(255, 255, 255, 0.2); }
.reprise { transition: background-color 0.3s ease-in-out; }

.curseur {
  -webkit-appearance: none;
  appearance: none;
  height: 24px;
  background: transparent;
  cursor: pointer;
}
.curseur::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(to right, #fff calc(var(--avance) * 100%), rgba(255, 255, 255, 0.25) 0);
}
.curseur::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(to right, #fff calc(var(--avance) * 100%), rgba(255, 255, 255, 0.25) 0);
}
.curseur::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: #fff;
}
.curseur::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 50%;
  background: #fff;
}

@media (prefers-reduced-motion: reduce) {
  .carte-film { transition: none; }
}
</style>
