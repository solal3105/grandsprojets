<template>
  <footer class="bg-dark text-white">
    <div class="max-w-container mx-auto px-6 pt-20 pb-8">
      <!-- Top row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12 mb-16">
        <!-- Brand -->
        <div>
          <LogoSvg variant="white" :width="46" :height="46" />
          <p class="mt-6 text-sm leading-relaxed text-white/60 max-w-sm">
            Open Projets transforme les données publiques en information citoyenne, accessible et transparente pour tous.
          </p>
        </div>

        <!-- Navigation -->
        <div>
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/40 mb-5">
            Navigation
          </h4>
          <ul class="space-y-3">
            <li v-for="link in navLinks" :key="link.to">
              <router-link
                :to="link.to"
                class="text-sm text-white/70 hover:text-white transition-colors"
              >
                {{ link.label }}
              </router-link>
            </li>
          </ul>
        </div>

        <!-- Explorer : les pages publiques hors du site vitrine. Elles ne sont
             reliées nulle part ailleurs depuis ici, et c'est le pied de page
             qui porte le plus de liens entrants du site. -->
        <div>
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/40 mb-5">
            Explorer
          </h4>
          <ul class="space-y-3">
            <li v-for="link in exploreLinks" :key="link.href">
              <a
                :href="link.href"
                class="text-sm text-white/70 hover:text-white transition-colors"
              >
                {{ link.label }}
              </a>
            </li>
          </ul>
        </div>

        <!-- Legal -->
        <div>
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/40 mb-5">
            Légal
          </h4>
          <ul class="space-y-3">
            <li v-for="item in legalLinks" :key="item">
              <span class="text-sm text-white/70">{{ item }}</span>
            </li>
            <li>
              <router-link
                to="/confidentialite"
                class="text-sm text-white/70 hover:text-white transition-colors"
              >
                Confidentialité et mesure d'audience
              </router-link>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-xs text-white/70">
          © {{ new Date().getFullYear() }} Open Projets by VAZY. Tous droits réservés.
        </p>
        <div class="flex items-center gap-6">
          <a href="https://www.linkedin.com/company/vazyapp/posts/?feedView=all" target="_blank" class="text-xs text-white/70 hover:text-white transition-colors">LinkedIn</a>
          <a href="https://github.com/solal3105/grandsprojets" target="_blank" class="text-xs text-white/70 hover:text-white transition-colors">GitHub</a>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import LogoSvg from './LogoSvg.vue'
import { navLinks } from '@/data/navLinks.js'
import { MAP_LYON_URL, DEMO_KIOSK_URL, VILLES_URL, CARTES_URL } from '@/data/siteUrls.js'

const legalLinks = ['Open Source', 'RGPD Conforme', 'Hébergement UE']

const exploreLinks = [
  { href: MAP_LYON_URL, label: 'La carte de la Métropole de Lyon' },
  { href: VILLES_URL, label: 'Les projets urbains par ville' },
  { href: CARTES_URL, label: 'Les cartes des communes' },
  { href: DEMO_KIOSK_URL, label: 'Générer la carte de ma commune' },
]
</script>
