<template>
  <section class="py-16 sm:py-20 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="bg-white rounded-2xl border border-gray-border shadow-card overflow-hidden">
        <!-- La carte occupe toute la largeur de la carte-bloc : a moitie de
             page elle tenait dans 590 pixels, soit une carte plus petite que
             son propre panneau lateral. Le texte passe donc au-dessus. -->
        <div class="p-8 sm:p-10">
          <span class="inline-flex items-center gap-2 text-xs font-medium text-primary-ink bg-primary-10 px-3 py-1.5 rounded-full">
            <MapIcon class="w-3.5 h-3.5" />
            Ce guide, en pratique
          </span>
          <h2 class="mt-5 font-heading font-bold text-2xl sm:text-3xl text-dark leading-snug max-w-[760px]">
            {{ heading }}
          </h2>

          <div class="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-x-14 gap-y-6">
            <p class="text-base text-gray-text leading-relaxed">
              {{ intro }}
            </p>
            <ul class="space-y-3">
              <li v-for="(point, i) in points" :key="i" class="flex items-start gap-3">
                <span class="w-5 h-5 rounded-full bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check class="w-3 h-3 text-green-ink" />
                </span>
                <span class="text-sm text-gray-text leading-relaxed">{{ point }}</span>
              </li>
            </ul>
          </div>

          <p class="mt-8 text-xs text-gray-text/80 leading-relaxed max-w-[760px]">
            Transparence : ce guide est édité par l'équipe d'Open Projets (VAZY, Lyon).
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { Check, Map as MapIcon } from 'lucide-vue-next'

// Bloc « solution » factorisé des articles Ressources : une démo embarquée de
// l'outil + les capacités qui répondent au besoin traité par l'article.
// Le contenu (intro, points) vient du frontmatter de chaque article ; les
// valeurs par défaut couvrent les articles qui ne le renseignent pas.
defineProps({
  heading: {
    type: String,
    default: 'À quoi ça ressemble, une fois en place',
  },
  intro: {
    type: String,
    default: 'Open Projets est la carte interactive des projets et des travaux pour les collectivités : chaque projet a sa fiche publique, sa carte aux couleurs de la commune, et se consulte sans installer quoi que ce soit.',
  },
  points: {
    type: Array,
    default: () => [
      'Une fiche par projet : photos, calendrier, statut mis à jour en deux clics',
      'Carte en marque blanche, intégrable sur le site de la commune',
      'Accessible par lien, QR code ou iframe, sans application',
      'Administration pensée pour un agent non technique',
    ],
  },
})
</script>
