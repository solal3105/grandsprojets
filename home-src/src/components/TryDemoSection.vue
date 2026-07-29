<template>
  <!-- Essai libre : le visiteur voit la carte de SA commune avant de parler à
       qui que ce soit. C'est l'argument le plus court de toute la vitrine. -->
  <section id="essayer" class="py-24 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="rounded-3xl bg-white border border-gray-border shadow-card p-8 sm:p-12 lg:p-14">
        <div class="max-w-[660px]">
          <span class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-primary bg-primary-10 px-3 py-1.5 rounded-full mb-6">
            <Sparkles class="w-3 h-3" />
            À essayer maintenant
          </span>

          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[42px] leading-[1.1] tracking-tight text-dark">
            Et si la carte des projets
            <span class="text-primary">de votre commune</span>
            existait déjà ?
          </h2>

          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed">
            Tapez son nom. En quelques minutes, nous recensons ses projets sur le web public et sa
            carte prend vie sous vos yeux. Sans compte, sans installation, sans engagement.
          </p>

          <div class="mt-9 flex flex-col sm:flex-row sm:items-center gap-4">
            <a
              :href="DEMO_KIOSK_URL"
              target="_blank" rel="noopener noreferrer" v-tilt-btn
              class="group inline-flex items-center justify-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-all duration-200 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
            >
              Générer la carte de ma commune
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </a>

            <a
              :href="MAP_LYON_URL"
              target="_blank" rel="noopener noreferrer"
              class="inline-flex items-center justify-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border hover:bg-gray-bg transition-all duration-200"
            >
              <MapIcon class="w-4 h-4" />
              Voir l'exemple Métropole de Lyon
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-text/60" />
            </a>
          </div>

          <!-- La réserve est dite ici, pas seulement dans le message de suivi :
               une carte bâtie sans la collectivité est forcément incomplète, et
               ce qui lui manque est exactement ce que la collectivité apporte. -->
          <p class="mt-8 text-sm text-gray-text/70 leading-relaxed">
            Cette carte d'essai est construite sans votre collectivité, à partir des seules sources
            publiques : site de la mairie, presse locale, avis de marchés publics. Elle est donc
            forcément incomplète. C'est précisément la différence avec un espace alimenté par vos
            équipes, à partir de vos documents.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, MapIcon, Sparkles } from 'lucide-vue-next'
import { DEMO_KIOSK_URL, MAP_LYON_URL } from '@/data/siteUrls'
</script>
