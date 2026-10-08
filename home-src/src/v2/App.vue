<template>
  <div class="min-h-screen bg-white">
    <!-- Une page « document » (estimation budgétaire à imprimer) se passe de
         l'en-tête et du pied de page du site : elle porte les siens. Une page
         « écran » (la vidéo des salons) occupe tout l'écran. -->
    <SiteHeader v-if="!route.meta.document && !route.meta.ecran && !dansLeSalon" />
    <main>
      <RouterView />
    </main>
    <SiteFooter v-if="!route.meta.document && !route.meta.ecran && !dansLeSalon" />
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'

const route = useRoute()

/* Dans l'écran du salon (/video), une page du site s'ouvre dans son cadre avec
   ?salon=1 : la barre du salon porte le titre et le seul bouton de retour, le
   site n'y affiche ni son en-tête ni son pied. Lu une fois au chargement, pour
   que la navigation dans la page (ancres, réglages) ne les fasse pas revenir.
   Ouverte seule, la page les garde. */
const dansLeSalon = new URLSearchParams(window.location.search).get('salon') === '1' && window.self !== window.top
</script>
