<template>
  <LiveEmbed :url="url" titre="Module Participer, espace de démonstration">
Un espace où Participer est ouvert. Déposez un signalement, ou passez par Explorer pour lire ceux déjà publiés.
  </LiveEmbed>
</template>
<script setup>
import LiveEmbed from './LiveEmbed.vue'
import { spaceUrl } from '@/data/siteUrls.js'
defineProps({ moduleKey: { type: String, default: 'participer' } })
const url = spaceUrl('villedelyon', 'participer')
</script>
