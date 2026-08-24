<template>
  <section class="relative bg-gray-bg pt-28 pb-24 overflow-hidden">
    <HeroGround />

    <div class="relative max-w-container mx-auto px-6">
      <div class="max-w-[900px] mx-auto text-center">
        <p class="text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Communes, intercommunalités, métropoles
        </p>

        <!-- Le titre nomme ce que les quatre modules ont en commun. Citer l'un
             d'eux, ou parler de « modules », faisait repartir le visiteur sans
             savoir ce que fait l'outil. -->
        <h1 class="mt-4 font-heading font-bold text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] tracking-tight-hero text-dark">
          Tout ce qui se passe sur votre territoire
          tient sur une seule carte
        </h1>

        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[700px] mx-auto">
          Les projets que vous portez, les chantiers qui gênent aujourd'hui, ce que vos habitants
          vous signalent, et l'analyse d'un secteur avant d'arbitrer. Vos habitants consultent sans
          compte ni application, et vous n'activez que ce qui vous sert.
        </p>

        <!-- Les quatre modules, dès la première seconde -->
        <ul class="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <li v-for="m in modules" :key="m.key">
            <router-link
              :to="`/modules/${m.key}`"
              class="group inline-flex items-center gap-2 bg-white border border-gray-border rounded-full pl-3 pr-4 py-2 shadow-pill hover:shadow-card hover:-translate-y-0.5 transition-all duration-200"
            >
              <span class="w-6 h-6 rounded-full flex items-center justify-center" :class="m.tone.bg">
                <component :is="m.icon" class="w-3 h-3" :class="m.tone.text" />
              </span>
              <span class="text-[13px] font-medium text-dark">{{ m.name }}</span>
              <ArrowRight class="w-3 h-3 text-gray-300 group-hover:text-dark transition-colors" />
            </router-link>
          </li>
        </ul>

        <!-- Les deux démos, distinguées dès le premier écran -->
        <div class="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
          <router-link
            to="/contact" v-tilt-btn
            class="group inline-flex items-center gap-2.5 bg-primary-ink text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-all duration-200 shadow-lg shadow-primary/25"
          >
            Demander une démo
            <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </router-link>
          <a
            :href="DEMO_KIOSK_URL"
            target="_blank" rel="noopener" v-tilt-btn
            class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border shadow-pill hover:border-gray-300 transition-colors"
          >
            <Sparkles class="w-4 h-4" />
            Générer la carte de ma commune
            <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
          </a>
        </div>

      </div>

      <!-- La demonstration doit deja depasser dans le premier ecran : c'est
           elle qui donne envie de faire defiler. -->
      <div class="mt-12">
        <MapShowcase />
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-vue-next'
import HeroGround from './HeroGround.vue'
import MapShowcase from '@/components/MapShowcase.vue'
import { modules } from '../data/modules.js'
import { DEMO_KIOSK_URL, MAP_LYON_URL } from '@/data/siteUrls.js'
</script>
