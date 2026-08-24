<template>
  <LiveEmbed city="default" module-key="carte" titre="Carte des projets, espace de démonstration Métropole de Lyon">
L'espace de la Métropole de Lyon, tel que ses habitants le consultent. Ouvrez une catégorie, puis un projet.
  </LiveEmbed>
</template>
<script setup>
import LiveEmbed from './LiveEmbed.vue'
defineProps({ moduleKey: { type: String, default: 'carte' } })
</script>
