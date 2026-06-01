<template>
  <div class="min-h-screen">
    <AnnouncementBanner v-if="isHome && !isEmbedded && !isStandalone" />
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
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'

const route = useRoute()

const isEmbedded = computed(() => route.query.embed === 'true')
const isStandalone = computed(() => route.meta.standalone === true)
const isHome = computed(() => route.name === 'home')
</script>
