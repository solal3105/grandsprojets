<template>
  <!-- L'outil lui-meme, en direct : l'adresse, le nom du cadre et la consigne
       viennent de la fiche du module (data/modules.js), la meme que celle
       qu'ouvre l'ecran du salon. -->
  <LiveEmbed :url="demo.url" :titre="demo.titre">{{ demo.consigne }}</LiveEmbed>
</template>

<script setup>
import LiveEmbed from './LiveEmbed.vue'
import { modules } from '../../data/modules.js'

const props = defineProps({ moduleKey: { type: String, required: true } })
const demo = modules.find((m) => m.key === props.moduleKey).demo
</script>
