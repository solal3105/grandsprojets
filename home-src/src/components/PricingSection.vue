<template>
  <section class="relative bg-white py-24 overflow-hidden">
    <PageBlobs top="blob-amber" bottom="blob-purple" top-offset="-80px" />

    <div class="max-w-container mx-auto px-6">

      <!-- ── En-tête ──────────────────────────────────────────────────────── -->
      <div class="text-center max-w-2xl mx-auto mb-16">
        <EyebrowLabel>Tarifs</EyebrowLabel>
        <h2 class="mt-5 font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
          Un tarif <span class="text-gradient-green">transparent</span>,<br />
          adapté à votre territoire
        </h2>
        <p class="mt-5 text-lg text-gray-text leading-relaxed">
          Configurez votre formule en 30 secondes - le prix se calcule en temps réel.
        </p>
      </div>

      <!-- ── Grille principale ─────────────────────────────────────────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">

        <!-- ── Colonne contrôles ─────────────────────────────────────────── -->
        <div class="space-y-6">

          <!-- Slider population -->
          <div class="rounded-2xl border border-gray-border bg-white p-8 shadow-sm">
            <div class="flex items-start justify-between gap-4 mb-8">
              <div>
                <p class="text-xs font-semibold uppercase tracking-widest text-gray-text/50 mb-1.5">
                  Population de votre territoire
                </p>
                <p class="font-heading font-bold text-2xl text-dark leading-tight">
                  {{ currentTranche.label }}
                  <span class="text-base font-semibold text-gray-text ml-1">hab.</span>
                </p>
              </div>
              <div class="text-right shrink-0">
                <p class="text-xs text-gray-text/50 mb-1">Carte de base</p>
                <p class="font-heading font-semibold text-dark tabular-nums">
                  {{ computedBaseAnnual }} €<span class="text-xs font-normal text-gray-text">/an</span>
                </p>
              </div>
            </div>

            <div class="relative">
              <input
                type="range"
                :min="0"
                :max="populationTranches.length - 1"
                v-model.number="selectedTrancheIdx"
                class="pricing-slider w-full"
                :style="{ '--p': sliderPct }"
              />
              <div class="flex justify-between mt-4">
                <span class="text-[11px] text-gray-text/40">{{ populationTranches[0].label }}</span>
                <span class="text-[11px] text-gray-text/40">{{ populationTranches[populationTranches.length - 1].label }}</span>
              </div>
            </div>
          </div>

          <!-- Modules optionnels -->
          <div class="rounded-2xl border border-gray-border bg-white p-8 shadow-sm">
            <div class="flex items-center justify-between mb-6">
              <div>
                <p class="text-xs font-semibold uppercase tracking-widest text-gray-text/50 mb-1.5">
                  Modules optionnels
                </p>
                <p class="font-heading font-bold text-xl text-dark">
                  Fonctionnalités supplémentaires
                </p>
              </div>
              <span
                v-if="selectedModules.length"
                class="text-[11px] font-bold uppercase tracking-wider text-primary bg-primary-10 border border-primary/20 px-2.5 py-1 rounded-full"
              >
                {{ selectedModules.length }} actif{{ selectedModules.length > 1 ? 's' : '' }}
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                v-for="mod in availableModules"
                :key="mod.id"
                class="group relative text-left rounded-xl border-2 p-4 transition-all duration-200 focus:outline-none"
                :class="selectedModules.includes(mod.id)
                  ? 'border-primary bg-primary-light'
                  : 'border-gray-border bg-gray-bg/50 hover:bg-white hover:border-gray-300 hover:shadow-sm'"
                @click="toggleModule(mod.id)"
              >
                <div class="flex items-start gap-3.5">
                  <div
                    class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200"
                    :class="selectedModules.includes(mod.id)
                      ? 'bg-primary'
                      : 'bg-white border border-gray-border group-hover:border-gray-300'"
                  >
                    <component
                      :is="mod.icon"
                      class="w-4 h-4 transition-colors duration-200"
                      :class="selectedModules.includes(mod.id) ? 'text-white' : 'text-gray-text'"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-0.5">
                      <p class="text-sm font-semibold text-dark">{{ mod.label }}</p>
                      <p
                        class="text-xs font-semibold shrink-0 tabular-nums transition-colors duration-200"
                        :class="selectedModules.includes(mod.id) ? 'text-primary' : 'text-gray-text/40'"
                      >
                        +{{ computedModuleAnnual }} €/an
                      </p>
                    </div>
                    <p class="text-xs text-gray-text leading-relaxed">{{ mod.desc }}</p>
                  </div>
                </div>
              </button>
            </div>

            <!-- Coming soon -->
            <div v-if="comingSoonModules.length" class="mt-4">
              <button
                class="flex items-center gap-2 text-xs text-gray-text/50 hover:text-gray-text transition-colors duration-200 focus:outline-none"
                @click="showComingSoon = !showComingSoon"
              >
                <ChevronDown
                  class="w-3.5 h-3.5 transition-transform duration-200"
                  :class="{ 'rotate-180': showComingSoon }"
                />
                {{ comingSoonModules.length }} modules en cours de développement
              </button>
              <div v-if="showComingSoon" class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  v-for="mod in comingSoonModules"
                  :key="mod.id"
                  class="relative rounded-xl border border-gray-border bg-gray-bg p-4 opacity-50 cursor-not-allowed"
                >
                  <span class="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-amber/10 text-amber border border-amber/20 px-2 py-0.5 rounded-full">
                    Bientôt
                  </span>
                  <div class="flex items-start gap-3.5">
                    <div class="w-9 h-9 rounded-xl bg-white border border-gray-border flex items-center justify-center shrink-0">
                      <component :is="mod.icon" class="w-4 h-4 text-gray-text" />
                    </div>
                    <div>
                      <p class="text-sm font-semibold text-dark">{{ mod.label }}</p>
                      <p class="text-xs text-gray-text mt-0.5 pr-8">{{ mod.desc }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Inclus -->
          <div class="px-2">
            <p class="text-xs font-semibold uppercase tracking-widest text-gray-text/40 mb-3">Inclus dans toute formule</p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="item in INCLUDED_FEATURES"
                :key="item.label"
                class="flex items-center gap-1.5 text-xs text-gray-text bg-gray-bg border border-gray-border px-3 py-1.5 rounded-full"
              >
                <component :is="item.icon" class="w-3 h-3 text-gray-text/50 shrink-0" />
                {{ item.label }}
              </span>
            </div>
          </div>

        </div>

        <!-- ── Panneau résultat ──────────────────────────────────────────── -->
        <div class="lg:sticky lg:top-24">
          <div class="bg-dark rounded-3xl overflow-hidden relative">

            <div class="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div class="absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-purple/15 blur-3xl pointer-events-none" />

            <!-- Prix principal -->
            <div class="p-8 relative z-10">
              <p class="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-5">
                Votre estimation
              </p>
              <div class="flex items-end gap-2 mb-1">
                <span class="font-heading font-bold text-[64px] leading-none text-white tabular-nums">
                  {{ displayMonthly }}
                </span>
                <div class="pb-2">
                  <p class="text-white/50 text-base leading-tight">€</p>
                  <p class="text-white/30 text-xs leading-tight">/ mois HT</p>
                </div>
              </div>
              <p class="text-white/30 text-sm tabular-nums">
                soit {{ displayAnnual }} € / an HT
              </p>
              <p class="text-white/20 text-[11px] mt-1.5 leading-relaxed">
                TVA non récupérable pour les collectivités.
              </p>
            </div>

            <!-- Détail ligne par ligne -->
            <div class="mx-8 border-t border-white/8 relative z-10" />
            <div class="px-8 py-5 relative z-10 space-y-2.5">
              <p class="text-[10px] font-semibold uppercase tracking-widest text-white/20 mb-3">Ventilation mensuelle</p>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full bg-green/70 shrink-0" />
                  <p class="text-xs text-white/40">Abonnement de base</p>
                </div>
                <p class="text-xs font-medium text-white/60 tabular-nums">{{ computedBaseMonthly }} €/mois</p>
              </div>
              <transition-group name="module-line" tag="div" class="space-y-2.5">
                <div
                  v-for="mod in activeModules"
                  :key="mod.id"
                  class="flex items-center justify-between"
                >
                  <div class="flex items-center gap-2">
                    <div class="w-1.5 h-1.5 rounded-full bg-primary/80 shrink-0" />
                    <p class="text-xs text-white/40">Module {{ mod.label }}</p>
                  </div>
                  <p class="text-xs font-medium text-white/60 tabular-nums">+{{ computedModuleMonthly }} €/mois</p>
                </div>
              </transition-group>
            </div>

            <!-- Mise en place -->
            <div class="mx-8 border-t border-white/8 relative z-10" />
            <div class="px-8 py-5 relative z-10">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-white/50">Mise en place</p>
                  <p class="text-[11px] text-white/25 mt-0.5">Facturée une seule fois</p>
                </div>
                <span class="font-heading font-semibold text-white text-xl tabular-nums">
                  {{ displaySetup }} €
                </span>
              </div>
            </div>

            <!-- CTA -->
            <div class="px-8 pb-8 relative z-10">
              <RouterLink
                to="/contact"
                v-tilt-btn
                class="flex items-center justify-center gap-2.5 bg-primary text-white text-sm font-semibold px-6 py-4 rounded-2xl hover:bg-red-700 transition-colors shadow-xl shadow-primary/40 w-full"
              >
                Demander une démo
                <ArrowRight class="w-4 h-4" />
              </RouterLink>
              <p class="text-[11px] text-white/20 text-center mt-4 leading-relaxed">
                Simulation indicative · Tarif définitif sur devis
              </p>
            </div>
          </div>
        </div>

      </div>

      <!-- ── FAQ ──────────────────────────────────────────────────────────── -->
      <div class="mt-20 max-w-2xl mx-auto">
        <p class="text-center text-sm font-semibold text-dark mb-8">Questions fréquentes</p>
        <div v-for="(item, i) in FAQ_ITEMS" :key="i" class="border-b border-gray-border last:border-b-0">
          <button
            class="w-full flex items-center justify-between py-4 text-left focus:outline-none group"
            @click="faqOpen[i] = !faqOpen[i]"
          >
            <span class="text-sm font-semibold text-dark pr-4 group-hover:text-primary transition-colors duration-200">
              {{ item.q }}
            </span>
            <ChevronDown
              class="w-4 h-4 text-gray-text shrink-0 transition-transform duration-200"
              :class="{ 'rotate-180': faqOpen[i] }"
            />
          </button>
          <div v-if="faqOpen[i]" class="pb-5 text-sm text-gray-text leading-relaxed">{{ item.a }}</div>
        </div>
      </div>

    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, reactive, markRaw } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Check, ArrowRight, ChevronDown,
  Layers, FileText, LayoutDashboard, Server, RefreshCw, Mail,
} from 'lucide-vue-next'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import PageBlobs from '@/components/PageBlobs.vue'
import {
  BASE_PRICES, COEF_MODULE, COEF_SETUP,
  populationTranches, pricingModules,
} from '@/data/pricingData.js'

// ── État ──────────────────────────────────────────────────────────────────────
const selectedTrancheIdx = ref(3)
const selectedModules = ref([])
const showComingSoon = ref(false)
const faqOpen = reactive([false, false, false, false])

// ── Dérivés ───────────────────────────────────────────────────────────────────
const currentTranche = computed(() => populationTranches[selectedTrancheIdx.value])
const availableModules = computed(() => pricingModules.filter(m => m.available))
const comingSoonModules = computed(() => pricingModules.filter(m => !m.available))
const activeModules = computed(() => availableModules.value.filter(m => selectedModules.value.includes(m.id)))

const sliderPct = computed(() =>
  `${(selectedTrancheIdx.value / (populationTranches.length - 1)) * 100}%`
)

function toggleModule(id) {
  const idx = selectedModules.value.indexOf(id)
  if (idx === -1) selectedModules.value.push(id)
  else selectedModules.value.splice(idx, 1)
}

// ── Calculs ───────────────────────────────────────────────────────────────────
const computedBaseAnnual = computed(() => {
  const { coef } = currentTranche.value
  return Math.round(BASE_PRICES.carte * coef)
})

const computedModuleAnnual = computed(() => {
  const { coef } = currentTranche.value
  return Math.round(BASE_PRICES.module * coef * COEF_MODULE)
})

const computedBaseMonthly = computed(() => Math.round(computedBaseAnnual.value / 12))
const computedModuleMonthly = computed(() => Math.round(computedModuleAnnual.value / 12))

const computedAnnual = computed(() =>
  computedBaseAnnual.value + selectedModules.value.length * computedModuleAnnual.value
)

const computedMonthly = computed(() => Math.round(computedAnnual.value / 12))

const computedSetup = computed(() => {
  const { coef } = currentTranche.value
  return Math.round(BASE_PRICES.setup * coef * COEF_SETUP)
})

// ── Animations ────────────────────────────────────────────────────────────────
const displayMonthly = ref(computedMonthly.value)
const displayAnnual = ref(computedAnnual.value)
const displaySetup = ref(computedSetup.value)

function animateTo(refVal, target, duration = 350) {
  const start = refVal.value
  if (start === target) return
  const startTime = performance.now()
  function step(now) {
    const t = Math.min((now - startTime) / duration, 1)
    const ease = 1 - (1 - t) ** 3
    refVal.value = Math.round(start + (target - start) * ease)
    if (t < 1) requestAnimationFrame(step)
    else refVal.value = target
  }
  requestAnimationFrame(step)
}

watch(computedMonthly, val => animateTo(displayMonthly, val))
watch(computedAnnual, val => animateTo(displayAnnual, val))
watch(computedSetup, val => animateTo(displaySetup, val))

// ── Données statiques ─────────────────────────────────────────────────────────
const INCLUDED_FEATURES = [
  { label: 'Projets illimités', icon: markRaw(Layers) },
  { label: 'Articles & actualités', icon: markRaw(FileText) },
  { label: 'Interface admin', icon: markRaw(LayoutDashboard) },
  { label: 'Hébergement inclus', icon: markRaw(Server) },
  { label: 'Mises à jour', icon: markRaw(RefreshCw) },
  { label: 'Support email', icon: markRaw(Mail) },
]

const FAQ_ITEMS = [
  {
    q: 'La TVA est-elle applicable ?',
    a: 'Les collectivités territoriales ne récupèrent pas la TVA. Tous nos prix sont affichés hors taxes - c\'est donc le montant que vous débourserez réellement. Aucune surprise à la facturation.',
  },
  {
    q: 'Les frais de mise en place sont-ils obligatoires ?',
    a: 'Oui, facturés une seule fois à l\'activation. Ils couvrent la configuration initiale de votre espace, le paramétrage du branding, et l\'accompagnement au démarrage avec notre équipe.',
  },
  {
    q: 'Y a-t-il un engagement de durée ?',
    a: 'L\'abonnement est annuel, renouvelé automatiquement. Résiliation possible à échéance avec un préavis de 30 jours. Aucun engagement pluriannuel requis.',
  },
  {
    q: 'Le prix change-t-il si ma commune grandit ?',
    a: 'Le tarif est révisé lors du renouvellement annuel en fonction de la population réelle déclarée. Aucun rattrapage en cours d\'année.',
  },
]
</script>

<style scoped>
.pricing-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 999px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    to right,
    #FF0037 var(--p),
    rgba(0, 0, 0, 0.08) var(--p)
  );
}

.pricing-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: white;
  border: 2.5px solid #FF0037;
  box-shadow: 0 0 0 4px rgba(255, 0, 55, 0.12), 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.pricing-slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 6px rgba(255, 0, 55, 0.16), 0 2px 12px rgba(0, 0, 0, 0.15);
  transform: scale(1.1);
}

.pricing-slider::-webkit-slider-thumb:active {
  transform: scale(0.96);
  box-shadow: 0 0 0 8px rgba(255, 0, 55, 0.12), 0 2px 6px rgba(0, 0, 0, 0.1);
}

.pricing-slider::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: white;
  border: 2.5px solid #FF0037;
  box-shadow: 0 0 0 4px rgba(255, 0, 55, 0.12), 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
}

.pricing-slider::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
}

/* Transition lignes modules dans le récapitulatif */
.module-line-enter-active,
.module-line-leave-active {
  transition: all 0.25s ease;
}
.module-line-enter-from,
.module-line-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
