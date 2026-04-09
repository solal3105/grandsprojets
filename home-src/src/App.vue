<template>
  <div class="min-h-screen">
    <TheHeader v-if="!isStandalone" />
    <main>
      <RouterView />
    </main>
    <TheFooter v-if="!isEmbedded && !isStandalone" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TheHeader from '@/components/TheHeader.vue'
import TheFooter from '@/components/TheFooter.vue'

const route = useRoute()

// Détecte si on est en mode embed (iframe)
const isEmbedded = computed(() => {
  return route.query.embed === 'true'
})

// Détecte les pages standalone (sans nav/footer) comme /helios
const isStandalone = computed(() => {
  return route.meta.standalone === true
})
</script>
