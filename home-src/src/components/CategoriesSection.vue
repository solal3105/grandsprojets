<template>
  <section class="py-16 sm:py-24 bg-white overflow-hidden">
    <div class="max-w-container mx-auto px-6">

      <!-- Heading -->
      <div class="text-center max-w-[680px] mx-auto mb-10 sm:mb-14">
        <span class="inline-flex items-center justify-center gap-2.5 text-xs font-semibold text-primary uppercase tracking-widest mb-5">
          <span class="w-5 h-px bg-primary" />
          Aller plus loin
          <span class="w-5 h-px bg-primary" />
        </span>
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
          Vous faites déjà l'essentiel.<br />
          <span class="text-gradient">Faites-en encore plus.</span>
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
          Open Projets ne repart pas de zéro — il amplifie ce que vous faites déjà, et le rend visible pour vos habitants.
          Tout se configure en quelques clics, directement depuis l'interface.
        </p>
      </div>

      <!-- Mobile: stacked cards -->
      <div class="sm:hidden space-y-3">
        <div v-for="(pair, i) in pairs" :key="'m'+i" class="rounded-2xl border border-gray-border overflow-hidden">
          <!-- Ce que vous faites -->
          <div class="flex items-start gap-3 px-5 py-5 bg-[#FAFAFA]">
            <div class="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
              <ArrowRight class="w-3 h-3 text-[#AAAAAA]" />
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-[#AAAAAA] mb-1.5">Ce que vous faites</p>
              <p class="text-[#2a2a2a] font-semibold text-sm leading-snug">{{ pair.before.title }}</p>
              <p class="text-[#AAAAAA] text-xs leading-relaxed mt-1">{{ pair.before.sub }}</p>
            </div>
          </div>
          <!-- En plus avec Open Projets -->
          <div class="flex items-start gap-3 px-5 py-5 bg-white border-t border-gray-border">
            <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Check class="w-3 h-3 text-primary" />
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-1.5">En plus avec Open Projets</p>
              <p class="text-dark font-semibold text-sm leading-snug">{{ pair.after.title }}</p>
              <p class="text-gray-text text-xs leading-relaxed mt-1">{{ pair.after.sub }}</p>
              <span class="inline-flex items-center mt-2.5 text-[10px] font-semibold text-gray-text/50 bg-gray-bg border border-gray-border px-2 py-0.5 rounded-full">{{ pair.feature }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop: side-by-side table -->
      <div class="hidden sm:block max-w-[920px] mx-auto">

        <!-- Column headers -->
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[#F5F5F5]">
            <span class="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
              <ArrowRight class="w-2.5 h-2.5 text-[#AAAAAA]" />
            </span>
            <span class="text-xs font-bold uppercase tracking-widest text-[#AAAAAA]">Ce que vous faites</span>
          </div>
          <div class="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-primary-light">
            <span class="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Check class="w-3 h-3 text-primary" />
            </span>
            <span class="text-xs font-bold uppercase tracking-widest text-primary/70">En plus avec Open Projets</span>
          </div>
        </div>

        <!-- Rows -->
        <div class="rounded-2xl overflow-hidden border border-gray-border" style="box-shadow: 0 8px 40px -8px rgba(0,0,0,0.08);">
          <div
            v-for="(pair, i) in pairs"
            :key="i"
            class="group grid grid-cols-2"
            :class="{ 'border-t border-gray-border': i > 0 }"
          >
            <!-- Left: what they do -->
            <div class="flex items-start gap-4 px-8 py-5 bg-[#FAFAFA] group-hover:bg-[#F3F3F3] transition-colors duration-200">
              <div class="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                <ArrowRight class="w-3 h-3 text-[#AAAAAA]" />
              </div>
              <div>
                <p class="text-[#2a2a2a] font-semibold text-base leading-snug">{{ pair.before.title }}</p>
                <p class="text-[#AAAAAA] text-sm leading-relaxed mt-1.5 max-h-0 overflow-hidden opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300">{{ pair.before.sub }}</p>
              </div>
            </div>

            <!-- Right: what they gain -->
            <div class="flex items-start gap-4 px-8 py-5 bg-white border-l border-gray-border group-hover:bg-gray-bg transition-colors duration-200">
              <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Check class="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p class="text-dark font-semibold text-base leading-snug">{{ pair.after.title }}</p>
                <p class="text-gray-text text-sm leading-relaxed mt-1.5 max-h-0 overflow-hidden opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300">{{ pair.after.sub }}</p>
                <span class="inline-flex items-center mt-3 text-[11px] font-medium text-gray-text/50 bg-gray-bg border border-gray-border px-2.5 py-0.5 rounded-full">{{ pair.feature }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CTA -->
      <div class="mt-12 flex justify-center">
        <router-link
          to="/fonctionnalites"
          class="inline-flex items-center gap-2 text-primary text-sm font-semibold hover:underline underline-offset-4"
        >
          Découvrir toutes les fonctionnalités
          <ArrowRight class="w-4 h-4" />
        </router-link>
      </div>

    </div>
  </section>
</template>

<script setup>
import { Check, ArrowRight } from 'lucide-vue-next'

const pairs = [
  {
    before: {
      title: 'Vous informez via réunions, PDF et communiqués',
      sub: "Comptes-rendus, affiches, publications réseaux — l'information existe, dispersée sur plusieurs canaux.",
    },
    after: {
      title: 'Carte en ligne, consultable 24h/24, sans inscription',
      sub: 'Tous vos projets au même endroit. Vos habitants accèdent depuis leur téléphone, sans téléchargement ni compte.',
    },
    feature: 'Carte publique',
  },
  {
    before: {
      title: 'Vos services suivent les chantiers en interne',
      sub: 'Les équipes maîtrisent le planning — mais cette information reste côté mairie.',
    },
    after: {
      title: 'Riverains informés : zone, dates, avancement en temps réel',
      sub: "Un module dédié aux chantiers, dessiné sur la carte, mis à jour par vos agents. Moins d'appels, plus de confiance.",
    },
    feature: 'Module Travaux',
  },
  {
    before: {
      title: 'Vous documentez vos projets en bilan de mandat',
      sub: 'Rapports annuels, délibérations — votre action est réelle, mais peu visible au quotidien.',
    },
    after: {
      title: "Chaque projet documenté, géolocalisé, consultable toute l'année",
      sub: 'Photo de couverture, article complet, localisation sur carte, URL officielle : vos projets racontent votre action en continu.',
    },
    feature: 'Fiches projet',
  },
  {
    before: {
      title: 'Vous organisez vos thématiques en interne',
      sub: 'Mobilité, patrimoine, logement, environnement — des silos métier que vos habitants ne voient pas organisés ainsi.',
    },
    after: {
      title: 'Navigation publique par catégories propres à votre territoire',
      sub: "Nommez-les, choisissez leurs icônes, définissez l'ordre. La carte reflète votre façon de faire.",
    },
    feature: 'Catégories',
  },
  {
    before: {
      title: 'Vous maintenez une identité visuelle sur vos supports',
      sub: 'Couleurs, logo, typographie — présents sur votre site, souvent absents de vos outils de transparence.',
    },
    after: {
      title: 'Votre charte graphique sur chaque écran de la carte',
      sub: 'Couleur principale, logotype clair et sombre, favicon, fond de carte : configuré en quelques clics, appliqué partout.',
    },
    feature: 'Personnalisation',
  },
  {
    before: {
      title: 'Vos agents travaillent avec des outils et fichiers séparés',
      sub: 'Chaque service a ses propres fichiers, sa façon de documenter — difficile à centraliser.',
    },
    after: {
      title: 'Un espace commun, des rôles clairs, zéro dépendance à la DSI',
      sub: 'Invitez un agent en deux clics. Il publie en autonomie. Vous restez maître des accès et des territoires autorisés.',
    },
    feature: "Gestion d'équipe",
  },
]
</script>
