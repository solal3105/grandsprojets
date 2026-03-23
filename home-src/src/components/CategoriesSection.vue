<template>
  <section class="py-24 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <!-- Title -->
      <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
        Urbanisme, travaux, mobilité :
        <br />
        <span class="text-gradient">tout sur une seule carte</span>
      </h2>

      <!-- 4 Categories -->
      <div class="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div
          v-for="cat in categories"
          :key="cat.label"
          class="flex flex-col items-center text-center group"
        >
          <!-- Icon card -->
          <div class="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:-translate-y-1" :class="cat.bgClass">
            <component :is="cat.icon" class="w-8 h-8" :class="cat.iconClass" />
          </div>
          <h3 class="font-heading font-semibold text-base text-dark mb-1">{{ cat.label }}</h3>
          <p class="text-xs text-gray-text leading-relaxed max-w-[200px]">{{ cat.desc }}</p>
        </div>
      </div>

      <!-- Link -->
      <div class="mt-12 text-center">
        <router-link
          to="/fonctionnalites"
          class="inline-flex items-center gap-2 text-primary text-sm font-medium hover:underline"
        >
          Voir toutes les fonctionnalités
          <ArrowRight class="w-4 h-4" />
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup>
import { Building2, HardHat, Bike, Building } from 'lucide-vue-next'
import { ArrowRight } from 'lucide-vue-next'

const categories = [
  {
    icon: Building2,
    label: 'Urbanisme',
    desc: 'Permis de construire, PLU, rénovations urbaines',
    bgClass: 'bg-orange-50',
    iconClass: 'text-orange-500',
  },
  {
    icon: HardHat,
    label: 'Travaux',
    desc: 'Voirie, réseaux, chantiers majeurs, calendrier',
    bgClass: 'bg-red-50',
    iconClass: 'text-red-500',
  },
  {
    icon: Bike,
    label: 'Mobilité',
    desc: 'Pistes cyclables, transports, stationnement',
    bgClass: 'bg-blue-50',
    iconClass: 'text-blue-500',
  },
  {
    icon: Building,
    label: 'Projets urbains',
    desc: 'Écoquartiers, réhabilitations, espaces publics',
    bgClass: 'bg-purple-50',
    iconClass: 'text-purple-500',
  },
]
</script>
