<template>
  <section :id="id" :class="['py-14 sm:py-20 lg:py-28 overflow-hidden', bg]">
    <div class="max-w-container mx-auto px-6">
      <div ref="gridEl" class="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-center reveal">

        <!-- Text -->
        <div :class="reversed ? 'order-1 lg:order-2' : ''">
          <div class="inline-flex items-center gap-2 mb-6 group/badge cursor-default">
            <span
              class="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 group-hover/badge:scale-110"
              :class="iconBg"
            >
              <component :is="icon" class="w-3.5 h-3.5" :class="accent" />
            </span>
            <span class="text-xs font-bold uppercase tracking-widest" :class="accent">{{ badge }}</span>
          </div>

          <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
            {{ title }}
          </h2>

          <button
            class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline underline-offset-4 transition-colors"
            :class="accent"
            @click="open = !open"
          >
            {{ open ? 'Réduire' : 'En savoir plus' }}
            <ChevronDown class="w-4 h-4 transition-transform duration-300" :class="{ 'rotate-180': open }" />
          </button>

          <Transition name="expand">
            <div v-if="open">
              <p class="mt-5 text-gray-text text-base leading-relaxed">{{ description }}</p>
              <ul class="mt-8 space-y-3.5">
                <li
                  v-for="feat in feats"
                  :key="feat"
                  class="flex items-start gap-3 group/item cursor-default"
                >
                  <Check
                    class="w-4 h-4 shrink-0 mt-0.5 transition-transform duration-200 group-hover/item:scale-110"
                    :class="accent"
                  />
                  <span class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/item:translate-x-0.5">{{ feat }}</span>
                </li>
              </ul>
            </div>
          </Transition>
        </div>

        <!-- Image -->
        <div :class="reversed ? 'order-2 lg:order-1' : ''">
          <ShimmerImage :src="imgSrc" :alt="imgAlt" />
        </div>

      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'
import ShimmerImage from '@/components/ShimmerImage.vue'

defineProps({
  id: String,
  bg: { type: String, default: 'bg-white' },
  icon: { type: [Object, Function], required: true },
  iconBg: { type: String, required: true },
  accent: { type: String, required: true },
  badge: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  feats: { type: Array, required: true },
  imgSrc: { type: String, required: true },
  imgAlt: { type: String, required: true },
  reversed: { type: Boolean, default: false },
})

const open = ref(false)
const gridEl = ref(null)
let observer = null

onMounted(() => {
  if (!gridEl.value) return
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.disconnect()
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  )
  observer.observe(gridEl.value)
})

onUnmounted(() => { observer?.disconnect() })
</script>

<style scoped>
.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.65s ease, transform 0.65s cubic-bezier(0.23, 1, 0.32, 1);
}
.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
.expand-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.expand-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.expand-enter-from,
.expand-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
