<template>
  <!-- Quatre tuiles, un seul niveau de lecture. La distinction public/interne
       se dit sur chaque page module, elle n'a pas besoin de decouper cette
       grille en deux. -->
  <section id="modules" class="py-20 sm:py-28 bg-white">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[720px] mx-auto text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
          Quatre modules s'activent séparément
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
          Vous n'activez que ceux qui vous servent, et vous en ajoutez un plus tard sans rien refaire.
        </p>
      </div>

      <div class="mt-14 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[1020px] mx-auto">
        <router-link
          v-for="m in modules" :key="m.key"
          :to="`/modules/${m.key}`"
          class="group flex flex-col bg-gray-bg rounded-3xl p-8 sm:p-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
        >
          <span
            class="w-12 h-12 rounded-2xl flex items-center justify-center mb-7 transition-transform duration-300 group-hover:scale-105"
            :class="m.tone.bg"
          >
            <component :is="m.icon" class="w-5 h-5" :class="m.tone.text" />
          </span>

          <h3 class="font-heading font-semibold text-xl sm:text-2xl leading-tight tracking-tight text-dark">
            {{ m.name }}
          </h3>
          <p class="mt-3.5 text-base text-gray-text leading-relaxed flex-1">{{ m.tagline }}</p>

          <span class="mt-7 inline-flex items-center gap-2 text-sm font-medium" :class="m.tone.text">
            En savoir plus
            <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight } from 'lucide-vue-next'
import { modules } from '../data/modules.js'
</script>
