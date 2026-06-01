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

const isEmbedded = computed(() => route.query.embed === 'true')
const isStandalone = computed(() => route.meta.standalone === true)
</script>
