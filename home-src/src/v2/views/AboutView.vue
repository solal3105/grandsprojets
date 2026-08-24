<template>
  <!-- La vue est celle du site actuel : seul le bloc de clôture change. -->
  <SharedAboutView>
    <template #cta>
      <DemoChoice />
      <ContactBlock />
    </template>
  </SharedAboutView>
</template>

<script setup>
import SharedAboutView from '@/views/AboutView.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'
</script>
