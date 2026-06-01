<template>
  <section class="relative bg-gray-bg pt-36 pb-24 overflow-hidden">
    <!-- Decorative blobs -->
    <div class="absolute top-[-124px] right-[-60px] w-[700px] h-[700px] blob-red opacity-40 blur-[120px] rounded-full pointer-events-none" />
    <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-purple opacity-30 blur-[120px] rounded-full pointer-events-none" />

    <div class="relative max-w-container mx-auto px-6">
      <!-- Text content -->
      <div class="max-w-[896px] mx-auto text-center">
        <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
          La carte interactive que votre collectivité déploie pour
          <span class="text-gradient"> informer ses administrés</span>
        </h1>

        <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[609px] mx-auto">
          Commune, intercommunalité ou métropole : publiez vos projets d'aménagement et vos chantiers sur une carte publique à vos couleurs — intuitif pour vos agents, consultable par tous, sans inscription.
        </p>
        <p class="mt-3 text-xs text-gray-text/50 tracking-wide">
          Prise en main en quelques minutes · Zéro prestataire imposé · Zéro frais caché
        </p>

        <!-- CTAs -->
        <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <router-link
            to="/contact" v-tilt-btn
            class="inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/20"
          >
            Demander une démo
            <ArrowRight class="w-4 h-4" />
          </router-link>

          <a
            href="https://openprojets.com/default"
            target="_blank" v-tilt-btn
            class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
          >
            <MapIcon class="w-4 h-4" />
            Voir l'exemple Lyon
            <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
          </a>
        </div>
      </div>

      <!-- Live map showcase -->
      <div class="mt-12">
        <MapShowcase />
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, MapIcon } from 'lucide-vue-next'
import MapShowcase from '@/components/MapShowcase.vue'
</script>

