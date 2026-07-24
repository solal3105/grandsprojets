<template>
  <div>
    <!-- Hero + Form -->
    <section class="relative bg-gray-bg pt-36 pb-24 overflow-hidden min-h-screen">
      <div class="absolute top-[-96px] right-[-60px] w-[700px] h-[700px] blob-contact-1 opacity-40 blur-[120px] rounded-full pointer-events-none" />
      <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-contact-2 opacity-30 blur-[120px] rounded-full pointer-events-none" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <!-- Left: Text + Trust -->
          <div>
            <EyebrowLabel>Contact</EyebrowLabel>
            <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
              Demander
              <br />
              <span class="text-gradient-contact">une démo</span>
            </h1>

            <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[460px]">
              Découvrez comment Open Projets peut transformer la communication de vos projets urbains auprès de vos administrés.
            </p>

            <!-- Trust items -->
            <div class="mt-12 flex flex-col gap-4">
              <div
                v-for="(item, i) in trustItems"
                :key="i"
                class="flex items-center gap-4"
              >
                <div class="w-10 h-10 rounded-2xl flex items-center justify-center" :class="item.bgClass">
                  <component :is="item.icon" class="w-[18px] h-[18px]" :class="item.iconClass" />
                </div>
                <span class="text-sm text-gray-text">{{ item.label }}</span>
              </div>
            </div>
          </div>

          <!-- Right: Form -->
          <DemoRequestForm :referrer="referrer" />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { ShieldCheck, Github, UserCircle, Wallet } from 'lucide-vue-next'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import DemoRequestForm from '@/components/DemoRequestForm.vue'

// Attribution : ?ref=<slug> (ex. bannière démo de la carte) → contact_requests.referrer
const route = useRoute()
const rawRef = String(route.query.ref || '')
const referrer = /^[a-z0-9-]{1,40}$/.test(rawRef) ? rawRef : 'home'

const trustItems = [
  {
    icon: ShieldCheck,
    label: 'RGPD conforme, hébergement européen',
    bgClass: 'bg-primary/[0.03]',
    iconClass: 'text-primary',
  },
  {
    icon: Github,
    label: 'Open source, code auditable',
    bgClass: 'bg-[rgba(78,43,255,0.03)]',
    iconClass: 'text-purple',
  },
  {
    icon: Wallet,
    label: 'Tarif transparent, aucun frais caché',
    bgClass: 'bg-green/[0.03]',
    iconClass: 'text-green',
  },
  {
    icon: UserCircle,
    label: 'Démo personnalisée sous 48h',
    bgClass: 'bg-amber/[0.03]',
    iconClass: 'text-amber',
  },
]
</script>

<style scoped>
</style>
