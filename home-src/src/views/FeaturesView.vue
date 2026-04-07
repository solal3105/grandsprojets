<template>
  <div>
    <!-- ═══ HERO ═══ -->
    <section class="relative bg-gray-bg overflow-hidden">
      <div class="absolute top-[-70px] right-[-60px] w-[700px] h-[700px] blob-purple opacity-40 blur-[120px] rounded-full pointer-events-none" />
      <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-red opacity-30 blur-[120px] rounded-full pointer-events-none" />

      <div class="relative max-w-container mx-auto px-6 pt-36 pb-20">
        <div class="max-w-[768px]">
          <span class="inline-flex items-center gap-2 text-[11px] font-semibold text-gray-text/40 uppercase tracking-[0.18em] mb-8">
            <span class="w-5 h-px bg-gray-border" />
            Fonctionnalités
          </span>
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Vos projets,<br />
            <span class="text-gradient">enfin visibles.</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[522px]">
            Publiez vos projets sur une carte interactive, informez vos habitants en temps réel — sans une ligne de code, sans délai.
          </p>
          <div class="mt-10 flex flex-col sm:flex-row gap-4">
            <router-link to="/contact" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/20">
              Demander une démo
              <ArrowRight class="w-4 h-4" />
            </router-link>
            <a href="https://openprojets.com/default" target="_blank" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border hover:border-gray-300 transition-colors">
              Voir un exemple en direct
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 1. CONTRIBUTIONS ═══ -->
    <section id="contributions" class="py-14 sm:py-20 lg:py-28 bg-white overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="(el) => { revealEls[0] = el }">

          <!-- Text -->
          <div>
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110">
                <MapPin class="w-3.5 h-3.5 text-primary" />
              </span>
              <span class="text-xs font-bold text-primary uppercase tracking-widest">01 — Contributions</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Publiez un projet en quelques minutes, pas en quelques semaines.
            </h2>
            <button
              class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4 transition-colors"
              @click="expanded.contributions = !expanded.contributions"
            >
              {{ expanded.contributions ? 'Réduire' : 'En savoir plus' }}
              <ChevronDown class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': expanded.contributions }" />
            </button>
            <Transition name="expand">
              <div v-if="expanded.contributions">
                <p class="mt-5 text-gray-text text-base leading-relaxed">
                  Votre agent dessine la zone sur la carte, rédige une fiche, ajoute une photo. Le projet apparaît instantanément. Interface intuitive — opérationnel en quelques minutes, sans formation, sans ticket, sans délai.
                </p>
                <ul class="mt-8 space-y-3.5">
                  <li v-for="feat in contributionFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                    <Check class="w-4 h-4 text-primary shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                    <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>

          <!-- Visual -->
          <div
            class="image-tilt"
            :ref="(el) => { imgEls[0] = el }"
            @mousemove="(e) => onImgMove(e, 0)"
            @mouseleave="onImgLeave(0)"
          >
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.10);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[0]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/1.jpeg`" alt="Interface de gestion des contributions" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- ═══ 2. TRAVAUX ═══ -->
    <section id="travaux" class="py-14 sm:py-20 lg:py-28 bg-gray-bg overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="(el) => { revealEls[1] = el }">

          <!-- Visual left -->
          <div
            class="image-tilt order-2 lg:order-1"
            :ref="(el) => { imgEls[1] = el }"
            @mousemove="(e) => onImgMove(e, 1)"
            @mouseleave="onImgLeave(1)"
          >
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.10);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[1]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/2.jpeg`" alt="Module travaux et chantiers" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>

          <!-- Text right -->
          <div class="order-1 lg:order-2">
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-amber/15 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110">
                <HardHat class="w-3.5 h-3.5 text-amber" />
              </span>
              <span class="text-xs font-bold text-amber uppercase tracking-widest">02 — Module Travaux</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Un chantier en cours ? Vos riverains ont l'info sans vous appeler.
            </h2>
            <button
              class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-amber hover:underline underline-offset-4 transition-colors"
              @click="expanded.travaux = !expanded.travaux"
            >
              {{ expanded.travaux ? 'Réduire' : 'En savoir plus' }}
              <ChevronDown class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': expanded.travaux }" />
            </button>
            <Transition name="expand">
              <div v-if="expanded.travaux">
                <p class="mt-5 text-gray-text text-base leading-relaxed">
                  Un module dédié aux chantiers, séparé de la carte des projets. Vos riverains trouvent l'info en deux clics — sans appeler la mairie.
                </p>
                <ul class="mt-8 space-y-3.5">
                  <li v-for="feat in travauxFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                    <Check class="w-4 h-4 text-amber shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                    <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>

        </div>
      </div>
    </section>

    <!-- ═══ 3. CATÉGORIES ═══ -->
    <section id="categories" class="py-14 sm:py-20 lg:py-28 bg-white overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="(el) => { revealEls[2] = el }">

          <!-- Text -->
          <div>
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-purple/10 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110">
                <Layers class="w-3.5 h-3.5 text-purple" />
              </span>
              <span class="text-xs font-bold text-purple uppercase tracking-widest">03 — Catégories</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Mobilité, logement, patrimoine — vos thématiques, pas un modèle générique.
            </h2>
            <button
              class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-purple hover:underline underline-offset-4 transition-colors"
              @click="expanded.categories = !expanded.categories"
            >
              {{ expanded.categories ? 'Réduire' : 'En savoir plus' }}
              <ChevronDown class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': expanded.categories }" />
            </button>
            <Transition name="expand">
              <div v-if="expanded.categories">
                <p class="mt-5 text-gray-text text-base leading-relaxed">
                  Créez les catégories qui correspondent à votre territoire. Mobilité douce, patrimoine, logement social : choisissez les icônes, définissez l'ordre, associez les couches cartographiques.
                </p>
                <ul class="mt-8 space-y-3.5">
                  <li v-for="feat in categoriesFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                    <Check class="w-4 h-4 text-purple shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                    <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>

          <!-- Visual -->
          <div
            class="image-tilt"
            :ref="(el) => { imgEls[2] = el }"
            @mousemove="(e) => onImgMove(e, 2)"
            @mouseleave="onImgLeave(2)"
          >
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.08);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[2]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/3.jpeg`" alt="Gestion des catégories" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- ═══ 4. BRANDING ═══ -->
    <section id="branding" class="py-14 sm:py-20 lg:py-28 bg-gray-bg overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="(el) => { revealEls[3] = el }">

          <!-- Visual left -->
          <div
            class="image-tilt order-2 lg:order-1"
            :ref="(el) => { imgEls[3] = el }"
            @mousemove="(e) => onImgMove(e, 3)"
            @mouseleave="onImgLeave(3)"
          >
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.08);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[3]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/4.jpeg`" alt="Personnalisation du branding" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>

          <!-- Text right -->
          <div class="order-1 lg:order-2">
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110">
                <Palette class="w-3.5 h-3.5 text-primary" />
              </span>
              <span class="text-xs font-bold text-primary uppercase tracking-widest">04 — Branding</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Vos couleurs, votre logo, votre identité — la carte fait partie de votre communication.
            </h2>
            <button
              class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4 transition-colors"
              @click="expanded.branding = !expanded.branding"
            >
              {{ expanded.branding ? 'Réduire' : 'En savoir plus' }}
              <ChevronDown class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': expanded.branding }" />
            </button>
            <Transition name="expand">
              <div v-if="expanded.branding">
                <p class="mt-5 text-gray-text text-base leading-relaxed">
                  En quelques clics, votre carte adopte les couleurs de votre charte graphique, vos logos, votre fond de carte. Vos agents s'y retrouvent. Vos habitants aussi.
                </p>
                <ul class="mt-8 space-y-3.5">
                  <li v-for="feat in brandingFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                    <Check class="w-4 h-4 text-primary shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                    <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>

        </div>
      </div>
    </section>

    <!-- ═══ 5. UTILISATEURS ═══ -->
    <section id="utilisateurs" class="py-14 sm:py-20 lg:py-28 bg-white overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal" :ref="(el) => { revealEls[4] = el }">

          <!-- Text -->
          <div>
            <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
              <span class="w-7 h-7 rounded-lg bg-green/15 flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110 group-hover/badge:rotate-6">
                <Users class="w-3.5 h-3.5 text-green" />
              </span>
              <span class="text-xs font-bold text-green uppercase tracking-widest">05 — Équipe</span>
            </div>
            <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
              Vos agents publient. Vous gardez le contrôle.
            </h2>
            <button
              class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-green hover:underline underline-offset-4 transition-colors"
              @click="expanded.utilisateurs = !expanded.utilisateurs"
            >
              {{ expanded.utilisateurs ? 'Réduire' : 'En savoir plus' }}
              <ChevronDown class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': expanded.utilisateurs }" />
            </button>
            <Transition name="expand">
              <div v-if="expanded.utilisateurs">
                <p class="mt-5 text-gray-text text-base leading-relaxed">
                  Deux niveaux de permissions, une logique claire. L'agent de terrain publie les chantiers. L'administrateur configure l'espace. Chacun dans son rôle, sans marcher sur les plates-bandes de l'autre.
                </p>
                <ul class="mt-8 space-y-3.5">
                  <li v-for="feat in utilisateursFeats" :key="feat" class="flex items-start gap-3 group/item cursor-default">
                    <Check class="w-4 h-4 text-green shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110" />
                    <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
                  </li>
                </ul>
              </div>
            </Transition>
          </div>

          <!-- Visual -->
          <div
            class="image-tilt"
            :ref="(el) => { imgEls[4] = el }"
            @mousemove="(e) => onImgMove(e, 4)"
            @mouseleave="onImgLeave(4)"
          >
            <div class="group relative rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 24px 64px -12px rgba(0,0,0,0.08);">
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="imgShines[4]" />
              <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <img :src="`${base}img/features/5.jpeg`" alt="Gestion de l'équipe et des permissions" class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]" loading="lazy" />
            </div>
          </div>

        </div>
      </div>
    </section>

    <!-- ═══ CTA ═══ -->
    <section class="relative py-16 sm:py-24 lg:py-32 bg-dark overflow-hidden">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full pointer-events-none opacity-20"
           style="background: radial-gradient(ellipse, #4E2BFF 0%, transparent 70%); filter: blur(80px);" />
      <div class="relative max-w-container mx-auto px-6 text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[52px] leading-tight tracking-tight text-white">
          Prêt à mettre vos projets<br />
          <span class="text-gradient-purple">sur la carte ?</span>
        </h2>
        <p class="mt-6 text-white/50 text-base sm:text-lg max-w-md mx-auto leading-relaxed">
          Demandez une démo — on configure votre espace ensemble, en moins d'une heure.
        </p>
        <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <router-link to="/contact" v-tilt-btn
            class="inline-flex items-center gap-2.5 bg-primary text-white text-sm font-semibold px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/30">
            Demander une démo
            <ArrowRight class="w-4 h-4" />
          </router-link>
          <a href="https://openprojets.com/default" target="_blank" v-tilt-btn
            class="inline-flex items-center gap-2.5 text-white text-sm font-medium px-7 py-4 rounded-full border border-white/15 bg-white/[0.08] hover:bg-white/[0.15] transition-colors">
            <MapIcon class="w-4 h-4" />
            Voir l'exemple Lyon
            <ArrowUpRight class="w-3.5 h-3.5 text-white/50" />
          </a>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import {
  MapPin, MapIcon, HardHat, Layers, Users, Palette,
  Check, ArrowRight, ArrowUpRight, ChevronDown,
} from 'lucide-vue-next'

const base = import.meta.env.BASE_URL

// ── Image tilt + glare ────────────────────────────────────────────────────────
const imgEls = ref([])
const imgShines = reactive([{}, {}, {}, {}, {}])

function onImgMove(e, i) {
  const el = imgEls.value[i]
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  el.style.transition = 'transform 0.1s ease'
  el.style.transform = `perspective(900px) rotateX(${-y * 4}deg) rotateY(${x * 4}deg) translateZ(8px)`
  imgShines[i] = {
    background: `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.18) 0%, transparent 55%)`,
  }
}

function onImgLeave(i) {
  const el = imgEls.value[i]
  if (!el) return
  el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
  el.style.transform = ''
  imgShines[i] = {}
}

// ── Scroll reveal ──────────────────────────────────────────────────────────────
const revealEls = ref([])

onMounted(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  )
  revealEls.value.forEach((el) => { if (el) observer.observe(el) })
})

// ── Expanded sections ──────────────────────────────────────────────────────────
const expanded = ref({
  contributions: false,
  travaux: false,
  categories: false,
  branding: false,
  utilisateurs: false,
})

const contributionFeats = [
  'Interface guidée pas à pas — aucune compétence technique requise',
  'Géolocalisation : dessinez à la main sur la carte ou importez un fichier GeoJSON',
  'Fiche complète : photo de couverture, description, article Markdown, URL officielle, tags',
  'Publication immédiate — visible sans délai sur la carte publique',
]

const travauxFeats = [
  'Délimitez la zone impactée directement sur la carte',
  'Dates de début et de fin, état d\'avancement en temps réel',
  'Module séparé de la carte des projets — pensé pour les riverains',
  'Zéro appel à la mairie : l\'information est accessible 24h/24',
]

const categoriesFeats = [
  'Nommez vos catégories selon vos thématiques (mobilité, patrimoine, logement…)',
  'Sélecteur visuel pour choisir une icône dans toute la bibliothèque FontAwesome',
  'Définissez l\'ordre d\'apparition dans la navigation publique',
  'Associez des couches cartographiques à chaque catégorie',
]

const brandingFeats = [
  'Configuration visuelle et intuitive — chaque modification est prévisualisée en direct',
  'Couleur principale avec aperçu en temps réel sur toute l\'interface',
  'Logo principal, logo dark-mode et favicon configurables indépendamment',
  'Activez ou désactivez chaque contrôle visible sur l\'interface publique',
]

const utilisateursFeats = [
  'Invitez vos agents et élus en deux secondes via leur adresse email',
  'Deux rôles : Invité (publie des projets) et Administrateur (configure l\'espace)',
  'Chaque agent ne voit que les territoires pour lesquels il est autorisé',
  'Aucune intervention DSI ni prestataire externe nécessaire pour gérer votre espace',
]

</script>

<style scoped>
/* Image tilt */
.image-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}

/* Scroll reveal */
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.65s ease, transform 0.65s cubic-bezier(0.23, 1, 0.32, 1);
}
.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.expand-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.expand-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
