<template>
  <!-- L'écran de salon. Un seul accueil : la vidéo en boucle et les icônes des
       écrans à ouvrir. Chaque icône ouvre la chose elle-même, jamais une page de
       présentation : l'outil d'un module, sa reproduction quand il n'a pas de
       démonstration publique, l'écran des communes, le générateur d'arrêtés, la
       roue des lots, l'estimation des prix. L'écran ouvert prend tout l'écran,
       sous une barre unique dont le seul bouton de retour remonte d'un cran, et
       tout se referme quand plus personne n'y touche. On ne change jamais de
       page : le plein écran tient du début à la fin. Page hors du menu, du plan
       du site et des moteurs. -->
  <div class="page-video relative isolate min-h-[100dvh] bg-dark text-white">
    <h1 class="sr-only">{{ videoAvantApres.nom }}</h1>

    <!-- Le fond reprend l'image de la vidéo, en tout petit, agrandie et floutée :
         il en suit les couleurs, en fondu. Un voile l'assombrit vers le bas pour
         que les icônes restent lisibles. -->
    <canvas ref="ambiance" class="ambiance" width="32" height="18" aria-hidden="true" />
    <div class="fixed inset-0 -z-10 bg-gradient-to-b from-dark/10 via-dark/40 to-dark/85 pointer-events-none" aria-hidden="true" />

    <!-- Sur un écran en largeur, la vidéo à gauche et les icônes dans une
         colonne à droite, centrées sur le lecteur ; sur un écran en hauteur,
         les icônes passent sous la vidéo. -->
    <div class="scene" :inert="ouverte ? '' : null">
      <div class="lecteur">
        <div class="ecran relative bg-black overflow-hidden">
          <!-- Un clic sur l'image met en pause ou relance, comme dans tout
               lecteur. -->
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

        <!-- Les commandes restent sous l'image, pour ne pas cacher la fin des
             sous-titres. Sur un téléphone, la barre de lecture prend une ligne
             à elle seule. -->
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
          <!-- Le seul plein écran du salon : il vise la page entière, et tient
               donc pour tous les écrans qu'on ouvre ensuite. -->
          <button type="button" class="bouton" @click="basculerPleinEcran">
            <Minimize v-if="plein" class="w-4 h-4" />
            <Maximize v-else class="w-4 h-4" />
            <span class="sr-only sm:not-sr-only">{{ plein ? 'Quitter le plein écran' : 'Passer en plein écran' }}</span>
          </button>
        </div>
      </div>

      <!-- Les icônes, comme sur l'écran d'accueil d'une tablette : les cinq
           modules en grille, et dans le dock ce qu'on fait sur le stand. Les
           liens gardent une adresse : un appui ordinaire ouvre l'écran ici, un
           clic avec Cmd, Ctrl ou la molette l'ouvre dans un nouvel onglet. -->
      <nav class="applis" aria-label="Écrans à ouvrir">
        <ul class="applis__grille" aria-label="Les cinq modules">
          <li v-for="v in vuesModules" :key="v.key">
            <a :href="v.lien" class="appli" @click="ouvrir($event, v)">
              <span class="appli__icone" :class="v.socle" aria-hidden="true">
                <component :is="v.icone" class="appli__picto" />
              </span>
              <span class="appli__nom">{{ v.court }}</span>
            </a>
          </li>
        </ul>
        <ul class="applis__dock" aria-label="Sur le stand">
          <li v-for="v in vuesStand" :key="v.key">
            <a :href="v.lien" class="appli" @click="ouvrir($event, v)">
              <span class="appli__icone appli__icone--blanc" :class="v.teinte" aria-hidden="true">
                <!-- L'icône de la roue est la roue elle-même, aux couleurs de ses lots -->
                <svg v-if="v.key === 'roue'" class="appli__roue" viewBox="-1.1 -1.1 2.2 2.2">
                  <path v-for="q in quartiersRoue" :key="q.d" :d="q.d" :fill="q.teinte" />
                  <circle r="0.3" fill="#fff" />
                  <circle r="0.12" fill="#111" />
                  <path d="M-0.16 -1.08 L0.16 -1.08 L0 -0.78 Z" fill="#FF0037" stroke="#fff" stroke-width="0.05" />
                </svg>
                <component :is="v.icone" v-else class="appli__picto" />
              </span>
              <span class="appli__nom">{{ v.court }}</span>
            </a>
          </li>
        </ul>
      </nav>
    </div>

    <!-- L'écran ouvert, sur tout l'écran. Une seule barre : le bouton de retour,
         qui dit où il ramène et ne remonte que d'un cran, le titre, la consigne,
         et l'action de l'écran quand il en a une (emporter la carte d'une
         commune). -->
    <div
      v-if="ouverte"
      class="vue fixed inset-0 z-50 flex flex-col bg-dark"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-vue"
    >
      <div class="barre flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 border-b border-white/10">
        <button ref="boutonRetour" type="button" class="bouton" @click="reculer">
          <ArrowLeft class="w-4 h-4" />
          {{ libelleRetour }}
        </button>
        <div class="flex-1 min-w-0">
          <h2 id="titre-vue" class="truncate font-heading font-semibold text-[15px] sm:text-base">{{ titreVue }}</h2>
          <p v-if="consigneVue" class="mt-0.5 text-[13px] leading-snug text-white/70 line-clamp-2">{{ consigneVue }}</p>
        </div>
        <button v-if="actionVue" type="button" class="bouton bouton--plein" @click="agir">
          {{ actionVue }}
        </button>
      </div>

      <div class="vue__corps" :class="ouverte.fond === 'sombre' ? 'bg-dark' : 'bg-white'">
        <!-- Le cadre reste caché jusqu'à son chargement : une page du site y
             montrerait un instant son en-tête, retiré dès qu'elle démarre. -->
        <iframe
          v-if="ouverte.url"
          ref="cadre"
          :key="ouverte.key"
          class="absolute inset-0 w-full h-full border-0"
          :class="{ invisible: !chargee }"
          :src="ouverte.url"
          :title="titreVue"
          allow="fullscreen; geolocation; screen-wake-lock"
          @load="cadreCharge"
        />
        <!-- Un module sans démonstration publique montre la reproduction de sa
             vitrine, sans la page qui l'entoure. -->
        <div v-else class="absolute inset-0 overflow-y-auto text-dark">
          <div class="max-w-[1040px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
            <component :is="ouverte.composant" :module-key="ouverte.key" />
          </div>
        </div>

        <p
          v-if="ouverte.url && !chargee"
          class="absolute inset-0 grid place-items-center text-sm pointer-events-none"
          :class="ouverte.fond === 'sombre' ? 'text-white/70' : 'text-gray-text'"
        >
          <span class="inline-flex items-center gap-2">
            <Loader class="w-4 h-4 animate-spin" />
            Chargement en cours
          </span>
        </p>

        <p
          v-if="lienBloque"
          class="lien-bloque absolute left-1/2 bottom-6 -translate-x-1/2 w-max max-w-[90%] rounded-2xl bg-dark/90 px-5 py-3 text-center text-sm leading-relaxed text-white"
          role="status"
        >
          {{ lienBloque }}
        </p>

        <!-- Le rappel avant le retour à la vidéo. Il couvre l'écran ouvert : un
             appui n'importe où le retient, même sur un site dont nous ne voyons
             pas les gestes. -->
        <div
          v-if="rappel"
          class="absolute inset-0 z-10 grid place-items-center bg-black/45 p-4"
          @pointerdown="toucher"
        >
          <div class="max-w-sm rounded-2xl bg-white px-6 py-5 text-center text-dark" role="alert">
            <p class="font-heading font-semibold text-lg leading-snug">
              Nous revenons à la vidéo dans {{ rappel }} {{ rappel > 1 ? 'secondes' : 'seconde' }}.
            </p>
            <button type="button" class="mt-4 rounded-full bg-dark px-5 py-2.5 text-sm font-medium text-white" @click="toucher">
              Rester sur cet écran
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount, defineAsyncComponent, markRaw } from 'vue'
import { ArrowLeft, Calculator, Loader, MapPinned, Maximize, Minimize, Pause, Play, Stamp, Volume2, VolumeX } from 'lucide-vue-next'
import { modules, ARRETE_URL } from '../data/modules.js'
import { lotsRoue } from '../data/roue.js'
import { videoAvantApres } from '../data/videoAvantApres.js'
import { KIOSK_URL, SALON_COMMUNES_PATH, SITE_URL } from '@/data/siteUrls.js'

/* ---- Les écrans ----
 *
 * `court` est le nom sous l'icône, `titre` celui de la barre, `url` ce que
 * montre le cadre, `lien` l'adresse du lien pour qui l'ouvre dans un nouvel
 * onglet. `liens` dit ce que le cadre laisse suivre : `outil` garde la
 * navigation de l'outil dans son cadre, `page` n'accepte que la page
 * elle-même, `communes` laisse l'écran des communes tenir les siens. `fond` est
 * la couleur sous le cadre pendant qu'il se charge. */

const vuesModules = modules.map((m) => ({
  key: m.key,
  court: m.short,
  titre: m.name,
  socle: m.tone.socle,
  icone: m.icon,
  url: m.demo?.url || null,
  lien: m.demo?.url || `/${m.key}`,
  consigne: m.demo?.consigne || null,
  // Sans démonstration publique (le Diagnostic), la reproduction de la vitrine
  composant: m.demo
    ? null
    : markRaw(defineAsyncComponent(() => import('../components/showcases/index.js').then((s) => s.showcases[m.showcase]))),
  liens: 'outil',
  fond: 'clair',
}))

// La clé du stand (/video?k=...) suit jusqu'à l'écran de génération : c'est
// elle qui lève le quota de constructions par adresse IP (demo/README.md).
const cleStand = (new URLSearchParams(window.location.search).get('k') || '').slice(0, 80)
const commune = {
  key: 'commune', court: 'Ma commune', titre: 'Voir la carte de votre commune', icone: MapPinned, teinte: 'text-mod-carte',
  url: cleStand ? `${SALON_COMMUNES_PATH}&k=${encodeURIComponent(cleStand)}` : SALON_COMMUNES_PATH,
  lien: KIOSK_URL, liens: 'communes', fond: 'sombre',
}
const vuesStand = [
  commune,
  {
    key: 'arretes', court: 'Arrêtés', titre: 'Générer un arrêté de circulation ou de voirie', icone: Stamp, teinte: 'text-mod-chantiers',
    url: ARRETE_URL, lien: ARRETE_URL, liens: 'outil', fond: 'clair',
    consigne: 'Touchez « Créer mon arrêté gratuitement » et choisissez ce que vous avez prévu : votre arrêté se rédige sous vos yeux, sans compte.',
  },
  { key: 'roue', court: 'Roue des lots', titre: 'Tourner la roue des lots', url: '/roue', lien: '/roue', liens: 'page', fond: 'sombre' },
  {
    key: 'tarification', court: 'Tarification', titre: "Estimer le prix d'Open Projets", icone: Calculator, teinte: 'text-dark',
    url: '/tarification?salon=1', lien: '/tarification', liens: 'page', fond: 'clair',
  },
]

/* L'icône de la roue : huit quartiers aux couleurs des lots. */
const quartiersRoue = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  const b = ((i + 1) * Math.PI) / 4
  const point = (t) => `${Math.sin(t).toFixed(3)} ${(-Math.cos(t)).toFixed(3)}`
  return { d: `M0 0 L${point(a)} A1 1 0 0 1 ${point(b)} Z`, teinte: lotsRoue[i % lotsRoue.length].teinte }
})

const video = ref(null)
const cadre = ref(null)
const boutonRetour = ref(null)

/* ---- La lecture ---- */

const lecture = ref(true)
const muet = ref(true)
const temps = ref(0)
const duree = ref(videoAvantApres.duree)
// Une pause demandée par le visiteur n'est pas défaite au retour sur l'onglet.
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
  if (document.visibilityState !== 'visible') return
  garderAllume()
  if (v?.paused && !pauseVoulue && !ouverte.value) v.play().catch(() => {})
}

/* ---- Le plein écran ----
 *
 * Il vise la page entière : comme on n'en change jamais, il tient pour tous
 * les écrans qu'on ouvre. L'iPhone ne sait mettre en plein écran que la
 * vidéo, avec son propre lecteur : c'est ce qu'il obtient. */

const pleinPossible = ref(false)
const plein = ref(false)

function basculerPleinEcran() {
  if (plein.value) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {})
    else document.webkitExitFullscreen?.()
    return
  }
  const el = document.documentElement
  if (!pleinPossible.value) video.value?.webkitEnterFullscreen?.()
  else if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
  else el.webkitRequestFullscreen?.()
}
function suivrePleinEcran() {
  plein.value = !!(document.fullscreenElement || document.webkitFullscreenElement)
}

// L'écran reste allumé : sur un stand, une tablette en veille ne montre rien.
let verrou = null
async function garderAllume() {
  try {
    if (navigator.wakeLock && (!verrou || verrou.released)) verrou = await navigator.wakeLock.request('screen')
  } catch { /* refusé : la tablette gère elle-même sa mise en veille */ }
}

/* ---- L'écran ouvert ---- */

const ouverte = ref(null)
const chargee = ref(false)
// Où en est l'écran des communes, d'après son dernier message : sa profondeur,
// son titre, le libellé de son retour, son action, et s'il faut l'attendre.
const etape = ref({ niveau: 0 })
let declencheur = null
let reprendreApres = false

const titreVue = computed(() => etape.value.titre || ouverte.value?.titre || '')
const libelleRetour = computed(() => etape.value.retour || 'Revenir à la vidéo')
const actionVue = computed(() => etape.value.action || null)
const consigneVue = computed(() => (etape.value.niveau ? null : ouverte.value?.consigne || null))

function ouvrir(e, vue) {
  // Cmd, Ctrl, Maj ou la molette : le navigateur ouvre l'onglet lui-même.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  e.preventDefault()
  declencheur = e.currentTarget
  afficher(vue)
}

// Ouvre un écran, depuis l'accueil ou à la place d'un autre (la roue mène à
// l'écran des communes).
function afficher(vue) {
  const v = video.value
  if (!ouverte.value) {
    reprendreApres = !v.paused
    v.pause()
  }
  etape.value = { niveau: 0 }
  chargee.value = false
  cadreDistant = false
  lienBloque.value = ''
  ouverte.value = vue
  toucher()
  document.documentElement.classList.add('overflow-hidden')
  nextTick(() => boutonRetour.value?.focus())
}

function fermer(motif) {
  ouverte.value = null
  etape.value = { niveau: 0 }
  rappel.value = 0
  lienBloque.value = ''
  document.documentElement.classList.remove('overflow-hidden')
  // Après la veille, la vidéo repart toujours : c'est elle qui attire le
  // visiteur suivant.
  if (motif === 'veille') pauseVoulue = false
  if (reprendreApres || motif === 'veille') video.value?.play().catch(() => {})
  nextTick(() => declencheur?.focus())
}

function envoyer(type) {
  try {
    cadre.value?.contentWindow?.postMessage({ type }, window.location.origin)
  } catch { /* cadre déjà refermé */ }
}

// Le bouton de retour remonte d'un cran : dans l'écran des communes, il ferme
// ce qui y est ouvert ; partout ailleurs, il ramène à la vidéo.
function reculer() {
  toucher()
  if (ouverte.value?.liens === 'communes' && etape.value.niveau > 0) envoyer('salon:retour')
  else fermer('bouton')
}
function agir() {
  toucher()
  envoyer('salon:action')
}
function toucheClavier(e) {
  if (e.key === 'Escape' && ouverte.value) reculer()
}

/* L'écran des communes dit où il en est. Seuls ses messages, de même origine,
 * sont écoutés, et ses textes passent par l'interpolation de Vue. */
const texte = (t) => (typeof t === 'string' && t ? t.slice(0, 120) : null)
function recevoir(e) {
  if (!ouverte.value || e.origin !== window.location.origin || !cadre.value || e.source !== cadre.value.contentWindow) return
  const d = e.data
  if (d?.type === 'salon:etat') {
    etape.value = {
      niveau: Number(d.niveau) || 0,
      titre: texte(d.titre),
      retour: texte(d.retour),
      action: texte(d.action),
      attente: d.attente === true,
    }
    toucher()
  } else if (d?.type === 'salon:geste') {
    toucher()
  }
}

/* ---- Les liens des écrans ouverts ----
 *
 * Un cadre de même origine laisse voir ses liens : celui qui mène à l'écran
 * des communes l'ouvre ici, ceux qui mènent à un autre site restent fermés,
 * et une page du site (la roue, les prix) ne mène nulle part ailleurs. Le
 * visiteur sait pourquoi. Un cadre d'un autre site ne montre rien : il garde
 * ses liens. */

const EXPLICATIONS = {
  ailleurs: "Ce lien mène à un autre site, qui ne s'ouvre pas sur l'écran du stand.",
  page: "Cette page ne s'ouvre pas sur l'écran du stand. Revenez à la vidéo pour ouvrir un autre écran.",
}
const lienBloque = ref('')
let minuteurLien = null
function expliquer(motif) {
  lienBloque.value = EXPLICATIONS[motif]
  clearTimeout(minuteurLien)
  minuteurLien = setTimeout(() => { lienBloque.value = '' }, 6000)
}

function versLesCommunes(u) {
  const origines = [window.location.origin, new URL(SITE_URL).origin]
  return origines.includes(u.origin) && (u.pathname === '/kiosk' || u.pathname.startsWith('/cartes'))
}

// Ce que devient une adresse demandée depuis le cadre : true si elle peut s'y
// ouvrir, sinon elle a déjà été traitée (écran des communes ou explication).
function autoriser(u, doc, vue) {
  if (versLesCommunes(u)) {
    afficher(commune)
    return false
  }
  if (u.origin !== window.location.origin) {
    expliquer('ailleurs')
    return false
  }
  if (vue.liens === 'page' && u.pathname !== doc.location.pathname) {
    expliquer('page')
    return false
  }
  return true
}

function surveillerLiens(doc, fenetre, vue) {
  doc.addEventListener('click', (e) => {
    // Pas de instanceof : les éléments du cadre viennent d'un autre monde JavaScript
    const a = typeof e.target?.closest === 'function' ? e.target.closest('a[href]') : null
    if (!a) return
    let cible
    try {
      cible = new URL(a.getAttribute('href') || '', doc.baseURI)
    } catch {
      return
    }
    if (!autoriser(cible, doc, vue)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // Un nouvel onglet s'ouvre dans le cadre
    if (a.target === '_blank') a.target = '_self'
  }, true)
  try {
    fenetre.open = (url) => {
      try {
        const u = new URL(String(url || ''), doc.baseURI)
        if (autoriser(u, doc, vue)) fenetre.location.href = u.href
      } catch { /* adresse illisible : ignorée */ }
      return null
    }
  } catch { /* fenêtre inaccessible */ }
}

/* ---- La veille ----
 *
 * Quand plus personne ne touche l'écran ouvert, un rappel prévient, puis tout
 * se referme et la vidéo repart. Les gestes comptent partout où nous les
 * voyons : sur cette page, dans un cadre de même origine, et dans l'écran des
 * communes, qui les signale lui-même, cartes ouvertes comprises. */

const VEILLE = {
  // Une minute sans geste, puis dix secondes de rappel
  calme: 60,
  prevenir: 10,
  // Un cadre d'un autre site (Chantiers, le générateur d'arrêtés) ne nous
  // montre pas ses gestes : le rappel y vient plus tard, et un appui le retient
  distant: 180,
  // La construction d'une carte se regarde plusieurs minutes sans toucher à
  // rien : le même filet que l'écran du stand, au cas où elle ne finirait pas
  attente: 20 * 60,
}
const GESTES = ['pointerdown', 'keydown', 'wheel', 'touchstart']
const rappel = ref(0)
let dernierGeste = Date.now()
let cadreDistant = false
let minuteurVeille = null

function toucher() {
  dernierGeste = Date.now()
  rappel.value = 0
}
function tic() {
  if (!ouverte.value) return
  const delai = etape.value.attente ? VEILLE.attente : cadreDistant ? VEILLE.distant : VEILLE.calme
  const reste = delai - (Date.now() - dernierGeste) / 1000
  if (reste <= 0) fermer('veille')
  else rappel.value = reste <= VEILLE.prevenir ? Math.ceil(reste) : 0
}
// Le premier appui dans un cadre d'un autre site lui donne le focus : c'est
// le seul geste que nous en voyons.
function focusCadre() {
  if (ouverte.value && document.activeElement?.tagName === 'IFRAME') toucher()
}

function cadreCharge() {
  chargee.value = true
  const vue = ouverte.value
  const el = cadre.value
  if (!vue || !el) return
  let doc = null
  try {
    doc = el.contentDocument
  } catch {
    doc = null
  }
  cadreDistant = !doc
  if (!doc) return
  GESTES.forEach((ev) => doc.addEventListener(ev, toucher, { passive: true, capture: true }))
  // L'écran des communes tient ses liens lui-même
  if (vue.liens !== 'communes') surveillerLiens(doc, el.contentWindow, vue)
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
  if (t - derniere < 100 || ouverte.value) return
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
  GESTES.forEach((ev) => window.addEventListener(ev, toucher, { passive: true, capture: true }))
  window.addEventListener('blur', focusCadre)
  window.addEventListener('message', recevoir)
  minuteurVeille = setInterval(tic, 1000)
  garderAllume()
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
  GESTES.forEach((ev) => window.removeEventListener(ev, toucher, { capture: true }))
  window.removeEventListener('blur', focusCadre)
  window.removeEventListener('message', recevoir)
  clearInterval(minuteurVeille)
  clearTimeout(minuteurLien)
  verrou?.release?.().catch(() => {})
  document.documentElement.classList.remove('bg-dark', 'overflow-hidden')
  cancelAnimationFrame(boucle)
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
  gap: 4px;
  padding: 12px 10px 10px;
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
/* Sur une icône blanche, le picto prend la teinte posée sur l'icône */
.appli__icone--blanc .appli__picto {
  color: inherit;
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
@media (max-width: 639px) {
  .appli__nom { font-size: 11.5px; }
}

/* Sur un écran en largeur (salon, ordinateur) : la vidéo à gauche, qui prend
   toute la place restante sans défilement, et les icônes à droite, sur deux
   colonnes, le dock compris. */
@media (min-width: 1024px) and (orientation: landscape) {
  .scene {
    --marge: 24px;
    --ecart: 28px;
    --commandes: 56px;
    --icone: clamp(64px, 8.6vh, 96px);
    --case: calc(var(--icone) + 26px);
    /* La colonne tient le dock, un peu plus large que deux icônes. */
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
    gap: 24px;
  }
  .applis__grille {
    grid-template-columns: repeat(2, var(--case));
    gap: 20px 12px;
  }
  .applis__dock {
    display: grid;
    grid-template-columns: repeat(2, var(--case));
    gap: 16px 12px;
    padding: 16px 14px 12px;
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

/* Les boutons du lecteur et de la barre. */
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
.bouton--plein,
.bouton--plein:hover {
  background: #fff;
  color: #111;
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

/* L'écran ouvert : la barre, puis ce qu'il montre sur toute la hauteur. */
.vue {
  animation: entree 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.vue__corps {
  position: relative;
  flex: 1;
  min-height: 0;
}
@keyframes entree {
  from { opacity: 0; transform: translateY(12px); }
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
  .vue { animation: none; }
}
</style>
