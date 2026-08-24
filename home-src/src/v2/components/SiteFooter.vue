<template>
  <footer class="bg-dark text-white">
    <div class="max-w-container mx-auto px-6 pt-20 pb-8">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
        <div class="md:col-span-2">
          <LogoSvg variant="white" :width="46" :height="46" />
          <p class="mt-6 text-sm leading-relaxed text-white/60 max-w-sm">
            La plateforme cartographique des collectivités. Vous activez les modules dont vous avez
            besoin, vos habitants consultent sans compte ni application.
          </p>
        </div>

        <div>
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/60 mb-5">Modules</h4>
          <ul class="space-y-3">
            <li v-for="m in modules" :key="m.key">
              <router-link :to="`/modules/${m.key}`" class="text-sm text-white/70 hover:text-white transition-colors">
                {{ m.name }}
              </router-link>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="text-[13px] font-semibold uppercase tracking-wider text-white/60 mb-5">Open Projets</h4>
          <ul class="space-y-3">
            <li v-for="link in flatLinks" :key="link.label">
              <router-link
                v-if="link.to"
                :to="link.to"
                class="text-sm text-white/70 hover:text-white transition-colors"
              >{{ link.label }}</router-link>
              <a
                v-else
                :href="link.href"
                target="_blank" rel="noopener"
                class="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
              >
                {{ link.label }}
                <ArrowUpRight class="w-3 h-3 text-white/40" />
              </a>
            </li>
            <li>
              <router-link to="/confidentialite" class="text-sm text-white/70 hover:text-white transition-colors">
                Confidentialité et mesure d'audience
              </router-link>
            </li>
          </ul>
        </div>
      </div>

      <div class="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-xs text-white/70">© {{ year }} Open Projets by VAZY. Tous droits réservés.</p>
        <p class="text-xs text-white/60">Version de travail servie sous /home2/</p>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ArrowUpRight } from 'lucide-vue-next'
import LogoSvg from '@/components/LogoSvg.vue'
import { modules } from '../data/modules.js'
import { flatLinks } from '../data/nav.js'

const year = new Date().getFullYear()
</script>
