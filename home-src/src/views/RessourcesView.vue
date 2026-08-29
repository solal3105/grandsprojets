<template>
  <div>
    <!-- Ouverture. La version 2 pose la sienne, calee sur son accueil ; celle
         du site actuel reste ci-dessous par defaut. -->
    <slot name="hero">
      <section class="relative bg-gray-bg pt-36 pb-20 overflow-hidden">
        <PageBlobs top="blob-amber" bottom="blob-green" top-offset="-70px" />

        <div class="relative max-w-container mx-auto px-6">
          <div class="max-w-[768px]">
            <EyebrowLabel>Ressources</EyebrowLabel>
            <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
              Communiquer sur les projets de votre territoire
            </h1>
            <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[560px]">
              Guides pratiques écrits pour les équipes des communes : plan de mandat, travaux, information des riverains. Des méthodes concrètes, issues du terrain, sans jargon.
            </p>
          </div>
        </div>
      </section>
    </slot>

    <!-- Liste des articles -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <!-- Pas d'apparition au defilement sur cette grille : l'observateur se
             declenche a 10 % de la hauteur de l'element, et treize cartes en
             colonne unique font une grille si haute que le seuil n'est jamais
             atteint sur telephone. La liste restait invisible. -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <RouterLink
            v-for="(article, i) in articles"
            :key="article.slug"
            :to="`/ressources/${article.slug}`"
            class="group flex flex-col rounded-2xl border border-gray-border overflow-hidden h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white"
          >
            <RessourceCouverture
              :titre="article.title" :slug="article.slug" :tag="article.tag"
              :teinte="teintePourArticle(article)" :rang="i"
              class="min-h-[210px]"
            />

            <div class="flex flex-col flex-1 p-6 sm:p-7">
              <div class="flex items-center gap-3 text-xs text-gray-muted">
                <span>{{ formatDateFr(article.date) }}</span>
                <span v-if="article.readingTime">{{ article.readingTime }} min de lecture</span>
              </div>

              <p class="mt-3 text-sm text-gray-text leading-relaxed line-clamp-3">{{ article.description }}</p>

              <span class="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink">
                Lire le guide
                <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- CTA (substituable : la version 2 y place son propre bloc de clôture) -->
    <slot name="cta">
      <CtaSection
        heading="Vos projets méritent"
        heading-line2="mieux qu'un PDF"
        heading-gradient="text-gradient-green"
        subtitle="Demandez une démo personnalisée : on prépare la carte de votre commune avant l'appel."
      />
    </slot>
  </div>
</template>

<script setup>
import { ArrowRight } from 'lucide-vue-next'
import PageBlobs from '@/components/PageBlobs.vue'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import RessourceCouverture from '@/components/RessourceCouverture.vue'
import CtaSection from '@/components/CtaSection.vue'
import { articles, formatDateFr, teintePourArticle } from '@/data/ressources.js'
</script>
