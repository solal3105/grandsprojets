<template>
  <LiveEmbed city="default" module-key="travaux" titre="Module Travaux, espace de démonstration Métropole de Lyon">
Le module Travaux du même espace. Déplacez le curseur de la chronologie : la carte se filtre avec lui.
  </LiveEmbed>
</template>
<script setup>
import LiveEmbed from './LiveEmbed.vue'
defineProps({ moduleKey: { type: String, default: 'travaux' } })
</script>
