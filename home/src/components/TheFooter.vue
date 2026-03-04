<template>
  <footer class="bg-dark text-white">
    <div class="max-w-container mx-auto px-6 pt-20 pb-8">
      <!-- Top row -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
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

        <!-- Legal -->
        <div>
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/40 mb-5">
            Légal
          </h4>
          <ul class="space-y-3">
            <li v-for="item in legalLinks" :key="item">
              <span class="text-sm text-white/70">{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom bar -->
      <div class="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-xs text-white/70">
          © 2026 Open Projets by VAZY. Tous droits réservés.
        </p>
        <div class="flex items-center gap-6">
          <a href="#" class="text-xs text-white/70 hover:text-white transition-colors">LinkedIn</a>
          <a href="#" class="text-xs text-white/70 hover:text-white transition-colors">GitHub</a>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import LogoSvg from './LogoSvg.vue'

const navLinks = [
  { to: '/', label: 'Accueil' },
  { to: '/fonctionnalites', label: 'Fonctionnalités' },
  { to: '/a-propos', label: 'À propos' },
  { to: '/contact', label: 'Contact' },
]

const legalLinks = ['Open Source', 'RGPD Conforme', 'Hébergement UE']
</script>
