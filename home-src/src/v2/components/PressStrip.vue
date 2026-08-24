<template>
  <!-- Preuve sociale, dans la meme composition que le reste : trois tuiles,
       un logo, une phrase, un lien. -->
  <section class="py-20 sm:py-28 bg-white">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[720px] mx-auto text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
          La presse en a parlé avant nous
        </h2>
      </div>

      <div class="mt-14 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[1020px] mx-auto">
        <a
          v-for="p in press" :key="p.url"
          :href="p.url" target="_blank" rel="noopener noreferrer"
          class="group flex flex-col bg-gray-bg rounded-3xl p-8 sm:p-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
        >
          <img :src="`${base}${p.logo}`" :alt="p.media" class="h-8 w-auto object-contain object-left mb-7" loading="lazy" />

          <p class="text-base text-gray-text leading-relaxed italic flex-1">« {{ p.citation }} »</p>

          <span class="mt-6 block text-sm text-gray-muted">{{ p.media }} · {{ p.type }} · {{ p.date }}</span>

          <span class="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary-ink">
            {{ p.cta }}
            <ArrowUpRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </a>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowUpRight } from 'lucide-vue-next'
import { press } from '../data/press.js'

const base = import.meta.env.BASE_URL
</script>
