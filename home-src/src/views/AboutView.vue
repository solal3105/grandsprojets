<template>
  <div>
    <!-- Hero -->
    <section class="relative bg-gray-bg pt-36 pb-20 overflow-hidden">
      <PageBlobs top="blob-amber" bottom="blob-green" top-offset="-70px" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[768px]">
          <EyebrowLabel>À propos</EyebrowLabel>
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Un outil français,
            <span class="text-gradient-green"> pour l'intérêt public</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[540px]">
            Développé à Lyon, hébergé en Europe, code public. Open Projets est conçu par une Société à Mission française - sans traceurs, sans ambiguïté sur vos données.
          </p>
        </div>
      </div>
    </section>

    <!-- 3 piliers : Français, Souverain, Ouvert -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 reveal" :ref="(el) => { revealEls[0] = el }">
          <div
            v-for="(pillar, i) in pillars"
            :key="i"
            :ref="(el) => { els[i] = el }"
            class="card-tilt"
            @mousemove="(e) => onMove(e, i)"
            @mouseleave="onLeave(i)"
          >
            <div class="group relative rounded-2xl border border-gray-border p-8 h-full overflow-hidden transition-shadow duration-300 hover:shadow-xl">
              <!-- Glare -->
              <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="shines[i]" />
              <!-- Top accent line -->
              <div
                class="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-2xl"
                :style="{ background: pillar.accentGradient }"
              />
              <div class="relative z-20">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110" :class="pillar.bgClass">
                  <component :is="pillar.icon" class="w-6 h-6" :class="pillar.iconClass" />
                </div>
                <h3 class="font-heading font-bold text-xl text-dark mb-3">{{ pillar.title }}</h3>
                <p class="text-sm text-gray-text leading-relaxed mb-5">{{ pillar.desc }}</p>
                <div class="flex flex-wrap gap-2">
                  <span v-for="tag in pillar.tags" :key="tag" class="text-xs text-gray-text bg-gray-bg border border-gray-border px-2.5 py-1 rounded-full transition-all duration-200 hover:-translate-y-px hover:shadow-sm cursor-default">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Qui sommes-nous ? -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Qui sommes-nous ?
        </h2>
        <p class="mt-6 text-gray-text text-base leading-relaxed max-w-[600px]">
          Open Projets est développé par <strong class="text-dark">VAZY</strong>, une entreprise lyonnaise, Société à Mission inscrite au RCS de Lyon.
        </p>

        <div
          class="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start reveal" :ref="(el) => { revealEls[1] = el }"
        >
          <!-- Vazy card -->
          <div class="bg-white rounded-2xl border border-gray-border p-8 sm:p-10 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
            <div class="flex items-center gap-5 mb-6">
              <img :src="`${base}img/logo-vazy.png`" alt="Vazy" class="h-14 w-auto" />
              <div>
                <h3 class="font-heading font-bold text-xl text-dark">VAZY</h3>
                <span class="inline-flex items-center gap-1.5 mt-1 text-xs font-medium text-green bg-green/10 px-2.5 py-1 rounded-full">
                  <Heart class="w-3 h-3" />
                  Société à Mission
                </span>
              </div>
            </div>

            <p class="text-sm text-gray-text leading-relaxed mb-4">
              Fondée à Lyon, VAZY est une <strong class="text-dark">Société à Mission</strong> au sens de la loi PACTE, avec des engagements sociaux et environnementaux inscrits dans ses statuts - vérifiables publiquement au RCS de Lyon.
            </p>

            <p class="text-sm text-gray-text leading-relaxed mb-4">
              Open Projets est le produit phare de VAZY - conçu pour rendre l’action des collectivités <strong class="text-dark">lisible, accessible et vérifiable</strong> par chaque habitant.
            </p>

            <div class="flex flex-wrap gap-3 mt-6">
              <span class="inline-flex items-center gap-1.5 text-xs text-gray-text bg-white border border-gray-border px-3 py-1.5 rounded-full">
                <MapPinIcon class="w-3.5 h-3.5 text-primary" />
                Lyon / Villeurbanne
              </span>
              <span class="inline-flex items-center gap-1.5 text-xs text-gray-text bg-white border border-gray-border px-3 py-1.5 rounded-full">
                <Building class="w-3.5 h-3.5 text-purple" />
                SASU - RCS Lyon
              </span>
              <span class="inline-flex items-center gap-1.5 text-xs text-gray-text bg-white border border-gray-border px-3 py-1.5 rounded-full">
                <ShieldCheck class="w-3.5 h-3.5 text-green" />
                Société à Mission
              </span>
            </div>
          </div>

          <!-- Why Vazy × Open Projets -->
          <div class="space-y-6">
            <div
              v-for="(item, i) in whyVazy"
              :key="i"
              class="flex items-start gap-4 group/why cursor-default"
            >
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover/why:scale-110" :class="item.bgClass">
                <component :is="item.icon" class="w-[18px] h-[18px]" :class="item.iconClass" />
              </div>
              <div>
                <h4 class="font-heading font-semibold text-sm text-dark mb-1">{{ item.title }}</h4>
                <p class="text-sm text-gray-text leading-relaxed transition-transform duration-200 group-hover/why:translate-x-0.5">{{ item.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <CtaSection
      heading="Déployez votre carte"
      heading-line2="pour votre territoire"
      heading-gradient="text-gradient-green"
      subtitle="Demandez une démo personnalisée et découvrez Open Projets en quelques minutes."
    />
  </div>
</template>

<script setup>
import {
  MapPin, GitBranch, ShieldCheck,
  Code, Heart,
  Building, MapPin as MapPinIcon, Users, Leaf,
} from 'lucide-vue-next'
import { useTilt } from '@/composables/useTilt.js'
import { useScrollReveal } from '@/composables/useScrollReveal.js'
import PageBlobs from '@/components/PageBlobs.vue'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import CtaSection from '@/components/CtaSection.vue'

const base = import.meta.env.BASE_URL

const { els, shines, onMove, onLeave } = useTilt(3, { rotateMax: 6 })
const { revealEls } = useScrollReveal()

const pillars = [
  {
    icon: MapPin,
    title: 'Entreprise française',
    desc: 'Créée à Lyon, inscrite au RCS, équipe basée en France. La prise de décision est locale, la réactivité est réelle. Aucun capital étranger, aucune dépendance à un acteur américain.',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
    accentGradient: 'linear-gradient(to right, #FF0037, #F2B327)',
    tags: ['Lyon / Villeurbanne', 'SASU - RCS Lyon', 'Équipe locale'],
  },
  {
    icon: ShieldCheck,
    title: 'Données souveraines',
    desc: 'Hébergement en Europe, zéro traceur, zéro publicité. Vos données appartiennent à votre collectivité - exportables et auditables à tout moment. Conformité RGPD native.',
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
    accentGradient: 'linear-gradient(to right, #5AAB7D, #2563EB)',
    tags: ['Hébergement UE', 'Zéro traceur', 'RGPD natif'],
  },
  {
    icon: GitBranch,
    title: 'Open source par conviction',
    desc: 'Code source public sous licence ouverte. Toute modification est vérifiable. Aucune boîte noire, aucun enfermement propriétaire. Vous n\' êtes jamais captif.',
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
    accentGradient: 'linear-gradient(to right, #4E2BFF, #7C3AED)',
    tags: ['GitHub public', 'Licence permissive', 'Auditable'],
  },
]

const whyVazy = [
  {
    icon: Leaf,
    title: 'Engagement statué',
    desc: 'VAZY est une Société à Mission au sens de la loi PACTE. Ses obligations sociales et environnementales sont inscrites dans ses statuts - vérifiables publiquement au RCS de Lyon.',
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
  },
  {
    icon: Users,
    title: 'Un seul interlocuteur',
    desc: 'Configuration initiale, personnalisation, formation des équipes, support technique : une seule équipe gère l\'ensemble du déploiement. Pas de prestataire intermédiaire.',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
  },
  {
    icon: Code,
    title: 'Indépendance garantie',
    desc: 'Le code est ouvert, la licence permissive. Vous pouvez auditer, modifier ou reprendre le projet indépendamment. Aucun enfermement propriétaire possible.',
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
  },
  {
    icon: ShieldCheck,
    title: 'Données sous votre contrôle',
    desc: 'Hébergement en Europe, conformité RGPD, export complet à tout moment. Vos données restent vôtres - même si vous résiliez demain.',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
  },
]
</script>

<style scoped>
.card-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}

.reveal {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.65s ease, transform 0.65s cubic-bezier(0.23, 1, 0.32, 1);
}
.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
</style>
