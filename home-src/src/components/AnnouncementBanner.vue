<template>
  <div
    v-if="visible"
    class="relative z-40 bg-dark text-white text-sm"
  >
    <div class="max-w-container mx-auto px-6 h-11 flex items-center justify-center gap-4">
      <span class="hidden sm:inline text-white/60">Open Projets équipe déjà des collectivités -</span>
      <router-link
        to="/contact"
        class="inline-flex items-center gap-2 font-medium text-white hover:text-primary transition-colors"
      >
        Demander une démo
        <ArrowRight class="w-3.5 h-3.5 shrink-0" />
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ArrowRight } from 'lucide-vue-next'

const props = defineProps({
  show: { type: Boolean, default: true },
})

const inIframe = ref(false)

onMounted(() => {
  try {
    inIframe.value = window.self !== window.top
  } catch {
    inIframe.value = true
  }
})

const visible = computed(() => props.show && !inIframe.value)
</script>
