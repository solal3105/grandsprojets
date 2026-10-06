<template>
  <!-- L'écran de salon : la vidéo tourne en boucle, et les sorties restent à
       portée de main, le stand des cartes des communes et les pages des cinq
       modules. Une sortie s'ouvre par-dessus la vidéo, dans un panneau qu'on
       referme pour revenir où on en était. Page hors du menu, du plan du site
       et des moteurs. -->
  <div class="page-video relative isolate min-h-[100dvh] bg-dark text-white">
    <h1 class="sr-only">{{ videoAvantApres.nom }}</h1>

    <!-- Le fond reprend l'image de la vidéo, en tout petit, agrandie et floutée :
         il en suit les couleurs, en fondu. Un voile l'assombrit vers le bas pour
         que les sorties restent lisibles. -->
    <canvas ref="ambiance" class="ambiance" width="32" height="18" aria-hidden="true" />
    <div class="fixed inset-0 -z-10 bg-gradient-to-b from-dark/10 via-dark/40 to-dark/85 pointer-events-none" aria-hidden="true" />

    <!-- Sur un écran en largeur, la vidéo à gauche et les icônes dans une
         colonne à droite, centrées sur le lecteur ; sur un écran en hauteur,
         les icônes passent sous la vidéo. -->
    <div class="scene" :inert="ouverte ? '' : null">
      <div
        ref="lecteur"
        class="lecteur"
        :class="{ 'is-plein': pleinVideo, 'is-calme': pleinVideo && lecture && !actif }"
        @pointermove="reveiller"
        @pointerdown="reveiller"
      >
        <div class="ecran relative bg-black overflow-hidden">
          <!-- Un clic sur l'image met en pause ou relance, comme dans tout
               lecteur. Le plein écran ne s'ouvre que par son bouton. -->
          <video
            ref="video"
            class="w-full h-full object-contain"
            :src="videoAvantApres.fichier"
            :poster="videoAvantApres.affiche"
            autoplay loop muted playsinline preload="auto"
            :aria-label="videoAvantApres.description"
            @click="basculerLecture"
            @play="lecture = true"
            @pause="lecture = false"
            @loadedmetadata="lireDuree"
          />
          <button
            v-if="!lecture"
            type="button"
            class="reprise absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-20 h-20 rounded-full bg-black/60 ring-1 ring-white/25 hover:bg-black/75"
            aria-label="Reprendre la vidéo"
            @click="basculerLecture"
          >
            <Play class="w-9 h-9 translate-x-0.5" />
          </button>
        </div>

        <!-- Les commandes restent sous l'image : posées dessus, elles cachaient
             la fin des sous-titres. En plein écran seulement, elles passent sur
             l'image et s'effacent quand on ne touche plus à rien. Sur un
             téléphone, la barre de lecture prend une ligne à elle seule. -->
        <div class="commandes flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap sm:gap-3">
          <button
            type="button"
            class="bouton-rond"
            :aria-label="lecture ? 'Mettre la vidéo en pause' : 'Reprendre la vidéo'"
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
            aria-label="Position dans la vidéo"
            :aria-valuetext="`${horloge(temps)} sur ${horloge(duree)}`"
            @input="chercher"
          >
          <span class="mr-auto text-sm tabular-nums text-white/75 whitespace-nowrap">
            {{ horloge(temps) }} / {{ horloge(duree) }}
          </span>
          <button
            type="button"
            class="bouton"
            :aria-pressed="!muet"
            @click="basculerSon"
          >
            <VolumeX v-if="muet" class="w-4 h-4" />
            <Volume2 v-else class="w-4 h-4" />
            {{ muet ? 'Activer le son' : 'Couper le son' }}
          </button>
          <button type="button" class="bouton" @click="basculerPleinVideo">
            <Minimize v-if="pleinVideo" class="w-4 h-4" />
            <Maximize v-else class="w-4 h-4" />
            <span class="sr-only sm:not-sr-only">{{ pleinVideo ? 'Quitter le plein écran' : 'Passer en plein écran' }}</span>
          </button>
        </div>
      </div>

      <!-- Les pages à ouvrir, en icônes d'applications comme sur l'écran d'accueil
           d'une tablette : les cinq modules en grille, et dans le dock du bas les
           deux activités du stand, la carte de sa commune et la roue des lots.
           Les liens gardent leur adresse : un appui ordinaire ouvre la page dans
           le panneau, un clic avec Cmd, Ctrl ou la molette l'ouvre dans un nouvel
           onglet, comme partout. -->
      <nav class="applis" aria-label="Pages à ouvrir">
        <ul class="applis__grille" aria-label="Les cinq modules">
          <li v-for="p in pagesModules" :key="p.key">
            <a :href="p.url" class="appli" @click="ouvrir($event, p)">
              <span class="appli__icone" :class="p.socle" aria-hidden="true">
                <component :is="p.icone" class="appli__picto" />
              </span>
              <span class="appli__nom">{{ p.court }}</span>
            </a>
          </li>
        </ul>
        <ul class="applis__dock" aria-label="Sur le stand">
          <li>
            <a :href="commune.url" class="appli" @click="ouvrir($event, commune)">
              <span class="appli__icone appli__icone--blanc" aria-hidden="true">
                <MapPinned class="appli__picto appli__picto--rouge" />
              </span>
              <span class="appli__nom">{{ commune.court }}</span>
            </a>
          </li>
          <li>
            <a :href="roue.url" class="appli" @click="ouvrir($event, roue)">
              <!-- L'icône de la roue est la roue elle-même, aux couleurs de ses lots -->
              <span class="appli__icone appli__icone--blanc" aria-hidden="true">
                <svg class="appli__roue" viewBox="-1.1 -1.1 2.2 2.2">
                  <path v-for="q in quartiersRoue" :key="q.d" :d="q.d" :fill="q.teinte" />
                  <circle r="0.3" fill="#fff" />
                  <circle r="0.12" fill="#111" />
                  <path d="M-0.16 -1.08 L0.16 -1.08 L0 -0.78 Z" fill="#FF0037" stroke="#fff" stroke-width="0.05" />
                </svg>
              </span>
              <span class="appli__nom">{{ roue.court }}</span>
            </a>
          </li>
        </ul>
      </nav>
    </div>

    <!-- La page ouverte, dans un panneau posé sur la vidéo. Il se referme par
         son bouton, par Échap ou d'un clic à côté ; son propre bouton le passe
         en plein écran. -->
    <div v-if="ouverte" class="voile-page" @click.self="fermer">
      <div
        ref="panneau"
        class="panneau"
        :class="{ 'is-plein': pleinPage }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-page-ouverte"
      >
        <div class="barre flex items-center gap-2 sm:gap-3 bg-dark text-white px-3 sm:px-4 py-2.5">
          <span class="w-3 h-3 shrink-0 rounded-full" :class="ouverte.socle" aria-hidden="true" />
          <h2 id="titre-page-ouverte" class="flex-1 min-w-0 truncate font-heading font-semibold text-[15px]">
            {{ ouverte.titre }}
          </h2>
          <button v-if="pleinPossible" type="button" class="bouton" @click="basculerPleinPage">
            <Minimize v-if="pleinPage" class="w-4 h-4" />
            <Maximize v-else class="w-4 h-4" />
            <span class="sr-only sm:not-sr-only">{{ pleinPage ? 'Quitter le plein écran' : 'Passer en plein écran' }}</span>
          </button>
          <button ref="boutonFermer" type="button" class="bouton" @click="fermer">
            <X class="w-4 h-4" />
            Revenir à la vidéo
          </button>
        </div>
        <div class="relative flex-1" :class="ouverte.key === 'roue' ? 'bg-dark' : 'bg-white'">
          <iframe
            :key="ouverte.key"
            class="absolute inset-0 w-full h-full"
            :src="ouverte.url"
            :title="ouverte.titre"
            allow="fullscreen"
            @load="chargee = true"
          />
          <p
            v-if="!chargee"
            class="absolute inset-0 grid place-items-center text-sm text-gray-text pointer-events-none"
          >
            <span class="inline-flex items-center gap-2">
              <Loader class="w-4 h-4 animate-spin" />
              Chargement de la page
            </span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Loader, MapPinned, Maximize, Minimize, Pause, Play, Volume2, VolumeX, X } from 'lucide-vue-next'
import { modules } from '../data/modules.js'
import { lotsRoue } from '../data/roue.js'
import { videoAvantApres } from '../data/videoAvantApres.js'
import { KIOSK_URL } from '@/data/siteUrls.js'

/* Les pages qui s'ouvrent dans le panneau : les cinq modules, l'écran du stand
 * et la roue des lots. `court` est le nom sous l'icône, `titre` celui du
 * panneau. */
const commune = { key: 'commune', court: 'Ma commune', titre: 'Chercher ma commune', url: KIOSK_URL, socle: 'bg-primary' }
const roue = { key: 'roue', court: 'Roue des lots', titre: 'La roue des lots', url: '/roue', socle: 'bg-white' }
const pagesModules = modules.map((m) => ({
  key: m.key,
  court: m.short,
  titre: m.name,
  url: `/${m.key}`,
  socle: m.tone.socle,
  icone: m.icon,
}))

/* L'icône de la roue : huit quartiers aux couleurs des lots. */
const quartiersRoue = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  const b = ((i + 1) * Math.PI) / 4
  const point = (t) => `${Math.sin(t).toFixed(3)} ${(-Math.cos(t)).toFixed(3)}`
  return { d: `M0 0 L${point(a)} A1 1 0 0 1 ${point(b)} Z`, teinte: lotsRoue[i % lotsRoue.length].teinte }
})

const lecteur = ref(null)
const video = ref(null)
const panneau = ref(null)
const boutonFermer = ref(null)

/* ---- La lecture ---- */

const lecture = ref(true)
const muet = ref(true)
const temps = ref(0)
const duree = ref(videoAvantApres.duree)
// Une pause demandée par le visiteur (ou par l'ouverture d'une page) n'est pas
// défaite au retour sur l'onglet.
let pauseVoulue = false

function basculerLecture() {
  const v = video.value
  if (v.paused) {
    pauseVoulue = false
    v.play().catch(() => {})
  } else {
    pauseVoulue = true
    v.pause()
  }
  reveiller()
}
// Les navigateurs refusent la lecture automatique avec le son : la vidéo part
// muette, et le son s'active d'un geste.
function basculerSon() {
  const v = video.value
  v.muted = !v.muted
  muet.value = v.muted
  if (v.paused && !pauseVoulue) v.play().catch(() => {})
}
function lireDuree() {
  if (Number.isFinite(video.value?.duration)) duree.value = video.value.duration
}
function chercher(e) {
  const v = video.value
  v.currentTime = Number(e.target.value)
  temps.value = v.currentTime
}
function horloge(s) {
  const t = Math.max(0, Math.floor(s || 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// Au retour sur l'onglet, la vidéo repart si le navigateur l'a mise en pause
// pendant qu'elle était cachée, jamais si on l'a arrêtée exprès.
function reprendre() {
  const v = video.value
  if (document.visibilityState === 'visible' && v?.paused && !pauseVoulue && !ouverte.value) v.play().catch(() => {})
}

/* ---- Le plein écran ---- */

// L'iPhone ne sait mettre en plein écran que la vidéo, avec son propre lecteur :
// le panneau d'une page, lui, y occupe déjà tout l'écran.
const pleinPossible = ref(false)
const pleinVideo = ref(false)
const pleinPage = ref(false)

function entrerPleinEcran(el) {
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
}
function quitterPleinEcran() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else if (document.webkitFullscreenElement) document.webkitExitFullscreen()
}
// Le plein écran vise le lecteur entier, pas la vidéo seule : ses commandes,
// dont celle qui en sort, restent disponibles par-dessus l'image.
function basculerPleinVideo() {
  if (pleinVideo.value) return quitterPleinEcran()
  if (pleinPossible.value) entrerPleinEcran(lecteur.value)
  else video.value?.webkitEnterFullscreen?.()
}
function basculerPleinPage() {
  if (pleinPage.value) quitterPleinEcran()
  else entrerPleinEcran(panneau.value)
}
function suivrePleinEcran() {
  const el = document.fullscreenElement || document.webkitFullscreenElement || null
  pleinVideo.value = !!el && el === lecteur.value
  pleinPage.value = !!el && el === panneau.value
  reveiller()
}

// En plein écran, les commandes s'effacent après trois secondes sans geste et
// reviennent au moindre mouvement.
const actif = ref(true)
let minuteur = null
function reveiller() {
  actif.value = true
  clearTimeout(minuteur)
  minuteur = setTimeout(() => { actif.value = false }, 3000)
}

/* ---- Les pages ouvertes dans le panneau ---- */

const ouverte = ref(null)
const chargee = ref(false)
let declencheur = null
let reprendreApres = false

function ouvrir(e, page) {
  // Cmd, Ctrl, Maj ou la molette : le navigateur ouvre l'onglet lui-même.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  declencheur = e.currentTarget
  const v = video.value
  reprendreApres = !v.paused
  v.pause()
  chargee.value = false
  ouverte.value = page
  document.documentElement.classList.add('overflow-hidden')
  nextTick(() => boutonFermer.value?.focus())
}
function fermer() {
  if (pleinPage.value) quitterPleinEcran()
  ouverte.value = null
  document.documentElement.classList.remove('overflow-hidden')
  if (reprendreApres) video.value?.play().catch(() => {})
  nextTick(() => declencheur?.focus())
}
function toucheClavier(e) {
  if (e.key === 'Escape' && ouverte.value && !pleinPage.value) fermer()
}

/* ---- Le fond d'ambiance ---- */

/* Dix fois par seconde, l'image courante est posée à 20 % sur la précédente
 * dans un canvas de 32 x 18 pixels. Ce mélange fait le fondu d'une scène à
 * l'autre ; l'agrandissement et le flou font le reste. La même boucle fait
 * avancer le curseur de lecture, à chaque image pour qu'il glisse. */
const ambiance = ref(null)
let boucle = 0
let derniere = 0
function animer(t) {
  boucle = requestAnimationFrame(animer)
  const v = video.value
  if (!v) return
  if (!v.paused) temps.value = v.currentTime
  if (t - derniere < 100 || pleinVideo.value || ouverte.value) return
  derniere = t
  const c = ambiance.value
  if (!c || v.readyState < 2) return
  const x = c.getContext('2d')
  x.globalAlpha = 0.2
  x.drawImage(v, 0, 0, c.width, c.height)
}

onMounted(() => {
  pleinPossible.value = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)
  document.addEventListener('visibilitychange', reprendre)
  document.addEventListener('fullscreenchange', suivrePleinEcran)
  document.addEventListener('webkitfullscreenchange', suivrePleinEcran)
  document.addEventListener('keydown', toucheClavier)
  // Le fond de la fenêtre suit aussi, pour les rebonds de défilement.
  document.documentElement.classList.add('bg-dark')
  const v = video.value
  v.muted = true
  v.play().catch(() => {})
  lecture.value = !v.paused
  boucle = requestAnimationFrame(animer)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', reprendre)
  document.removeEventListener('fullscreenchange', suivrePleinEcran)
  document.removeEventListener('webkitfullscreenchange', suivrePleinEcran)
  document.removeEventListener('keydown', toucheClavier)
  document.documentElement.classList.remove('bg-dark', 'overflow-hidden')
  cancelAnimationFrame(boucle)
  clearTimeout(minuteur)
})
</script>

<style scoped>
.page-video {
  overflow-x: clip;
}

/* Sur un écran en hauteur (téléphone, tablette debout) : une colonne, la vidéo
   en tête, les icônes dessous, les cinq modules sur une ligne et le dock du stand
   en dessous, comme sur l'écran d'accueil d'un téléphone. */
.scene {
  --icone: min(14vw, 64px);
  --case: calc(var(--icone) + 14px);
  min-height: 100dvh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.ecran {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 16px;
}
.ecran video {
  cursor: pointer;
}
.commandes {
  margin-top: 12px;
}
@media (min-width: 640px) {
  .scene {
    --icone: 72px;
    --case: calc(var(--icone) + 26px);
    padding: 24px;
  }
}

/* Les icônes d'applications */
.applis {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}
.applis__grille {
  display: grid;
  grid-template-columns: repeat(5, var(--case));
  justify-content: center;
  gap: 18px 4px;
}
.applis__dock {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px 10px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.appli {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: var(--case);
  border-radius: 12px;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
}
.appli:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 4px;
}
.appli__icone {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--icone);
  height: var(--icone);
  border-radius: 23%;
  overflow: hidden;
  box-shadow:
    0 6px 16px rgba(0, 0, 0, 0.35),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.35);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
/* Le reflet du haut, comme sur les icônes d'un écran d'accueil */
.appli__icone::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 55%);
  pointer-events: none;
}
.appli:hover .appli__icone {
  transform: scale(1.06);
}
.appli:active .appli__icone {
  transform: scale(0.92);
}
.appli__icone--blanc {
  background: #fff;
}
.appli__picto {
  position: relative;
  z-index: 1;
  width: 48%;
  height: 48%;
  color: #fff;
}
.appli__picto--rouge {
  color: #c4002a;
}
.appli__roue {
  position: relative;
  z-index: 1;
  width: 74%;
  height: 74%;
}
.appli__nom {
  max-width: 100%;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
/* Dans le dock, deux icônes seulement : leurs noms tiennent sur une ligne. */
.applis__dock .appli {
  width: auto;
  min-width: var(--case);
}
.applis__dock .appli__nom {
  white-space: nowrap;
}
@media (max-width: 639px) {
  .appli__nom { font-size: 11.5px; }
}

/* Sur un écran en largeur (salon, ordinateur) : la vidéo à gauche, qui prend
   toute la place restante sans défilement, et les icônes à droite, sur deux
   colonnes. */
@media (min-width: 1024px) and (orientation: landscape) {
  .scene {
    --marge: 24px;
    --ecart: 28px;
    --commandes: 56px;
    --icone: clamp(64px, 8.6vh, 96px);
    --case: calc(var(--icone) + 26px);
    /* La colonne tient le dock, un peu plus large que les deux icônes. */
    --colonne: calc(2 * var(--case) + 44px);
    padding: var(--marge);
    display: grid;
    grid-template-columns: auto var(--colonne);
    justify-content: center;
    align-content: center;
    column-gap: var(--ecart);
  }
  .applis {
    grid-column: 2;
    grid-row: 1;
    align-self: center;
    gap: 28px;
  }
  .applis__grille {
    grid-template-columns: repeat(2, var(--case));
    gap: 22px 12px;
  }
  .applis__dock {
    gap: 10px;
    padding: 14px 14px 12px;
  }
  .appli__nom {
    font-size: 14px;
  }
  .lecteur {
    grid-column: 1;
    grid-row: 1;
    align-self: center;
    width: min(
      calc(100vw - 2 * var(--marge) - var(--colonne) - var(--ecart)),
      calc((100dvh - 2 * var(--marge) - var(--commandes)) * 16 / 9),
      1760px
    );
  }
}
@media (min-width: 1536px) and (orientation: landscape) {
  .scene {
    --marge: 32px;
    --ecart: 36px;
  }
}

/* Les boutons du lecteur et du panneau. */
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
.bouton {
  padding: 10px 16px;
}
.bouton-rond {
  width: 40px;
  height: 40px;
}
.bouton:hover,
.bouton-rond:hover {
  background: rgba(255, 255, 255, 0.2);
}
.reprise {
  transition: background-color 0.3s ease-in-out;
}

/* Le curseur de lecture : la part déjà lue en blanc plein, le reste en blanc
   voilé. --avance va de 0 à 1. */
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

/* Le lecteur en plein écran : l'image occupe tout, les commandes passent
   dessus, sur un dégradé, et s'effacent avec le curseur de la souris. */
.lecteur.is-plein {
  position: relative;
  background: #000;
}
.lecteur.is-plein .ecran {
  height: 100%;
  aspect-ratio: auto;
  border-radius: 0;
}
.lecteur.is-plein .commandes {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  margin: 0;
  padding: 48px 32px 24px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent);
  transition: opacity 0.3s ease-in-out;
}
.lecteur.is-calme,
.lecteur.is-calme video {
  cursor: none;
}
.lecteur.is-calme .commandes {
  opacity: 0;
  pointer-events: none;
}

/* Le panneau d'une page : presque tout l'écran sur un ordinateur, tout l'écran
   sur un téléphone. */
.voile-page {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  animation: apparition 0.3s ease-in-out;
}
.panneau {
  margin: auto;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  animation: entree 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (min-width: 768px) {
  .voile-page {
    padding: 24px;
  }
  .panneau {
    max-width: 1680px;
    border-radius: 16px;
  }
}
.panneau.is-plein {
  border-radius: 0;
}
@keyframes apparition {
  from { opacity: 0; }
}
@keyframes entree {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
}

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
  .voile-page,
  .panneau { animation: none; }
}
</style>
