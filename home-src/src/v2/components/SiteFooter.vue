<template>
  <!-- Pied de page partagé par toutes les vues de la v2 : il n'existe qu'ici,
       App.vue le monte une fois sous le router-view. Les colonnes lisent les
       mêmes sources que le reste du site (data/modules.js, data/nav.js,
       data/siteUrls.js) : aucun lien n'est recopié à la main. -->
  <footer class="bg-dark text-white">
    <div class="max-w-container mx-auto px-6 pt-20 pb-10">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-10 gap-y-14">
        <!-- La marque, ce qu'on fait, et où nous suivre. -->
        <div class="lg:col-span-4">
          <LogoSvg variant="white" :width="46" :height="46" />
          <p class="mt-6 text-sm leading-relaxed text-white/60 max-w-sm">
            La plateforme cartographique des collectivités. Vous activez les modules dont vous avez
            besoin, vos habitants consultent sans compte ni application.
          </p>

          <div class="mt-8 flex items-center gap-3">
            <a
              v-for="s in reseaux" :key="s.label"
              :href="s.url" target="_blank" rel="noopener"
              :aria-label="s.label" :title="s.label"
              class="w-10 h-10 rounded-full border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:border-white/40 hover:bg-white/5 transition-colors duration-200"
            >
              <component :is="s.icon" class="w-[18px] h-[18px]" />
            </a>
          </div>
        </div>

        <div class="lg:col-span-2">
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/40 mb-5">Les modules</h4>
          <ul class="space-y-3">
            <li v-for="m in modules" :key="m.key">
              <router-link :to="`/modules/${m.key}`" class="text-sm text-white/70 hover:text-white transition-colors duration-200">
                {{ m.name }}
              </router-link>
            </li>
          </ul>
        </div>

        <div class="lg:col-span-2">
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/40 mb-5">Open Projets</h4>
          <ul class="space-y-3">
            <li v-for="link in flatLinks" :key="link.label">
              <router-link :to="link.to" class="text-sm text-white/70 hover:text-white transition-colors duration-200">
                {{ link.label }}
              </router-link>
            </li>
            <li>
              <router-link :to="CONTACT_URL" class="text-sm text-white/70 hover:text-white transition-colors duration-200">
                Nous écrire
              </router-link>
            </li>
            <li>
              <router-link to="/confidentialite" class="text-sm text-white/70 hover:text-white transition-colors duration-200">
                Confidentialité
              </router-link>
            </li>
          </ul>
        </div>

        <!-- Le produit en service, plutôt qu'une page qui en parle. -->
        <div class="lg:col-span-4">
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/40 mb-5">Voir le produit</h4>
          <ul class="space-y-3">
            <li v-for="v in vitrines" :key="v.url">
              <a
                :href="v.url" target="_blank" rel="noopener"
                class="group inline-flex items-baseline gap-1.5 text-sm text-white/70 hover:text-white transition-colors duration-200"
              >
                {{ v.label }}
                <ArrowUpRight class="w-3.5 h-3.5 shrink-0 self-center text-white/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div class="mt-16 border-t border-white/10 pt-6 flex flex-col items-center gap-4 text-xs text-white/60 sm:flex-row sm:justify-between">
        <p>© {{ year }} Open Projets by VAZY, société à mission inscrite au RCS de Lyon.</p>
        <p class="group inline-flex items-center gap-1.5">
          Fait à Villeurbanne avec
          <Heart class="w-3.5 h-3.5 text-primary fill-current transition-transform duration-300 group-hover:scale-125" />
        </p>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ArrowUpRight, Heart, Linkedin, Github } from 'lucide-vue-next'
import LogoSvg from '@/components/LogoSvg.vue'
import { modules, CHANTIERS_URL, ARRETE_URL } from '../data/modules.js'
import { flatLinks, CONTACT_URL } from '../data/nav.js'
import { DEMO_KIOSK_URL, MAP_LYON_URL } from '@/data/siteUrls.js'

const year = new Date().getFullYear()

/* Les deux comptes qui existent réellement. On n'affiche pas une icône vers un
 * réseau où nous ne publions rien : un lien mort dans un pied de page se voit. */
const reseaux = [
  { label: 'Open Projets sur LinkedIn', icon: Linkedin, url: 'https://www.linkedin.com/company/vazyapp/posts/?feedView=all' },
  { label: 'Le code source sur GitHub', icon: Github, url: 'https://github.com/solal3105/grandsprojets' },
]

const vitrines = [
  { label: 'La carte de la Métropole de Lyon', url: MAP_LYON_URL },
  { label: 'Construire la carte de votre commune', url: DEMO_KIOSK_URL },
  { label: 'Open Projets Chantiers', url: CHANTIERS_URL },
  { label: 'Générer un arrêté de voirie, sans compte', url: ARRETE_URL },
]
</script>
