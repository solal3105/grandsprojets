<template>
  <div>
    <!-- Hero -->
    <section class="relative bg-gray-bg pt-36 pb-20 overflow-hidden">
      <PageBlobs top="blob-amber" bottom="blob-green" top-offset="-70px" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[768px]">
          <EyebrowLabel>Ressources</EyebrowLabel>
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Communiquer sur les projets
            <span class="text-gradient-green"> de votre territoire</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[560px]">
            Guides pratiques écrits pour les équipes des communes : plan de mandat, travaux, information des riverains. Des méthodes concrètes, issues du terrain, sans jargon.
          </p>
        </div>
      </div>
    </section>

    <!-- Liste des articles -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 reveal" :ref="(el) => { revealEls[0] = el }">
          <RouterLink
            v-for="article in articles"
            :key="article.slug"
            :to="`/ressources/${article.slug}`"
            class="group block rounded-2xl border border-gray-border p-8 h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white"
          >
            <div class="flex items-center gap-3 mb-5">
              <span v-if="article.tag" class="text-xs font-medium text-primary bg-primary-10 px-2.5 py-1 rounded-full">
                {{ article.tag }}
              </span>
              <span class="text-xs text-gray-text">{{ formatDateFr(article.date) }}</span>
              <span v-if="article.readingTime" class="text-xs text-gray-text">{{ article.readingTime }} min de lecture</span>
            </div>
            <h2 class="font-heading font-bold text-xl sm:text-2xl text-dark leading-snug mb-3 group-hover:text-primary transition-colors duration-200">
              {{ article.title }}
            </h2>
            <p class="text-sm text-gray-text leading-relaxed mb-6">{{ article.description }}</p>
            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Lire le guide
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <CtaSection
      heading="Vos projets méritent"
      heading-line2="mieux qu'un PDF"
      heading-gradient="text-gradient-green"
      subtitle="Demandez une démo personnalisée : on prépare la carte de votre commune avant l'appel."
    />
  </div>
</template>

<script setup>
import { ArrowRight } from 'lucide-vue-next'
import { useScrollReveal } from '@/composables/useScrollReveal.js'
import PageBlobs from '@/components/PageBlobs.vue'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import CtaSection from '@/components/CtaSection.vue'
import { articles, formatDateFr } from '@/data/ressources.js'

const { revealEls } = useScrollReveal()
</script>

<style scoped>
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.65s ease, transform 0.65s cubic-bezier(0.23, 1, 0.32, 1);
}
.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
</style>
