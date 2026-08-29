<template>
  <div>
    <!-- HERO -->
    <section class="relative bg-gray-bg overflow-hidden">
      <PageBlobs top="blob-purple" bottom="blob-red" top-offset="-70px" />

      <div class="relative max-w-container mx-auto px-6 pt-36 pb-20">
        <div class="max-w-[768px]">
          <EyebrowLabel>Fonctionnalités</EyebrowLabel>
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Vos projets,<br />
            <span class="text-gradient">enfin visibles.</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[522px]">
            Publiez vos projets sur une carte interactive, informez vos habitants en temps réel - sans une ligne de code, sans délai.
          </p>
          <div class="mt-10 flex flex-col sm:flex-row gap-4">
            <router-link
              to="/contact" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-primary-ink text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-red-700 transition-colors shadow-lg shadow-primary/20"
            >
              Demander une démo
              <ArrowRight class="w-4 h-4" />
            </router-link>
            <a
              href="https://openprojets.com/default"
              target="_blank" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-7 py-4 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
            >
              Voir un exemple en direct
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400" />
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURE SECTIONS -->
    <FeatureSection v-for="section in sections" :key="section.id" v-bind="section" />

    <!-- 06 - Diagnostic terrain : pleine largeur, l'outil reproduit en action -->
    <section id="diagnostic" class="py-16 sm:py-24 bg-gray-bg overflow-hidden">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[760px] mx-auto text-center">
          <div class="inline-flex items-center gap-2 mb-6">
            <span class="w-7 h-7 rounded-lg flex items-center justify-center bg-teal/10">
              <ScanSearch class="w-3.5 h-3.5 text-teal" />
            </span>
            <span class="text-xs font-bold uppercase tracking-widest text-teal">06 - Diagnostic terrain</span>
          </div>
          <h2 class="font-heading font-bold text-3xl sm:text-[40px] leading-[1.1] tracking-tight text-dark">
            Des centaines de relevés sur le terrain. Une lecture claire en quelques secondes.
          </h2>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed">
            Entourez un secteur sur la carte. L'IA lit tous les relevés qui s'y trouvent - signalements,
            contributions, comptages - et vous en rend une synthèse structurée, source par source,
            entièrement citée. Aucune invention, aucun jugement : une restitution fidèle, prête à partager.
          </p>
        </div>

        <div class="mt-12 lg:mt-14 max-w-[1040px] mx-auto">
          <DiagnosticShowcase />
        </div>

        <ul class="mt-11 flex flex-wrap justify-center gap-x-8 gap-y-3.5 max-w-[900px] mx-auto">
          <li v-for="feat in diagnosticFeats" :key="feat" class="flex items-start gap-2.5">
            <Check class="w-4 h-4 shrink-0 mt-0.5 text-teal" />
            <span class="text-sm text-gray-text leading-relaxed">{{ feat }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- CTA -->
    <CtaSection
      heading="Prêt à mettre vos projets"
      heading-line2="sur la carte ?"
      heading-gradient="text-gradient-purple"
      subtitle="Demandez une démo, on configure votre espace ensemble."
    />
  </div>
</template>

<script setup>
import { markRaw } from 'vue'
import { ArrowRight, ArrowUpRight, MapPin, HardHat, Layers, Users, Palette, ScanSearch, Check } from 'lucide-vue-next'
import PageBlobs from '@/components/PageBlobs.vue'
import EyebrowLabel from '@/components/EyebrowLabel.vue'
import FeatureSection from '@/components/FeatureSection.vue'
import DiagnosticShowcase from '@/components/DiagnosticShowcase.vue'
import CtaSection from '@/components/CtaSection.vue'

const base = import.meta.env.BASE_URL

const diagnosticFeats = [
  'Sélectionnez une zone à main levée - seuls les relevés qui s\'y trouvent sont analysés',
  'L\'IA regroupe les points par source et par sujet, en citant chaque relevé',
  'Aucune note, aucun classement, aucune recommandation : une restitution, pas un avis',
  'Les chiffres sont recalculés à partir des points cités, jamais inventés par l\'IA',
  'Chaque diagnostic s\'enregistre et s\'exporte en rapport, plan de la zone en couverture',
]

const sections = [
  {
    id: 'contributions',
    bg: 'bg-white',
    icon: markRaw(MapPin),
    iconBg: 'bg-primary/10',
    accent: 'text-primary-ink',
    badge: '01 - Contributions',
    title: 'Publiez un projet en quelques minutes, pas en quelques semaines.',
    description: "Votre agent dessine la zone sur la carte, rédige une fiche, ajoute une photo. Le projet apparaît instantanément. Interface intuitive - opérationnel en quelques minutes, sans formation, sans ticket, sans délai.",
    feats: [
      'Interface guidée pas à pas - aucune compétence technique requise',
      'Géolocalisation : dessinez à la main sur la carte ou importez un fichier GeoJSON',
      'Fiche complète : photo de couverture, description, article Markdown, URL officielle, tags',
      'Publication immédiate - visible sans délai sur la carte publique',
    ],
    imgSrc: `${base}img/features/1.jpeg`,
    imgAlt: 'Interface de gestion des contributions',
    reversed: false,
  },
  {
    id: 'travaux',
    bg: 'bg-gray-bg',
    icon: markRaw(HardHat),
    iconBg: 'bg-amber/15',
    accent: 'text-amber-ink',
    badge: '02 - Module Travaux',
    title: "Un chantier en cours ? Vos riverains ont l'info sans vous appeler.",
    description: "Un module dédié aux chantiers, séparé de la carte des projets. Vos riverains trouvent l'info en deux clics - sans appeler la mairie.",
    feats: [
      'Délimitez la zone impactée directement sur la carte',
      "Dates de début et de fin, état d'avancement en temps réel",
      'Module séparé de la carte des projets - pensé pour les riverains',
      "Zéro appel à la mairie : l'information est accessible 24h/24",
    ],
    imgSrc: `${base}img/features/2.jpeg`,
    imgAlt: 'Module travaux et chantiers',
    reversed: true,
  },
  {
    id: 'categories',
    bg: 'bg-white',
    icon: markRaw(Layers),
    iconBg: 'bg-purple/10',
    accent: 'text-purple',
    badge: '03 - Catégories',
    title: 'Mobilité, logement, patrimoine - vos thématiques, pas un modèle générique.',
    description: "Créez les catégories qui correspondent à votre territoire. Mobilité douce, patrimoine, logement social : choisissez les icônes, définissez l'ordre, associez les couches cartographiques.",
    feats: [
      'Nommez vos catégories selon vos thématiques (mobilité, patrimoine, logement…)',
      'Sélecteur visuel pour choisir une icône dans toute la bibliothèque FontAwesome',
      "Définissez l'ordre d'apparition dans la navigation publique",
      'Associez des couches cartographiques à chaque catégorie',
    ],
    imgSrc: `${base}img/features/3.jpeg`,
    imgAlt: 'Gestion des catégories',
    reversed: false,
  },
  {
    id: 'branding',
    bg: 'bg-gray-bg',
    icon: markRaw(Palette),
    iconBg: 'bg-primary/10',
    accent: 'text-primary-ink',
    badge: '04 - Branding',
    title: 'Vos couleurs, votre logo, votre identité - la carte fait partie de votre communication.',
    description: "En quelques clics, votre carte adopte les couleurs de votre charte graphique, vos logos, votre fond de carte. Vos agents s'y retrouvent. Vos habitants aussi.",
    feats: [
      'Configuration visuelle et intuitive - chaque modification est prévisualisée en direct',
      "Couleur principale avec aperçu en temps réel sur toute l'interface",
      'Logo principal, logo dark-mode et favicon configurables indépendamment',
      "Activez ou désactivez chaque contrôle visible sur l'interface publique",
    ],
    imgSrc: `${base}img/features/4.jpeg`,
    imgAlt: 'Personnalisation du branding',
    reversed: true,
  },
  {
    id: 'utilisateurs',
    bg: 'bg-white',
    icon: markRaw(Users),
    iconBg: 'bg-green/15',
    accent: 'text-green-ink',
    badge: '05 - Équipe',
    title: 'Vos agents publient. Vous gardez le contrôle.',
    description: "Deux niveaux de permissions, une logique claire. L'agent de terrain publie les chantiers. L'administrateur configure l'espace. Chacun dans son rôle, sans marcher sur les plates-bandes de l'autre.",
    feats: [
      'Invitez vos agents et élus en deux secondes via leur adresse email',
      "Deux rôles : Invité (publie des projets) et Administrateur (configure l'espace)",
      "Chaque agent ne voit que les territoires pour lesquels il est autorisé",
      "Aucune intervention DSI ni prestataire externe nécessaire pour gérer votre espace",
    ],
    imgSrc: `${base}img/features/5.jpeg`,
    imgAlt: "Gestion de l'équipe et des permissions",
    reversed: false,
  },
]
</script>
