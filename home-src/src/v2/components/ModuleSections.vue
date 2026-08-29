<template>
  <div ref="conteneur">
    <!-- L'annonce, puis une planche par module. Les tuiles ne restent que sur
         la page /modules, ou un index a du sens : sur l'accueil, chaque module
         a besoin de sa capture pour qu'on comprenne ce qu'il fait. -->
    <section id="modules" class="pt-20 sm:pt-28 pb-4 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[720px] mx-auto text-center">
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
            {{ compteEnLettres }} modules s'activent séparément
          </h2>
          <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
            Vous n'activez que ceux qui vous servent, et vous en ajoutez un plus tard sans rien refaire.
          </p>
        </div>
      </div>
    </section>

    <PlancheSection
      v-for="(m, i) in modules" :key="m.key"
      :tone="m.tone" :forme="m.forme" :capture="m.capture"
      :inverse="i % 2 === 1" :ancre="`module-${m.key}`"
    >
      <!-- Le nom du module est l'ancre de la planche : la police de titrage et
           la couleur du module. -->
      <div class="flex items-center gap-4">
        <span class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" :class="m.tone.bg">
          <component :is="m.icon" class="w-5 h-5" :class="m.tone.text" />
        </span>
        <span
          class="min-w-0 font-heading font-bold text-[25px] sm:text-[29px] leading-none tracking-tight-name"
          :class="m.tone.text"
        >{{ m.name }}</span>
      </div>

      <h3 class="mt-9 font-heading font-bold text-2xl sm:text-3xl lg:text-[36px] leading-[1.1] tracking-tight text-dark max-w-[560px]">
        {{ m.h1 }}
      </h3>
      <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">
        {{ m.produces }}
      </p>

      <ul class="mt-8 space-y-3.5 max-w-[520px]">
        <li v-for="p in m.habitant.slice(0, 3)" :key="p" class="flex items-start gap-3">
          <Check class="w-4 h-4 shrink-0 mt-1" :class="m.tone.text" />
          <span class="text-base text-gray-text leading-relaxed">{{ p }}</span>
        </li>
      </ul>

      <router-link
        :to="`/modules/${m.key}`" v-tilt-btn
        class="group mt-9 inline-flex items-center gap-2.5 text-white text-sm font-medium px-6 py-3.5 rounded-full shadow-pill hover:shadow-card hover:-translate-y-0.5 transition-all duration-200"
        :class="m.tone.socle"
      >
        Voir le module {{ m.short }}
        <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
      </router-link>
    </PlancheSection>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ArrowRight, Check } from 'lucide-vue-next'
import PlancheSection from './PlancheSection.vue'
import { useParallaxe } from '../composables/useParallaxe.js'
import { modules, compteEnLettres } from '../data/modules.js'

const conteneur = ref(null)
useParallaxe(conteneur)
</script>
