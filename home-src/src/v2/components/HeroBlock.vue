<template>
  <section class="relative bg-gray-bg pt-28 pb-24 overflow-hidden">
    <HeroGround />

    <div class="relative max-w-container mx-auto px-6">
      <div class="max-w-[900px] mx-auto text-center">
        <!-- Le titre nomme ce que les quatre modules ont en commun. Citer l'un
             d'eux, ou parler de « modules », faisait repartir le visiteur sans
             savoir ce que fait l'outil. -->
        <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] tracking-tight-hero text-dark">
          Tout ce qui se passe sur votre territoire
          tient sur une seule carte
        </h1>

        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[700px] mx-auto">
          Les projets que vous portez, les chantiers qui gênent aujourd'hui, les permissions de
          voirie que vous instruisez, ce que vos habitants vous signalent, et l'analyse d'un secteur
          avant d'arbitrer. Vos habitants consultent sans compte ni application, et vous n'activez
          que ce qui vous sert.
        </p>

        <!-- Deux actions, et une seule mise en avant. -->
        <div class="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <router-link
            :to="{ hash: '#contact' }" v-tilt-btn
            class="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-primary-ink text-white text-[15px] font-medium px-6 sm:px-8 py-4 rounded-full hover:bg-red-700 transition-all duration-200 shadow-lg shadow-primary/25"
          >
            Demander une démo
            <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </router-link>
          <a
            :href="DEMO_KIOSK_URL" target="_blank" rel="noopener" v-tilt-btn
            class="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white text-dark text-[15px] font-medium px-6 sm:px-8 py-4 rounded-full border border-gray-border shadow-pill hover:border-gray-300 transition-colors"
          >
            <Sparkles class="w-4 h-4 text-primary-ink" />
            Générer la carte de ma commune
            <ArrowUpRight class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>

      <!-- Les modules forment une seule barre, posee juste au-dessus de la
           demonstration : cinq pastilles separees se lisaient comme cinq
           boutons de plus, en concurrence avec les deux actions. -->
      <div class="mt-14 flex justify-center">
        <nav :aria-label="`Les ${compteEnLettres} modules`" class="w-full max-w-[896px]">
          <ul
            class="flex flex-col sm:flex-row bg-white border border-gray-border rounded-xl shadow-pill overflow-hidden divide-y sm:divide-y-0 sm:divide-x divide-gray-border"
          >
            <li v-for="m in modules" :key="m.key" class="sm:flex-1 sm:min-w-0">
              <router-link
                :to="`/modules/${m.key}`"
                class="group relative flex items-center justify-center gap-2 h-full px-3 py-3.5 hover:bg-gray-bg transition-colors"
              >
                <component :is="m.icon" class="w-4 h-4 shrink-0" :class="m.tone.text" />
                <span class="text-[13px] font-medium text-dark whitespace-nowrap">{{ m.name }}</span>
                <!-- Le trait de couleur n'apparait qu'au survol : au repos, la
                     barre doit rester un seul objet. -->
                <span
                  class="absolute left-0 right-0 bottom-0 h-[3px] scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left"
                  :class="m.tone.socle"
                />
              </router-link>
            </li>
          </ul>
        </nav>
      </div>

      <!-- La demonstration doit deja depasser dans le premier ecran : c'est
           elle qui donne envie de faire defiler. La barre des modules lui sert
           d'en-tete, elle reste donc collee a elle. -->
      <div class="mt-6">
        <MapShowcase />
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-vue-next'
import HeroGround from './HeroGround.vue'
import MapShowcase from '@/components/MapShowcase.vue'
import { modules, compteEnLettres } from '../data/modules.js'
import { DEMO_KIOSK_URL } from '@/data/siteUrls.js'
</script>
