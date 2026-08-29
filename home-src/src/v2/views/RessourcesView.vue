<template>
  <!-- La liste vient de la vue partagee ; l'ouverture et la cloture sont celles
       de la version 2, pour que la page se lise comme l'accueil. -->
  <SharedRessourcesView>
    <template #hero>
      <section class="relative bg-gray-bg pt-36 pb-20 overflow-hidden">
        <HeroGround />
        <div class="relative max-w-container mx-auto px-6">
          <div class="max-w-[820px] mx-auto text-center">
            <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] tracking-tight-hero text-dark">
              Communiquer sur les projets de votre territoire
            </h1>
            <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[640px] mx-auto">
              Des guides écrits pour les équipes des communes : plan de mandat, travaux, information
              des riverains, signalements. Des méthodes venues du terrain, sans jargon.
            </p>
          </div>
        </div>
      </section>
    </template>

    <template #cta>
      <DemoChoice />
      <ContactBlock />
    </template>
  </SharedRessourcesView>
</template>

<script setup>
import SharedRessourcesView from '@/views/RessourcesView.vue'
import HeroGround from '../components/HeroGround.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'
</script>
