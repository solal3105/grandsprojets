<template>
  <header class="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-border">
    <div class="max-w-container mx-auto flex items-center justify-between h-16 px-6">
      <!-- Logo -->
      <router-link to="/" class="flex items-center gap-2">
        <LogoSvg :width="119" :height="46" />
      </router-link>

      <!-- Navigation desktop -->
      <nav class="hidden md:flex items-center gap-1">
        <router-link
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="nav-link"
          :class="{ 'nav-link--active': isActive(link.to) }"
        >
          {{ link.label }}
        </router-link>

        <a
          href="https://grandsprojets.com"
          target="_blank"
          class="ml-2 inline-flex items-center gap-2 bg-dark text-white text-[13px] font-normal px-5 py-2 rounded-full hover:bg-gray-800 transition-colors"
        >
          Explorer la carte
        </a>
      </nav>

      <!-- Burger mobile -->
      <button
        class="md:hidden flex flex-col gap-1.5 p-2"
        @click="mobileOpen = !mobileOpen"
        aria-label="Menu"
      >
        <span class="block w-5 h-0.5 bg-dark transition-transform" :class="{ 'rotate-45 translate-y-2': mobileOpen }" />
        <span class="block w-5 h-0.5 bg-dark transition-opacity" :class="{ 'opacity-0': mobileOpen }" />
        <span class="block w-5 h-0.5 bg-dark transition-transform" :class="{ '-rotate-45 -translate-y-2': mobileOpen }" />
      </button>
    </div>

    <!-- Mobile menu -->
    <Transition name="slide">
      <div v-if="mobileOpen" class="md:hidden bg-white border-t border-gray-border px-6 py-4">
        <nav class="flex flex-col gap-2">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="nav-link text-base py-2"
            :class="{ 'nav-link--active': isActive(link.to) }"
            @click="mobileOpen = false"
          >
            {{ link.label }}
          </router-link>
          <a
            href="https://grandsprojets.com"
            target="_blank"
            class="inline-flex items-center justify-center gap-2 bg-dark text-white text-sm font-normal px-5 py-3 rounded-full mt-2"
          >
            Explorer la carte
          </a>
        </nav>
      </div>
    </Transition>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import LogoSvg from './LogoSvg.vue'

const route = useRoute()
const mobileOpen = ref(false)

const navLinks = [
  { to: '/', label: 'Accueil' },
  { to: '/fonctionnalites', label: 'Fonctionnalités' },
  { to: '/a-propos', label: 'À propos' },
  { to: '/contact', label: 'Contact' },
  { to: '/aide', label: 'Aide' },
]

function isActive(to) {
  return route.path === to
}
</script>

<style scoped>
.nav-link {
  @apply text-gray-text text-[13px] font-normal px-3.5 py-1.5 rounded-full transition-colors;
}
.nav-link:hover {
  @apply text-dark bg-gray-100;
}
.nav-link--active {
  @apply text-primary bg-primary-light;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
