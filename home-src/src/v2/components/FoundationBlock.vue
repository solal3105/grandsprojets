<template>
  <!-- Le socle : meme composition que les modules, fond inverse. -->
  <section id="socle" class="py-20 sm:py-28 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[720px] mx-auto text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
          Vous gardez la même base, quel que soit le module
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
          Pas une option, pas facturé au module. La base sur laquelle tout s'active.
        </p>
      </div>

      <div class="mt-14 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[1020px] mx-auto">
        <div
          v-for="item in items" :key="item.title"
          class="bg-white rounded-3xl p-8 sm:p-10"
        >
          <span class="w-12 h-12 rounded-2xl bg-gray-bg flex items-center justify-center mb-7">
            <component :is="item.icon" class="w-5 h-5 text-dark" />
          </span>
          <h3 class="font-heading font-semibold text-xl sm:text-2xl leading-tight tracking-tight text-dark">
            {{ item.title }}
          </h3>
          <p class="mt-3.5 text-base text-gray-text leading-relaxed">{{ item.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { Palette, Layers, Users, Globe } from 'lucide-vue-next'

const items = [
  {
    icon: Palette,
    title: 'Votre identité visuelle',
    desc: 'Couleur, logos, favicon, fond de carte. Prévisualisé en direct, appliqué à tous les modules.',
  },
  {
    icon: Layers,
    title: 'Vos catégories et vos couches',
    desc: 'Vous nommez vos thématiques, choisissez leurs icônes, fixez leur ordre, y associez vos couches.',
  },
  {
    icon: Users,
    title: 'Vos rôles et vos territoires',
    desc: "L'agent publie, l'administrateur configure, chacun sur son périmètre. Une invitation par email suffit.",
  },
  {
    icon: Globe,
    title: 'Aucune application à installer',
    desc: 'Un lien, un QR code ou une intégration dans votre site. Pas de compte, pas de téléchargement.',
  },
]
</script>
