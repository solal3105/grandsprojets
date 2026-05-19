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
          Pas de forfait unique. Le prix s'adapte à la taille de votre commune et aux modules que vous activez.
        </p>
      </div>

      <!-- ── Cartes profils types ──────────────────────────────────────────── -->
      <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="(profile, i) in pricingProfiles"
          :key="profile.label"
          :ref="(el) => { cardEls[i] = el }"
          class="card-tilt"
          @mousemove="(e) => onMove(e, i)"
          @mouseleave="onLeave(i)"
        >
          <div
            class="group relative flex flex-col h-full rounded-2xl p-8 overflow-hidden transition-shadow duration-300"
            :class="profile.highlight
              ? 'bg-white border-2 border-primary shadow-card'
              : 'bg-gray-bg border border-gray-border hover:shadow-xl'"
          >
            <!-- Glare souris -->
            <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="shines[i]" />

            <!-- Badge "Le plus courant" -->
            <div
              v-if="profile.highlight"
              class="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap z-20
                     bg-primary text-white text-[11px] font-bold uppercase tracking-widest
                     px-4 py-1.5 rounded-full shadow-sm shadow-primary/30"
            >
              {{ profile.badge }}
            </div>

            <!-- Icône + label -->
            <div class="flex items-center gap-3 mb-6 relative z-20">
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                       transition-all duration-300 group-hover:scale-110"
                :class="profile.iconBgClass"
              >
                <component :is="profile.icon" class="w-5 h-5" :class="profile.accentClass" />
              </div>
              <div>
                <p class="font-heading font-semibold text-base text-dark leading-tight">{{ profile.label }}</p>
                <p class="text-xs text-gray-text mt-0.5">{{ profile.pop }}</p>
              </div>
            </div>

            <!-- Prix -->
            <div class="mb-6 relative z-20">
              <p class="text-xs text-gray-text font-medium mb-1.5">à partir de</p>
              <div class="flex items-end gap-1.5">
                <span class="font-heading font-bold text-4xl text-dark leading-none">{{ profile.monthlyFrom }}</span>
                <span class="text-sm text-gray-text mb-1">€/mois HT</span>
              </div>
              <p class="text-xs text-gray-text mt-2">
                Set up unique dès <strong class="text-dark">{{ profile.setupFrom }} €</strong> HT
              </p>
            </div>

            <!-- Séparateur -->
            <div class="h-px bg-gray-border mb-6 relative z-20" />

            <!-- Liste features -->
            <ul class="space-y-3 flex-1 relative z-20">
              <li
                v-for="feat in profile.features"
                :key="feat"
                class="flex items-start gap-2.5 text-sm text-gray-text leading-snug"
              >
                <Check class="w-4 h-4 shrink-0 mt-0.5" :class="profile.accentClass" />
                <span>{{ feat }}</span>
              </li>
            </ul>

            <!-- Barre d'accent bas (hover) -->
            <div
              class="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl transition-opacity duration-300"
              :class="profile.highlight
                ? 'bg-primary opacity-100'
                : 'bg-gradient-to-r from-transparent via-gray-300 to-transparent opacity-0 group-hover:opacity-100'"
            />
          </div>
        </div>
      </div>

      <!-- ── Simulateur ────────────────────────────────────────────────────── -->
      <div class="mt-20">

        <!-- Séparateur titré -->
        <div class="flex items-center gap-4 mb-12">
          <div class="flex-1 h-px bg-gray-border" />
          <div class="flex items-center gap-2.5 px-1">
            <Calculator class="w-4 h-4 text-primary" />
            <span class="text-sm font-semibold text-dark">Simulez votre tarif en 30 secondes</span>
          </div>
          <div class="flex-1 h-px bg-gray-border" />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10 items-start">

          <!-- ── Sélecteurs ───────────────────────────────────────────────── -->
          <div class="space-y-10">

            <!-- Toujours inclus -->
            <div class="flex items-center gap-3 p-4 bg-gray-bg rounded-xl border border-gray-border text-sm text-gray-text">
              <div class="w-7 h-7 rounded-lg bg-primary-10 flex items-center justify-center shrink-0">
                <Check class="w-3.5 h-3.5 text-primary" />
              </div>
              <span>
                <strong class="text-dark">Carte interactive principale</strong>
                incluse dans toute formule — projets, articles et visualisation illimités
              </span>
            </div>

            <!-- Tranche de population -->
            <div>
              <p class="text-sm font-semibold text-dark mb-4">Quelle est la population de votre territoire ?</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="(tranche, i) in populationTranches"
                  :key="tranche.id"
                  class="text-xs font-medium px-4 py-2 rounded-full border transition-all duration-200 focus:outline-none"
                  :class="selectedTrancheIdx === i
                    ? 'bg-dark text-white border-dark shadow-sm'
                    : 'bg-white text-gray-text border-gray-border hover:border-gray-300 hover:text-dark'"
                  @click="selectedTrancheIdx = i"
                >
                  {{ tranche.label }}
                </button>
              </div>
              <p class="text-xs text-gray-text mt-3">
                Carte de base pour cette tranche :
                <strong class="text-dark">{{ computedBaseAnnual }} €/an HT</strong>
              </p>
            </div>

            <!-- Modules -->
            <div>
              <p class="text-sm font-semibold text-dark mb-4">Modules optionnels</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  v-for="mod in pricingModules"
                  :key="mod.id"
                  class="relative text-left rounded-xl border p-4 transition-all duration-200 focus:outline-none"
                  :class="[
                    !mod.available
                      ? 'border-gray-border bg-gray-bg opacity-55 cursor-not-allowed'
                      : selectedModules.includes(mod.id)
                        ? 'border-primary bg-primary-light shadow-sm'
                        : 'border-gray-border bg-white hover:border-gray-300 cursor-pointer'
                  ]"
                  :disabled="!mod.available"
                  @click="mod.available && toggleModule(mod.id)"
                >
                  <!-- Badge bientôt -->
                  <span
                    v-if="!mod.available"
                    class="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider
                           bg-amber/10 text-amber border border-amber/20 px-2 py-0.5 rounded-full"
                  >
                    Bientôt
                  </span>

                  <div class="flex items-start gap-3">
                    <!-- Checkbox visuel -->
                    <div
                      class="mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0
                             transition-all duration-200"
                      :class="selectedModules.includes(mod.id)
                        ? 'bg-primary border-primary'
                        : 'bg-white border-gray-border'"
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
                      <p class="text-xs text-gray-text leading-relaxed pr-10">{{ mod.desc }}</p>
                      <p
                        v-if="mod.available"
                        class="text-xs font-medium mt-2 transition-colors duration-200"
                        :class="selectedModules.includes(mod.id) ? 'text-primary' : 'text-gray-text/60'"
                      >
                        + {{ computedModuleAnnual }} €/an HT
                      </p>
                    </div>
                  </div>
                </button>
              </div>
              <p class="text-xs text-gray-text mt-3">Le coût des modules s'adapte également à la taille de votre territoire.</p>
            </div>
          </div>

          <!-- ── Panneau résultat ──────────────────────────────────────────── -->
          <div class="lg:sticky lg:top-24">
            <div class="bg-dark rounded-2xl p-8 overflow-hidden relative">

              <!-- Halo décoratif -->
              <div class="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
              <div class="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-purple/10 blur-3xl pointer-events-none" />

              <p class="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-6 relative z-10">
                Votre estimation
              </p>

              <!-- Prix mensuel (animé) -->
              <div class="relative z-10">
                <div class="flex items-end gap-2">
                  <span class="font-heading font-bold text-5xl text-white leading-none tabular-nums">
                    {{ displayMonthly }}
                  </span>
                  <span class="text-white/50 text-sm mb-1.5">€ / mois HT</span>
                </div>
                <p class="text-white/40 text-sm mt-1.5 tabular-nums">
                  soit {{ displayAnnual }} €/an HT
                </p>
              </div>

              <!-- Set up -->
              <div class="mt-6 pt-6 border-t border-white/10 relative z-10">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <p class="text-sm text-white/60">Set up unique</p>
                    <p class="text-xs text-white/30 mt-0.5">Facturation ponctuelle à l'activation</p>
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

              <p class="text-[11px] text-white/25 text-center mt-4 leading-relaxed relative z-10">
                Simulation indicative, tous prix HT.<br />
                Tarif définitif établi sur devis personnalisé.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Check, ArrowRight, Calculator } from 'lucide-vue-next'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import PageBlobs from '@/components/PageBlobs.vue'
import { useTilt } from '@/composables/useTilt.js'
import {
  BASE_PRICES, COEF_MODULE, COEF_SETUP,
  populationTranches, pricingModules, pricingProfiles,
} from '@/data/pricingData.js'

const { els: cardEls, shines, onMove, onLeave } = useTilt(3)

// ── État du simulateur ───────────────────────────────────────────────────────
const selectedTrancheIdx = ref(3) // 15 001 – 50 000 par défaut
const selectedModules = ref([])

function toggleModule(id) {
  const idx = selectedModules.value.indexOf(id)
  if (idx === -1) selectedModules.value.push(id)
  else selectedModules.value.splice(idx, 1)
}

// ── Calcul des prix ──────────────────────────────────────────────────────────
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

// ── Animation compteur ───────────────────────────────────────────────────────
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
</script>
