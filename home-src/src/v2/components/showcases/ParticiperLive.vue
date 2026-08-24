<template>
  <LiveEmbed city="villedelyon" module-key="participer" titre="Module Participer, espace de démonstration">
Un espace où Participer est ouvert. Déposez un signalement, ou passez par Explorer pour lire ceux déjà publiés.
  </LiveEmbed>
</template>
<script setup>
import LiveEmbed from './LiveEmbed.vue'
defineProps({ moduleKey: { type: String, default: 'participer' } })
</script>
