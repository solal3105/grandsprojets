<template>
  <section class="bg-white border-y border-gray-100 py-5">
    <div class="max-w-container mx-auto px-6 flex flex-wrap items-center justify-center gap-8 sm:gap-16">
      <div
        v-for="item in items"
        :key="item.label"
        class="flex items-center gap-2.5"
      >
        <component :is="item.icon" class="w-3.5 h-3.5 text-primary" />
        <span class="text-[13px] text-gray-text tracking-wide">{{ item.label }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ShieldCheck, Github, Server } from 'lucide-vue-next'

const items = [
  { icon: ShieldCheck, label: 'RGPD Conforme' },
  { icon: Github, label: 'Open Source' },
  { icon: Server, label: 'Hébergement UE' },
]
</script>
