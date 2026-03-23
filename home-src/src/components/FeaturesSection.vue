<template>
  <section id="fonctionnalites" class="py-24 bg-white">
    <div class="max-w-container mx-auto px-6">
      <!-- Title -->
      <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
        Vous publiez,
        <br />
        <span class="font-bold">vos habitants consultent</span>
      </h2>

      <!-- 3 Cards -->
      <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="(card, i) in cards"
          :key="i"
          class="group relative bg-gray-bg rounded-2xl border border-gray-border overflow-hidden hover:shadow-lg transition-shadow"
        >
          <!-- Illustration area -->
          <div class="h-40 bg-gray-100 relative overflow-hidden p-6">
            <!-- Mini UI mockup illustration -->
            <div class="space-y-2">
              <div
                v-for="j in card.lines"
                :key="j"
                class="flex items-center gap-3"
              >
                <span class="w-2 h-2 rounded-full" :class="j === 1 ? 'bg-primary' : 'bg-gray-300'" />
                <span class="h-1.5 rounded-full bg-gray-200" :style="{ width: `${60 + Math.random() * 80}px` }" />
                <span v-if="card.hasCheck" class="ml-auto w-1.5 h-1.5 rounded-full bg-gray-300" />
              </div>
              <div v-if="card.hasAdd" class="flex items-center gap-2 mt-2">
                <Plus class="w-4 h-4 text-gray-400" />
                <span class="h-1.5 rounded-full bg-gray-200 w-12" />
              </div>
            </div>

            <!-- Number badge -->
            <span class="absolute top-4 right-4 font-heading font-bold text-4xl text-gray-200/80">
              {{ String(i + 1).padStart(2, '0') }}
            </span>
          </div>

          <!-- Text -->
          <div class="p-6">
            <h3 class="font-heading font-semibold text-lg text-dark mb-2">
              {{ card.title }}
            </h3>
            <p class="text-sm text-gray-text leading-relaxed">
              {{ card.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { Plus } from 'lucide-vue-next'

const cards = [
  {
    title: 'Vos équipes ajoutent les projets',
    description: 'Back-office no-code. Localisation, description, état d\'avancement : tout se gère sans compétences techniques.',
    lines: 5,
    hasAdd: true,
    hasCheck: true,
  },
  {
    title: 'La carte s\'adapte à votre identité',
    description: 'Branding, couleurs et typographie : votre carte reprend automatiquement l\'identité de votre collectivité.',
    lines: 4,
    hasAdd: false,
    hasCheck: false,
  },
  {
    title: 'Vos habitants s\'informent',
    description: 'Carte publique, sans inscription. Recherche, filtres, notifications : tout est pensé pour l\'usage citoyen.',
    lines: 4,
    hasAdd: false,
    hasCheck: false,
  },
]
</script>
