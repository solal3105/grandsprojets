<template>
  <div v-if="mod">
    <!-- Ouverture -->
    <section class="relative pt-36 pb-20 overflow-hidden">
      <HeroGround :teinte="mod.teinte" />
      <div class="relative max-w-container mx-auto px-6">
        <router-link to="/modules" class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-text hover:text-dark transition-colors">
          <ArrowLeft class="w-3.5 h-3.5" />
          Tous les modules
        </router-link>

        <div class="mt-8 max-w-[820px] mx-auto text-center">
          <div class="inline-flex flex-wrap items-center justify-center gap-2.5 mb-6">
            <span class="w-9 h-9 rounded-xl flex items-center justify-center" :class="mod.tone.bg">
              <component :is="mod.icon" class="w-4 h-4" :class="mod.tone.text" />
            </span>
            <span class="text-xs font-bold uppercase tracking-widest" :class="mod.tone.text">Module {{ mod.short }}</span>
            <span class="text-[11px] font-medium text-gray-text bg-white border border-gray-border px-2.5 py-1 rounded-full">
              {{ estPublic ? 'Visible par vos habitants' : 'Réservé à votre équipe' }}
            </span>
          </div>

          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[52px] leading-[1.06] tracking-tight-hero text-dark">
            {{ mod.h1 }}
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[620px] mx-auto">{{ mod.tagline }}</p>

          <div class="mt-10 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4">
            <router-link
              to="/contact" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-primary-ink text-white text-sm font-medium px-6 py-3.5 rounded-full hover:bg-red-700 transition-colors"
            >
              Demander une démo
              <ArrowRight class="w-3.5 h-3.5" />
            </router-link>
            <a
              v-if="mod.live" :href="mod.live.url"
              target="_blank" rel="noopener" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-6 py-3.5 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
            >
              {{ mod.live.label }}
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
            </a>
          </div>
        </div>

        <div v-if="showcases[mod.showcase]" class="mt-14 sm:mt-16 max-w-[1040px] mx-auto">
          <component :is="showcases[mod.showcase]" :module-key="mod.key" />
        </div>
      </div>
    </section>

    <!-- Le problème -->
    <section class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <p class="font-heading font-semibold text-2xl sm:text-3xl lg:text-[34px] text-dark leading-snug max-w-[820px]">
          {{ mod.problem }}
        </p>
      </div>
    </section>

    <!-- Ce que ça produit -->
    <section class="pb-20 sm:pb-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div>
            <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark">
              {{ mod.titres.habitant }}
            </h2>
            <p class="mt-5 text-gray-text text-base leading-relaxed">{{ mod.produces }}</p>
          </div>
          <ul class="space-y-4">
            <li v-for="p in mod.habitant" :key="p" class="flex items-start gap-3">
              <Check class="w-4 h-4 shrink-0 mt-1" :class="mod.tone.text" />
              <span class="text-base text-gray-text leading-relaxed">{{ p }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Côté agent : une séquence, donc numérotée -->
    <section class="py-20 sm:py-28 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div>
            <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark">
              {{ mod.titres.agent }}
            </h2>
            <p class="mt-5 text-gray-text text-base leading-relaxed">{{ mod.agent }}</p>

            <ol class="mt-9 space-y-6">
              <li v-for="(e, i) in mod.etapes" :key="e.titre" class="flex gap-4">
                <span
                  class="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                  :class="[mod.tone.bg, mod.tone.text]"
                >{{ i + 1 }}</span>
                <div>
                  <p class="font-heading font-semibold text-sm text-dark">{{ e.titre }}</p>
                  <p class="mt-1 text-sm text-gray-text leading-relaxed">{{ e.texte }}</p>
                </div>
              </li>
            </ol>
          </div>

          <div class="bg-white rounded-3xl p-8 sm:p-10">
            <p class="font-heading font-semibold text-base text-dark mb-6">Vous réglez tout cela vous-même.</p>
            <ul class="space-y-4">
              <li v-for="s in mod.settings" :key="s" class="flex items-start gap-3">
                <Check class="w-4 h-4 shrink-0 mt-0.5" :class="mod.tone.text" />
                <span class="text-sm text-gray-text leading-relaxed">{{ s }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Le détail, en blocs -->
    <section v-if="mod.details?.length" class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          {{ mod.titres.details }}
        </h2>
        <div class="mt-14 sm:mt-16 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div v-for="d in mod.details" :key="d.titre" class="bg-gray-bg rounded-3xl p-8 sm:p-10">
            <h3 class="font-heading font-semibold text-xl sm:text-2xl leading-tight tracking-tight text-dark">{{ d.titre }}</h3>
            <p v-if="d.texte" class="mt-3.5 text-base text-gray-text leading-relaxed">{{ d.texte }}</p>
            <ul v-if="d.points?.length" class="mt-4 space-y-2.5">
              <li v-for="p in d.points" :key="p" class="flex items-start gap-2.5">
                <span class="w-1 h-1 rounded-full bg-gray-400 shrink-0 mt-2" />
                <span class="text-base text-gray-text leading-relaxed">{{ p }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Ce que les modules se donnent les uns aux autres -->
    <section class="py-20 sm:py-28 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          {{ mod.titres.combine }}
        </h2>
        <p class="mt-5 text-gray-text text-base leading-relaxed max-w-[720px]">{{ mod.linkedTo }}</p>

        <div class="mt-14 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-5">
          <router-link
            v-for="syn in mod.synergies" :key="syn.vers"
            :to="`/modules/${syn.vers}`"
            class="group flex flex-col bg-white rounded-3xl p-8 sm:p-10 hover:shadow-card hover:-translate-y-1 transition-all duration-300"
          >
            <span class="flex items-center gap-3 mb-4">
              <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="parModule[syn.vers].tone.bg">
                <component :is="parModule[syn.vers].icon" class="w-4 h-4" :class="parModule[syn.vers].tone.text" />
              </span>
              <span class="font-heading font-semibold text-xl text-dark">{{ parModule[syn.vers].name }}</span>
            </span>
            <p class="text-base text-gray-text leading-relaxed flex-1">{{ syn.texte }}</p>
            <span class="mt-7 inline-flex items-center gap-2 text-sm font-medium" :class="parModule[syn.vers].tone.text">
              Voir le module
              <ArrowRight class="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </router-link>
        </div>

        <router-link
          to="/modules#cumul"
          class="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary-ink hover:underline underline-offset-4"
        >
          Comment les quatre se nourrissent
          <ArrowRight class="w-4 h-4" />
        </router-link>
      </div>
    </section>

    <DemoChoice />
    <ContactBlock />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from 'lucide-vue-next'
import HeroGround from '../components/HeroGround.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'
import { moduleByKey, SIDE_PUBLIC } from '../data/modules.js'
import { showcases } from '../components/showcases/index.js'

const route = useRoute()
const router = useRouter()

const mod = computed(() => moduleByKey[route.params.key] || null)
const estPublic = computed(() => mod.value?.side === SIDE_PUBLIC)
const parModule = moduleByKey

// Clé inconnue : l'index des modules plutôt qu'une page vide
if (!mod.value) router.replace('/modules')
</script>
