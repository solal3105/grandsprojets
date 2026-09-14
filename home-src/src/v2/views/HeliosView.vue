<template>
  <!-- La page des clients Hélios. Elle n'est ni dans le menu, ni dans le plan
       du site, ni dans les moteurs (routeur : noindex) : Hélios donne son
       adresse à ses clients. Même composition que les pages de modules, avec
       le co-marquage en ouverture et le module Travaux en direct, puisque
       c'est lui que ces clients retrouvent au quotidien. -->
  <div>
    <section class="relative pt-36 pb-20 overflow-hidden">
      <HeroGround />
      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[820px] mx-auto text-center">
          <div class="flex items-center justify-center gap-5 mb-10">
            <img :src="`${base}img/logos/classic_color.png`" alt="Open Projets" class="h-9 w-auto" width="256" height="93" />
            <span class="text-gray-400 text-2xl font-light select-none" aria-hidden="true">&times;</span>
            <img :src="`${base}img/partners/helios-logo.png`" alt="Hélios" class="h-9 w-auto" />
          </div>

          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[52px] leading-[1.06] tracking-tight-hero text-dark">
            Vos chantiers sur le terrain, visibles par tous les habitants
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[640px] mx-auto">
            Vous suivez vos chantiers de marquage et de voirie dans Phaos. Avec Open Projets, partenaire
            d'Hélios, chaque intervention et chaque projet d'aménagement se retrouvent sur une carte
            publique que vos habitants consultent sans compte ni application.
          </p>

          <div class="mt-10 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:commercial@helios-marquage.fr" v-tilt-btn
              class="group inline-flex items-center gap-2.5 bg-primary-ink text-white text-sm font-medium px-6 py-3.5 rounded-full hover:bg-red-700 transition-colors"
            >
              Écrire au commercial Hélios
              <ArrowRight class="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </a>
            <router-link
              :to="{ hash: '#contact' }" v-tilt-btn
              class="inline-flex items-center gap-2.5 bg-white text-dark text-sm font-medium px-6 py-3.5 rounded-full border border-gray-border hover:border-gray-300 transition-colors"
            >
              Demander une démo
            </router-link>
          </div>
        </div>

        <div class="mt-14 sm:mt-16 max-w-[1040px] mx-auto">
          <TravauxLive />
        </div>
      </div>
    </section>

    <!-- Ce que l'outil ajoute à ce que la commune fait déjà -->
    <section class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          Ce que vous faites déjà, et ce qu'Open Projets y ajoute
        </h2>
        <p class="mt-5 text-gray-text text-base leading-relaxed max-w-[720px]">
          Les chantiers, les projets et les décisions existent déjà dans vos services. Ce qui manque,
          c'est une carte où les habitants les retrouvent.
        </p>

        <div class="mt-12 sm:mt-14 bg-white rounded-3xl border border-gray-border overflow-hidden">
          <div class="hidden md:grid grid-cols-2 bg-gray-bg border-b border-gray-border">
            <p class="px-8 py-4 text-xs font-semibold uppercase tracking-wider text-gray-muted">Ce que vous faites déjà</p>
            <p class="px-8 py-4 text-xs font-semibold uppercase tracking-wider text-primary-ink border-l border-gray-border">En plus avec Open Projets</p>
          </div>
          <div
            v-for="(pair, i) in pairs" :key="i"
            class="grid grid-cols-1 md:grid-cols-2 border-b border-gray-border last:border-b-0"
          >
            <div class="px-6 sm:px-8 py-6 flex items-start gap-4">
              <ArrowRight class="w-3.5 h-3.5 text-gray-400 shrink-0 mt-1.5" />
              <div>
                <p class="md:hidden text-[11px] font-semibold uppercase tracking-wider text-gray-muted mb-1.5">Ce que vous faites déjà</p>
                <p class="font-semibold text-base text-dark">{{ pair.avant.titre }}</p>
                <p class="mt-1.5 text-sm text-gray-text leading-relaxed">{{ pair.avant.texte }}</p>
              </div>
            </div>
            <div class="px-6 sm:px-8 py-6 flex items-start gap-4 bg-gray-bg/60 md:border-l border-gray-border">
              <Check class="w-4 h-4 text-primary-ink shrink-0 mt-1" />
              <div>
                <p class="md:hidden text-[11px] font-semibold uppercase tracking-wider text-primary-ink mb-1.5">En plus avec Open Projets</p>
                <p class="font-semibold text-base text-dark">{{ pair.apres.titre }}</p>
                <p class="mt-1.5 text-sm text-gray-text leading-relaxed">{{ pair.apres.texte }}</p>
                <span class="inline-flex items-center mt-3 text-[11px] font-medium text-gray-muted bg-white border border-gray-border px-2.5 py-0.5 rounded-full">{{ pair.module }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Trois usages, chacun montré par une capture de l'outil -->
    <section class="py-20 sm:py-28 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          Trois usages concrets pour vos services
        </h2>
        <div class="mt-12 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          <article
            v-for="usage in usages" :key="usage.titre"
            class="bg-white rounded-3xl border border-gray-border overflow-hidden shadow-pill"
          >
            <img
              :src="`${base}img/features/${usage.image}`" :alt="usage.alt"
              class="w-full h-48 object-cover" loading="lazy" width="1600" height="1000"
            />
            <div class="p-7">
              <span class="w-10 h-10 rounded-xl flex items-center justify-center" :class="usage.tone.bg">
                <component :is="usage.icon" class="w-[18px] h-[18px]" :class="usage.tone.text" />
              </span>
              <h3 class="mt-5 font-heading font-bold text-xl text-dark">{{ usage.titre }}</h3>
              <p class="mt-3 text-sm text-gray-text leading-relaxed">{{ usage.texte }}</p>
              <ul class="mt-5 space-y-2.5">
                <li v-for="point in usage.points" :key="point" class="flex items-start gap-2.5">
                  <Check class="w-4 h-4 shrink-0 mt-0.5" :class="usage.tone.text" />
                  <span class="text-sm text-gray-text leading-relaxed">{{ point }}</span>
                </li>
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Comment ça se passe -->
    <section class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          Comment ça se passe
        </h2>
        <ol class="mt-12 sm:mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          <li v-for="(etape, i) in etapes" :key="etape.titre" class="rounded-3xl border border-gray-border p-7">
            <span class="font-heading font-bold text-4xl text-primary-ink">{{ String(i + 1).padStart(2, '0') }}</span>
            <h3 class="mt-4 font-heading font-semibold text-lg text-dark">{{ etape.titre }}</h3>
            <p class="mt-2 text-sm text-gray-text leading-relaxed">{{ etape.texte }}</p>
          </li>
        </ol>
      </div>
    </section>

    <ContactBlock referrer="helios" />
  </div>
</template>

<script setup>
import { ArrowRight, Check, HardHat, Building, Users } from 'lucide-vue-next'
import HeroGround from '../components/HeroGround.vue'
import ContactBlock from '../components/ContactBlock.vue'
import TravauxLive from '../components/showcases/TravauxLive.vue'

const base = import.meta.env.BASE_URL

const pairs = [
  {
    avant: { titre: 'Un chantier démarre sur votre commune.', texte: "L'information reste dans les courriels entre services, et les riverains ne sont pas prévenus." },
    apres: { titre: 'Le chantier est localisé sur la carte, avec ses dates et son avancement.', texte: 'Les riverains ouvrent la carte et comprennent ce qui se passe dans leur rue.' },
    module: 'Travaux du quotidien',
  },
  {
    avant: { titre: 'Vous informez par des réunions et des comptes rendus en PDF.', texte: 'Les documents circulent mal, et les élus manquent de visuels concrets pour communiquer.' },
    apres: { titre: 'Chaque projet se voit en un clic, avec sa fiche et ses photos.', texte: 'Les élus partagent un lien unique en réunion publique et en comité.' },
    module: 'Carte des projets urbains',
  },
  {
    avant: { titre: 'Plusieurs services gèrent des projets en parallèle.', texte: "Sans vue d'ensemble, les doublons passent inaperçus." },
    apres: { titre: 'Tous les projets sont sur une carte unique, partagée entre services.', texte: 'Urbanisme, voirie, espaces verts : chacun publie et consulte les mêmes données.' },
    module: 'Gestion par service',
  },
  {
    avant: { titre: 'Les habitants appellent le standard pour savoir ce qui se passe.', texte: 'Le secrétariat passe du temps à répondre aux mêmes questions.' },
    apres: { titre: "L'information est accessible à toute heure, sans appeler.", texte: 'La carte se consulte sur mobile, sans inscription, avec une recherche par quartier.' },
    module: 'Information des habitants',
  },
  {
    avant: { titre: 'Les projets votés en conseil restent dans les archives.', texte: 'Rien ne montre publiquement les engagements tenus.' },
    apres: { titre: 'Les projets sont publiés dès que la décision est actée.', texte: "L'avancement des engagements du mandat est visible par tous." },
    module: 'Transparence',
  },
]

const usages = [
  {
    icon: HardHat,
    tone: { text: 'text-mod-travaux', bg: 'bg-mod-travaux-soft' },
    image: '2.jpeg',
    alt: 'Un chantier localisé sur la carte, avec ses dates et sa progression.',
    titre: 'Le suivi de chantier',
    texte: 'Chaque intervention est localisée sur la carte, avec ses dates, sa zone et sa progression. Les riverains sont informés et vos services suivent l’avancement.',
    points: [
      'Les zones de chantier se dessinent sur la carte.',
      'La progression et les dates se mettent à jour depuis le terrain.',
      'Les dates de début et de fin sont visibles par tous.',
    ],
  },
  {
    icon: Building,
    tone: { text: 'text-mod-diagnostic', bg: 'bg-mod-diagnostic-soft' },
    image: '5.jpeg',
    alt: "L'interface de gestion des projets, avec les catégories d'une commune.",
    titre: 'La coordination entre services',
    texte: 'Urbanisme, voirie, espaces verts : tous vos services publient et consultent les mêmes projets, sans doublon ni courriel perdu.',
    points: [
      "Des rôles d'administrateur et de contributeur pour votre équipe.",
      'Des catégories propres à chaque service.',
      "Une vue d'ensemble de tout le territoire.",
    ],
  },
  {
    icon: Users,
    tone: { text: 'text-mod-participer', bg: 'bg-mod-participer-soft' },
    image: 'feature-consultation.jpeg',
    alt: 'La carte publique consultée sur un téléphone.',
    titre: "L'information des habitants",
    texte: 'La carte est publique, sans inscription, et se consulte sur mobile. Chaque habitant retrouve les projets de son quartier en quelques secondes.',
    points: [
      'Des filtres par catégorie et une recherche par mot.',
      'La géolocalisation, pour voir les projets autour de soi.',
      'Des fiches détaillées, avec photos et description.',
    ],
  },
]

const etapes = [
  { titre: 'Nous configurons votre espace', texte: 'Logo, couleurs, fond de carte : votre identité est appliquée en quelques clics, et la carte ressemble à votre collectivité.' },
  { titre: 'Vos équipes publient', texte: 'Dessiner une zone, remplir une fiche, ajouter une photo : aucune compétence technique n’est requise.' },
  { titre: 'Vos habitants consultent', texte: 'La carte est publique, sans inscription, accessible sur mobile. Chaque habitant voit les projets et les travaux de son quartier.' },
]
</script>
