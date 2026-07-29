<template>
  <div v-if="alt">
    <!-- Hero + démonstration live -->
    <section class="relative bg-gray-bg pt-36 pb-20 overflow-hidden">
      <PageBlobs top="blob-red" bottom="blob-purple" top-offset="-90px" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[860px] mx-auto text-center">
          <EyebrowLabel>{{ alt.hero.eyebrow }}</EyebrowLabel>
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[60px] leading-[1.05] tracking-tight-hero text-dark">
            {{ alt.hero.titleLine1 }}
            <br />
            <span :class="alt.hero.gradient">{{ alt.hero.titleLine2 }}</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[640px] mx-auto">
            {{ alt.hero.intro }}
          </p>

          <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#tester"
              v-tilt-btn
              class="group inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-all duration-200 shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
            >
              Demander une démo
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </a>
            <a
              href="https://openprojets.com/default"
              target="_blank"
              v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
            >
              <MapIcon class="w-4 h-4 text-primary" />
              Voir des exemples réels
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
            </a>
          </div>
        </div>

        <!-- Démonstration live : montre immédiatement ce que fait Open Projets -->
        <div class="mt-14">
          <MapShowcase />
        </div>
      </div>
    </section>

    <!-- C'est quoi Open Projets : clarifie le produit en 4 piliers -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[680px] mb-14">
          <EyebrowLabel>Concrètement</EyebrowLabel>
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-tight tracking-tight text-dark">
            Open Projets, c'est la carte
            <span class="text-gradient">de vos projets de territoire</span>
          </h2>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed">
            Une plateforme pensée pour les collectivités : vous publiez vos projets d'aménagement et vos chantiers,
            vos habitants les consultent sur une carte claire - sans inscription, sans application.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            v-for="(pillar, i) in pillars"
            :key="i"
            class="group rounded-2xl border border-gray-border p-7 h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
          >
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
              :class="pillar.bg"
            >
              <component :is="pillar.icon" class="w-6 h-6" :class="pillar.accent" />
            </div>
            <h3 class="font-heading font-semibold text-lg text-dark mb-2.5 leading-snug">{{ pillar.title }}</h3>
            <p class="text-sm text-gray-text leading-relaxed">{{ pillar.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Contexte concurrent : reconnaît honnêtement ses atouts -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div>
            <EyebrowLabel>Soyons justes</EyebrowLabel>
            <h2 class="font-heading font-bold text-2xl sm:text-3xl lg:text-[38px] leading-tight tracking-tight text-dark">
              {{ alt.context.title }}
            </h2>
            <p class="mt-6 text-gray-text text-base leading-relaxed">{{ alt.context.intro }}</p>
          </div>

          <ul class="space-y-3.5 lg:pt-4">
            <li
              v-for="(strength, i) in alt.context.strengths"
              :key="i"
              class="flex items-start gap-3.5 bg-white rounded-xl border border-gray-border px-5 py-4"
            >
              <Check class="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span class="text-sm text-gray-text leading-relaxed">{{ strength }}</span>
            </li>
          </ul>
        </div>

        <!-- Le pont : là où Open Projets prend le relais -->
        <div class="mt-14 relative overflow-hidden rounded-2xl bg-dark p-8 sm:p-12">
          <div class="absolute top-1/2 right-0 -translate-y-1/2 w-[420px] h-[420px] blob-red blur-[140px] opacity-30 rounded-full pointer-events-none" />
          <div class="relative max-w-[760px]">
            <div class="inline-flex items-center gap-2 mb-5">
              <span class="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <ArrowRight class="w-4 h-4 text-primary" />
              </span>
              <span class="text-xs font-bold uppercase tracking-widest text-primary">{{ alt.bridge.title }}</span>
            </div>
            <p class="text-white/85 text-lg sm:text-xl leading-relaxed font-light">{{ alt.bridge.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Showcase produit avec illustrations réelles -->
    <FeatureSection
      v-for="feat in showcase"
      :key="feat.badge"
      :bg="feat.bg"
      :icon="feat.icon"
      :icon-bg="feat.iconBg"
      :accent="feat.accent"
      :badge="feat.badge"
      :title="feat.title"
      :description="feat.description"
      :feats="feat.feats"
      :img-src="feat.imgSrc"
      :img-alt="feat.imgAlt"
      :reversed="feat.reversed"
    />

    <!-- Tableau comparatif (équilibré) -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[680px] mb-12">
          <EyebrowLabel>En un coup d'œil</EyebrowLabel>
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-tight tracking-tight text-dark">
            {{ alt.comparison.title }}
          </h2>
          <p class="mt-5 text-gray-text text-base leading-relaxed">{{ alt.comparison.intro }}</p>
        </div>

        <div class="overflow-hidden rounded-2xl border border-gray-border bg-white shadow-lg shadow-black/5">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-border">
                <th class="text-left font-medium text-gray-text px-5 py-4 w-2/5"></th>
                <th class="text-left font-heading font-bold text-dark px-5 py-4 bg-primary/[0.04]">
                  Open Projets
                </th>
                <th class="text-left font-medium text-gray-text px-5 py-4">
                  {{ alt.comparison.competitorLabel }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in alt.comparison.rows"
                :key="i"
                class="border-b border-gray-border/60 last:border-0"
              >
                <td class="px-5 py-4 text-gray-text">{{ row.label }}</td>
                <td class="px-5 py-4 bg-primary/[0.03]">
                  <span class="inline-flex items-center gap-2 font-medium text-dark">
                    <Check class="w-4 h-4 text-green shrink-0" />
                    {{ row.op }}
                  </span>
                </td>
                <td class="px-5 py-4">
                  <span v-if="row.comp === false" class="inline-flex items-center gap-1.5 text-gray-400">
                    <Minus class="w-4 h-4 shrink-0" />
                    Non proposé
                  </span>
                  <span v-else class="text-gray-text">{{ row.comp }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Note coexistence (positive) -->
        <div class="mt-10 flex items-start gap-4 rounded-2xl bg-white border border-gray-border p-6 sm:p-8 max-w-[860px]">
          <span class="w-10 h-10 rounded-xl bg-green/10 flex items-center justify-center shrink-0">
            <Puzzle class="w-5 h-5 text-green" />
          </span>
          <div>
            <h3 class="font-heading font-bold text-base text-dark mb-1.5">{{ alt.coexist.title }}</h3>
            <p class="text-sm text-gray-text leading-relaxed">{{ alt.coexist.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA : demande de démonstration -->
    <section id="tester" class="py-24 bg-dark scroll-mt-20 relative overflow-hidden">
      <div class="absolute top-0 right-0 w-[500px] h-[500px] blob-purple blur-[160px] opacity-20 rounded-full pointer-events-none" />
      <div class="relative max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-white">
              Demandez une démonstration
              <br />
              <span class="text-gradient">d'Open Projets</span>
            </h2>
            <p class="mt-6 text-white/60 text-base leading-relaxed max-w-[460px]">
              On configure votre carte ensemble. Démonstration personnalisée sous 48h, sans engagement.
            </p>
            <div class="mt-10 flex flex-col gap-4">
              <div
                v-for="(item, i) in trustItems"
                :key="i"
                class="flex items-center gap-4"
              >
                <div class="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center">
                  <component :is="item.icon" class="w-[18px] h-[18px] text-white/70" />
                </div>
                <span class="text-sm text-white/70">{{ item.label }}</span>
              </div>
            </div>
          </div>

          <DemoRequestForm
            :referrer="alt.referrer"
            :id-prefix="alt.slug"
            submit-label="Demander une démo"
          />
        </div>
      </div>
    </section>


  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  ArrowRight, ArrowUpRight, MapIcon, Map, FileText, HardHat, QrCode,
  Check, Minus, Puzzle, Pencil, Palette, Users, ShieldCheck, Wallet, UserCircle,
} from 'lucide-vue-next'
import { alternatives } from '@/data/alternatives.js'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import PageBlobs from '@/components/PageBlobs.vue'
import MapShowcase from '@/components/MapShowcase.vue'
import FeatureSection from '@/components/FeatureSection.vue'
import DemoRequestForm from '@/components/DemoRequestForm.vue'

const base = import.meta.env.BASE_URL
const route = useRoute()
const alt = computed(() => alternatives[route.meta.altKey])

// Le produit Open Projets - identique quel que soit le concurrent.
const pillars = [
  {
    icon: Map,
    bg: 'bg-primary/10',
    accent: 'text-primary',
    title: 'Une carte publique',
    desc: 'Tous vos projets localisés sur une carte à vos couleurs. Recherche, filtres, catégories - sans inscription.',
  },
  {
    icon: FileText,
    bg: 'bg-amber/10',
    accent: 'text-amber',
    title: 'Une fiche par projet',
    desc: 'Photo, description, statut et calendrier. Une page dédiée et partageable pour chaque projet.',
  },
  {
    icon: HardHat,
    bg: 'bg-blue-500/10',
    accent: 'text-blue-500',
    title: 'Un module travaux',
    desc: "Dessinez les zones de chantier, indiquez les dates et l'avancement. Vos riverains savent quoi, où, quand.",
  },
  {
    icon: QrCode,
    bg: 'bg-green/10',
    accent: 'text-green',
    title: 'Sans application',
    desc: "Accessible d'un lien, d'un QR code ou en iframe sur votre site. Vos habitants n'installent rien.",
  },
]

// Démonstration des fonctionnalités avec les illustrations réelles du produit.
const showcase = [
  {
    bg: 'bg-white',
    icon: Pencil,
    iconBg: 'bg-primary/10',
    accent: 'text-primary',
    badge: 'Back-office no-code',
    title: 'Vos équipes publient en quelques clics',
    description: "Géolocalisez le projet, rédigez la fiche, ajoutez une photo : aucune compétence technique, aucune dépendance à un prestataire. Vos agents sont autonomes dès le premier jour.",
    feats: [
      'Interface pensée pour les équipes non techniques',
      'Publication et mise à jour en autonomie',
      'Gestion des accès par agent et par territoire',
    ],
    imgSrc: `${base}img/features/feature-projects.jpeg`,
    imgAlt: 'Interface de gestion de projets sur fond de carte',
    reversed: false,
  },
  {
    bg: 'bg-gray-bg',
    icon: Palette,
    iconBg: 'bg-amber/10',
    accent: 'text-amber',
    badge: 'Marque blanche',
    title: 'La carte adopte votre identité',
    description: "Couleurs, logotype, favicon et fond de carte : votre espace reprend automatiquement la charte de votre collectivité. La carte est à votre nom, sur votre domaine - elle vous appartient.",
    feats: [
      'Charte graphique appliquée sur chaque écran',
      'Votre domaine, votre logo, vos catégories',
      'Une carte qui valorise votre action publique',
    ],
    imgSrc: `${base}img/features/feature-branding.jpeg`,
    imgAlt: 'Personnalisation visuelle de la carte avec palette et composants',
    reversed: true,
  },
  {
    bg: 'bg-white',
    icon: Users,
    iconBg: 'bg-blue-500/10',
    accent: 'text-blue-500',
    badge: 'Consultation citoyenne',
    title: 'Vos habitants consultent sans compte',
    description: "Carte publique, sans inscription, sans téléchargement. Un QR code sur la palissade ou un lien sur le site de la mairie suffit pour ouvrir la fiche d'un chantier - pour tout le monde, immédiatement.",
    feats: [
      'Aucune inscription, aucune application',
      'Accessible par lien, QR code ou iframe',
      'Information permanente, pas un flux éphémère',
    ],
    imgSrc: `${base}img/features/feature-consultation.jpeg`,
    imgAlt: 'Vue cartographique orientée consultation citoyenne',
    reversed: false,
  },
]

const trustItems = [
  { icon: ShieldCheck, label: 'RGPD conforme, hébergement européen' },
  { icon: Wallet, label: 'Tarif transparent, aucun frais caché' },
  { icon: UserCircle, label: 'Démonstration personnalisée sous 48h' },
]
</script>
