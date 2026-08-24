<template>
  <!-- La vue est celle du site actuel : seul le bloc de clôture change. -->
  <SharedRessourceArticleView>
    <template #cta>
      <DemoChoice />
      <ContactBlock />
    </template>
  </SharedRessourceArticleView>
</template>

<script setup>
import SharedRessourceArticleView from '@/views/RessourceArticleView.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'
</script>
