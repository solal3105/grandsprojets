<template>
  <!-- La roue des lots du stand. On la lance d'un geste du doigt ou par le
       bouton du centre ; elle tourne, claque sur ses picots, ralentit, et le
       lot gagné est celui de la case où elle s'arrête. Page hors du menu, du
       plan du site et des moteurs, ouverte depuis l'écran de la vidéo. -->
  <div class="page-roue bg-dark text-white" :class="`is-${etat}`">
    <!-- Le texte : la consigne et les lots, puis le lot gagné à la place -->
    <section class="texte" aria-live="polite">
      <div v-if="etat === 'resultat' && gagnant" class="resultat">
        <span class="pastille" :style="{ backgroundColor: gagnant.lot.teinte }" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path :d="gagnant.lot.picto.join(' ')" /></svg>
        </span>
        <h2 class="font-heading font-bold tracking-tight leading-[1.08] text-[clamp(30px,4vw,52px)]">
          Vous avez gagné {{ gagnant.lot.gain }}.
        </h2>
        <p class="mt-4 text-lg leading-relaxed text-white/80">{{ gagnant.lot.remise }}</p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a v-if="gagnant.lot.action" :href="KIOSK_URL" class="bouton bouton--plein">
            {{ gagnant.lot.action }}
            <ArrowRight class="w-4 h-4" />
          </a>
          <button ref="boutonRevenir" type="button" class="bouton" @click="fermerResultat">
            <RotateCcw class="w-4 h-4" />
            Revenir à la roue
          </button>
        </div>
      </div>

      <div v-else class="consigne">
        <h1 class="font-heading font-bold tracking-tight leading-[1.05] text-[clamp(34px,4.6vw,64px)]">
          Tournez la roue et gagnez un lot.
        </h1>
        <p v-if="etat === 'vide'" class="mt-4 text-lg leading-relaxed text-white/80">
          Aucun lot n'est sur la roue pour l'instant. Ouvrez les réglages pour en ajouter.
        </p>
        <div v-else>
          <p class="mt-4 text-lg leading-relaxed text-white/80">
            Lancez la roue d'un geste du doigt, ou touchez le bouton au centre. Chaque case fait gagner le lot qu'elle porte.
          </p>
          <h2 class="mt-8 font-heading font-semibold text-[15px] text-white/70">
            {{ enJeu.length > 1 ? `La roue fait gagner ces ${enJeu.length} lots.` : 'La roue fait gagner ce lot.' }}
          </h2>
          <ul class="lots mt-3">
            <li v-for="lot in enJeu" :key="lot.key">
              <span class="pastille pastille--petite" :style="{ backgroundColor: lot.teinte }" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path :d="lot.picto.join(' ')" /></svg>
              </span>
              <span>{{ lot.nom }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- La roue -->
    <section ref="theatre" class="theatre" aria-label="La roue des lots">
      <div class="rayons" aria-hidden="true" />
      <div ref="roueEl" class="roue" :class="{ 'is-gain': etat === 'resultat' }">
        <canvas ref="cadre" class="couche" aria-hidden="true" />
        <canvas ref="ampoulesA" class="couche ampoules ampoules--a" aria-hidden="true" />
        <canvas ref="ampoulesB" class="couche ampoules ampoules--b" aria-hidden="true" />
        <div
          ref="disque"
          class="disque"
          @pointerdown="saisir"
          @pointermove="glisser"
          @pointerup="lacher"
          @pointercancel="lacher"
        >
          <canvas ref="net" class="couche" aria-hidden="true" />
          <canvas ref="flou" class="couche flou" aria-hidden="true" />
          <svg v-if="gagnant" class="couche eclat" viewBox="-1 -1 2 2" aria-hidden="true">
            <path class="eclat__reste" :d="gagnant.chemins.reste" fill-rule="evenodd" />
            <path class="eclat__halo" :d="gagnant.chemins.part" />
            <path class="eclat__part" :d="gagnant.chemins.part" />
          </svg>
        </div>
        <div class="reflet" aria-hidden="true" />
        <button
          type="button"
          class="moyeu"
          :disabled="etat !== 'repos'"
          aria-label="Lancer la roue"
          @click="lancerAuBouton"
        >
          <svg class="moyeu__logo" viewBox="0 0 568 531" aria-hidden="true">
            <path d="M409.02 346.761L398.849 349.951L440.009 322.511C464.501 306.183 481.174 280.477 486.095 251.457C491.965 216.845 480.492 181.516 456.469 155.917C453.155 152.385 449.85 148.846 446.603 145.355C419.139 115.827 380.226 99.5343 339.935 101.192C304.184 102.663 259.736 104.311 224.142 105.054C202.426 105.508 180.822 108.158 159.768 113.498L108.708 126.45C84.1024 132.692 62.3533 147.121 47.0379 167.366C29.3519 190.744 21.5556 220.133 25.3281 249.203L29.4571 281.021L9.20524 222.695C3.11145 205.145 0 186.699 0 168.121C0 110.806 29.4997 57.5262 78.0761 27.1071L79.9055 25.9615C106.996 8.99688 138.315 0 170.279 0H364.244C376.671 0 389.06 1.37949 401.183 4.11313C463.597 18.1868 512.591 66.5031 527.533 128.715L529.04 134.989C550.936 226.156 498.484 318.706 409.02 346.761Z" fill="#FF0037" />
            <path d="M146.881 530.713L146.045 527.266C134.524 479.813 134.811 430.259 146.881 382.942L227 359.5L381 352.5L334.425 370.276C255.258 400.49 188.991 457.179 146.881 530.713Z" fill="#489C56" />
            <path d="M163.268 394.465L141.394 408.865L147.566 370.757C152.373 341.08 166.011 313.54 186.7 291.728C214.947 261.948 254.189 245.083 295.234 245.083H323.477C333.937 245.083 344.277 242.861 353.814 238.563L361.599 235.055C424.283 206.805 414.293 114.87 347.005 100.743L365.337 99.402C423.844 95.121 476.37 135.112 487.81 192.65C506.768 274.294 446.728 353.026 362.977 356.344L270.499 360.008C232.286 361.522 195.21 373.436 163.268 394.465Z" fill="#F2A12B" />
            <path d="M76.5882 358.198L39.059 299.963C30.0056 285.915 23.9487 270.15 21.267 253.654C12.2504 198.188 42.4556 143.778 94.299 122.098L109.219 115.858C126.568 108.603 145.186 104.867 163.992 104.867H230.354L211.17 106.296C187.453 108.062 164.612 116.003 144.915 129.331C102.912 157.752 80.1645 207.146 85.871 257.539L100.5 386.725L76.5882 358.198Z" fill="#5D3FF3" />
          </svg>
          <span class="moyeu__texte font-heading font-bold">Lancer</span>
        </button>
        <svg ref="languetteEl" class="languette" viewBox="0 0 60 100" aria-hidden="true">
          <path d="M33 8 C49 8 52 28 46 44 L33 92 Q30 98 27 92 L14 44 C8 28 11 8 27 8 Z" transform="translate(3 3)" fill="rgba(0,0,0,0.35)" />
          <path d="M33 8 C49 8 52 28 46 44 L33 92 Q30 98 27 92 L14 44 C8 28 11 8 27 8 Z" fill="#FF0037" stroke="#fff" stroke-width="3" />
          <path d="M20 22 C22 15 26 13 30 13" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="3" stroke-linecap="round" />
          <circle cx="30" cy="26" r="9" fill="#e9e9ee" stroke="#8a8a94" stroke-width="2" />
          <circle cx="27.5" cy="23.5" r="3" fill="#fff" />
        </svg>
      </div>
      <p class="indice" :class="{ 'is-visible': etat === 'repos' && !!indice }">{{ indice }}</p>
    </section>

    <canvas ref="confettisEl" class="confettis" aria-hidden="true" />

    <!-- Les outils de celui qui tient le stand -->
    <div class="outils">
      <button type="button" class="outil" :aria-pressed="sonActif" @click="basculerSon">
        <Volume2 v-if="sonActif" class="w-5 h-5" />
        <VolumeX v-else class="w-5 h-5" />
        <span class="sr-only">{{ sonActif ? 'Couper le son' : 'Activer le son' }}</span>
      </button>
      <button v-if="pleinPossible" type="button" class="outil" @click="basculerPleinEcran">
        <Minimize v-if="plein" class="w-5 h-5" />
        <Maximize v-else class="w-5 h-5" />
        <span class="sr-only">{{ plein ? 'Quitter le plein écran' : 'Passer en plein écran' }}</span>
      </button>
      <button type="button" class="outil" @click="ouvrirReglages">
        <Settings class="w-5 h-5" />
        <span class="sr-only">Ouvrir les réglages des lots</span>
      </button>
    </div>

    <!-- Les réglages des lots -->
    <div v-if="reglagesOuverts" class="voile-reglages" @click.self="fermerReglages">
      <div class="reglages bg-white text-dark" role="dialog" aria-modal="true" aria-labelledby="titre-reglages">
        <h2 id="titre-reglages" class="font-heading font-bold text-2xl tracking-tight">Réglez les lots de la roue.</h2>
        <p class="mt-2 text-sm leading-relaxed text-gray-text">
          Ces réglages et ces compteurs restent sur cette tablette. Un lot dont le stock tombe à zéro quitte la roue, et une case de plus augmente sa chance d'être gagné.
        </p>
        <ul class="mt-5 divide-y divide-gray-border border-y border-gray-border">
          <li v-for="lot in lotsRoue" :key="lot.key" class="py-4">
            <div class="flex items-center gap-3">
              <span class="pastille pastille--petite" :style="{ backgroundColor: lot.teinte }" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path :d="lot.picto.join(' ')" /></svg>
              </span>
              <span class="font-semibold">{{ lot.nom }}</span>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-4">
              <div>
                <span :id="`cases-${lot.key}`" class="block text-sm text-gray-text">Cases sur la roue</span>
                <div class="mt-1 flex items-center gap-2" role="group" :aria-labelledby="`cases-${lot.key}`">
                  <button type="button" class="pas" :disabled="reglages[lot.key].parts <= 0" :aria-label="`Retirer une case à ${lot.nom.toLowerCase()}`" @click="changerParts(lot.key, -1)">
                    <Minus class="w-4 h-4" />
                  </button>
                  <span class="w-6 text-center font-semibold tabular-nums">{{ reglages[lot.key].parts }}</span>
                  <button type="button" class="pas" :disabled="reglages[lot.key].parts >= 6" :aria-label="`Ajouter une case à ${lot.nom.toLowerCase()}`" @click="changerParts(lot.key, 1)">
                    <Plus class="w-4 h-4" />
                  </button>
                </div>
              </div>
              <label class="block">
                <span class="block text-sm text-gray-text">Stock restant</span>
                <input
                  class="champ mt-1"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  placeholder="Sans limite"
                  :value="reglages[lot.key].stock ?? ''"
                  @change="changerStock(lot.key, $event.target.value)"
                >
              </label>
            </div>
            <p class="mt-2 text-sm text-gray-text">
              {{ !gagnes[lot.key] ? "Ce lot n'a pas encore été gagné sur cette tablette." : gagnes[lot.key] === 1 ? 'Ce lot a été gagné une fois sur cette tablette.' : `Ce lot a été gagné ${gagnes[lot.key]} fois sur cette tablette.` }}
            </p>
          </li>
        </ul>
        <p class="mt-4 text-sm text-gray-text">
          {{ parties > 1 ? `${parties} parties ont été jouées sur cette tablette.` : parties === 1 ? 'Une partie a été jouée sur cette tablette.' : "Aucune partie n'a encore été jouée sur cette tablette." }}
        </p>
        <div class="mt-6 flex flex-wrap justify-between gap-3">
          <button type="button" class="bouton-clair" :class="{ 'is-danger': confirmerRemise }" @click="remettre">
            {{ confirmerRemise ? 'Oui, tout effacer' : 'Effacer les compteurs et les réglages' }}
          </button>
          <button ref="boutonFermerReglages" type="button" class="bouton-clair bouton-clair--plein" @click="fermerReglages">
            Fermer les réglages
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ArrowRight, Maximize, Minimize, Minus, Plus, RotateCcw, Settings, Volume2, VolumeX } from 'lucide-vue-next'
import { lotsRoue } from '../data/roue.js'
import { KIOSK_URL } from '@/data/siteUrls.js'
import {
  REGLAGES, caseSousLanguette, creerRoue, lancer, avancer, deplacer, repartirCases,
  creerLanguette, avancerLanguette,
} from '../roue/moteur.mjs'
import { DISQUE, dessinerDisque, dessinerFlou, dessinerCadre, dessinerAmpoules, cheminsCase } from '../roue/dessin.js'
import { creerSon } from '../roue/son.js'
import { creerConfettis } from '../roue/confettis.js'
import { lireStock, ecrireStock, lotsEnJeu, enregistrerGain, remettreAZero } from '../roue/stock.js'

/* ---- Les lots et leurs compteurs ---- */

const stock = ref(lireStock(lotsRoue))
const reglages = computed(() => stock.value.reglages)
const gagnes = computed(() => stock.value.gagnes)
const parties = computed(() => stock.value.parties)
const enJeu = computed(() => lotsEnJeu(lotsRoue, stock.value))

/* ---- L'état de la partie ---- */

// repos (la roue dérive doucement), saisie (au doigt), course, resultat, vide
const etat = ref('repos')
const gagnant = ref(null)
// La consigne sous la roue n'apparaît qu'après un geste trop mou : le texte
// à côté explique déjà comment lancer.
const indice = ref('')
let cases = []
let roue = creerRoue(1)
const languette = creerLanguette()
const son = creerSon()
let confettis = null

const theatre = ref(null)
const roueEl = ref(null)
const disque = ref(null)
const net = ref(null)
const flou = ref(null)
const cadre = ref(null)
const ampoulesA = ref(null)
const ampoulesB = ref(null)
const languetteEl = ref(null)
const confettisEl = ref(null)
const boutonRevenir = ref(null)

const reduit = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const DERIVE = 0.12 // rad/s : la roue tourne lentement au repos, pour attirer l'œil

/* ---- Le dessin ---- */

let taille = 0
let peinture = 0
let policePrete = null

function attendrePolice() {
  if (!policePrete) {
    policePrete = Promise.race([
      document.fonts?.load('700 40px "Space Grotesk"') ?? Promise.resolve(),
      new Promise((fin) => setTimeout(fin, 1500)),
    ]).catch(() => {})
  }
  return policePrete
}

async function peindre() {
  if (!taille) return
  const jeton = ++peinture
  await attendrePolice()
  if (jeton !== peinture) return
  dessinerCadre(cadre.value, taille)
  dessinerAmpoules(ampoulesA.value, taille, 0)
  dessinerAmpoules(ampoulesB.value, taille, 1)
  if (!cases.length) {
    net.value.getContext('2d').clearRect(0, 0, net.value.width, net.value.height)
    flou.value.getContext('2d').clearRect(0, 0, flou.value.width, flou.value.height)
    return
  }
  dessinerDisque(net.value, cases, taille * DISQUE)
  // Le flou se calcule juste après, sans retarder l'affichage de la roue.
  setTimeout(() => { if (jeton === peinture) dessinerFlou(flou.value, net.value, cases.length) }, 0)
}

function composer() {
  cases = repartirCases(enJeu.value)
  roue.nbCases = Math.max(1, cases.length)
  roue.contact = 0
  if (!cases.length) etat.value = 'vide'
  else if (etat.value === 'vide') etat.value = 'repos'
  peindre()
}

/* La roue prend toute la place du théâtre, au carré. */
let observateur = null
let minuteurTaille = 0
function mesurer() {
  const t = theatre.value
  if (!t) return
  const nouvelle = Math.floor(Math.min(t.clientWidth, t.clientHeight - 56) * 0.92)
  if (nouvelle <= 0 || Math.abs(nouvelle - taille) < 3) return
  taille = nouvelle
  roueEl.value.style.setProperty('--f', `${taille}px`)
  clearTimeout(minuteurTaille)
  minuteurTaille = setTimeout(peindre, 120)
}

/* ---- La boucle : seules des transformations et des opacités sont écrites ---- */

let boucle = 0
let precedent = 0
let echelle = 1
const ecrit = { angle: NaN, flou: NaN, languette: NaN, echelle: NaN }

function image(t) {
  boucle = requestAnimationFrame(image)
  const dt = precedent ? Math.min((t - precedent) / 1000, 0.05) : 1 / 60
  precedent = t

  if (etat.value === 'repos' && !reduit) {
    deplacer(roue, roue.angle + DERIVE * dt)
  } else if (etat.value === 'course') {
    for (const p of avancer(roue, dt)) {
      son.clic(p.vitesse)
      if (p.vitesse < 3) vibrer(8)
    }
    if (roue.arretee) terminer()
  }
  const angleLanguette = avancerLanguette(languette, roue, dt)

  // La caméra s'approche un peu pendant les derniers picots.
  const lent = etat.value === 'course' && Math.abs(roue.vitesse) < 2.2
  const cible = reduit ? 1 : lent ? 1.04 : etat.value === 'resultat' ? 1.02 : 1
  echelle += (cible - echelle) * Math.min(1, dt * 2.2)

  const vitesse = etat.value === 'saisie' ? vitesseSaisie : Math.abs(roue.vitesse)
  const opaciteFlou = Math.min(0.92, Math.max(0, (vitesse - 3.5) / 7))

  if (roue.angle !== ecrit.angle) {
    disque.value.style.transform = `rotate(${roue.angle.toFixed(5)}rad)`
    ecrit.angle = roue.angle
  }
  if (Math.abs(opaciteFlou - ecrit.flou) > 0.01 || (opaciteFlou === 0 && ecrit.flou !== 0)) {
    flou.value.style.opacity = opaciteFlou.toFixed(3)
    ecrit.flou = opaciteFlou
  }
  if (angleLanguette !== ecrit.languette) {
    languetteEl.value.style.transform = `translateX(-50%) rotate(${angleLanguette.toFixed(4)}rad)`
    ecrit.languette = angleLanguette
  }
  if (Math.abs(echelle - ecrit.echelle) > 0.0004) {
    roueEl.value.style.transform = `scale(${echelle.toFixed(4)})`
    ecrit.echelle = echelle
  }
}

/* ---- Lancer ---- */

function demarrer(vitesse) {
  lancer(roue, vitesse)
  etat.value = 'course'
  indice.value = ''
  son.elan(Math.abs(roue.vitesse))
  garderEveille()
}

function lancerAuBouton() {
  if (etat.value !== 'repos') return
  son.reveiller()
  demarrer(10 + Math.random() * 4)
}

/* Au doigt : la roue suit l'angle du doigt autour de son centre, et la vitesse
 * des derniers instants devient la vitesse du lancer. */
let prise = null
let vitesseSaisie = 0

function angleAutourDuCentre(e) {
  const r = roueEl.value.getBoundingClientRect()
  const dx = e.clientX - (r.left + r.width / 2)
  const dy = e.clientY - (r.top + r.height / 2)
  return { angle: Math.atan2(dx, -dy), distance: Math.hypot(dx, dy), rayon: (r.width * DISQUE) / 2 }
}

function saisir(e) {
  if (etat.value !== 'repos' || e.button > 0) return
  const p = angleAutourDuCentre(e)
  if (p.distance > p.rayon) return
  son.reveiller()
  disque.value.setPointerCapture?.(e.pointerId)
  etat.value = 'saisie'
  prise = { id: e.pointerId, dernier: p.angle, depart: roue.angle, echantillons: [{ t: e.timeStamp, angle: roue.angle }] }
  vitesseSaisie = 0
}

function glisser(e) {
  if (etat.value !== 'saisie' || !prise || e.pointerId !== prise.id) return
  const p = angleAutourDuCentre(e)
  let d = p.angle - prise.dernier
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  prise.dernier = p.angle
  const franchis = deplacer(roue, roue.angle + d)
  prise.echantillons.push({ t: e.timeStamp, angle: roue.angle })
  while (prise.echantillons.length > 2 && e.timeStamp - prise.echantillons[0].t > 120) prise.echantillons.shift()
  const premier = prise.echantillons[0]
  const duree = (e.timeStamp - premier.t) / 1000
  vitesseSaisie = duree > 0 ? Math.abs((roue.angle - premier.angle) / duree) : 0
  if (franchis) son.clic(vitesseSaisie)
}

function lacher(e) {
  if (etat.value !== 'saisie' || !prise || e.pointerId !== prise.id) return
  const fin = e.timeStamp
  const recents = prise.echantillons.filter((s) => fin - s.t <= 100)
  const reference = recents[0] || prise.echantillons[prise.echantillons.length - 1]
  const duree = Math.max((fin - reference.t) / 1000, 0.016)
  const vitesse = (roue.angle - reference.angle) / duree
  const bouge = Math.abs(roue.angle - prise.depart) > 0.05
  prise = null
  vitesseSaisie = 0
  if (Math.abs(vitesse) >= REGLAGES.seuilLancer) {
    demarrer(vitesse)
  } else {
    etat.value = 'repos'
    if (bouge) indice.value = "Lancez la roue d'un geste plus vif, ou touchez le bouton au centre."
  }
}

/* ---- Le gain ---- */

let tirage = 0
let minuteurRetour = 0
function terminer() {
  const i = caseSousLanguette(roue.angle, cases.length)
  const lot = cases[i]
  enregistrerGain(stock.value, lot.key)
  stock.value = { ...stock.value }
  window.OPAnalytics?.capture?.('roue_partie', { lot: lot.key })
  gagnant.value = { lot, chemins: cheminsCase(i, cases.length), tirage: ++tirage }
  etat.value = 'resultat'
  son.fanfare()
  vibrer([30, 60, 30])
  if (!reduit) {
    const l = languetteEl.value.getBoundingClientRect()
    const couleurs = [lot.teinte, lot.teinte, '#FFD166', '#FFFFFF', '#FF0037', ...enJeu.value.map((x) => x.teinte)]
    confettis.lancer({ x: l.left + l.width / 2, y: l.bottom }, couleurs)
  }
  clearTimeout(minuteurRetour)
  // Sans geste pendant une minute et demie, la roue revient d'elle-même.
  minuteurRetour = setTimeout(fermerResultat, 90000)
  nextTick(() => boutonRevenir.value?.focus({ preventScroll: true }))
}

function fermerResultat() {
  clearTimeout(minuteurRetour)
  if (etat.value !== 'resultat') return
  gagnant.value = null
  confettis?.arreter()
  etat.value = 'repos'
  indice.value = ''
  // Un lot épuisé quitte la roue maintenant, pas pendant que le gagnant la regarde.
  const avant = cases.map((c) => c.key).join()
  const apres = repartirCases(enJeu.value).map((c) => c.key).join()
  if (avant !== apres) composer()
}

function vibrer(motif) {
  try { navigator.vibrate?.(motif) } catch { /* sans vibreur */ }
}

/* ---- Les outils ---- */

const sonActif = ref(true)
function basculerSon() {
  sonActif.value = !sonActif.value
  son.actif = sonActif.value
  if (sonActif.value) son.reveiller()
  try { localStorage.setItem('op-roue-son', sonActif.value ? '1' : '0') } catch { /* rien */ }
}

// Dans le panneau de la page vidéo, c'est le panneau qui porte le plein écran.
const pleinPossible = ref(false)
const plein = ref(false)
function basculerPleinEcran() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
function suivrePleinEcran() {
  plein.value = !!document.fullscreenElement
}

// L'écran de la tablette ne doit pas s'éteindre pendant le salon.
let verrou = null
async function garderEveille() {
  try {
    if (document.visibilityState === 'visible' && navigator.wakeLock && !verrou) {
      verrou = await navigator.wakeLock.request('screen')
      verrou.addEventListener?.('release', () => { verrou = null })
    }
  } catch {
    verrou = null
  }
}
function auRetour() {
  if (document.visibilityState === 'visible') garderEveille()
}

/* ---- Les réglages ---- */

const reglagesOuverts = ref(false)
const confirmerRemise = ref(false)
const boutonFermerReglages = ref(null)
function ouvrirReglages() {
  reglagesOuverts.value = true
  confirmerRemise.value = false
  // Le bouton de fermeture est en bas du panneau : le focus y va sans le faire
  // défiler, pour que les réglages s'ouvrent sur le premier lot.
  nextTick(() => boutonFermerReglages.value?.focus({ preventScroll: true }))
}
function fermerReglages() {
  reglagesOuverts.value = false
}
function appliquerReglages() {
  ecrireStock(stock.value)
  stock.value = { ...stock.value }
  if (etat.value === 'repos' || etat.value === 'vide') composer()
}
function changerParts(cle, delta) {
  const r = stock.value.reglages[cle]
  r.parts = Math.min(6, Math.max(0, r.parts + delta))
  appliquerReglages()
}
function changerStock(cle, valeur) {
  const n = parseInt(valeur, 10)
  stock.value.reglages[cle].stock = Number.isFinite(n) && n >= 0 ? n : null
  appliquerReglages()
}
function remettre() {
  if (!confirmerRemise.value) {
    confirmerRemise.value = true
    return
  }
  stock.value = remettreAZero(lotsRoue)
  confirmerRemise.value = false
  if (etat.value === 'repos' || etat.value === 'vide') composer()
}
function toucheClavier(e) {
  if (e.key === 'Escape' && reglagesOuverts.value) fermerReglages()
}

onMounted(() => {
  document.documentElement.classList.add('bg-dark')
  confettis = creerConfettis(confettisEl.value)
  try { sonActif.value = localStorage.getItem('op-roue-son') !== '0' } catch { /* rien */ }
  son.actif = sonActif.value
  pleinPossible.value = window.self === window.top && !!document.fullscreenEnabled
  document.addEventListener('fullscreenchange', suivrePleinEcran)
  document.addEventListener('visibilitychange', auRetour)
  document.addEventListener('keydown', toucheClavier)
  observateur = new ResizeObserver(mesurer)
  observateur.observe(theatre.value)
  mesurer()
  composer()
  garderEveille()
  boucle = requestAnimationFrame(image)
})
onBeforeUnmount(() => {
  document.documentElement.classList.remove('bg-dark')
  document.removeEventListener('fullscreenchange', suivrePleinEcran)
  document.removeEventListener('visibilitychange', auRetour)
  document.removeEventListener('keydown', toucheClavier)
  observateur?.disconnect()
  cancelAnimationFrame(boucle)
  clearTimeout(minuteurTaille)
  clearTimeout(minuteurRetour)
  confettis?.arreter()
  verrou?.release?.().catch(() => {})
})
</script>

<style scoped>
/* Sur un écran en largeur : le texte à gauche, la roue à droite. Sur un écran
   en hauteur : le texte au-dessus, la roue dessous. */
.page-roue {
  position: relative;
  isolation: isolate;
  height: 100dvh;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  user-select: none;
  -webkit-user-select: none;
  background-image: radial-gradient(ellipse at 68% 50%, rgba(255, 0, 55, 0.14), transparent 60%);
}
.texte {
  padding: 28px 24px 0;
  max-width: 640px;
}
@media (orientation: landscape) and (min-width: 820px) {
  .page-roue {
    grid-template-rows: none;
    grid-template-columns: minmax(300px, 0.85fr) minmax(0, 1.4fr);
  }
  .texte {
    align-self: center;
    padding: 40px 0 40px clamp(32px, 5vw, 80px);
  }
}
/* Les outils du stand sont en haut à droite ; sur un écran en hauteur, le
   titre leur laisse la place, et sur un téléphone ils descendent en bas. */
@media (orientation: portrait) and (min-width: 600px), (orientation: landscape) and (max-width: 819px) {
  .texte h1 { padding-right: 150px; }
}
@media (max-width: 599px) {
  .outils { top: auto !important; bottom: 12px; }
  .indice { text-align: left !important; padding: 0 160px 0 16px; }
}

.lots {
  display: grid;
  gap: 10px;
}
.lots li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 17px;
  font-weight: 500;
}
.pastille {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 999px;
  box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.35);
}
.pastille svg {
  width: 55%;
  height: 55%;
  fill: none;
  stroke: #fff;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.pastille--petite {
  width: 36px;
  height: 36px;
}
.resultat .pastille {
  margin-bottom: 20px;
  animation: surgir 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.resultat {
  animation: monter 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes monter {
  from { opacity: 0; transform: translateY(18px); }
}
@keyframes surgir {
  from { opacity: 0; transform: scale(0.4); }
}

/* Les boutons */
.bouton {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 16px;
  font-weight: 600;
  transition: background-color 0.3s ease-in-out;
}
.bouton:hover {
  background: rgba(255, 255, 255, 0.2);
}
.bouton--plein {
  background: #fff;
  color: #111;
}
.bouton--plein:hover {
  background: #e9e9ee;
}

/* Le théâtre de la roue */
.theatre {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 16px 0 40px;
}
.rayons {
  position: absolute;
  left: 50%;
  top: calc(50% - 20px);
  width: 150vmax;
  height: 150vmax;
  margin: -75vmax 0 0 -75vmax;
  background: repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.04) 0deg 5deg, transparent 5deg 15deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, transparent 45%);
  mask-image: radial-gradient(circle, #000 0%, transparent 45%);
  animation: tourner 120s linear infinite;
  pointer-events: none;
  will-change: transform;
}
@keyframes tourner {
  to { transform: rotate(360deg); }
}

.roue {
  --f: 0px;
  position: relative;
  width: var(--f);
  height: var(--f);
  will-change: transform;
}
.couche {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.disque {
  position: absolute;
  inset: 7%;
  border-radius: 50%;
  touch-action: none;
  cursor: grab;
  will-change: transform;
}
.is-saisie .disque {
  cursor: grabbing;
}
.flou {
  opacity: 0;
  will-change: opacity;
}
.reflet {
  position: absolute;
  inset: 7%;
  border-radius: 50%;
  background:
    radial-gradient(ellipse 60% 40% at 32% 22%, rgba(255, 255, 255, 0.16), transparent 70%),
    radial-gradient(circle at 50% 50%, transparent 62%, rgba(0, 0, 0, 0.22) 100%);
  pointer-events: none;
}

/* Les ampoules : deux calques, paires et impaires, qui alternent */
.ampoules {
  opacity: 0;
  will-change: opacity;
}
.is-repos .ampoules,
.is-saisie .ampoules,
.is-vide .ampoules {
  animation: respirer 2.4s ease-in-out infinite;
}
.is-repos .ampoules--b,
.is-saisie .ampoules--b,
.is-vide .ampoules--b {
  animation-delay: -1.2s;
}
.is-course .ampoules {
  animation: chasser 0.24s steps(1, end) infinite;
}
.is-course .ampoules--b {
  animation-delay: -0.12s;
}
.roue.is-gain .ampoules {
  animation: eclater 0.3s steps(1, end) infinite;
}
@keyframes respirer {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.9; }
}
@keyframes chasser {
  0% { opacity: 1; }
  50% { opacity: 0.08; }
}
@keyframes eclater {
  0% { opacity: 1; }
  50% { opacity: 0.25; }
}

/* La case gagnante : le reste du disque s'assombrit, elle s'éclaire */
.eclat__reste {
  fill: rgba(0, 0, 0, 0.55);
  animation: apparaitre 0.6s ease-in-out both;
}
.eclat__part {
  fill: rgba(255, 255, 255, 0.14);
  stroke: #fff;
  stroke-width: 0.018;
  stroke-linejoin: round;
  animation: pulser 1.1s ease-in-out infinite;
}
.eclat__halo {
  fill: none;
  stroke: rgba(255, 220, 140, 0.55);
  stroke-width: 0.07;
  stroke-linejoin: round;
  animation: pulser 1.1s ease-in-out infinite;
}
@keyframes apparaitre {
  from { opacity: 0; }
}
@keyframes pulser {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* Le moyeu, qui lance la roue */
.moyeu {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--f) * 0.22);
  height: calc(var(--f) * 0.22);
  margin: calc(var(--f) * -0.11) 0 0 calc(var(--f) * -0.11);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--f) * 0.008);
  background: radial-gradient(circle at 35% 30%, #ffffff, #e6e6ec 60%, #c9c9d2);
  color: #111;
  box-shadow:
    0 calc(var(--f) * 0.012) calc(var(--f) * 0.03) rgba(0, 0, 0, 0.45),
    inset 0 -3px 0 rgba(0, 0, 0, 0.12),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.95);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.moyeu:not(:disabled):hover {
  transform: scale(1.05);
}
.moyeu:not(:disabled):active {
  transform: scale(0.96);
}
.moyeu:disabled {
  cursor: default;
}
.moyeu__logo {
  width: 42%;
  height: auto;
}
.moyeu__texte {
  font-size: calc(var(--f) * 0.03);
  letter-spacing: -0.01em;
  transition: opacity 0.3s ease-in-out;
}
.moyeu:disabled .moyeu__texte {
  opacity: 0.35;
}

/* La languette : son pivot est en haut, elle plie à chaque picot */
.languette {
  position: absolute;
  left: 50%;
  top: calc(var(--f) * -0.012);
  width: calc(var(--f) * 0.07);
  height: calc(var(--f) * 0.117);
  transform: translateX(-50%);
  transform-origin: 50% 26%;
  will-change: transform;
  pointer-events: none;
}

.indice {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  text-align: center;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
}
.indice.is-visible {
  opacity: 1;
}

.confettis {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 30;
}

.outils {
  position: absolute;
  right: 16px;
  top: 16px;
  display: flex;
  gap: 8px;
  z-index: 20;
}
.outil {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  transition: background-color 0.3s ease-in-out;
}
.outil:hover {
  background: rgba(255, 255, 255, 0.16);
}

/* Les réglages, dans un panneau clair */
.voile-reglages {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.55);
}
.reglages {
  width: min(100%, 460px);
  height: 100%;
  overflow-y: auto;
  padding: 28px 24px;
  user-select: text;
  -webkit-user-select: text;
  animation: glisser 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes glisser {
  from { transform: translateX(40px); opacity: 0; }
}
.pas {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  transition: background-color 0.3s ease-in-out;
}
.pas:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}
.pas:disabled {
  opacity: 0.35;
}
.champ {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  font-variant-numeric: tabular-nums;
}
.bouton-clair {
  padding: 11px 18px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  font-size: 14px;
  font-weight: 600;
  transition: background-color 0.3s ease-in-out;
}
.bouton-clair:hover {
  background: rgba(0, 0, 0, 0.05);
}
.bouton-clair.is-danger {
  border-color: #c4002a;
  color: #c4002a;
}
.bouton-clair--plein {
  background: #111;
  border-color: #111;
  color: #fff;
}
.bouton-clair--plein:hover {
  background: #333;
}

@media (prefers-reduced-motion: reduce) {
  .rayons { animation: none; }
  .resultat, .resultat .pastille, .reglages { animation: none; }
}
</style>
