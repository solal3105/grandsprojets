<template>
  <!-- Les deux demos sont deux choses differentes : meme composition en tuiles
       que les modules, pour qu'on les compare d'un coup d'oeil. -->
  <section id="essayer" class="py-20 sm:py-28 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[720px] mx-auto text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
          Vous pouvez juger sur pièces de deux façons
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
          L'une construit la carte de votre commune. L'autre vous fait entrer dans un espace déjà
          en service. Aucune ne demande de compte.
        </p>
      </div>

      <div class="mt-14 sm:mt-16 grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1020px] mx-auto">
        <a
          v-for="demo in demos" :key="demo.href"
          :href="demo.href" target="_blank" rel="noopener"
          class="group flex flex-col bg-white rounded-3xl p-8 sm:p-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
        >
          <span class="w-12 h-12 rounded-2xl flex items-center justify-center mb-7" :class="demo.iconBg">
            <component :is="demo.icon" class="w-5 h-5" :class="demo.iconColor" />
          </span>

          <h3 class="font-heading font-semibold text-xl sm:text-2xl leading-tight tracking-tight text-dark">
            {{ demo.title }}
          </h3>
          <p class="mt-3.5 text-base text-gray-text leading-relaxed flex-1">{{ demo.desc }}</p>

          <span
            class="mt-8 inline-flex items-center justify-center gap-2.5 text-sm font-medium px-6 py-3.5 rounded-full transition-colors"
            :class="demo.ctaClass"
          >
            {{ demo.cta }}
            <ArrowUpRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </a>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowUpRight, Sparkles, MapPin } from 'lucide-vue-next'
import { DEMO_KIOSK_URL, MAP_LYON_URL } from '@/data/siteUrls.js'

const demos = [
  {
    icon: Sparkles,
    iconBg: 'bg-primary-10',
    iconColor: 'text-primary-ink',
    ctaClass: 'bg-primary-ink text-white group-hover:bg-red-700',
    title: 'Générez la carte de votre commune',
    desc: "Tapez le nom de votre commune. L'outil recense ses projets sur le web public et construit sa carte. Votre territoire, pas un exemple.",
    cta: 'Générer ma carte',
    href: DEMO_KIOSK_URL,
  },
  {
    icon: MapPin,
    iconBg: 'bg-gray-100',
    iconColor: 'text-dark',
    ctaClass: 'bg-dark text-white group-hover:bg-gray-800',
    title: "Explorez l'espace de la Métropole de Lyon",
    desc: 'Un espace réel, alimenté par une collectivité, avec ses vrais projets et le module Travaux en fonctionnement. Naviguez-y comme le ferait un habitant.',
    cta: "Ouvrir l'espace",
    href: MAP_LYON_URL,
  },
]
</script>
