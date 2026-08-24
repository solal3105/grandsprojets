<template>
  <!-- La vue est celle du site actuel : seul le bloc de clôture change. -->
  <SharedRessourcesView>
    <template #cta>
      <DemoChoice />
      <ContactBlock />
    </template>
  </SharedRessourcesView>
</template>

<script setup>
import SharedRessourcesView from '@/views/RessourcesView.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'
</script>
