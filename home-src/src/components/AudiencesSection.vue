<template>
  <section id="a-propos" class="py-24 bg-white">
    <div class="max-w-container mx-auto px-6">
      <!-- Title -->
      <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[900px]">
        Communes, intercommunalités, métropoles :
        <br />
        même outil, votre identité
      </h2>

      <!-- 3 Audience cards -->
      <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="(card, i) in audiences"
          :key="i"
          class="bg-gray-bg rounded-2xl border border-gray-border p-8 flex flex-col"
        >
          <!-- Icon -->
          <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-6" :class="card.bgClass">
            <component :is="card.icon" class="w-6 h-6" :class="card.iconClass" />
          </div>

          <!-- Title -->
          <h3 class="font-heading font-semibold text-xl text-dark mb-4">{{ card.title }}</h3>

          <!-- Features list -->
          <ul class="space-y-3 flex-1">
            <li
              v-for="(feature, j) in card.features"
              :key="j"
              class="flex items-start gap-3 text-sm text-gray-text leading-relaxed"
            >
              <Check class="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{{ feature }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { UserCircle, Settings, Users, Check } from 'lucide-vue-next'

const audiences = [
  {
    icon: UserCircle,
    title: 'Élus & direction',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
    features: [
      'Valorisez l\'action publique et renforcer la transparence',
      'Pilotez les projets structurants via un portail unique',
      'Outil souverain, conforme RGPD, made in EU',
    ],
  },
  {
    icon: Settings,
    title: 'Services techniques',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
    features: [
      'Publiez et gérez les projets depuis un back-office simple',
      'Centralisez les informations cartographiques',
      'Mettez à jour sans développeur, en toute autonomie',
    ],
  },
  {
    icon: Users,
    title: 'Habitants & associations',
    bgClass: 'bg-blue-500/10',
    iconClass: 'text-blue-500',
    features: [
      'Consultez les projets de votre territoire en un clic',
      'Compréhension rapide grâce à la carte interactive',
      'Aucune inscription nécessaire',
    ],
  },
]
</script>
