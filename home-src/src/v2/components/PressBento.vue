<template>
  <!-- Trois parutions, trois formats. Des tuiles de meme taille les auraient
       rendues interchangeables : ici la television occupe la largeur, la radio
       tient la hauteur avec son extrait ecoutable, le webinaire garde son titre
       complet parce que c'est lui qui parle aux collectivites. -->
  <section id="presse" class="py-20 sm:py-28 bg-white">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[760px] mx-auto text-center">
        <span class="inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-ink">
          <span class="w-5 h-px bg-primary inline-block" />
          On en parle
        </span>
        <h2 class="mt-5 font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
          Open Projets dans les médias
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
          Une émission de télévision, une matinale de radio et un webinaire destiné aux
          collectivités, tous les trois en avril 2026.
        </p>
      </div>

      <div class="mt-14 sm:mt-16 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 max-w-[1120px] mx-auto">

        <!-- Television : la tuile large, et la citation en gros. -->
        <a
          :href="bfm.url" target="_blank" rel="noopener noreferrer"
          class="group lg:col-span-2 flex flex-col justify-between gap-8 bg-gray-bg rounded-3xl p-8 sm:p-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
        >
          <div class="flex items-start justify-between gap-6">
            <img
              :src="`${base}${bfm.logo}`" :alt="bfm.logoAlt"
              class="h-12 w-auto object-contain" loading="lazy"
            />
            <span :class="badge">
              <Tv class="w-3 h-3 shrink-0" />
              {{ bfm.type }}
            </span>
          </div>

          <blockquote>
            <p class="font-heading font-semibold text-xl sm:text-[26px] leading-[1.25] tracking-tight text-dark">
              « {{ bfm.citation }} »
            </p>
            <cite class="mt-4 block not-italic text-sm text-gray-muted">
              {{ bfm.media }}, {{ bfm.date }}
            </cite>
          </blockquote>

          <span :class="lien">
            {{ bfm.cta }}
            <ArrowUpRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </a>

        <!-- Radio : la tuile haute, parce qu'elle porte l'extrait ecoutable. -->
        <div class="lg:row-span-2 flex flex-col justify-between gap-7 bg-gray-bg rounded-3xl p-8 sm:p-10">
          <div class="flex items-start justify-between gap-6">
            <img
              :src="`${base}${lyonDemain.logo}`" :alt="lyonDemain.logoAlt"
              class="h-9 w-auto object-contain" loading="lazy"
            />
            <span :class="badge">
              <Radio class="w-3 h-3 shrink-0" />
              {{ lyonDemain.type }}
            </span>
          </div>

          <blockquote>
            <p class="text-base text-gray-text leading-relaxed">« {{ lyonDemain.citation }} »</p>
            <cite class="mt-4 block not-italic text-sm text-gray-muted">
              {{ lyonDemain.signature }}, {{ lyonDemain.date }}
            </cite>
          </blockquote>

          <!-- L'extrait s'ecoute sur place : un lecteur dans la tuile retient
               le visiteur, un lien vers le diffuseur le fait partir. -->
          <div class="bg-white rounded-2xl p-5">
            <div class="flex items-center gap-3">
              <button
                @click="togglePlay"
                class="w-10 h-10 rounded-full bg-primary-ink text-white flex items-center justify-center shrink-0 hover:bg-red-700 active:scale-95 transition-all duration-200"
                :aria-label="isPlaying ? 'Mettre en pause' : 'Écouter l\'extrait'"
              >
                <Pause v-if="isPlaying" class="w-4 h-4" />
                <Play v-else class="w-4 h-4 ml-px" />
              </button>
              <span class="min-w-0">
                <span class="block text-[13px] font-medium text-dark truncate">{{ lyonDemain.audio.emission }}</span>
                <span class="block text-[11px] text-gray-muted mt-0.5">{{ lyonDemain.audio.date }}, avec {{ lyonDemain.audio.invites }}</span>
              </span>
            </div>
            <div class="mt-4 flex items-center gap-3">
              <span class="text-[11px] text-gray-muted tabular-nums w-8 text-right shrink-0">{{ formatTime(currentTime) }}</span>
              <div
                ref="progressBar"
                class="relative flex-1 h-1 bg-dark/10 rounded-full cursor-pointer group/bar"
                @click="seek" @mousedown="startDrag"
              >
                <div class="absolute inset-y-0 left-0 bg-primary rounded-full" :style="{ width: progress + '%' }" />
                <div
                  class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200"
                  :style="{ left: `calc(${progress}% - 6px)` }"
                />
              </div>
              <span class="text-[11px] text-gray-muted tabular-nums w-8 shrink-0">{{ formatTime(duration) }}</span>
            </div>
          </div>

          <a
            :href="lyonDemain.url" target="_blank" rel="noopener noreferrer"
            class="group" :class="lien"
          >
            {{ lyonDemain.cta }}
            <ArrowUpRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <!-- Webinaire : son titre est sa meilleure citation. -->
        <a
          :href="gazette.url" target="_blank" rel="noopener noreferrer"
          class="group flex flex-col gap-7 bg-gray-bg rounded-3xl p-8 sm:p-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
        >
          <div class="flex items-start justify-between gap-6">
            <img
              :src="`${base}${gazette.logo}`" :alt="gazette.logoAlt"
              class="h-8 w-auto object-contain" loading="lazy"
            />
            <span :class="badge">
              <Video class="w-3 h-3 shrink-0" />
              {{ gazette.type }}
            </span>
          </div>

          <div class="flex-1">
            <h3 class="font-heading font-semibold text-lg leading-snug tracking-tight text-dark">
              {{ gazette.titre }}
            </h3>
            <p class="mt-3.5 text-[15px] text-gray-text leading-relaxed">« {{ gazette.citation }} »</p>
            <p class="mt-4 text-sm text-gray-muted">{{ gazette.media }}, {{ gazette.date }}</p>
          </div>

          <span :class="lien">
            {{ gazette.cta }}
            <ArrowUpRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </a>

        <!-- La quatrieme tuile ferme la grille et donne le point d'entree aux
             journalistes. Elle reste au meme niveau que les parutions : c'est
             une precision utile, pas une offre a vendre. -->
        <router-link
          :to="{ path: '/', hash: '#contact' }"
          class="group flex flex-col justify-between gap-7 bg-gray-bg rounded-3xl p-8 sm:p-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
        >
          <span class="w-10 h-10 rounded-2xl bg-white flex items-center justify-center">
            <Mic class="w-4 h-4 text-gray-muted" />
          </span>
          <span>
            <span class="block font-heading font-semibold text-lg leading-snug tracking-tight text-dark">
              Vous préparez un sujet sur Open Projets ?
            </span>
            <span class="block mt-3 text-[15px] text-gray-text leading-relaxed">
              Écrivez-nous, nous vous ouvrons un espace de démonstration et nous répondons à vos
              questions.
            </span>
          </span>
          <span class="inline-flex items-center gap-2 text-sm font-medium text-gray-muted group-hover:text-dark transition-colors">
            Nous contacter
            <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </span>
        </router-link>

      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, Mic, Pause, Play, Radio, Tv, Video } from 'lucide-vue-next'
import { bfm, lyonDemain, gazette } from '../data/press.js'
import { useAudioPlayer } from '@/composables/useAudioPlayer.js'

const base = import.meta.env.BASE_URL

const badge = 'inline-flex shrink-0 items-center gap-1.5 bg-white text-primary-ink text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full'
const lien = 'inline-flex items-center gap-2 text-sm font-medium text-primary-ink'

const { isPlaying, currentTime, duration, progress, progressBar, togglePlay, seek, startDrag, formatTime } =
  useAudioPlayer(lyonDemain.audio.src)
</script>
