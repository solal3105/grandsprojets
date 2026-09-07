<template>
  <div>
    <!-- Ouverture : meme composition que les autres pages de la refonte. La
         page n'est reliee a aucun menu et la refonte entiere est en noindex :
         elle sert a estimer un prix en rendez-vous, pas a etre trouvee. -->
    <section class="relative pt-36 pb-14 overflow-hidden">
      <HeroGround />
      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[820px] mx-auto text-center">
          <span class="inline-block text-xs font-semibold text-primary-ink uppercase tracking-widest mb-5">
            Tarification
          </span>
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[52px] leading-[1.06] tracking-tight-hero text-dark">
            Estimez le prix d'Open Projets pour votre collectivité
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[640px] mx-auto">
            Trois réglages suffisent : la taille de votre commune, les modules que vous activez et la
            durée de votre engagement. Les montants sont hors taxes.
          </p>
        </div>
      </div>
    </section>

    <section class="pb-20 sm:pb-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-8 lg:gap-12 items-start">

          <!-- Les trois réglages -->
          <div class="flex flex-col gap-6">

            <!-- 1. La population -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-8 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">1</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">La taille de votre commune</h2>
              </div>

              <div class="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <label for="tarif-population" class="sr-only">Nombre d'habitants</label>
                <!-- Le champ porte sa propre valeur (v-model) : lie directement a
                     la population, chaque rendu declenche par l'animation des
                     montants remettait le nombre en place et effacait la frappe -->
                <input
                  id="tarif-population"
                  v-model="populationSaisie"
                  type="text"
                  inputmode="numeric"
                  class="w-[9ch] bg-transparent font-heading font-bold text-4xl sm:text-5xl tracking-tight text-dark tabular-nums outline-none border-b-2 border-transparent focus:border-primary transition-colors"
                  @blur="saisirPopulation()"
                  @keydown.enter.prevent="saisirPopulation(); $event.target.blur()"
                />
                <span class="text-gray-text text-lg">habitants</span>
              </div>

              <!-- Le curseur parcourt la population en logarithme : la moitie du
                   trajet est autour de 35 000 habitants, pas a 1,25 million -->
              <label for="tarif-curseur" class="sr-only">Population, au curseur</label>
              <input
                id="tarif-curseur"
                type="range" min="0" max="1000" step="1"
                :value="Math.round(curseur * 1000)"
                class="curseur mt-6 w-full"
                :style="{ '--part': `${(curseur * 100).toFixed(2)}%` }"
                @input="population = curseurVersPopulation($event.target.value / 1000)"
              />
              <div class="mt-2 flex justify-between text-[11px] text-gray-muted tabular-nums">
                <span>{{ nombre(POPULATION.min) }}</span>
                <span>{{ nombre(POPULATION.max) }}</span>
              </div>

              <div class="mt-5 flex flex-wrap gap-2">
                <button
                  v-for="r in REPERES" :key="r.nom"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors"
                  :class="population === r.population
                    ? 'border-dark bg-dark text-white'
                    : 'border-gray-border bg-white text-dark hover:border-gray-300'"
                  @click="population = r.population"
                >
                  <span class="font-medium">{{ r.nom }}</span>
                  <span class="tabular-nums" :class="population === r.population ? 'text-white/70' : 'text-gray-muted'">{{ nombre(r.population) }}</span>
                </button>
              </div>
            </div>

            <!-- 2. Les modules -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-8 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">2</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">Les modules que vous activez</h2>
              </div>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">
                Chaque module a son prix. Dès le deuxième, le plus cher d'entre eux baisse de 10 %
                par module ajouté.
              </p>

              <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  v-for="m in offre" :key="m.key"
                  type="button"
                  role="switch"
                  :aria-checked="retenus.includes(m.key)"
                  :data-module="m.key"
                  class="group relative text-left rounded-2xl border-2 p-4 sm:p-5 transition-all duration-200"
                  :class="retenus.includes(m.key)
                    ? 'border-dark bg-white shadow-card'
                    : 'border-gray-border bg-gray-bg hover:border-gray-300'"
                  @click="basculer(m.key)"
                >
                  <span class="flex items-start justify-between gap-3">
                    <span class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="m.tone.bg">
                      <component :is="m.icon" class="w-[18px] h-[18px]" :class="m.tone.text" />
                    </span>
                    <span
                      class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors"
                      :class="retenus.includes(m.key) ? 'border-dark bg-dark' : 'border-gray-300 bg-white'"
                      aria-hidden="true"
                    >
                      <Check v-if="retenus.includes(m.key)" class="w-3.5 h-3.5 text-white" />
                    </span>
                  </span>
                  <span class="mt-4 block font-heading font-bold text-base text-dark leading-tight">{{ m.name }}</span>
                  <span class="mt-1 block text-xs text-gray-muted leading-snug">{{ m.tagline }}</span>
                  <span class="mt-4 flex items-baseline gap-1.5">
                    <span class="font-heading font-semibold text-lg text-dark tabular-nums" :class="{ 'line-through text-gray-muted font-normal': remiseSur(m.key) }">
                      {{ euros(prixUnitaire(population) * poidsDe(m.key, population)) }}
                    </span>
                    <span v-if="remiseSur(m.key)" class="font-heading font-semibold text-lg tabular-nums" :class="m.tone.text">
                      {{ euros(prixUnitaire(population) * poidsDe(m.key, population) * (1 - estimation.remiseModules.taux)) }}
                    </span>
                    <span class="text-xs text-gray-muted">/ mois HT</span>
                  </span>
                  <span
                    v-if="remiseSur(m.key)"
                    class="absolute -top-2.5 right-4 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                    :class="m.tone.socle"
                  >
                    -{{ pourcent(estimation.remiseModules.taux) }} sur le plus cher
                  </span>
                </button>
              </div>
            </div>

            <!-- 3. L'engagement -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-8 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">3</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">La durée de votre engagement</h2>
              </div>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">
                Un engagement plus long baisse l'abonnement chaque année, pendant toute la durée.
              </p>

              <div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Durée d'engagement">
                <button
                  v-for="e in ENGAGEMENTS" :key="e.annees"
                  type="button"
                  role="radio"
                  :aria-checked="annees === e.annees"
                  :data-annees="e.annees"
                  class="rounded-2xl border-2 px-3 py-4 text-center transition-all duration-200"
                  :class="annees === e.annees
                    ? 'border-dark bg-dark text-white shadow-card'
                    : 'border-gray-border bg-gray-bg text-dark hover:border-gray-300'"
                  @click="annees = e.annees"
                >
                  <span class="block font-heading font-bold text-lg leading-none">{{ e.annees }} {{ e.annees > 1 ? 'ans' : 'an' }}</span>
                  <span class="mt-2 block text-xs" :class="annees === e.annees ? 'text-white/70' : 'text-gray-muted'">
                    {{ e.remise ? `-${pourcent(e.remise)} par an` : 'Plein tarif' }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Le résultat, qui suit le défilement -->
          <aside class="lg:sticky lg:top-24">
            <div class="rounded-3xl bg-dark text-white p-6 sm:p-8 shadow-card">
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs font-semibold uppercase tracking-widest text-white/60">Votre estimation</span>
                <div class="inline-flex rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Période d'affichage">
                  <button
                    v-for="p in PERIODES" :key="p.cle"
                    type="button" role="radio" :aria-checked="periode === p.cle"
                    class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                    :class="periode === p.cle ? 'bg-white text-dark' : 'text-white/70 hover:text-white'"
                    @click="periode = p.cle"
                  >{{ p.label }}</button>
                </div>
              </div>

              <p class="mt-6 flex items-baseline gap-2">
                <span id="tarif-principal" class="font-heading font-bold text-5xl sm:text-[56px] leading-none tracking-tight tabular-nums">{{ euros(principalAnime) }}</span>
                <span class="text-white/60 text-sm">HT {{ periode === 'mois' ? 'par mois' : 'par an' }}</span>
              </p>
              <p class="mt-2 text-sm text-white/60">
                <template v-if="retenus.length">
                  {{ retenus.length }} {{ retenus.length > 1 ? 'modules' : 'module' }}, engagement {{ annees }} {{ annees > 1 ? 'ans' : 'an' }},
                  {{ nombre(population) }} habitants.
                </template>
                <template v-else>Choisissez au moins un module.</template>
              </p>

              <!-- Le détail : chaque module, puis les remises, puis le prix -->
              <dl class="mt-7 border-t border-white/10 text-sm">
                <div v-for="l in estimation.lignes" :key="l.cle" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">{{ moduleByKey[l.cle]?.name }}</dt>
                  <dd class="tabular-nums whitespace-nowrap">{{ euros(l.prix * facteur) }}</dd>
                </div>
                <div v-if="estimation.remiseModules.montant > 0" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Plusieurs modules, -{{ pourcent(estimation.remiseModules.taux) }} sur {{ moduleByKey[estimation.remiseModules.module]?.short }}</dt>
                  <dd class="tabular-nums whitespace-nowrap text-green">-{{ euros(estimation.remiseModules.montant * facteur) }}</dd>
                </div>
                <div v-if="estimation.remiseEngagement.montant > 0" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Engagement {{ annees }} ans, -{{ pourcent(estimation.remiseEngagement.taux) }}</dt>
                  <dd class="tabular-nums whitespace-nowrap text-green">-{{ euros(estimation.remiseEngagement.montant * facteur) }}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10 font-semibold">
                  <dt>Abonnement {{ periode === 'mois' ? 'mensuel' : 'annuel' }}</dt>
                  <dd id="tarif-abonnement" class="tabular-nums whitespace-nowrap">{{ euros(estimation.mensuel * facteur) }}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Mise en service, une fois<br /><span class="text-xs text-white/50">{{ estimation.setupOfferte ? `Offerte aux communes de moins de ${nombre(MISE_EN_SERVICE.offerteSous)} habitants` : `${MISE_EN_SERVICE.mois} mois d'abonnement, payés la première année` }}</span></dt>
                  <dd id="tarif-setup" class="tabular-nums whitespace-nowrap">{{ estimation.setupOfferte ? 'Offerte' : euros(estimation.setup) }}</dd>
                </div>
              </dl>

              <!-- Le total sur la durée, face aux seuils des marchés publics -->
              <div class="mt-6">
                <div class="flex items-baseline justify-between gap-4">
                  <span class="text-sm text-white/80">Total sur {{ annees }} {{ annees > 1 ? 'ans' : 'an' }}, mise en service comprise<br /><span class="text-xs text-white/50">C'est ce montant que la commande publique regarde</span></span>
                  <span id="tarif-total" class="font-heading font-bold text-2xl tabular-nums whitespace-nowrap">{{ euros(totalAnime) }} <span class="text-sm font-normal text-white/60">HT</span></span>
                </div>

                <div class="relative mt-4 h-2 rounded-full bg-white/10" aria-hidden="true">
                  <span
                    class="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500"
                    :class="jauge.classe"
                    :style="{ width: `${jauge.part}%` }"
                  />
                  <span
                    v-for="s in jauge.reperes" :key="s.montant"
                    class="absolute -top-1.5 h-5 w-px bg-white/60"
                    :style="{ left: `${s.part}%` }"
                  />
                </div>
                <div class="relative mt-1.5 h-4 text-[11px] text-white/60 tabular-nums" aria-hidden="true">
                  <span
                    v-for="s in jauge.reperes" :key="s.montant"
                    class="absolute -translate-x-1/2 whitespace-nowrap"
                    :style="{ left: `${s.part}%` }"
                  >{{ s.court }}</span>
                </div>

                <p
                  id="tarif-seuil"
                  class="mt-4 flex items-start gap-2.5 rounded-2xl p-3.5 text-sm leading-relaxed"
                  :class="jauge.encart"
                  role="status"
                >
                  <component :is="estimation.seuilDepasse ? AlertTriangle : ShieldCheck" class="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{{ estimation.seuilDepasse ? estimation.seuilDepasse.texte : SOUS_LES_SEUILS }}</span>
                </p>
              </div>

              <router-link
                :to="{ hash: '#contact' }" v-tilt-btn
                class="mt-6 w-full inline-flex items-center justify-center gap-2.5 bg-primary text-white text-[15px] font-medium px-6 py-4 rounded-full hover:bg-red-600 transition-colors"
              >
                Demander un devis sur cette base
                <ArrowRight class="w-4 h-4" />
              </router-link>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <!-- Les règles, en clair : ce que le détail du prix applique -->
    <section class="py-20 sm:py-28 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          Comment le prix se calcule
        </h2>
        <div class="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div v-for="r in regles" :key="r.titre" class="bg-white rounded-3xl border border-gray-border p-7">
            <span class="w-10 h-10 rounded-xl flex items-center justify-center" :class="r.tone.bg">
              <component :is="r.icon" class="w-[18px] h-[18px]" :class="r.tone.text" />
            </span>
            <h3 class="mt-5 font-heading font-bold text-lg text-dark leading-tight">{{ r.titre }}</h3>
            <p class="mt-2.5 text-sm text-gray-text leading-relaxed">{{ r.texte }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Ce que dit la commande publique. Chaque phrase renvoie a un article
         du code (voir data/tarification.js) : une collectivite lira cette
         page avec son service des marches. -->
    <section class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div>
            <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark">
              Ce que regarde la commande publique
            </h2>
            <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">
              Votre collectivité n'apprécie pas un abonnement à son prix mensuel, mais à ce qu'il
              lui coûtera en tout : le montant hors taxes sur toute la durée du marché, mise en
              service et reconductions comprises. C'est ce total que l'estimation compare aux
              seuils. Un marché sans terme, ou de plus de quatre ans, compte pour quarante-huit mois.
            </p>
            <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">
              Elle y ajoute les services de même nature qu'elle achète par ailleurs dans l'année :
              le seuil se juge sur son besoin, pas sur notre seule facture. Et dès 25 000 € HT, le
              marché est écrit.
            </p>
            <p class="mt-5 text-xs text-gray-muted leading-relaxed max-w-[520px]">
              Seuils en vigueur pour les collectivités depuis le 1er avril 2026 (décret 2025-1386,
              articles R2121-1 à R2121-7, R2122-8 et R2131-12 du code de la commande publique) et
              seuil européen 2026-2027. Ce n'est pas un conseil juridique : votre service des
              marchés tranche.
            </p>
          </div>

          <ol class="bg-gray-bg rounded-3xl border border-gray-border p-6 sm:p-8 flex flex-col gap-5">
            <li class="flex gap-4">
              <span class="w-3 h-3 mt-1.5 rounded-full bg-green shrink-0" aria-hidden="true" />
              <span>
                <span class="block font-heading font-bold text-base text-dark">Sous 60 000 € HT</span>
                <span class="block mt-1 text-sm text-gray-text leading-relaxed">Commande sans publicité ni mise en concurrence préalables. La collectivité retient une offre pertinente, fait bon usage des deniers publics et ne contracte pas toujours avec le même fournisseur.</span>
              </span>
            </li>
            <li v-for="s in SEUILS" :key="s.montant" class="flex gap-4">
              <span class="w-3 h-3 mt-1.5 rounded-full shrink-0" :class="s.montant === SEUILS[SEUILS.length - 1].montant ? 'bg-primary' : 'bg-amber'" aria-hidden="true" />
              <span>
                <span class="block font-heading font-bold text-base text-dark">À partir de {{ s.court }} HT : {{ s.nom.toLowerCase() }}</span>
                <span class="block mt-1 text-sm text-gray-text leading-relaxed">{{ s.texte }}</span>
              </span>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <ContactBlock />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, AlertTriangle, ShieldCheck, Users, Layers, CalendarClock, Wrench } from 'lucide-vue-next'
import HeroGround from '../components/HeroGround.vue'
import ContactBlock from '../components/ContactBlock.vue'
import { modules, moduleByKey } from '../data/modules.js'
import {
  POIDS, POPULATION, REPERES, ENGAGEMENTS, SEUILS, SOUS_LES_SEUILS, MISE_EN_SERVICE,
  estimer, prixUnitaire, poidsDe, curseurVersPopulation, populationVersCurseur, borner,
  euros, nombre, pourcent,
} from '../data/tarification.js'
import { useChiffreAnime } from '../composables/useChiffreAnime.js'

const route = useRoute()
const router = useRouter()

/* Les modules qui ont un prix, dans l'ordre de la vitrine */
const offre = modules.filter((m) => POIDS[m.key] != null)

const PERIODES = [
  { cle: 'mois', label: 'Par mois' },
  { cle: 'an', label: 'Par an' },
]

/* L'état vient de l'adresse quand elle en porte un : une estimation se
 * partage en copiant le lien. */
const depuisAdresse = () => {
  const q = route.query
  const cles = String(q.modules || '').split(',').filter((k) => POIDS[k] != null)
  const a = Number(q.annees)
  return {
    population: q.population ? borner(q.population) : POPULATION.defaut,
    retenus: cles.length ? cles : ['carte'],
    annees: ENGAGEMENTS.some((e) => e.annees === a) ? a : 3,
  }
}
const initial = depuisAdresse()
const population = ref(initial.population)
const retenus = ref(initial.retenus)
const annees = ref(initial.annees)
const periode = ref('mois')

const curseur = computed(() => populationVersCurseur(population.value))

/* Ce que montre le champ : le nombre formaté, ou ce que le visiteur tape */
const populationSaisie = ref(nombre(population.value))
watch(population, (p) => { populationSaisie.value = nombre(p) })

function saisirPopulation() {
  const n = Number(String(populationSaisie.value).replace(/[^\d]/g, ''))
  if (n) population.value = borner(n)
  populationSaisie.value = nombre(population.value)
}

function basculer(cle) {
  const i = retenus.value.indexOf(cle)
  if (i >= 0) retenus.value = retenus.value.filter((k) => k !== cle)
  else retenus.value = offre.filter((m) => m.key === cle || retenus.value.includes(m.key)).map((m) => m.key)
}

const estimation = computed(() => estimer({ population: population.value, modules: retenus.value, annees: annees.value }))
// Le module qui porte la remise multi-modules, quand il y en a une
const remiseSur = (cle) => estimation.value.remiseModules.taux > 0 && estimation.value.remiseModules.module === cle
const facteur = computed(() => (periode.value === 'mois' ? 1 : 12))
const principal = computed(() => estimation.value.mensuel * facteur.value)
const principalAnime = useChiffreAnime(principal)
const total = computed(() => estimation.value.total)
const totalAnime = useChiffreAnime(total)

/* La jauge du total : son échelle s'étend juste assez pour que le dernier
 * seuil et le total tiennent dedans, et la couleur dit où l'on en est. */
const jauge = computed(() => {
  const plafond = Math.max(SEUILS[1].montant * 1.35, total.value * 1.15)
  const depasses = SEUILS.filter((s) => total.value >= s.montant).length
  return {
    part: Math.min(100, (total.value / plafond) * 100),
    classe: depasses === 0 ? 'bg-green' : depasses < SEUILS.length ? 'bg-amber' : 'bg-primary',
    encart: depasses === 0 ? 'bg-white/5 text-white/70' : depasses < SEUILS.length ? 'bg-amber/15 text-amber' : 'bg-primary/20 text-white',
    // Un seuil hors de l'échelle n'est pas dessiné : il apparaît quand le total s'en approche
    reperes: SEUILS.filter((s) => s.montant <= plafond).map((s) => ({ ...s, part: (s.montant / plafond) * 100 })),
  }
})

/* L'adresse suit les réglages, sans empiler d'historique */
watch([population, retenus, annees], () => {
  router.replace({ query: { population: String(population.value), modules: retenus.value.join(','), annees: String(annees.value) } })
})

onMounted(() => {
  if (!route.query.population) router.replace({ query: { population: String(population.value), modules: retenus.value.join(','), annees: String(annees.value) } })
})

const regles = [
  {
    icon: Users,
    tone: { text: 'text-mod-carte', bg: 'bg-mod-carte-soft' },
    titre: 'Le prix suit la taille de votre commune',
    texte: "Plus votre commune compte d'habitants, plus sa carte sert de monde, et plus l'abonnement est élevé. La progression reste douce : une ville dix fois plus peuplée qu'une autre paie environ quatre fois plus.",
  },
  {
    icon: Layers,
    tone: { text: 'text-mod-participer', bg: 'bg-mod-participer-soft' },
    titre: 'Chaque module a son prix, et les combiner coûte moins cher',
    texte: "Le prix de chaque module est affiché sur sa carte, plus haut dans la page. Dès le deuxième module, le plus cher de ceux que vous activez baisse de 10 % par module ajouté, jusqu'à 40 % avec les cinq. Chantiers et arrêtés est à moitié prix pour les communes de moins de 5 000 habitants.",
  },
  {
    icon: CalendarClock,
    tone: { text: 'text-mod-travaux', bg: 'bg-mod-travaux-soft' },
    titre: "S'engager plus longtemps baisse l'abonnement",
    texte: "Deux ans d'engagement font baisser l'abonnement de 10 % chaque année, trois ans de 15 %, quatre ans de 20 %. Nous nous arrêtons à quatre ans : c'est la durée maximale d'un accord-cadre pour une collectivité.",
  },
  {
    icon: Wrench,
    tone: { text: 'text-mod-diagnostic', bg: 'bg-mod-diagnostic-soft' },
    titre: 'La mise en service coûte trois mois d\'abonnement',
    texte: "Nous montons votre espace avec vous : vos catégories, votre identité visuelle, vos premières fiches, la formation de votre équipe. Ce travail est facturé une seule fois, la première année, et vaut trois mois d'abonnement au tarif que vous avez obtenu. Il est offert aux communes de moins de 2 000 habitants.",
  },
]
</script>

<style scoped>
/* Le curseur : une piste fine, remplie jusqu'au curseur, et un bouton rond
   assez large pour le pouce. */
.curseur {
  -webkit-appearance: none;
  appearance: none;
  height: 28px;
  background: transparent;
  cursor: pointer;
}
.curseur::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(to right, #111111 var(--part), rgba(0, 0, 0, 0.08) var(--part));
}
.curseur::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
}
.curseur::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: #111111;
}
.curseur::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 28px;
  height: 28px;
  margin-top: -11px;
  border-radius: 999px;
  background: #ffffff;
  border: 2px solid #111111;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s ease;
}
.curseur::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #ffffff;
  border: 2px solid #111111;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.curseur:active::-webkit-slider-thumb { transform: scale(1.12); }
.curseur:focus-visible { outline: 2px solid #FF0037; outline-offset: 6px; border-radius: 999px; }
</style>
