<template>
  <!-- Le corps du guide vient de la vue partagee ; la fin est celle de la
       version 2 : ce que le guide donne en pratique, puis la suite d'outils,
       puis l'essai sur sa propre commune. -->
  <SharedRessourceArticleView>
    <template #solution="{ contenu }">
      <SuiteOutils v-bind="contenu" />
    </template>

    <template #cta>
      <DemoChoice />
    </template>
  </SharedRessourceArticleView>
</template>

<script setup>
import SharedRessourceArticleView from '@/views/RessourceArticleView.vue'
import SuiteOutils from '../components/SuiteOutils.vue'
import DemoChoice from '../components/DemoChoice.vue'
</script>
