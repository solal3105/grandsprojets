<template>
  <!-- Ce que la liste des modules ne dit pas : les trois modules publics
       ecrivent au meme endroit, et tout ce qu'ils recueillent devient matiere
       pour le Diagnostic. C'est la raison d'en activer plusieurs. -->
  <section id="cumul" class="py-20 sm:py-28 bg-white">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[720px] mx-auto text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
          Chaque module que vous activez en nourrit un autre
        </h2>
      </div>

      <div class="mt-14 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[1020px] mx-auto">
        <div v-for="bloc in BLOCS" :key="bloc.titre" class="bg-gray-bg rounded-3xl p-8 sm:p-10">
          <h3 class="font-heading font-semibold text-xl sm:text-2xl text-dark leading-tight tracking-tight">
            {{ bloc.titre }}
          </h3>
          <p class="mt-3.5 text-base text-gray-text leading-relaxed">{{ bloc.texte }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const BLOCS = [
  {
    titre: 'Les trois modules publics écrivent au même endroit.',
    texte: "Carte, Travaux et Participer alimentent un seul espace public : vos couleurs, une seule adresse, quel que soit le nombre de modules.",
  },
  {
    titre: 'Ce qu\'ils recueillent nourrit le Diagnostic.',
    texte: "Le Diagnostic charge d'un clic vos projets publiés et vos chantiers. Vos signalements et vos autres jeux de données s'y ajoutent par lien ou par fichier.",
  },
  {
    titre: 'Open Projets Chantiers reste à part.',
    texte: "Outil distinct, site distinct, pour les services voirie. Le module Travaux sait afficher un flux externe : c'est par là que les deux se raccordent.",
  },
]
</script>
