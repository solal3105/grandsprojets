<template>
  <div class="bg-gray-bg min-h-screen">
    <!-- La barre d'outils : à l'écran seulement, jamais sur le papier -->
    <div class="print:hidden sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-border">
      <div class="max-w-[900px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <router-link :to="{ name: 'tarification', query: route.query }" class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-text hover:text-dark transition-colors">
          <ArrowLeft class="w-4 h-4" />
          Modifier l'estimation
        </router-link>
        <button
          type="button"
          class="inline-flex items-center gap-2.5 bg-primary-ink text-white text-sm font-medium px-5 py-3 rounded-full hover:bg-red-700 transition-colors"
          @click="imprimer"
        >
          <Printer class="w-4 h-4" />
          Enregistrer en PDF
        </button>
      </div>
      <p class="max-w-[900px] mx-auto px-6 pb-3 text-xs text-gray-muted">
        Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF » et laissez les couleurs d'arrière-plan activées.
      </p>
    </div>

    <!-- Le document : une feuille A4, dans la charte du site -->
    <article id="estimation" class="feuille bg-white text-dark mx-auto my-8 print:my-0 shadow-card print:shadow-none">
      <header class="flex items-start justify-between gap-8">
        <LogoSvg :width="150" :height="58" />
        <div class="text-right">
          <p class="font-heading font-bold text-2xl leading-tight tracking-tight">Estimation budgétaire</p>
          <p class="mt-1 text-sm text-gray-text">Document indicatif, non contractuel</p>
          <p v-if="!exact" id="estimation-fourchette" class="mt-1 text-xs text-gray-muted">Montants en fourchette. Le tarif exact vous est communiqué sur demande.</p>
          <dl class="mt-4 text-xs text-gray-text leading-relaxed">
            <div v-if="suivi" class="flex justify-end gap-2"><dt>Référence</dt><dd id="estimation-suivi" class="font-medium text-dark tabular-nums">{{ suivi }}</dd></div>
            <div class="flex justify-end gap-2"><dt>Établie le</dt><dd class="font-medium text-dark">{{ dateLongue(aujourdhui) }}</dd></div>
            <div class="flex justify-end gap-2"><dt>Valable jusqu'au</dt><dd class="font-medium text-dark">{{ dateLongue(validite) }}</dd></div>
          </dl>
        </div>
      </header>

      <section class="mt-10 grid grid-cols-2 gap-8">
        <div>
          <p class="etiquette">Pour</p>
          <p id="estimation-collectivite" class="mt-2 font-heading font-bold text-xl leading-tight">{{ collectivite || 'Votre collectivité' }}</p>
          <p v-if="contact" class="mt-1 text-sm text-gray-text">{{ contact }}</p>
          <p class="mt-1 text-sm text-gray-text">{{ nombre(estimation.population) }} habitants</p>
        </div>
        <div>
          <p class="etiquette">De la part de</p>
          <p class="mt-2 font-heading font-bold text-xl leading-tight">Open Projets</p>
          <p class="mt-1 text-sm text-gray-text">Édité par VAZY, société à mission, Villeurbanne</p>
          <p class="mt-1 text-sm text-gray-text">openprojets.com</p>
        </div>
      </section>

      <!-- Ce que l'estimation comprend -->
      <section class="mt-10">
        <h2 class="font-heading font-bold text-lg tracking-tight">Ce que comprend cette estimation</h2>
        <p class="mt-2 text-sm text-gray-text leading-relaxed">
          Un espace Open Projets pour {{ collectivite || 'votre collectivité' }}, avec
          {{ retenus.length > 1 ? `les ${retenus.length} modules ci-dessous` : 'le module ci-dessous' }},
          sur un engagement de {{ estimation.annees }} {{ estimation.annees > 1 ? 'ans' : 'an' }}.
          La mise en service comprend la configuration de l'espace, vos catégories et votre identité
          visuelle, vos premières fiches et la formation de votre équipe.
        </p>
        <ul class="mt-5 grid grid-cols-1 gap-3">
          <li v-for="m in retenus" :key="m.key" class="flex items-start gap-4 rounded-2xl border border-gray-border p-4">
            <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" :class="m.tone.bg">
              <component :is="m.icon" class="w-4 h-4" :class="m.tone.text" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-heading font-semibold text-sm">{{ m.name }}</span>
              <span class="block mt-0.5 text-xs text-gray-text leading-snug">{{ m.produces }}</span>
            </span>
            <span v-if="exact" class="text-sm font-medium tabular-nums whitespace-nowrap">{{ euros(ligneDe(m.key).prix) }} <span class="text-xs font-normal text-gray-muted">/ mois</span></span>
          </li>
        </ul>
      </section>

      <!-- Le détail du prix : ouvre la seconde page du document imprimé -->
      <section class="mt-10 page-2">
        <h2 class="font-heading font-bold text-lg tracking-tight">Le détail du prix, hors taxes</h2>
        <table class="mt-4 w-full text-sm">
          <tbody>
            <!-- Le prix de chaque module ne figure qu'en mode commercial -->
            <template v-if="exact">
              <tr v-for="l in estimation.lignes" :key="l.cle" class="border-b border-gray-border">
                <td class="py-2.5 pr-4">{{ moduleByKey[l.cle]?.name }}</td>
                <td class="py-2.5 text-right tabular-nums whitespace-nowrap">{{ euros(l.prix) }} / mois</td>
              </tr>
            </template>
            <tr v-if="estimation.remiseModules.montant > 0" class="border-b border-gray-border">
              <td class="py-2.5 pr-4 text-gray-text">{{ exact ? `Plusieurs modules : -${pourcent(estimation.remiseModules.taux)} sur ${moduleByKey[estimation.remiseModules.module]?.name}` : 'Remise multi-modules' }}</td>
              <td class="py-2.5 text-right tabular-nums whitespace-nowrap text-green-ink">{{ exact ? `-${euros(estimation.remiseModules.montant)} / mois` : `-${pourcent(estimation.remiseModules.taux)}` }}</td>
            </tr>
            <tr v-if="estimation.remiseEngagement.montant > 0" class="border-b border-gray-border">
              <td class="py-2.5 pr-4 text-gray-text">Engagement {{ estimation.annees }} ans : -{{ pourcent(estimation.remiseEngagement.taux) }} chaque année</td>
              <td class="py-2.5 text-right tabular-nums whitespace-nowrap text-green-ink">{{ exact ? `-${euros(estimation.remiseEngagement.montant)} / mois` : `-${pourcent(estimation.remiseEngagement.taux)}` }}</td>
            </tr>
            <tr class="border-b border-gray-border font-semibold">
              <td class="py-2.5 pr-4">Abonnement</td>
              <td id="estimation-abonnement" class="py-2.5 text-right tabular-nums whitespace-nowrap">{{ montant(estimation.mensuel) }} / mois, soit {{ montant(estimation.annuel) }} / an</td>
            </tr>
            <tr class="border-b border-gray-border">
              <td class="py-2.5 pr-4">Mise en service, une seule fois<span v-if="estimation.setupOfferte" class="block text-xs text-gray-muted">Offerte aux communes de moins de {{ nombre(MISE_EN_SERVICE.offerteSous) }} habitants</span></td>
              <td class="py-2.5 text-right tabular-nums whitespace-nowrap align-top">{{ estimation.setupOfferte ? 'Offerte' : montant(estimation.setup) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="mt-5 rounded-2xl bg-dark text-white p-5 flex items-center justify-between gap-6 encre">
          <div>
            <p class="font-heading font-bold text-base leading-tight">Total sur {{ estimation.annees }} {{ estimation.annees > 1 ? 'ans' : 'an' }}, mise en service comprise</p>
            <p class="mt-1 text-xs text-white/70">Hors taxes. La TVA de 20 % s'ajoute à ces montants.</p>
          </div>
          <p id="estimation-total" class="font-heading font-bold tabular-nums whitespace-nowrap" :class="exact ? 'text-3xl' : 'text-2xl'">{{ montant(estimation.total) }} <span class="text-sm font-normal text-white/70">HT</span></p>
        </div>

        <div class="mt-4 grid grid-cols-3 gap-3 text-center">
          <div class="rounded-2xl bg-gray-bg p-4">
            <p class="text-xs text-gray-muted">Première année</p>
            <p class="mt-1 font-heading font-bold tabular-nums" :class="exact ? 'text-lg' : 'text-sm'">{{ montant(estimation.annuel + estimation.setup) }}</p>
          </div>
          <div class="rounded-2xl bg-gray-bg p-4">
            <p class="text-xs text-gray-muted">Chaque année suivante</p>
            <p class="mt-1 font-heading font-bold tabular-nums" :class="exact ? 'text-lg' : 'text-sm'">{{ montant(estimation.annuel) }}</p>
          </div>
          <div class="rounded-2xl bg-gray-bg p-4">
            <p class="text-xs text-gray-muted">Par mois, en moyenne</p>
            <p class="mt-1 font-heading font-bold tabular-nums" :class="exact ? 'text-lg' : 'text-sm'">{{ montant(estimation.total / (estimation.annees * 12)) }}</p>
          </div>
        </div>
      </section>

      <!-- La commande publique -->
      <section class="mt-8 rounded-2xl border p-5" :class="estimation.seuilDepasse ? 'border-amber bg-amber/10' : 'border-gray-border bg-gray-bg'">
        <p class="font-heading font-semibold text-sm">Au regard de la commande publique</p>
        <p class="mt-1.5 text-xs text-gray-text leading-relaxed">
          {{ estimation.seuilDepasse ? estimation.seuilDepasse.texte : SOUS_LES_SEUILS }}
          Ce montant s'apprécie sur le total hors taxes de toute la durée, auquel votre collectivité
          ajoute les services de même nature qu'elle achète par ailleurs. Votre service des marchés
          reste seul juge de la procédure.
        </p>
      </section>

      <footer class="mt-10 pt-5 border-t border-gray-border text-[10.5px] text-gray-muted leading-relaxed">
        <p>
          Cette estimation est établie à partir des éléments connus à ce jour : {{ nombre(estimation.population) }} habitants,
          {{ retenus.map((m) => m.name).join(', ') }}, engagement de {{ estimation.annees }} {{ estimation.annees > 1 ? 'ans' : 'an' }}.
          {{ exact ? '' : 'Les montants sont donnés en fourchette, le tarif exact vous est communiqué sur demande.' }}
          Elle ne vaut pas offre ferme : un devis définitif vous sera adressé après un échange sur votre besoin.
          Montants hors taxes, valables jusqu'au {{ dateLongue(validite) }}.
        </p>
        <p class="mt-2">
          Open Projets est édité par VAZY, SASU, société à mission au sens de la loi PACTE, inscrite au RCS de Lyon,
          établie à Villeurbanne. Données hébergées dans l'Union européenne.
        </p>
      </footer>
    </article>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Printer } from 'lucide-vue-next'
import LogoSvg from '@/components/LogoSvg.vue'
import { modules, moduleByKey } from '../data/modules.js'
import {
  POIDS, POPULATION, ENGAGEMENTS, SOUS_LES_SEUILS, MISE_EN_SERVICE,
  estimer, borner, euros, eurosFourchette, nombre, pourcent,
} from '../data/tarification.mjs'
import { useTarifExact } from '../composables/useTarifExact.js'

const route = useRoute()
const router = useRouter()

/* Fourchette ou tarif exact : le même accès que la page de tarification */
const exact = useTarifExact(route, router)
const montant = (v) => (exact.value ? euros(v) : eurosFourchette(v))

/* Tout vient de l'adresse : la page de tarification y a mis les réglages et
 * ce que l'on a saisi pour le destinataire. Rien n'est enregistré. */
const cles = computed(() => String(route.query.modules || '').split(',').filter((k) => POIDS[k] != null))
const annees = computed(() => {
  const a = Number(route.query.annees)
  return ENGAGEMENTS.some((e) => e.annees === a) ? a : 1
})
const estimation = computed(() => estimer({
  population: route.query.population ? borner(route.query.population) : POPULATION.defaut,
  modules: cles.value.length ? cles.value : ['carte'],
  annees: annees.value,
}))
const retenus = computed(() => modules.filter((m) => estimation.value.lignes.some((l) => l.cle === m.key)))
const ligneDe = (cle) => estimation.value.lignes.find((l) => l.cle === cle) || { prix: 0 }

const texte = (cle, max = 120) => String(route.query[cle] || '').slice(0, max).trim()
const collectivite = computed(() => texte('collectivite'))
const contact = computed(() => texte('contact'))
const suivi = computed(() => texte('suivi', 40))

const aujourdhui = new Date()
/* La validité : la date donnée, sinon soixante jours */
const validite = computed(() => {
  const d = new Date(String(route.query.valide || ''))
  if (!Number.isNaN(d.getTime())) return d
  const v = new Date(aujourdhui)
  v.setDate(v.getDate() + 60)
  return v
})
const dateLongue = (d) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)

function imprimer() {
  window.print()
}
</script>

<style scoped>
.etiquette {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #C4002A;
}
/* La feuille : le format A4 à l'écran comme sur le papier */
.feuille {
  width: 210mm;
  min-height: 297mm;
  padding: 18mm 18mm 16mm;
  box-sizing: border-box;
  border-radius: 12px;
}
/* Les fonds colorés doivent survivre à l'impression */
.encre, .feuille * {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@media print {
  .feuille { width: auto; min-height: 0; margin: 0; padding: 0; border-radius: 0; }
  /* Deux pages, coupées au bon endroit : ce que comprend l'estimation, puis
     le prix. Les blocs ne se coupent jamais au milieu. */
  .page-2 { break-before: page; margin-top: 0 !important; }
  .feuille section, .feuille li, .feuille tr, .feuille footer { break-inside: avoid; }
  .feuille .mt-10 { margin-top: 24px !important; }
  .feuille td { padding-top: 7px; padding-bottom: 7px; }
}
</style>

<style>
/* Hors portée du composant : la page elle-même, à l'impression */
@page { size: A4; margin: 12mm 16mm; }
@media print {
  html, body { background: #fff !important; }
}
</style>
