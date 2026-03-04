<template>
  <div>
    <!-- Hero -->
    <section class="relative bg-[#f8f8f8] pt-36 pb-24 overflow-hidden">
      <div class="absolute top-[-70px] right-[-60px] w-[700px] h-[700px] blob-amber opacity-40 blur-[120px] rounded-full pointer-events-none" />
      <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-green opacity-30 blur-[120px] rounded-full pointer-events-none" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[768px]">
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Rendre l'action publique
            <span class="text-gradient-green"> lisible par tous</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[522px]">
            Open Projets est né d'un constat simple : l'information sur les projets urbains est éparpillée, technique, inaccessible aux habitants. Nous construisons l'outil qui change ça — ouvert, souverain, pensé pour les collectivités françaises.
          </p>
        </div>
      </div>
    </section>

    <!-- 3 Cards: Outil, Open source, Droits -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            v-for="(card, i) in valueCards"
            :key="i"
            class="bg-gray-bg rounded-2xl border border-gray-border overflow-hidden hover:shadow-lg transition-shadow"
          >
            <div class="h-36 border-b border-gray-border p-5 overflow-hidden" :style="card.gradientBg">
              <!-- Mini UI illustration -->
              <div class="space-y-2">
                <div v-for="j in 4" :key="j" class="flex items-center gap-2">
                  <span class="w-1 h-1 rounded-full" :class="card.dotClass" />
                  <span class="h-1.5 rounded-full bg-black/[0.06]" :style="{ width: `${50 + j * 20}px` }" />
                  <span class="h-1.5 rounded-full bg-black/[0.04]" :style="{ width: `${30 + j * 10}px` }" />
                </div>
              </div>
            </div>
            <div class="p-6">
              <h3 class="font-heading font-bold text-[15px] text-dark mb-2">{{ card.title }}</h3>
              <p class="text-[13px] text-[#666] leading-relaxed">{{ card.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Une technologie saine, transparente, auditable -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Une technologie saine,
          <br />
          transparente, auditable
        </h2>
        <p class="mt-6 text-gray-text text-base leading-relaxed max-w-[550px]">
          Pas de trackers, pas de revente de données, pas de dépendance à un GAFAM. Open Projets repose sur des choix technologiques responsables.
        </p>

        <div class="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            v-for="(item, i) in techItems"
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

    <!-- Timeline: D'une initiative citoyenne... -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          D'une initiative citoyenne à Lyon à un outil
          <span class="text-gradient-green"> pour toutes les collectivités</span>
        </h2>

        <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            v-for="(step, i) in timeline"
            :key="i"
            class="relative bg-gray-bg rounded-2xl border border-gray-border p-8"
          >
            <div class="flex items-center gap-3 mb-4">
              <div class="w-8 h-8 rounded-full flex items-center justify-center" :class="step.dotClass">
                <component :is="step.icon" class="w-4 h-4" :class="step.iconColor" />
              </div>
              <h3 class="font-heading font-semibold text-base text-dark">{{ step.title }}</h3>
            </div>
            <p class="text-sm text-gray-text leading-relaxed">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Lisibilité, transparence, ouverture -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Lisibilité, transparence, ouverture
        </h2>

        <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            v-for="(val, i) in valeurs"
            :key="i"
            class="rounded-2xl border p-8 hover:shadow-lg transition-shadow"
            :class="val.cardClass"
          >
            <div class="flex items-center gap-3 mb-4">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="val.iconBg">
                <component :is="val.icon" class="w-4 h-4" :class="val.iconColor" />
              </div>
              <h3 class="font-heading font-semibold text-lg" :class="val.titleColor">{{ val.title }}</h3>
            </div>
            <p class="text-sm leading-relaxed mb-6" :class="val.textColor">{{ val.desc }}</p>
            <ul class="space-y-3">
              <li
                v-for="(feat, j) in val.features"
                :key="j"
                class="flex items-start gap-3 text-sm"
                :class="val.textColor"
              >
                <Check class="w-4 h-4 shrink-0 mt-0.5" :class="val.checkColor" />
                <span>{{ feat }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Qui sommes-nous ? -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Qui sommes-nous ?
        </h2>
        <p class="mt-6 text-gray-text text-base leading-relaxed max-w-[600px]">
          Open Projets est développé et commercialisé par <strong class="text-dark">VAZY</strong>, une entreprise lyonnaise engagée dans la transition des mobilités et de la ville.
        </p>

        <div class="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <!-- Vazy card -->
          <div class="bg-gray-bg rounded-2xl border border-gray-border p-8 sm:p-10">
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
              Fondée à Lyon, VAZY est une <strong class="text-dark">Société à Mission</strong> qui inscrit dans ses statuts des objectifs sociaux et environnementaux. Son application mobile récompense l'utilisation des mobilités douces — marche, vélo, trottinette — par des réductions chez plus de 540 commerçants de proximité partenaires, auprès de 31 000 utilisateurs.
            </p>

            <p class="text-sm text-gray-text leading-relaxed mb-4">
              Avec Open Projets, VAZY élargit sa mission à la <strong class="text-dark">transparence de l'action publique</strong>. Le même engagement — rendre la ville plus lisible, plus ouverte, plus proche des citoyens — appliqué à l'information sur les projets urbains.
            </p>

            <div class="flex flex-wrap gap-3 mt-6">
              <span class="inline-flex items-center gap-1.5 text-xs text-gray-text bg-white border border-gray-border px-3 py-1.5 rounded-full">
                <MapPinIcon class="w-3.5 h-3.5 text-primary" />
                Lyon / Villeurbanne
              </span>
              <span class="inline-flex items-center gap-1.5 text-xs text-gray-text bg-white border border-gray-border px-3 py-1.5 rounded-full">
                <Building class="w-3.5 h-3.5 text-purple" />
                SASU — RCS Lyon
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
              class="flex items-start gap-4"
            >
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" :class="item.bgClass">
                <component :is="item.icon" class="w-[18px] h-[18px]" :class="item.iconClass" />
              </div>
              <div>
                <h4 class="font-heading font-semibold text-sm text-dark mb-1">{{ item.title }}</h4>
                <p class="text-sm text-gray-text leading-relaxed">{{ item.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="relative py-32 bg-dark overflow-hidden">
      <div class="absolute inset-0 opacity-20">
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] blob-amber blur-[160px] rounded-full" />
      </div>
      <div class="relative max-w-container mx-auto px-6 text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[52px] leading-tight tracking-tight text-white">
          Déployez votre carte
          <br />
          <span class="text-gradient-green">pour votre territoire</span>
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
  MapPin, GitBranch, ShieldCheck, Github, Server, Lock,
  Check, ArrowRight, ArrowUpRight, MapIcon,
  Code, BarChart3, Globe, Heart, Rocket, Eye,
  Building, MapPin as MapPinIcon, Users, Leaf, Handshake, Target,
} from 'lucide-vue-next'

const base = import.meta.env.BASE_URL

const valueCards = [
  {
    title: 'Un outil au service des collectivités',
    desc: 'Communes, intercommunalités, métropoles : Open Projets s\'adapte à chaque échelle pour permettre aux habitants de comprendre ce qui se construit et pourquoi.',
    gradientBg: 'background: linear-gradient(157deg, rgba(90,171,125,0.04) 0%, rgba(242,179,39,0.04) 100%)',
    dotClass: 'bg-primary',
  },
  {
    title: 'Open source, par conviction',
    desc: 'Le code est public, consultable, auditable. Pas de boîte noire, pas de dépendance propriétaire. Les collectivités gardent le contrôle de leur outil et de leurs données.',
    gradientBg: 'background: linear-gradient(157deg, rgba(78,43,255,0.04) 0%, rgba(90,171,125,0.04) 100%)',
    dotClass: 'bg-purple',
  },
  {
    title: 'Droits en France, hébergé en Europe',
    desc: 'Entreprise française, réglementation européenne. Infrastructure hébergée en UE. Conforme RGPD, sans transfert de données hors zone.',
    gradientBg: 'background: linear-gradient(157deg, rgba(255,0,55,0.04) 0%, rgba(78,43,255,0.04) 100%)',
    dotClass: 'bg-amber',
  },
]

const techItems = [
  {
    icon: Code,
    title: 'Code ouvert',
    desc: 'Code source public, licence ouverte et vérifiable. Tout le code est auditable.',
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
  },
  {
    icon: BarChart3,
    title: 'Smart tracking',
    desc: 'Aucun tracker tiers, pas de cookies de suivi, pas de collecte abusive.',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
  },
  {
    icon: Server,
    title: 'Hébergement UE',
    desc: 'Infrastructure dédiée en Europe, données souveraines et protégées.',
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
  },
  {
    icon: Lock,
    title: 'Données souveraines',
    desc: 'Les collectivités restent propriétaires de leurs données. Export possible à tout moment.',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
  },
]

const timeline = [
  {
    icon: MapPin,
    title: 'Le point de départ',
    desc: 'Open Projets a été créé par un citoyen lyonnais, frustré de ne pas comprendre les chantiers de son quartier — ni les raisons, ni les délais. L\'information était éclatée, et Lyon restait la seule collectivité à proposer un outil de ce type.',
    dotClass: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Rocket,
    title: 'Aujourd\'hui',
    desc: 'La plateforme est utilisée par plusieurs collectivités en France. Marque blanche, back-office no-code, module travaux, import open data : chaque ville déploie sa propre carte en quelques jours.',
    dotClass: 'bg-green/10',
    iconColor: 'text-green',
  },
  {
    icon: Globe,
    title: 'Objectif',
    desc: 'Devenir l\'outil de référence pour la transparence des projets urbains en France, en facilitant l\'accès à l\'information publique pour chaque citoyen.',
    dotClass: 'bg-purple/10',
    iconColor: 'text-purple',
  },
]

const valeurs = [
  {
    icon: Eye,
    title: 'Lisibilité',
    desc: 'L\'information publique doit être compréhensible, facile d\'accès et visuellement exploitable.',
    cardClass: 'bg-primary/[0.03] border-primary/20',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    titleColor: 'text-dark',
    textColor: 'text-gray-text',
    checkColor: 'text-primary',
    features: [
      'Carte publique, sans inscription',
      'Formats adaptés à chaque support',
      'Information structurée et accessible',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Transparence',
    desc: 'Le code, les données et les décisions doivent pouvoir être vérifiés et questionnés.',
    cardClass: 'bg-white border-gray-border',
    iconBg: 'bg-purple/10',
    iconColor: 'text-purple',
    titleColor: 'text-dark',
    textColor: 'text-gray-text',
    checkColor: 'text-purple',
    features: [
      'Code en open source',
      'Pas de cookies tiers',
      'Données auditables',
    ],
  },
  {
    icon: Heart,
    title: 'Ouverture',
    desc: 'Un outil pensé pour les collectivités, construit pour servir l\'intérêt général.',
    cardClass: 'bg-white border-gray-border',
    iconBg: 'bg-green/10',
    iconColor: 'text-green',
    titleColor: 'text-dark',
    textColor: 'text-gray-text',
    checkColor: 'text-green',
    features: [
      'Open data natif',
      'API REST ouverte',
      'Interopérable et extensible',
    ],
  },
]

const whyVazy = [
  {
    icon: Leaf,
    title: 'Société à Mission',
    desc: 'VAZY inscrit dans ses statuts des objectifs sociaux et environnementaux. Cette exigence guide chaque décision produit, y compris Open Projets.',
    bgClass: 'bg-green/10',
    iconClass: 'text-green',
  },
  {
    icon: Users,
    title: 'Expertise mobilité & ville',
    desc: 'Avec son app de mobilités douces déployée à Lyon et en France, VAZY comprend les enjeux des collectivités et de leurs habitants au quotidien.',
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
  },
  {
    icon: Handshake,
    title: 'Accompagnement dédié',
    desc: 'VAZY commercialise et accompagne le déploiement d\'Open Projets : configuration, personnalisation, formation des équipes, support continu.',
    bgClass: 'bg-purple/10',
    iconClass: 'text-purple',
  },
  {
    icon: Target,
    title: 'Vision long terme',
    desc: 'Construire l\'outil de référence pour la transparence des projets urbains en France, en s\'appuyant sur l\'open source et la souveraineté numérique.',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
  },
]
</script>
