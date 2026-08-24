<template>
  <!-- Le point d'entree pour nous joindre : le formulaire lui-meme, sur
       l'accueil, pas un lien discret en bas de section. -->
  <section id="contact" class="relative py-20 sm:py-28 bg-white overflow-hidden">
    <div class="absolute top-[-120px] left-[-100px] w-[620px] h-[620px] blob-red opacity-25 blur-[120px] rounded-full pointer-events-none" />

    <div class="relative max-w-container mx-auto px-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
        <div>
          <span class="inline-block text-xs font-semibold text-primary-ink uppercase tracking-widest mb-5">
            Parlons-en
          </span>

          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
            Nous configurons votre espace avec vous
          </h2>

          <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[480px]">
            Dites-nous quel territoire vous représentez. Nous vous rappelons et montons votre espace
            ensemble, sur vos vraies données.
          </p>

          <ul class="mt-10 flex flex-col gap-4">
            <li v-for="item in reassurance" :key="item.label" class="flex items-center gap-4">
              <span class="w-10 h-10 rounded-2xl bg-gray-bg flex items-center justify-center shrink-0">
                <component :is="item.icon" class="w-[18px] h-[18px] text-dark" />
              </span>
              <span class="text-sm text-gray-text">{{ item.label }}</span>
            </li>
          </ul>

        </div>

        <DemoRequestForm referrer="home2" id-prefix="home2-contact" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { Clock, ShieldCheck, Unlock } from 'lucide-vue-next'
import DemoRequestForm from '@/components/DemoRequestForm.vue'

const reassurance = [
  { icon: Clock, label: 'Espace configuré en moins d\'une heure' },
  { icon: ShieldCheck, label: 'Hébergement en Europe, conforme au RGPD' },
  { icon: Unlock, label: 'Sans engagement, sans prestataire imposé' },
]
</script>
