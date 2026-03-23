<template>
  <div>
    <!-- Hero -->
    <section class="relative bg-gray-bg pt-36 pb-24 overflow-hidden">
      <div class="absolute top-[-70px] right-[-60px] w-[700px] h-[700px] blob-purple opacity-40 blur-[120px] rounded-full pointer-events-none" />
      <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-red opacity-30 blur-[120px] rounded-full pointer-events-none" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[768px]">
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Tout ce dont une collectivité a besoin pour
            <span class="text-gradient-purple"> cartographier ses projets</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[522px]">
            Carte interactive, back-office no-code, marque blanche, module travaux, import open data. Le tout hébergé en Europe, open source, RGPD.
          </p>
        </div>
      </div>
    </section>

    <!-- Ce que vos habitants voient -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Ce que vos habitants
          <span class="text-gradient-purple"> voient</span>
        </h2>

        <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            v-for="(card, i) in habitantsCards"
            :key="i"
            class="group bg-gray-bg rounded-2xl border border-gray-border overflow-hidden hover:shadow-lg transition-shadow"
          >
            <div class="h-44 bg-gradient-to-br from-purple/[0.04] to-primary/[0.04] border-b border-gray-border p-6 flex items-center justify-center">
              <component :is="card.icon" class="w-12 h-12 text-gray-300" />
            </div>
            <div class="p-6">
              <h3 class="font-heading font-semibold text-lg text-dark mb-2">{{ card.title }}</h3>
              <p class="text-sm text-gray-text leading-relaxed">{{ card.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Ce que vos équipes utilisent -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Ce que vos équipes
          <span class="text-gradient-purple"> utilisent</span>
        </h2>

        <div class="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div
            v-for="(card, i) in equipesCards"
            :key="i"
            class="bg-white rounded-2xl border border-gray-border p-8 hover:shadow-lg transition-shadow"
          >
            <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-6" :class="card.bgClass">
              <component :is="card.icon" class="w-6 h-6" :class="card.iconClass" />
            </div>
            <h3 class="font-heading font-semibold text-xl text-dark mb-3">{{ card.title }}</h3>
            <p class="text-sm text-gray-text leading-relaxed mb-6">{{ card.desc }}</p>
            <ul class="space-y-3">
              <li
                v-for="(feat, j) in card.features"
                :key="j"
                class="flex items-start gap-3 text-sm text-gray-text"
              >
                <Check class="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{{ feat }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Votre territoire, votre identité -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Votre territoire,
          <span class="text-gradient-purple"> votre identité</span>
        </h2>

        <div class="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div
            v-for="(card, i) in identiteCards"
            :key="i"
            class="bg-gray-bg rounded-2xl border border-gray-border p-8 hover:shadow-lg transition-shadow"
          >
            <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-6" :class="card.bgClass">
              <component :is="card.icon" class="w-6 h-6" :class="card.iconClass" />
            </div>
            <h3 class="font-heading font-semibold text-xl text-dark mb-3">{{ card.title }}</h3>
            <p class="text-sm text-gray-text leading-relaxed">{{ card.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Souveraineté, conformité, transparence -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Souveraineté, conformité,
          <br />
          <span class="text-gradient-purple">transparence</span>
        </h2>
        <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[550px]">
          Open Projets repose sur des choix technologiques responsables.
        </p>

        <div class="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            v-for="(item, i) in souveraineteItems"
            :key="i"
            class="bg-white rounded-2xl border border-gray-border p-6 hover:shadow-lg transition-shadow"
          >
            <div class="w-10 h-10 rounded-lg flex items-center justify-center mb-4" :class="item.bgClass">
              <component :is="item.icon" class="w-5 h-5" :class="item.iconClass" />
            </div>
            <h3 class="font-heading font-semibold text-base text-dark mb-2">{{ item.title }}</h3>
            <p class="text-xs text-gray-text leading-relaxed">{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="relative py-32 bg-dark overflow-hidden">
      <div class="absolute inset-0 opacity-20">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blob-purple blur-[160px] rounded-full" />
      </div>
      <div class="relative max-w-container mx-auto px-6 text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[52px] leading-tight tracking-tight text-white">
          Déployez votre carte
          <br />
          <span class="text-gradient-purple">pour votre territoire</span>
        </h2>
        <p class="mt-6 text-white/60 text-base sm:text-lg max-w-md mx-auto leading-relaxed">
          Demandez une démo personnalisée et découvrez Open Projets en quelques minutes.
        </p>
        <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <router-link
            to="/contact"
            class="inline-flex items-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/30"
          >
            Demander une démo
            <ArrowRight class="w-4 h-4" />
          </router-link>
          <a
            href="https://grandsprojets.com"
            target="_blank"
            class="inline-flex items-center gap-2.5 bg-white/10 text-white text-sm font-medium px-7 py-4 rounded-full border border-white/20 hover:bg-white/20 transition-colors"
          >
            <MapIcon class="w-4 h-4" />
            Voir l'exemple Lyon
            <ArrowUpRight class="w-3.5 h-3.5 text-white/60" />
          </a>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import {
  MapIcon, Globe, Eye, FileText, HardHat, Settings, Database,
  Palette, Link2, ShieldCheck, Github, Lock, Accessibility,
  Leaf, Server, Check, ArrowRight, ArrowUpRight,
} from 'lucide-vue-next'

const habitantsCards = [
  {
    icon: Eye,
    title: 'Carte interactive publique',
    desc: 'Vos habitants explorent les projets de leur territoire sur une carte claire, responsive, sans inscription. Filtres, recherche, vue par catégorie.',
  },
  {
    icon: FileText,
    title: 'Formats adaptés et utilisables',
    desc: 'Chaque projet comprend description, avancement, dates, documents. L\'information est accessible, structurée, lisible sur mobile.',
  },
  {
    icon: HardHat,
    title: 'Espace travaux dédié',
    desc: 'Les chantiers en cours sont visibles avec dates, localisation, état d\'avancement. Les riverains s\'informent sans appeler la mairie.',
  },
]

const equipesCards = [
  {
    icon: Settings,
    title: 'Back-office no-code',
    desc: 'Publiez et gérez les projets depuis un back-office simple, sans compétences techniques.',
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
    features: [
      'Ajout, modification et suppression de projets',
      'Géolocalisation par adresse ou clic sur carte',
      'Gestion des statuts et catégories',
      'Publication immédiate ou différée',
    ],
  },
  {
    icon: Database,
    title: 'Import de données extérieures',
    desc: 'Connectez vos sources de données existantes pour enrichir votre carte automatiquement.',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
    features: [
      'Import GeoJSON, CSV, fichiers SIG',
      'Connexion aux API open data',
      'Synchronisation automatique',
      'Mise à jour sans intervention manuelle',
    ],
  },
]

const identiteCards = [
  {
    icon: Palette,
    title: 'Marque blanche complète',
    desc: 'Votre carte adopte les couleurs, le logo et la typographie de votre collectivité. L\'utilisateur navigue sur votre identité, pas celle d\'un prestataire.',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
  },
  {
    icon: Link2,
    title: 'Sous-domaine personnalisé',
    desc: 'Chaque collectivité dispose de son propre sous-domaine : votre-ville.openprojets.com. Une URL claire, professionnelle, facile à partager.',
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
  },
]

const souveraineteItems = [
  {
    icon: ShieldCheck,
    title: 'RGPD conforme',
    desc: 'Pas de trackers, pas de cookies tiers, pas de collecte cachée. Conçu pour respecter la réglementation européenne.',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
  },
  {
    icon: Github,
    title: 'Open source',
    desc: 'Code ouvert, auditable, vérifiable. Pas de boîte noire, pas de dépendance propriétaire.',
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
  },
  {
    icon: Server,
    title: 'Hébergement UE',
    desc: 'Infrastructure hébergée en Europe, données souveraines et protégées.',
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
  },
  {
    icon: Lock,
    title: 'Données souveraines',
    desc: 'Les collectivités conservent la propriété totale de leurs données. Export possible à tout moment.',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
  },
]
</script>
