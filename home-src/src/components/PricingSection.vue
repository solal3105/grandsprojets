<template>
  <section class="relative bg-white py-24 overflow-hidden">
    <PageBlobs top="blob-amber" bottom="blob-purple" top-offset="-80px" />

    <div class="max-w-container mx-auto px-6">

      <!-- ── En-tête ──────────────────────────────────────────────────────── -->
      <div class="text-center max-w-2xl mx-auto">
        <EyebrowLabel>Tarifs</EyebrowLabel>
        <h2 class="mt-5 font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
          Un tarif <span class="text-gradient-green">transparent</span>,<br />
          adapté à votre territoire
        </h2>
        <p class="mt-5 text-lg text-gray-text leading-relaxed">
          Pas de forfait unique. Le prix s'adapte à la taille de votre commune et aux fonctionnalités que vous activez.
        </p>
      </div>

      <!-- ── Simulateur ────────────────────────────────────────────────────── -->
      <div class="mt-16">

        <div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10 items-start">

          <!-- ── Sélecteurs (mobile : après le panneau résultat) ──────────── -->
          <div class="order-2 lg:order-1 space-y-8">

            <!-- Toujours inclus -->
            <div class="flex items-start gap-3 p-4 bg-gray-bg rounded-xl border border-gray-border">
              <div class="w-7 h-7 rounded-lg bg-primary-10 flex items-center justify-center shrink-0 mt-0.5">
                <Check class="w-3.5 h-3.5 text-primary" />
              </div>
              <p class="text-sm text-gray-text">
                <strong class="text-dark">Carte interactive principale incluse dans toute formule</strong>
                — projets, articles et visualisation illimités, sans supplément.
              </p>
            </div>

            <!-- Étape 1 : Population -->
            <div>
              <p class="text-sm font-semibold text-dark mb-3 flex items-center gap-2">
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-dark text-white text-[10px] font-bold shrink-0">1</span>
                Population de votre territoire
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="(tranche, i) in populationTranches"
                  :key="tranche.id"
                  class="text-xs font-medium px-3.5 py-2 rounded-full border transition-all duration-200 focus:outline-none"
                  :class="selectedTrancheIdx === i
                    ? 'bg-dark text-white border-dark shadow-sm'
                    : 'bg-white text-gray-text border-gray-border hover:border-gray-300 hover:text-dark'"
                  @click="selectedTrancheIdx = i"
                >
                  {{ tranche.label }}
                </button>
              </div>
              <p class="text-xs text-gray-text mt-3">
                Carte de base : <strong class="text-dark">{{ computedBaseAnnual }} €/an HT</strong>
              </p>
            </div>

            <!-- Étape 2 : Modules disponibles -->
            <div>
              <p class="text-sm font-semibold text-dark mb-3 flex items-center gap-2">
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-dark text-white text-[10px] font-bold shrink-0">2</span>
                Modules optionnels
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  v-for="mod in availableModules"
                  :key="mod.id"
                  class="relative text-left rounded-xl border p-4 transition-all duration-200 focus:outline-none cursor-pointer"
                  :class="selectedModules.includes(mod.id)
                    ? 'border-primary bg-primary-light shadow-sm'
                    : 'border-gray-border bg-white hover:border-gray-300'"
                  @click="toggleModule(mod.id)"
                >
                  <div class="flex items-start gap-3">
                    <div
                      class="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200"
                      :class="selectedModules.includes(mod.id) ? 'bg-primary border-primary' : 'bg-white border-gray-border'"
                    >
                      <Check v-if="selectedModules.includes(mod.id)" class="w-3 h-3 text-white" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <component
                          :is="mod.icon"
                          class="w-4 h-4 shrink-0 transition-colors duration-200"
                          :class="selectedModules.includes(mod.id) ? 'text-primary' : 'text-gray-text'"
                        />
                        <span class="text-sm font-semibold text-dark">{{ mod.label }}</span>
                      </div>
                      <p class="text-xs text-gray-text leading-relaxed">{{ mod.desc }}</p>
                      <p
                        class="text-xs font-medium mt-2 transition-colors duration-200"
                        :class="selectedModules.includes(mod.id) ? 'text-primary' : 'text-gray-text/60'"
                      >
                        + {{ computedModuleAnnual }} €/an HT
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <!-- Modules à venir (repliés) -->
            <div v-if="comingSoonModules.length">
              <button
                class="flex items-center gap-2 text-xs text-gray-text hover:text-dark transition-colors duration-200 focus:outline-none"
                @click="showComingSoon = !showComingSoon"
              >
                <ChevronDown
                  class="w-3.5 h-3.5 transition-transform duration-200"
                  :class="{ 'rotate-180': showComingSoon }"
                />
                {{ showComingSoon ? 'Masquer' : 'Voir' }} les {{ comingSoonModules.length }} modules en cours de développement
              </button>
              <div v-if="showComingSoon" class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  v-for="mod in comingSoonModules"
                  :key="mod.id"
                  class="relative rounded-xl border border-gray-border bg-gray-bg p-4 opacity-55"
                >
                  <span class="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider
                               bg-amber/10 text-amber border border-amber/20 px-2 py-0.5 rounded-full">
                    Bientôt
                  </span>
                  <div class="flex items-start gap-3">
                    <div class="mt-0.5 w-5 h-5 rounded-md border-2 border-gray-border bg-white shrink-0" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <component :is="mod.icon" class="w-4 h-4 text-gray-text shrink-0" />
                        <span class="text-sm font-semibold text-dark">{{ mod.label }}</span>
                      </div>
                      <p class="text-xs text-gray-text leading-relaxed pr-8">{{ mod.desc }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- ── Panneau résultat (mobile : EN PREMIER) ──────────────────── -->
          <div class="order-1 lg:order-2 lg:sticky lg:top-24">
            <div class="bg-dark rounded-2xl p-8 overflow-hidden relative">

              <div class="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
              <div class="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-purple/10 blur-3xl pointer-events-none" />

              <p class="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-5 relative z-10">
                Votre estimation
              </p>

              <!-- Mensuel -->
              <div class="relative z-10">
                <div class="flex items-end gap-2">
                  <span class="font-heading font-bold text-5xl text-white leading-none tabular-nums">
                    {{ displayMonthly }}
                  </span>
                  <span class="text-white/50 text-sm mb-1.5">€ / mois</span>
                </div>
                <p class="text-white/40 text-sm mt-1.5 tabular-nums">
                  soit {{ displayAnnual }} €/an
                </p>
                <p class="text-[11px] text-white/25 mt-1.5 leading-relaxed">
                  Tous prix hors taxes. TVA non récupérable pour les collectivités.
                </p>
              </div>

              <!-- Frais de mise en place -->
              <div class="mt-6 pt-6 border-t border-white/10 relative z-10">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="text-sm text-white/60">Frais de mise en place</p>
                    <p class="text-xs text-white/30 mt-0.5">Facturés une seule fois à l'activation</p>
                  </div>
                  <span class="font-heading font-semibold text-white text-lg tabular-nums shrink-0">
                    {{ displaySetup }} €
                  </span>
                </div>
              </div>

              <!-- CTA -->
              <RouterLink
                to="/contact"
                v-tilt-btn
                class="mt-8 relative z-10 flex items-center justify-center gap-2.5
                       bg-primary text-white text-sm font-medium px-6 py-3.5 rounded-full
                       hover:bg-red-700 transition-colors shadow-lg shadow-primary/30 w-full"
              >
                Demander une démo
                <ArrowRight class="w-4 h-4" />
              </RouterLink>

              <p class="text-[11px] text-white/20 text-center mt-4 leading-relaxed relative z-10">
                Simulation indicative. Tarif définitif sur devis personnalisé.
              </p>
            </div>
          </div>

        </div>
      </div>

      <!-- ── Ce qui est inclus ─────────────────────────────────────────────── -->
      <div class="mt-20 pt-16 border-t border-gray-border">
        <p class="text-center text-sm font-semibold text-dark mb-10">Inclus dans toute formule, sans condition</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-8 gap-x-4">
          <div
            v-for="item in INCLUDED_FEATURES"
            :key="item.label"
            class="flex flex-col items-center text-center gap-3"
          >
            <div class="w-11 h-11 rounded-2xl bg-gray-bg border border-gray-border flex items-center justify-center">
              <component :is="item.icon" class="w-[18px] h-[18px] text-gray-text" />
            </div>
            <p class="text-xs text-gray-text leading-snug">{{ item.label }}</p>
          </div>
        </div>
      </div>

      <!-- ── FAQ ──────────────────────────────────────────────────────────── -->
      <div class="mt-16 max-w-2xl mx-auto">
        <p class="text-center text-sm font-semibold text-dark mb-8">Questions fréquentes</p>
        <div
          v-for="(item, i) in FAQ_ITEMS"
          :key="i"
          class="border-b border-gray-border last:border-b-0"
        >
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
          <div v-if="faqOpen[i]" class="pb-5 text-sm text-gray-text leading-relaxed">
            {{ item.a }}
          </div>
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

// ── État ─────────────────────────────────────────────────────────────────────
const selectedTrancheIdx = ref(3)   // 15 001 – 50 000 par défaut
const selectedModules = ref([])
const showComingSoon = ref(false)
const faqOpen = reactive([false, false, false, false])

// ── Modules filtrés ───────────────────────────────────────────────────────────
const availableModules = computed(() => pricingModules.filter(m => m.available))
const comingSoonModules = computed(() => pricingModules.filter(m => !m.available))

function toggleModule(id) {
  const idx = selectedModules.value.indexOf(id)
  if (idx === -1) selectedModules.value.push(id)
  else selectedModules.value.splice(idx, 1)
}

// ── Calculs ───────────────────────────────────────────────────────────────────
const computedBaseAnnual = computed(() => {
  const { coef } = populationTranches[selectedTrancheIdx.value]
  return Math.round(BASE_PRICES.carte * coef)
})

const computedModuleAnnual = computed(() => {
  const { coef } = populationTranches[selectedTrancheIdx.value]
  return Math.round(BASE_PRICES.module * coef * COEF_MODULE)
})

const computedAnnual = computed(() =>
  computedBaseAnnual.value + selectedModules.value.length * computedModuleAnnual.value
)

const computedMonthly = computed(() => Math.round(computedAnnual.value / 12))

const computedSetup = computed(() => {
  const { coef } = populationTranches[selectedTrancheIdx.value]
  return Math.round(BASE_PRICES.setup * coef * COEF_SETUP)
})

// ── Animation compteur ────────────────────────────────────────────────────────
const displayMonthly = ref(computedMonthly.value)
const displayAnnual = ref(computedAnnual.value)
const displaySetup = ref(computedSetup.value)

function animateTo(refVal, target, duration = 400) {
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

// ── Données UI statiques ──────────────────────────────────────────────────────
const INCLUDED_FEATURES = [
  { label: 'Projets illimités', icon: markRaw(Layers) },
  { label: 'Articles & actualités', icon: markRaw(FileText) },
  { label: 'Interface d\'administration', icon: markRaw(LayoutDashboard) },
  { label: 'Hébergement inclus', icon: markRaw(Server) },
  { label: 'Mises à jour incluses', icon: markRaw(RefreshCw) },
  { label: 'Support par email', icon: markRaw(Mail) },
]

const FAQ_ITEMS = [
  {
    q: 'La TVA est-elle applicable ?',
    a: 'Les collectivités territoriales ne récupèrent pas la TVA. Tous nos prix sont affichés hors taxes — c\'est donc le montant que vous débourserez réellement. Aucune surprise à la facturation.',
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
