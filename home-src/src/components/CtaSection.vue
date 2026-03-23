<template>
  <section class="relative py-32 bg-dark overflow-hidden">
    <!-- Subtle gradient overlay -->
    <div class="absolute inset-0 opacity-20">
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blob-red blur-[160px] rounded-full" />
    </div>

    <div class="relative max-w-container mx-auto px-6 text-center">
      <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[52px] leading-tight tracking-tight text-white">
        Déployez votre carte
        <br />
        <span class="text-gradient">pour votre territoire</span>
      </h2>

      <p class="mt-6 text-white/60 text-base sm:text-lg max-w-md mx-auto leading-relaxed">
        Demandez une démo personnalisée et découvrez Open Projets en quelques minutes.
      </p>

      <!-- CTAs -->
      <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
        <router-link
          to="/contact"
          class="inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/30"
        >
          Demander une démo
          <ArrowRight class="w-4 h-4" />
        </router-link>

        <a
          href="https://grandsprojets.com"
          target="_blank"
          class="inline-flex items-center gap-2.5 bg-white/10 text-white text-sm font-medium px-7 py-4 rounded-full border border-white/20 hover:bg-white/20 transition-colors"
        >
          <MapIcon class="w-4 h-4" />
          Voir l'exemple Lyon
          <ArrowUpRight class="w-3.5 h-3.5 text-white/60" />
        </a>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, MapIcon } from 'lucide-vue-next'
</script>
