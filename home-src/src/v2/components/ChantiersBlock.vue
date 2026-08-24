<template>
  <!-- Second produit, second domaine. Le regroupement des deux sites reste
       ouvert : pour l'instant le lien sort vers openprojets-chantiers.com.

       La section porte le vert de Chantiers, pas la palette de l'accueil : sa
       version noir et violet annoncait un produit qui n'existe pas. Et elle
       montre l'outil au lieu de le lister, parce que « permission de voirie »
       ne veut rien dire tant qu'on n'a pas vu l'ecran. -->
  <section id="chantiers" class="py-20 sm:py-28 bg-chantiers-bg overflow-hidden">
    <div class="max-w-container mx-auto px-6">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-16 items-center">
        <div class="lg:col-span-6 xl:col-span-5">
          <span class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-chantiers-ink bg-chantiers/10 px-3 py-1.5 rounded-full mb-6">
            <ClipboardCheck class="w-3 h-3" />
            Open Projets Chantiers
          </span>

          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[40px] leading-[1.08] tracking-tight text-balance text-dark">
            Vos permissions de voirie et vos arrêtés de circulation s'instruisent en ligne
          </h2>

          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed">
            C'est le logiciel de vos services voirie. Les entreprises y déposent leurs demandes,
            votre gestionnaire et vos communes les instruisent dans un fil daté, et chaque chantier
            est suivi jusqu'à la réouverture de la rue.
          </p>

          <p class="mt-4 text-gray-text text-base sm:text-lg leading-relaxed">
            Vos habitants ne s'en servent pas. Mais dès qu'un chantier est autorisé, il rejoint le
            module Travaux de votre carte, et le riverain y trouve seul son emprise et ses dates.
          </p>

          <a
            :href="CHANTIERS_URL"
            target="_blank" rel="noopener" v-tilt-btn
            class="mt-9 inline-flex items-center gap-2.5 bg-chantiers-ink text-white text-sm font-medium px-7 py-4 rounded-full hover:bg-chantiers transition-colors"
          >
            Découvrir Open Projets Chantiers
            <ArrowUpRight class="w-4 h-4 text-white/70" />
          </a>
          <p class="mt-3 text-xs text-gray-muted">
            Site et abonnement séparés.
          </p>
        </div>

        <!-- L'outil, montre. La capture telephone dit d'un coup d'oeil que le
             chantier se suit aussi depuis le terrain.

             Trois regimes, parce qu'une capture d'interface ne se reduit pas
             indefiniment : sous 640px la vue large tomberait a 340px et serait
             illisible, donc le telephone passe seul et au centre. Entre les
             deux, la vue large occupe toute la colonne. Le telephone ne flotte
             qu'a partir de 1024px, la ou la mise en page a deux colonnes lui
             laisse une gouttiere. -->
        <div class="lg:col-span-6 xl:col-span-7 relative xl:-mr-10">
          <img
            :src="`${base}img/chantiers/instruction.png`"
            width="1440" height="900" loading="lazy" decoding="async"
            alt="L'écran d'instruction d'Open Projets Chantiers : le gestionnaire de voirie lit une demande de permission et choisit de l'approuver, de demander une modification ou de la refuser."
            class="hidden sm:block w-full rounded-2xl border border-chantiers-border shadow-capture bg-white"
          />
          <img
            :src="`${base}img/chantiers/fil-chantier-mobile.png`"
            width="390" height="844" loading="lazy" decoding="async"
            alt="Le fil d'un chantier sur téléphone : l'intervenant et le gestionnaire de voirie s'y répondent, chaque message est daté."
            class="mx-auto w-[210px] rounded-[28px] border-4 border-white shadow-capture
                   sm:hidden
                   lg:block lg:absolute lg:mx-0 lg:-bottom-12 lg:-left-6 lg:w-[140px] lg:rounded-[24px]
                   xl:-left-10 xl:w-[158px]"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ArrowUpRight, ClipboardCheck } from 'lucide-vue-next'
import { CHANTIERS_URL } from '../data/nav.js'

const base = import.meta.env.BASE_URL
</script>
