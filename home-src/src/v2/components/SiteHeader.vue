<template>
  <header class="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-md border-b border-gray-border">
    <div class="max-w-container mx-auto flex items-center justify-between h-16 px-6">
      <router-link to="/" class="flex items-center gap-2" aria-label="Open Projets, accueil">
        <LogoSvg :width="119" :height="46" />
      </router-link>

      <!-- Navigation desktop -->
      <nav class="hidden md:flex items-center gap-1" aria-label="Principale">
        <div class="relative" @mouseenter="open = true" @mouseleave="open = false">
          <button
            type="button"
            class="nav-link inline-flex items-center gap-1.5"
            :class="{ 'nav-link--active': isModuleRoute }"
            :aria-expanded="open"
            aria-haspopup="true"
            @click="open = !open"
          >
            Modules
            <ChevronDown class="w-3.5 h-3.5 transition-transform duration-200" :class="{ 'rotate-180': open }" />
          </button>

          <Transition name="drop">
            <div
              v-if="open"
              class="absolute left-0 top-full pt-2 w-[344px]"
            >
              <div class="bg-white border border-gray-border rounded-2xl shadow-card p-2">
                <router-link
                  v-for="m in modules"
                  :key="m.key"
                  :to="`/modules/${m.key}`"
                  class="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-bg transition-colors"
                  @click="open = false"
                >
                  <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="m.tone.bg">
                    <component :is="m.icon" class="w-4 h-4" :class="m.tone.text" />
                  </span>
                  <span class="min-w-0">
                    <span class="block font-heading font-semibold text-sm text-dark">{{ m.name }}</span>
                    <span class="block text-xs text-gray-text leading-snug mt-0.5">{{ m.tagline }}</span>
                  </span>
                </router-link>
                <router-link
                  to="/modules"
                  class="flex items-center justify-between gap-2 mt-1 px-3 py-2.5 rounded-xl bg-gray-bg text-xs font-semibold text-dark hover:bg-gray-100 transition-colors"
                  @click="open = false"
                >
                  Comment les modules s'articulent
                  <ArrowRight class="w-3.5 h-3.5" />
                </router-link>
              </div>
            </div>
          </Transition>
        </div>

        <template v-for="link in flatLinks" :key="link.label">
          <router-link
            v-if="link.to"
            :to="link.to"
            class="nav-link"
            active-class="nav-link--active"
          >{{ link.label }}</router-link>
          <a
            v-else
            :href="link.href"
            target="_blank" rel="noopener"
            class="nav-link inline-flex items-center gap-1"
          >
            {{ link.label }}
            <ArrowUpRight class="w-3 h-3 text-gray-400" />
          </a>
        </template>

        <router-link
          to="/contact" v-tilt-btn
          class="ml-2 inline-flex items-center gap-2 bg-primary-ink text-white text-[13px] font-medium px-5 py-2 rounded-full hover:bg-red-700 transition-colors"
        >
          Demander une démo
        </router-link>
      </nav>

      <!-- Burger mobile -->
      <button
        class="md:hidden flex flex-col gap-1.5 p-2"
        :aria-expanded="mobileOpen"
        aria-label="Menu"
        @click="mobileOpen = !mobileOpen"
      >
        <span class="block w-5 h-0.5 bg-dark transition-transform" :class="{ 'rotate-45 translate-y-2': mobileOpen }" />
        <span class="block w-5 h-0.5 bg-dark transition-opacity" :class="{ 'opacity-0': mobileOpen }" />
        <span class="block w-5 h-0.5 bg-dark transition-transform" :class="{ '-rotate-45 -translate-y-2': mobileOpen }" />
      </button>
    </div>

    <!-- Menu mobile -->
    <Transition name="drop">
      <div v-if="mobileOpen" class="md:hidden bg-white border-t border-gray-border px-6 py-4 max-h-[80vh] overflow-y-auto">
        <p class="text-[10px] font-bold uppercase tracking-widest text-gray-muted mb-2">Modules</p>
        <router-link
          v-for="m in modules"
          :key="m.key"
          :to="`/modules/${m.key}`"
          class="flex items-center gap-3 py-2.5"
          @click="mobileOpen = false"
        >
          <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="m.tone.bg">
            <component :is="m.icon" class="w-3.5 h-3.5" :class="m.tone.text" />
          </span>
          <span class="font-heading font-medium text-sm text-dark">{{ m.name }}</span>
        </router-link>

        <div class="border-t border-gray-border mt-3 pt-3 flex flex-col">
          <template v-for="link in flatLinks" :key="link.label">
            <router-link
              v-if="link.to"
              :to="link.to"
              class="nav-link text-base py-2"
              active-class="nav-link--active"
              @click="mobileOpen = false"
            >{{ link.label }}</router-link>
            <a
              v-else
              :href="link.href"
              target="_blank" rel="noopener"
              class="nav-link text-base py-2 inline-flex items-center gap-1.5"
            >
              {{ link.label }}
              <ArrowUpRight class="w-3 h-3 text-gray-400" />
            </a>
          </template>
          <router-link
            to="/contact"
            class="inline-flex items-center justify-center gap-2 bg-primary-ink text-white text-sm font-medium px-5 py-3 rounded-full mt-3"
          >
            Demander une démo
          </router-link>
          <a
            :href="DEMO_KIOSK_URL"
            target="_blank" rel="noopener"
            class="inline-flex items-center justify-center gap-2 bg-white text-dark border border-gray-border text-sm px-5 py-3 rounded-full mt-2"
          >
            Générer la carte de ma commune
          </a>
        </div>
      </div>
    </Transition>
  </header>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronDown, ArrowRight, ArrowUpRight } from 'lucide-vue-next'
import LogoSvg from '@/components/LogoSvg.vue'
import { modules } from '../data/modules.js'
import { flatLinks } from '../data/nav.js'
import { DEMO_KIOSK_URL } from '@/data/siteUrls.js'

const route = useRoute()
const open = ref(false)
const mobileOpen = ref(false)

const isModuleRoute = computed(() => route.path.startsWith('/modules'))

// Refermer les menus à chaque navigation, sinon le survol laisse le panneau
// ouvert par-dessus la nouvelle page.
watch(() => route.fullPath, () => { open.value = false; mobileOpen.value = false })

function onKey(e) { if (e.key === 'Escape') { open.value = false; mobileOpen.value = false } }
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.nav-link {
  @apply text-gray-text text-[13px] font-normal px-3.5 py-1.5 rounded-full transition-colors;
}
.nav-link:hover { @apply text-dark bg-gray-100; }
.nav-link--active { @apply text-primary-ink bg-primary-light; }

.drop-enter-active, .drop-leave-active { transition: opacity .18s ease, transform .18s ease; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
