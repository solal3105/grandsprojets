<template>
  <img
    :src="logoSrc"
    :width="width"
    :height="height"
    alt="Open Projets"
    class="block"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  width: { type: [Number, String], default: 119 },
  height: { type: [Number, String], default: 46 },
  variant: { type: String, default: 'full' },
})

const logoSrc = computed(() => {
  switch (props.variant) {
    case 'white': return '/img/logos/square_white.png'
    case 'min': return '/img/logos/square_color.png'
    case 'full':
    default: return '/img/logos/classic_color.png'
  }
})
</script>
