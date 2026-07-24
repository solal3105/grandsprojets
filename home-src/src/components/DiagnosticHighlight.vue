<template>
  <section id="diagnostic" class="py-24 bg-white overflow-hidden">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[680px]">
        <span class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-teal bg-teal/10 px-3 py-1.5 rounded-full mb-6">
          <Sparkles class="w-3 h-3" />
          Nouveau - Diagnostic terrain
        </span>
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.1] tracking-tight text-dark">
          Des centaines de relevés, <span class="text-teal">une lecture en quelques secondes.</span>
        </h2>
        <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed">
          Entourez une zone sur la carte. L'IA lit tous les relevés qui s'y trouvent et vous en rend une
          synthèse structurée, source par source, entièrement citée - sans rien inventer, sans jugement,
          sans recommandation.
        </p>
      </div>

      <div class="mt-11 lg:mt-12 max-w-[1040px]">
        <DiagnosticShowcase />
      </div>

      <router-link
        to="/fonctionnalites#diagnostic" v-tilt-btn
        class="mt-9 inline-flex items-center gap-2 bg-dark text-white text-sm font-medium px-6 py-3.5 rounded-full hover:bg-dark/90 transition-colors"
      >
        Voir comment ça marche
        <ArrowRight class="w-4 h-4" />
      </router-link>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, Sparkles } from 'lucide-vue-next'
import DiagnosticShowcase from '@/components/DiagnosticShowcase.vue'
</script>
