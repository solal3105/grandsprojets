<template>
  <section class="py-16 sm:py-20 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="bg-white rounded-2xl border border-gray-border shadow-card overflow-hidden">
        <div class="grid grid-cols-1 lg:grid-cols-2">
          <!-- Bloc explication -->
          <div class="p-8 sm:p-10 flex flex-col">
            <span class="inline-flex items-center gap-2 self-start text-xs font-medium text-primary-ink bg-primary-10 px-3 py-1.5 rounded-full mb-5">
              <MapIcon class="w-3.5 h-3.5" />
              Ce guide, en pratique
            </span>
            <h2 class="font-heading font-bold text-2xl sm:text-3xl text-dark leading-snug mb-4">
              {{ heading }}
            </h2>
            <p class="text-sm sm:text-base text-gray-text leading-relaxed mb-6">
              {{ intro }}
            </p>
            <ul class="space-y-3 mb-8">
              <li v-for="(point, i) in points" :key="i" class="flex items-start gap-3">
                <span class="w-5 h-5 rounded-full bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check class="w-3 h-3 text-green-ink" />
                </span>
                <span class="text-sm text-gray-text leading-relaxed">{{ point }}</span>
              </li>
            </ul>
            <p class="text-xs text-gray-text/80 leading-relaxed mt-auto">
              Transparence : ce guide est édité par l'équipe d'Open Projets (VAZY, Lyon). La démo ci-contre est l'outil réel, en accès libre : jugez sur pièces.
            </p>
          </div>

          <!-- Démo embarquée -->
          <div class="bg-dark/[0.03] border-t lg:border-t-0 lg:border-l border-gray-border p-4 sm:p-6 flex flex-col">
            <iframe
              :src="demoUrl"
              title="Démo interactive Open Projets : la carte publique d'une collectivité"
              class="w-full grow min-h-[380px] sm:min-h-[440px] rounded-xl border border-gray-border bg-white"
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
            />
            <div class="flex items-center justify-between gap-3 mt-3">
              <span class="text-xs text-gray-text">Démo interactive : naviguez librement dans la carte.</span>
              <a
                :href="demoUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex items-center gap-1.5 text-xs font-medium text-primary-ink hover:underline shrink-0"
              >
                Ouvrir en plein écran
                <ExternalLink class="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { Check, ExternalLink, Map as MapIcon } from 'lucide-vue-next'

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
  demoUrl: {
    type: String,
    default: 'https://openprojets.com/default',
  },
})
</script>
