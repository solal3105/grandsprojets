<template>
  <LiveEmbed :url="url" titre="Carte des projets, espace de démonstration Métropole de Lyon">
L'espace de la Métropole de Lyon, tel que ses habitants le consultent. Ouvrez une catégorie, puis un projet.
  </LiveEmbed>
</template>
<script setup>
import LiveEmbed from './LiveEmbed.vue'
import { spaceUrl } from '@/data/siteUrls.js'
defineProps({ moduleKey: { type: String, default: 'carte' } })
const url = spaceUrl('default', 'carte')
</script>
