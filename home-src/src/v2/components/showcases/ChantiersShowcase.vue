<template>
  <!-- Chantiers se montre en direct comme les trois autres : l'espace de
       travail est derriere invitation, mais son ecran d'accueil ouvre une
       demonstration sans compte, avec un jeu de donnees deja rempli. Le
       visiteur manipule donc le produit, pas une capture. -->
  <LiveEmbed :url="CHANTIERS_APP_URL" titre="Open Projets Chantiers, espace de travail en démonstration">
    L'espace de travail des permissions de voirie. Ouvrez « Essayer la démo » : un jeu de démonstration
    se met en place, sans compte, et vos essais restent sur votre appareil.
  </LiveEmbed>
</template>

<script setup>
import LiveEmbed from './LiveEmbed.vue'
import { CHANTIERS_APP_URL } from '../../data/modules.js'
</script>
