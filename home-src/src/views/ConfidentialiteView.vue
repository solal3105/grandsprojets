<template>
  <div>
    <!-- Hero -->
    <section class="relative bg-gray-bg pt-36 pb-20 overflow-hidden">
      <PageBlobs top="blob-green" bottom="blob-amber" top-offset="-70px" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[768px]">
          <EyebrowLabel>Confidentialité</EyebrowLabel>
          <h1 class="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] tracking-tight-hero text-dark">
            Nous mesurons l'usage,
            <span class="text-gradient-green"> vous gardez la main</span>
          </h1>
          <p class="mt-8 text-gray-text text-base sm:text-lg leading-relaxed max-w-[600px]">
            Open Projets mesure la fréquentation de ses espaces pour savoir ce qui
            sert et ce qui gêne. Cette page dit exactement ce qui est collecté, et
            vous permet de refuser cette mesure en un clic, sans créer de compte.
          </p>
        </div>
      </div>
    </section>

    <!-- Le refus, en haut de page : ce que le visiteur vient chercher -->
    <section class="py-20 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[768px] rounded-2xl border border-gray-border p-8 sm:p-10">
          <h2 class="font-heading font-bold text-2xl sm:text-3xl text-dark">
            Vous pouvez refuser la mesure d'audience
          </h2>
          <p class="mt-4 text-gray-text leading-relaxed">
            Le refus s'applique immédiatement aux deux outils que nous utilisons,
            PostHog et Google Analytics, sur tous les espaces Open Projets ouverts
            depuis ce navigateur : le site vitrine, les cartes publiques, les
            fiches projet et l'espace d'administration. Il est conservé sur votre
            appareil, donc à renouveler si vous changez de navigateur ou effacez
            vos données de navigation.
          </p>

          <div class="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-medium text-sm transition-colors duration-200"
              :class="optedOut
                ? 'bg-gray-bg text-dark border border-gray-border hover:bg-white'
                : 'bg-primary text-white hover:bg-red-700 shadow-lg shadow-primary/30'"
              @click="toggle"
            >
              <component :is="optedOut ? Check : Ban" class="w-4 h-4" />
              {{ optedOut ? 'Réactiver la mesure d\'audience' : 'Refuser la mesure d\'audience' }}
            </button>

            <p class="text-sm font-medium" :class="optedOut ? 'text-primary' : 'text-gray-text'">
              {{ etat }}
            </p>
          </div>

          <p class="mt-6 text-xs text-gray-text leading-relaxed">
            Si votre navigateur envoie le signal « Do Not Track » ou « Global
            Privacy Control », la mesure est déjà désactivée sans aucune action de
            votre part. Vous pouvez aussi ajouter <code class="font-mono">?tracking=off</code>
            à n'importe quelle adresse du site pour obtenir le même résultat, et
            <code class="font-mono">?tracking=on</code> pour revenir en arrière.
          </p>
        </div>
      </div>
    </section>

    <!-- Ce qui est mesuré, ce qui ne l'est pas -->
    <section class="py-24 bg-gray-bg">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
          Voici ce que nous regardons
        </h2>

        <div class="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div
            v-for="block in blocks"
            :key="block.title"
            class="rounded-2xl border border-gray-border bg-white p-8"
          >
            <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-6" :class="block.bgClass">
              <component :is="block.icon" class="w-6 h-6" :class="block.iconClass" />
            </div>
            <h3 class="font-heading font-bold text-xl text-dark mb-3">{{ block.title }}</h3>
            <ul class="space-y-2">
              <li
                v-for="line in block.lines"
                :key="line"
                class="text-sm text-gray-text leading-relaxed"
              >
                {{ line }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Cadre technique et juridique -->
    <section class="py-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="max-w-[768px]">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl leading-tight tracking-tight text-dark">
          Le cadre technique tient en quatre points
        </h2>

        <dl class="mt-10 space-y-8">
          <div v-for="item in details" :key="item.term">
            <dt class="font-heading font-semibold text-lg text-dark">{{ item.term }}</dt>
            <dd class="mt-2 text-gray-text leading-relaxed">{{ item.desc }}</dd>
          </div>
        </dl>

        <p class="mt-12 text-gray-text leading-relaxed">
          Pour exercer vos droits d'accès, de rectification ou d'effacement, ou
          pour toute question sur ce traitement, écrivez-nous depuis la
          <router-link to="/contact" class="text-primary font-medium hover:underline">page contact</router-link>.
        </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Ban, Check, BarChart3, ShieldOff } from 'lucide-vue-next'
import PageBlobs from '@/components/PageBlobs.vue'
import EyebrowLabel from '@/components/EyebrowLabel.vue'

const optedOut = ref(false)
const actif = ref(false)

// Le module de mesure est chargé en `defer` : au montage du composant il peut
// ne pas encore avoir été évalué. La valeur de repli lit directement le même
// stockage que lui, pour que la page n'affiche jamais un état faux.
function readOptOut() {
  if (window.OPAnalytics) return window.OPAnalytics.isOptedOut()
  try { return window.localStorage.getItem('op_analytics_optout') === '1' } catch { return false }
}

function relire() {
  optedOut.value = readOptOut()
  actif.value = !!window.OPAnalytics?.isEnabled()
}

onMounted(relire)

// La mesure peut être à l'arrêt sans que le visiteur ait rien demandé : signal
// Do Not Track du navigateur, bloqueur de traceurs. Annoncer « active » dans ce
// cas serait faux, et c'est précisément ce que cette page ne doit pas faire.
const etat = computed(() => {
  if (optedOut.value) return 'La mesure est désactivée sur ce navigateur.'
  if (actif.value) return 'La mesure est active sur ce navigateur.'
  return 'La mesure est déjà inactive sur ce navigateur, sans action de votre part.'
})

function toggle() {
  if (optedOut.value) window.OPAnalytics?.optIn()
  else window.OPAnalytics?.optOut()

  // Repli si le module n'a pas pu se charger (bloqueur, coupure réseau) :
  // le choix doit être enregistré quand même.
  if (!window.OPAnalytics) {
    try {
      if (optedOut.value) window.localStorage.removeItem('op_analytics_optout')
      else window.localStorage.setItem('op_analytics_optout', '1')
    } catch { /* stockage indisponible */ }
  }
  // relire() repart du stockage, qui vient d'être écrit dans les deux branches :
  // inutile, et faux, de basculer le drapeau une seconde fois à la main.
  relire()
}

const blocks = [
  {
    icon: BarChart3,
    bgClass: 'bg-primary/10',
    iconClass: 'text-primary',
    title: 'Ce que nous mesurons',
    lines: [
      'Les pages consultées et l\'espace d\'où elles viennent.',
      'Les projets et catégories ouverts sur une carte publique.',
      'Les demandes de démonstration envoyées depuis le site.',
      'Le navigateur, le type d\'appareil et le pays de connexion.',
      'Un enregistrement de la navigation, saisies masquées, pour comprendre les blocages d\'interface.',
    ],
  },
  {
    icon: ShieldOff,
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
    title: 'Ce que nous ne faisons pas',
    lines: [
      'Aucune publicité, aucun reciblage, aucune revente de données.',
      'Aucun suivi de votre navigation sur d\'autres sites.',
      'Aucun enregistrement de ce que vous tapez dans un champ de formulaire : les saisies sont masquées avant l\'envoi.',
      'Aucun profil personnel tant que vous ne vous connectez pas à un espace d\'administration.',
    ],
  },
]

const details = [
  {
    term: 'L\'outil principal est PostHog, hébergé dans l\'Union européenne',
    desc: 'Les données collectées par PostHog ne quittent pas l\'Union européenne et ne sont accessibles qu\'à l\'équipe Open Projets. Nous utilisons par ailleurs Google Analytics pour le suivi de notre référencement.',
  },
  {
    term: 'Les requêtes de mesure passent par notre propre domaine',
    desc: 'PostHog est appelé via openprojets.com et non via un domaine tiers. Google Analytics, lui, reste un service de Google et communique avec ses propres serveurs : c\'est le seul appel externe de mesure sur nos pages, et le refus ci-dessus le coupe également.',
  },
  {
    term: 'Les identifiants sont limités à ce domaine',
    desc: 'Un identifiant de visite est conservé sur votre appareil pour ne pas compter deux fois la même personne. Il n\'est partagé avec aucun autre site et ne permet pas de vous identifier.',
  },
  {
    term: 'Les comptes connectés sont identifiés, les visiteurs ne le sont pas',
    desc: 'Tant que vous ne vous connectez pas, aucune fiche personne n\'est créée : votre visite est comptée sans être rattachée à une identité. Si vous vous connectez à un espace d\'administration, vos actions sont rattachées à votre compte afin que nous puissions vous assister, et le restent jusqu\'à votre déconnexion.',
  },
  {
    term: 'Les enregistrements de navigation ont des limites que nous assumons',
    desc: 'Ils reproduisent ce qui s\'affiche à l\'écran : le texte des pages en fait partie, seules vos saisies sont masquées. Ils sont désactivés lorsque la carte est intégrée dans le site d\'une collectivité, où vous ne pourriez pas exprimer votre refus depuis cette page.',
  },
]
</script>
