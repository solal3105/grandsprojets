<template>
  <!-- Fin de guide : ce que le texte vient de decrire, puis ce qu'est
       reellement l'outil. Une carte embarquee a cet endroit ne disait rien du
       reste de la suite, et le visiteur repartait en croyant qu'Open Projets
       se limitait a une carte. -->
  <section class="py-16 sm:py-24 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[760px]">
        <span class="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-muted">
          Ce guide, en pratique
        </span>
        <h2 class="mt-5 font-heading font-bold text-2xl sm:text-3xl lg:text-[38px] leading-[1.1] tracking-tight text-dark">
          {{ heading }}
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
          {{ intro }}
        </p>

        <ul class="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3.5">
          <li v-for="(point, i) in points" :key="i" class="flex items-start gap-3">
            <Check class="w-4 h-4 shrink-0 mt-1 text-primary-ink" />
            <span class="text-[15px] text-gray-text leading-relaxed">{{ point }}</span>
          </li>
        </ul>
      </div>

      <!-- La suite elle-meme : les cinq modules, lus dans la meme source que
           l'accueil et le menu, jamais recopies. -->
      <div class="mt-14 sm:mt-16 pt-12 border-t border-gray-border">
        <div class="max-w-[760px]">
          <h3 class="font-heading font-bold text-xl sm:text-2xl tracking-tight text-dark">
            Open Projets, {{ compteEnLettres.toLowerCase() }} modules sur une seule carte
          </h3>
          <p class="mt-4 text-gray-text text-base leading-relaxed">
            Vous n'activez que ceux qui vous servent, et vous en ajoutez un plus tard sans rien
            refaire. Vos habitants consultent sans compte ni application.
          </p>
        </div>

        <div class="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <router-link
            v-for="m in modules" :key="m.key"
            :to="`/modules/${m.key}`"
            class="group flex flex-col bg-white rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
          >
            <span class="w-10 h-10 rounded-xl flex items-center justify-center mb-5" :class="m.tone.bg">
              <component :is="m.icon" class="w-4 h-4" :class="m.tone.text" />
            </span>
            <span class="font-heading font-semibold text-[17px] tracking-tight text-dark">
              {{ m.name }}
            </span>
            <span class="mt-2.5 flex-1 text-sm text-gray-text leading-relaxed">{{ m.tagline }}</span>
            <span class="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium" :class="m.tone.text">
              Voir le module
              <ArrowRight class="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </router-link>

          <!-- La sixieme tuile ferme la grille et ramene a l'essai. -->
          <router-link
            to="/#essayer"
            class="group flex flex-col justify-between bg-dark rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
          >
            <span class="font-heading font-semibold text-[17px] leading-snug tracking-tight text-white">
              Voyez ce que ça donne sur votre commune
            </span>
            <span class="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-white">
              Générer ma carte
              <ArrowRight class="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </router-link>
        </div>

        <p class="mt-10 text-xs text-gray-muted leading-relaxed max-w-[760px]">
          Transparence : ce guide est édité par l'équipe d'Open Projets (VAZY, Lyon).
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, Check } from 'lucide-vue-next'
import { modules, compteEnLettres } from '../data/modules.js'

defineProps({
  heading: { type: String, default: 'À quoi ça ressemble, une fois en place' },
  intro: {
    type: String,
    default: "Open Projets est la carte des projets et des travaux d'une collectivité : chaque projet a sa fiche publique, aux couleurs de la commune, consultable sans rien installer.",
  },
  points: {
    type: Array,
    default: () => [
      'Une fiche par projet : photos, calendrier, statut mis à jour en deux clics',
      'Carte à vos couleurs, intégrable dans le site de la commune',
      'Accessible par lien ou par QR code, sans application',
      'Administration tenue par un agent, sans compétence technique',
    ],
  },
})
</script>
