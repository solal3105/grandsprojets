<template>
  <div>
    <!-- La page des candidats aux appels d'offres : la grille de /tarification,
         avec le montant du marché à la place des habitants (data/tarification.mjs,
         estimerMarche). Hors du menu, du plan du site et des moteurs : son
         adresse est donnée par nos partenaires. -->
    <section class="relative pt-36 pb-14 overflow-hidden">
      <HeroGround />
      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[820px] mx-auto text-center">
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[52px] leading-[1.06] tracking-tight-hero text-dark">
            Chiffrez Open Projets dans votre réponse à un appel d'offres
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[640px] mx-auto">
            Le prix suit le montant du marché auquel vous répondez, avec la même grille que celle
            des collectivités. Vous ne payez que si vous remportez le marché. Les montants sont hors taxes.
          </p>
        </div>
      </div>
    </section>

    <section class="pb-20 sm:pb-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-10 items-start">

          <div class="flex flex-col gap-6">

            <!-- 1. Le montant du marché -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">1</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">Le montant du marché</h2>
              </div>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">
                Le montant estimé hors taxes, tel qu'il figure dans l'avis de marché ou le règlement de la consultation.
              </p>

              <div class="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <label for="marche-montant" class="sr-only">Montant estimé du marché, en euros hors taxes</label>
                <input
                  id="marche-montant"
                  v-model="montantSaisi"
                  type="text"
                  inputmode="numeric"
                  :style="{ width: largeurMontant }"
                  class="bg-transparent font-heading font-bold text-4xl sm:text-5xl tracking-tight text-dark tabular-nums outline-none border-b-2 border-transparent focus:border-primary transition-colors"
                  @blur="saisirMontant()"
                  @keydown.enter.prevent="saisirMontant(); $event.target.blur()"
                />
                <span class="text-gray-text text-lg">€ HT</span>
              </div>

              <label for="marche-curseur" class="sr-only">Montant du marché, au curseur</label>
              <input
                id="marche-curseur"
                type="range" min="0" max="1000" step="1"
                :value="Math.round(curseur * 1000)"
                class="curseur mt-6 w-full"
                :style="{ '--part': `${(curseur * 100).toFixed(2)}%` }"
                @input="montant = curseurVersMarche($event.target.value / 1000)"
              />
              <div class="mt-2 flex justify-between text-[11px] text-gray-muted tabular-nums">
                <span>{{ euros(MARCHE.min) }}</span>
                <span>{{ euros(MARCHE.max) }}</span>
              </div>

              <div class="mt-5 flex flex-wrap gap-2">
                <button
                  v-for="r in REPERES_MARCHE" :key="r.nom"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors"
                  :class="montant === r.montant
                    ? 'border-dark bg-dark text-white'
                    : 'border-gray-border bg-white text-dark hover:border-gray-300'"
                  @click="montant = r.montant"
                >
                  <span class="font-medium">{{ r.nom }}</span>
                  <span class="tabular-nums" :class="montant === r.montant ? 'text-white/70' : 'text-gray-muted'">{{ euros(r.montant) }}</span>
                </button>
              </div>
            </div>

            <!-- 2. Les modules -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">2</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">Les modules que vous proposez</h2>
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
                  class="relative w-full h-full text-left rounded-2xl border-2 p-4 sm:p-5 transition duration-200"
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
                  <span class="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                    <span class="font-heading font-semibold text-lg text-dark tabular-nums" :class="{ 'line-through text-gray-muted font-normal': remiseSur(m.key) }">
                      {{ euros(prixModule(m.key)) }}
                    </span>
                    <span v-if="remiseSur(m.key)" class="font-heading font-semibold text-lg tabular-nums" :class="m.tone.text">
                      {{ euros(prixModule(m.key) * (1 - estimation.remiseModules.taux)) }}
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

            <!-- 3. La durée du marché -->
            <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
              <div class="flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center">3</span>
                <h2 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">La durée du marché</h2>
              </div>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">
                Un marché plus long baisse l'abonnement chaque année, pendant toute sa durée.
              </p>

              <div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Durée du marché">
                <button
                  v-for="e in ENGAGEMENTS" :key="e.annees"
                  type="button"
                  role="radio"
                  :aria-checked="annees === e.annees"
                  :data-annees="e.annees"
                  class="rounded-2xl border-2 px-3 py-4 text-center transition duration-200"
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
              <span class="text-xs font-semibold text-white/70">Le prix à porter dans votre offre</span>

              <p class="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span id="marche-total" class="font-heading font-bold leading-none tracking-tight tabular-nums text-5xl sm:text-[56px]">{{ euros(totalAnime) }}</span>
                <span class="text-white/60 text-sm">HT</span>
              </p>
              <p class="mt-2 text-sm text-white/60">
                <template v-if="retenus.length">
                  Sur {{ annees }} {{ annees > 1 ? 'ans' : 'an' }}, mise en service comprise, soit
                  {{ partDuMarche }} d'un marché de {{ euros(montant) }}.
                </template>
                <template v-else>Choisissez au moins un module.</template>
              </p>

              <!-- Le détail : chaque module, puis les remises, puis le prix -->
              <dl class="mt-7 border-t border-white/10 text-sm">
                <div v-for="l in estimation.lignes" :key="l.cle" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">{{ moduleByKey[l.cle]?.name }}</dt>
                  <dd class="tabular-nums whitespace-nowrap">{{ euros(l.prix) }} / mois</dd>
                </div>
                <div v-if="estimation.remiseModules.montant > 0" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Plusieurs modules, -{{ pourcent(estimation.remiseModules.taux) }} sur {{ moduleByKey[estimation.remiseModules.module]?.short }}</dt>
                  <dd class="tabular-nums whitespace-nowrap text-green">-{{ euros(estimation.remiseModules.montant) }} / mois</dd>
                </div>
                <div v-if="estimation.remiseEngagement.montant > 0" class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Marché de {{ annees }} ans, -{{ pourcent(estimation.remiseEngagement.taux) }}</dt>
                  <dd class="tabular-nums whitespace-nowrap text-green">-{{ euros(estimation.remiseEngagement.montant) }} / mois</dd>
                </div>
                <div class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10 font-semibold">
                  <dt>Abonnement mensuel</dt>
                  <dd id="marche-mensuel" class="tabular-nums whitespace-nowrap">{{ euros(estimation.mensuel) }}</dd>
                </div>
                <div class="flex items-baseline justify-between gap-4 py-2.5 border-b border-white/10">
                  <dt class="text-white/80">Mise en service, une fois</dt>
                  <dd id="marche-setup" class="tabular-nums whitespace-nowrap">{{ euros(estimation.setup) }}</dd>
                </div>
              </dl>

              <p class="mt-6 flex items-start gap-2.5 rounded-2xl bg-white/5 p-3.5 text-sm leading-relaxed text-white/70">
                <ShieldCheck class="w-4 h-4 mt-0.5 shrink-0" />
                Ce montant n'est dû que si vous remportez le marché. Pendant la consultation, l'espace de
                démonstration et le texte pour votre mémoire technique sont gratuits.
              </p>

              <router-link
                :to="{ hash: '#contact' }" v-tilt-btn
                class="mt-6 w-full inline-flex items-center justify-center gap-2.5 bg-primary-ink text-white text-[15px] font-medium px-6 py-4 rounded-full hover:bg-red-700 transition-colors"
              >
                Préparer une offre avec nous
                <ArrowRight class="w-4 h-4" />
              </router-link>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <!-- Ce qui se passe avant, pendant et après le marché -->
    <section class="py-20 sm:py-28 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          Ce que vous engagez, de la réponse à la fin du marché
        </h2>
        <div class="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div v-for="e in ETAPES" :key="e.titre" class="rounded-3xl bg-white border border-gray-border p-6 sm:p-7 shadow-pill">
            <span class="w-10 h-10 rounded-xl bg-gray-bg flex items-center justify-center"><component :is="e.icon" class="w-[18px] h-[18px] text-dark" /></span>
            <h3 class="mt-5 font-heading font-bold text-lg text-dark leading-tight">{{ e.titre }}</h3>
            <p class="mt-3 text-sm text-gray-text leading-relaxed">{{ e.texte }}</p>
          </div>
        </div>
      </div>
    </section>

    <ContactBlock
      referrer="appel-offres"
      titre="Nous préparons votre offre avec vous"
      texte="Dites-nous à quel marché vous répondez et quand l'offre doit partir. Nous vous rappelons pour préparer l'espace de démonstration et le texte de votre mémoire technique."
      email-placeholder="email@entreprise.fr"
      org-placeholder="Nom de votre entreprise"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, ShieldCheck, FileText, HardHat, KeyRound } from 'lucide-vue-next'
import HeroGround from '../components/HeroGround.vue'
import ContactBlock from '../components/ContactBlock.vue'
import { modules, moduleByKey } from '../data/modules.js'
import {
  ENGAGEMENTS, MARCHE, REPERES_MARCHE, POIDS,
  estimerMarche, prixUnitaire, poidsDe, populationEquivalente, curseurVersMarche, marcheVersCurseur, bornerMarche,
  euros, nombre, pourcent,
} from '../data/tarification.mjs'
import { useChiffreAnime } from '../composables/useChiffreAnime.js'

const route = useRoute()
const router = useRouter()

const ETAPES = [
  {
    icon: FileText,
    titre: 'Pendant la consultation',
    texte: "Nous préparons gratuitement un espace de démonstration aux couleurs du maître d'ouvrage et un texte pour votre mémoire technique. Si vous ne remportez pas le marché, vous ne devez rien.",
  },
  {
    icon: HardHat,
    titre: 'Pendant le marché',
    texte: "La mise en service est facturée à la notification, puis l'abonnement chaque trimestre. Vos équipes, le maître d'ouvrage et vos sous-traitants y ont accès sans limite de comptes.",
  },
  {
    icon: KeyRound,
    titre: 'À la fin du marché',
    texte: "Le maître d'ouvrage peut garder l'espace avec l'abonnement collectivité, sans nouvelle mise en service. Sinon, ses données lui sont remises au format GeoJSON.",
  },
]

/* Les modules de la grille, sauf Chantiers : il est payé par le gestionnaire
 * des routes, et l'entreprise y dépose gratuitement */
const offre = modules.filter((m) => POIDS[m.key] != null)

/* L'état vient de l'adresse quand elle en porte un : un chiffrage se partage
 * en copiant le lien */
const q = route.query
const clesInitiales = String(q.modules || '').split(',').filter((k) => POIDS[k] != null)
const anneesInitiales = Number(q.annees)
const montant = ref(q.montant ? bornerMarche(q.montant) : MARCHE.defaut)
const retenus = ref(clesInitiales.length ? clesInitiales : ['carte', 'travaux'])
const annees = ref(ENGAGEMENTS.some((e) => e.annees === anneesInitiales) ? anneesInitiales : 2)

const curseur = computed(() => marcheVersCurseur(montant.value))

/* Ce que montre le champ : le montant formaté, ou ce que le visiteur tape */
const montantSaisi = ref(nombre(montant.value))
watch(montant, (m) => { montantSaisi.value = nombre(m) })

/* La largeur du champ suit le nombre tapé, pour que « € HT » le suive sans
 * vide : les espaces fines entre les milliers sont plus étroites qu'un chiffre */
const largeurMontant = computed(() => {
  const chiffres = String(montantSaisi.value).replace(/[^\d]/g, '').length
  return `${Math.max(2, chiffres) + Math.floor((chiffres - 1) / 3) * 0.3 + 0.5}ch`
})

function saisirMontant() {
  const n = Number(String(montantSaisi.value).replace(/[^\d]/g, ''))
  if (n) montant.value = bornerMarche(n)
  montantSaisi.value = nombre(montant.value)
}

function basculer(cle) {
  retenus.value = retenus.value.includes(cle)
    ? retenus.value.filter((k) => k !== cle)
    : offre.filter((m) => m.key === cle || retenus.value.includes(m.key)).map((m) => m.key)
}

const estimation = computed(() => estimerMarche({ montant: montant.value, modules: retenus.value, annees: annees.value }))
const remiseSur = (cle) => estimation.value.remiseModules.taux > 0 && estimation.value.remiseModules.module === cle
const prixModule = (cle) => prixUnitaire(populationEquivalente(montant.value)) * poidsDe(cle)

const total = computed(() => estimation.value.total)
const totalAnime = useChiffreAnime(total)
const partDuMarche = computed(() => {
  const p = (total.value / montant.value) * 100
  return `${p.toLocaleString('fr-FR', { maximumFractionDigits: p < 1 ? 2 : 1 })} %`
})

/* L'adresse suit les réglages, sans empiler d'historique */
watch([montant, retenus, annees], () => {
  router.replace({ query: { montant: String(montant.value), modules: retenus.value.join(','), annees: String(annees.value) }, hash: route.hash })
}, { immediate: true })

/* Le chiffrage réglé, mesuré une fois le visiteur arrêté (docs/analytics.md) */
let mesure = null
watch([montant, retenus, annees], () => {
  clearTimeout(mesure)
  mesure = setTimeout(() => window.OPAnalytics?.capture?.('pricing_tender_settings_changed', {
    tender_amount: montant.value,
    modules: retenus.value,
    years: annees.value,
    total_price: Math.round(total.value),
  }), 1500)
}, { deep: true })
</script>

<style scoped>
/* Le curseur de /tarification : une piste fine, remplie jusqu'au curseur, et
   un bouton rond assez large pour le pouce. */
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
