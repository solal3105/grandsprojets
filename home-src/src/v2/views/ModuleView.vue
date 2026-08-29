<template>
  <div v-if="mod">
    <!-- Ouverture -->
    <section class="relative pt-36 pb-20 overflow-hidden">
      <HeroGround :teinte="mod.teinte" />
      <div class="relative max-w-container mx-auto px-6">
        <router-link to="/#modules" class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-text hover:text-dark transition-colors">
          <ArrowLeft class="w-3.5 h-3.5" />
          Tous les modules
        </router-link>

        <div class="mt-8 max-w-[820px] mx-auto text-center">
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[52px] leading-[1.06] tracking-tight-hero text-dark">
            {{ mod.h1 }}
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[620px] mx-auto">{{ mod.tagline }}</p>

          <div class="mt-10 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4">
            <router-link
              :to="{ hash: '#contact' }" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-primary-ink text-white text-sm font-medium px-6 py-3.5 rounded-full hover:bg-red-700 transition-colors"
            >
              Demander une démo
              <ArrowRight class="w-3.5 h-3.5" />
            </router-link>
            <a
              v-if="mod.aussi" :href="mod.aussi.url"
              target="_blank" rel="noopener" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-6 py-3.5 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
            >
              {{ mod.aussi.label }}
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
            </a>
            <a
              v-if="mod.live" :href="mod.live.url"
              target="_blank" rel="noopener" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-6 py-3.5 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
            >
              {{ mod.live.label }}
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
            </a>
          </div>

          <!-- Un module dont l'espace de travail est ailleurs le dit ici, pas
               dans une section separee qui en ferait un autre produit. -->
          <p v-if="mod.note" class="mt-5 text-xs text-gray-muted leading-relaxed max-w-[560px] mx-auto">
            {{ mod.note }}
          </p>
        </div>

        <div v-if="showcases[mod.showcase]" class="mt-14 sm:mt-16 max-w-[1040px] mx-auto">
          <component :is="showcases[mod.showcase]" :module-key="mod.key" />
        </div>
      </div>
    </section>

    <!-- Le problème -->
    <section class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <p class="font-heading font-semibold text-2xl sm:text-3xl lg:text-[34px] text-dark leading-snug max-w-[820px]">
          {{ mod.problem }}
        </p>
      </div>
    </section>

    <!-- Les fonctions, une par planche, dans la couleur et la figure du
         module. Meme composition que l'accueil : ici aussi, ce qu'on montre
         vaut mieux que ce qu'on decrit.

         C'est la meme composition que l'accueil : ici aussi, ce qu'on
         montre vaut mieux que ce qu'on decrit. -->
    <div ref="conteneur">
      <PlancheSection
        v-for="(f, i) in mod.features" :key="f.titre"
        :tone="mod.tone" :forme="mod.forme" :capture="f.capture" :inverse="i % 2 === 1"
      >
        <span class="block text-[11px] font-semibold uppercase tracking-[0.2em]" :class="mod.tone.text">
          {{ f.etiquette }}
        </span>
        <h2 class="mt-4 font-heading font-bold text-2xl sm:text-3xl lg:text-[36px] leading-[1.1] tracking-tight text-dark max-w-[560px]">
          {{ f.titre }}
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">{{ f.texte }}</p>
        <ul class="mt-8 space-y-3.5 max-w-[520px]">
          <li v-for="p in f.points" :key="p" class="flex items-start gap-3">
            <Check class="w-4 h-4 shrink-0 mt-1" :class="mod.tone.text" />
            <span class="text-base text-gray-text leading-relaxed">{{ p }}</span>
          </li>
        </ul>
      </PlancheSection>
    </div>

    <!-- Ce que les modules se donnent les uns aux autres -->
    <section class="py-20 sm:py-28 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          {{ mod.titres.combine }}
        </h2>
        <p class="mt-5 text-gray-text text-base leading-relaxed max-w-[720px]">{{ mod.linkedTo }}</p>

        <!-- Les quatre autres modules, toujours les quatre et toujours dans le
             meme ordre : d'une page module a l'autre, on retrouve la meme
             table des matieres. Une ligne par module, la couleur seulement
             sur la pastille et le nom, aucune illustration : cet encart est
             un sommaire, pas une vitrine. -->
        <div class="mt-12 sm:mt-14 bg-white rounded-3xl border border-gray-border overflow-hidden">
          <router-link
            v-for="autre in autresModules" :key="autre.key"
            :to="`/modules/${autre.key}`"
            class="group relative overflow-hidden grid grid-cols-1 md:grid-cols-[236px_1fr_auto] items-start md:items-center gap-3 md:gap-8
                   px-6 sm:px-8 py-6 border-b border-gray-border last:border-b-0 hover:border-transparent transition-colors duration-300"
          >
            <!-- Au survol, la ligne prend la couleur du module et sa figure,
                 comme les socles de l'accueil. Au repos, rien : l'encart reste
                 un sommaire. -->
            <span
              class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              :class="autre.tone.socle"
            >
              <SocleFormes :forme="autre.forme" compact />
              <!-- Voile pose par-dessus la figure : sans lui, une phrase en
                   blanc qui traverse le triangle ou l'etoile tombe a 3,7 pour
                   un sur l'ocre. Avec, le pire cas des cinq couleurs remonte a
                   4,6 pour un, au-dessus du seuil de lisibilite. -->
              <span class="absolute inset-0 bg-black/[0.12]" />
            </span>

            <span class="relative flex items-center gap-3">
              <span
                class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:bg-white/20"
                :class="autre.tone.bg"
              >
                <component :is="autre.icon" class="w-4 h-4 transition-colors duration-300 group-hover:text-white" :class="autre.tone.text" />
              </span>
              <span
                class="font-heading font-bold text-lg leading-none tracking-tight-name transition-colors duration-300 group-hover:text-white"
                :class="autre.tone.text"
              >
                {{ autre.name }}
              </span>
            </span>
            <span class="relative text-base text-gray-text leading-relaxed transition-colors duration-300 group-hover:text-white">
              {{ autre.lien }}
            </span>
            <ArrowRight class="relative hidden md:block w-4 h-4 text-gray-400 transition-all duration-200 group-hover:text-white group-hover:translate-x-1" />
          </router-link>
        </div>
      </div>
    </section>

    <DemoChoice />
    <ContactBlock />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from 'lucide-vue-next'
import HeroGround from '../components/HeroGround.vue'
import PlancheSection from '../components/PlancheSection.vue'
import { useParallaxe } from '../composables/useParallaxe.js'
import SocleFormes from '../components/SocleFormes.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'
import { modules, moduleByKey } from '../data/modules.js'
import { showcases } from '../components/showcases/index.js'

const route = useRoute()
const router = useRouter()

const conteneur = ref(null)
useParallaxe(conteneur)

const mod = computed(() => moduleByKey[route.params.key] || null)

/* Les autres modules, pris dans l'ordre du catalogue et non dans celui des
 * phrases : c'est ce qui fait que l'encart se lit pareil sur les cinq pages.
 * Chacun porte la phrase qui le relie a celui qu'on est en train de lire. */
const autresModules = computed(() => {
  const courant = mod.value
  if (!courant) return []
  return modules
    .filter((m) => m.key !== courant.key)
    .map((m) => ({ ...m, lien: courant.synergies.find((s) => s.vers === m.key)?.texte }))
    .filter((m) => m.lien)
})

// Clé inconnue : l'accueil plutôt qu'une page vide
if (!mod.value) router.replace('/')
</script>
