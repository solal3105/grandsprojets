<template>
  <div>
    <!-- Ouverture : meme composition que les pages module, fond topographique
         compris. Trois sections ensuite, pas une de plus : qui nous sommes, ce
         qui se verifie avant de signer, et les deux blocs de cloture. -->
    <section class="relative pt-36 pb-20 overflow-hidden">
      <HeroGround />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[860px] mx-auto text-center">
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[52px] leading-[1.06] tracking-tight-hero text-dark">
            Open Projets est développé à Villeurbanne par une société à mission
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[660px] mx-auto">
            Nous sommes une petite équipe française. Vos données restent dans l'Union européenne,
            ce que vous publiez ressort dans des formats que n'importe quel logiciel relit, et le
            code du produit est public pour que vous n'ayez pas à nous croire sur parole.
          </p>

          <div class="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <router-link
              :to="{ hash: '#contact' }" v-tilt-btn
              class="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-primary-ink text-white text-[15px] font-medium px-6 sm:px-8 py-4 rounded-full hover:bg-red-700 transition-all duration-200 shadow-lg shadow-primary/25"
            >
              Demander une démo
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </router-link>
            <a
              :href="DEPOT_URL" target="_blank" rel="noopener" v-tilt-btn
              class="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white text-dark text-[15px] font-medium px-6 sm:px-8 py-4 rounded-full border border-gray-border shadow-pill hover:border-gray-300 transition-colors"
            >
              <Github class="w-4 h-4 text-dark" />
              Voir le dépôt de code
              <ArrowUpRight class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- L'entreprise : la prose d'un cote, l'etat civil de l'autre. Une
         collectivite qui monte un dossier a besoin des deux. -->
    <section class="py-20 sm:py-28 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div>
            <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark">
              Qui édite Open Projets
            </h2>
            <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">
              Open Projets est édité par VAZY, une SASU inscrite au registre du commerce de Lyon et
              établie à Villeurbanne. VAZY est une société à mission au sens de la loi PACTE : ses
              engagements sociaux et environnementaux figurent dans ses statuts, que n'importe qui
              peut aller lire au registre.
            </p>
            <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[520px]">
              Sa raison d'être tient en une ligne : rendre l'action des collectivités lisible par
              les habitants qui la financent et qui la subissent. Le produit est développé en
              France, et une demande d'une commune est traitée par les gens qui écrivent le
              logiciel.
            </p>
          </div>

          <div class="bg-gray-bg rounded-3xl border border-gray-border p-8 sm:p-10">
            <div class="flex items-center gap-5">
              <img :src="`${base}img/logo-vazy.png`" alt="VAZY" class="h-14 w-auto" />
              <span>
                <span class="block font-heading font-bold text-xl text-dark">VAZY</span>
                <span class="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium text-mod-chantiers bg-mod-chantiers-soft px-2.5 py-1 rounded-full">
                  <Heart class="w-3 h-3" />
                  Société à mission
                </span>
              </span>
            </div>

            <dl class="mt-8 divide-y divide-gray-border">
              <div v-for="ligne in fiche" :key="ligne.intitule" class="flex items-baseline justify-between gap-6 py-3.5">
                <dt class="text-sm text-gray-muted">{{ ligne.intitule }}</dt>
                <dd class="text-sm font-medium text-dark text-right">{{ ligne.valeur }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <!-- Ce qui se verifie : quatre points, chacun repondant a une question que
         la collectivite posera de toute facon en commission ou au DPO. Meme
         sommaire que les modules voisins sur une page module. -->
    <section class="py-20 sm:py-28 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-[1.08] tracking-tight text-dark max-w-[720px]">
          Ce que vous pouvez vérifier avant de signer
        </h2>
        <p class="mt-5 text-gray-text text-base leading-relaxed max-w-[720px]">
          Quatre questions que votre service juridique, votre délégué à la protection des données
          et votre direction des systèmes d'information poseront, et ce que nous répondons.
        </p>

        <div class="mt-12 sm:mt-14 bg-white rounded-3xl border border-gray-border overflow-hidden">
          <div
            v-for="e in verifications" :key="e.titre"
            class="group relative overflow-hidden grid grid-cols-1 md:grid-cols-[300px_1fr] items-start md:items-center gap-3 md:gap-8
                   px-6 sm:px-8 py-6 border-b border-gray-border last:border-b-0 hover:border-transparent transition-colors duration-300"
          >
            <span
              class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              :class="e.tone.socle"
            >
              <SocleFormes :forme="e.forme" compact />
              <!-- Meme voile que sur les pages module : sans lui, une phrase
                   blanche qui traverse la figure devient illisible sur l'ocre. -->
              <span class="absolute inset-0 bg-black/[0.12]" />
            </span>

            <span class="relative flex items-center gap-3">
              <span
                class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:bg-white/20"
                :class="e.tone.bg"
              >
                <component :is="e.icon" class="w-4 h-4 transition-colors duration-300 group-hover:text-white" :class="e.tone.text" />
              </span>
              <span
                class="font-heading font-bold text-lg leading-tight tracking-tight-name transition-colors duration-300 group-hover:text-white"
                :class="e.tone.text"
              >
                {{ e.titre }}
              </span>
            </span>
            <span class="relative text-base text-gray-text leading-relaxed transition-colors duration-300 group-hover:text-white">
              {{ e.texte }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <DemoChoice />
    <ContactBlock />
  </div>
</template>

<script setup>
import { ArrowRight, ArrowUpRight, Github, Heart, ShieldCheck, Database, FileCode, Share2 } from 'lucide-vue-next'
import HeroGround from '../components/HeroGround.vue'
import SocleFormes from '../components/SocleFormes.vue'
import DemoChoice from '../components/DemoChoice.vue'
import ContactBlock from '../components/ContactBlock.vue'

const base = import.meta.env.BASE_URL

const DEPOT_URL = 'https://github.com/solal3105/grandsprojets'

const fiche = [
  { intitule: 'Éditeur', valeur: 'VAZY, SASU' },
  { intitule: 'Immatriculation', valeur: 'RCS de Lyon' },
  { intitule: 'Statut', valeur: 'Société à mission (loi PACTE)' },
  { intitule: 'Établissement', valeur: 'Villeurbanne, métropole de Lyon' },
  { intitule: 'Hébergement des données', valeur: 'Union européenne' },
]

/* Les quatre points repondent chacun a une exigence reelle de la commande
 * publique, pas a un argument de vitrine :
 *  - la circulaire du 5 fevrier 2026 sur la commande publique numerique place
 *    la souverainete et la securite en tete des criteres d'achat ;
 *  - la reversibilite est la clause que tout marche doit prevoir ;
 *  - la loi pour une Republique numerique impose l'ouverture des donnees aux
 *    collectivites de plus de 3 500 habitants employant plus de 50 agents ;
 *  - l'audit du code avant signature est ce que demande une DSI.
 *
 * Chaque phrase doit rester verifiable. La licence du depot autorise la
 * lecture, l'etude et la contribution, pas le redeploiement du service par un
 * tiers : la page dit donc « depot public », jamais « open source ». */
const verifications = [
  {
    icon: ShieldCheck,
    forme: 'triangle',
    tone: { text: 'text-mod-chantiers', bg: 'bg-mod-chantiers-soft', socle: 'bg-mod-chantiers' },
    titre: 'Où vivent les données',
    texte: "La base et la mesure d'audience sont hébergées dans l'Union européenne. Nous signons le contrat de sous-traitance prévu par l'article 28 du RGPD, vous restez responsable de traitement, et rien n'est revendu ni utilisé pour de la publicité.",
  },
  {
    icon: Database,
    forme: 'barre',
    tone: { text: 'text-mod-travaux', bg: 'bg-mod-travaux-soft', socle: 'bg-mod-travaux' },
    titre: 'Ce que vous emportez en partant',
    texte: "Les couches que vous publiez sont servies en GeoJSON, les signalements de vos habitants s'exportent en CSV. Ce sont des formats standards, que votre SIG et vos successeurs relisent sans nous. La réversibilité est ce qu'un marché public doit vous garantir : ici elle est dans le produit.",
  },
  {
    icon: Share2,
    forme: 'cercle',
    tone: { text: 'text-mod-carte', bg: 'bg-mod-carte-soft', socle: 'bg-mod-carte' },
    titre: 'Ce que ça donne à votre open data',
    texte: "Depuis la loi pour une République numérique, une collectivité de plus de 3 500 habitants employant plus de 50 agents publie ses données dans un format ouvert. Vos projets et vos chantiers sortent en GeoJSON à une adresse stable, réutilisable telle quelle par votre portail.",
  },
  {
    icon: FileCode,
    forme: 'arche',
    tone: { text: 'text-mod-participer', bg: 'bg-mod-participer-soft', socle: 'bg-mod-participer' },
    titre: 'Ce que fait le logiciel, ligne à ligne',
    texte: "Le dépôt est public : votre direction des systèmes d'information peut lire comment les données sont traitées avant que vous signiez. La licence couvre la lecture, l'étude et la contribution, pas le redéploiement du service par un tiers.",
  },
]
</script>
