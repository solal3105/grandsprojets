<template>
  <div class="min-h-screen bg-white">
    <!-- Une page « document » (estimation budgétaire à imprimer) se passe de
         l'en-tête et du pied de page du site : elle porte les siens. Une page
         « écran » (la vidéo des salons) occupe tout l'écran. -->
    <SiteHeader v-if="!route.meta.document && !route.meta.ecran" />
    <main>
      <RouterView />
    </main>
    <SiteFooter v-if="!route.meta.document && !route.meta.ecran" />
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'

const route = useRoute()
</script>
