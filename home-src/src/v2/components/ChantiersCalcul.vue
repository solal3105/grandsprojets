<template>
  <!-- Le calcul du prix de Chantiers, ligne à ligne. En mode commercial chaque
       ligne porte son montant ; un visiteur voit la méthode et les quantités,
       les montants restent réservés au tarif exact. -->
  <div class="text-sm" :class="compact ? 'text-[13px]' : ''">
    <template v-if="chiffrage.espaces.length === 1">
      <dl class="divide-y divide-gray-border">
        <!-- Les routes. Un territoire peu dense a sa réduction, sur sa propre
             ligne ; un territoire plus dense que la moyenne voit l'ajustement
             expliqué sous la ligne des routes, dont le montant l'intègre. -->
        <template v-if="espace.routes">
          <div class="flex items-baseline justify-between gap-4 py-2.5">
            <dt>
              <span class="font-medium text-dark">Permissions de voirie : {{ nombre(espace.routes.km) }} km de routes</span>
              <span v-if="espace.routes.coefficient > 1" class="block mt-0.5 text-xs text-gray-muted leading-snug">Ajusté à la densité : {{ texteDensite(espace.routes) }}.</span>
            </dt>
            <dd v-if="exact" class="tabular-nums whitespace-nowrap">{{ euros(reduction(espace.routes) ? espace.routes.bareme : espace.routes.montant) }}</dd>
          </div>
          <div v-if="reduction(espace.routes)" class="flex items-baseline justify-between gap-4 py-2.5">
            <dt>
              <span class="font-medium text-dark">Territoire peu dense : -{{ reduction(espace.routes) }} %</span>
              <span class="block mt-0.5 text-xs text-gray-muted leading-snug">{{ texteDensite(espace.routes) }}.</span>
            </dt>
            <dd v-if="exact" class="tabular-nums whitespace-nowrap text-green-ink">-{{ euros(espace.routes.bareme - espace.routes.montant) }}</dd>
          </div>
        </template>
        <div v-if="espace.arretes.length" class="py-2.5">
          <div class="flex items-baseline justify-between gap-4">
            <dt class="font-medium text-dark">{{ espace.arretes.length > 1 ? `Arrêtés de circulation : ${espace.arretes.length} communes, chacune selon sa population` : `Arrêtés de circulation de ${espace.arretes[0].nom}, selon sa population` }}</dt>
            <dd v-if="exact" class="tabular-nums whitespace-nowrap">{{ euros(espace.montantArretes) }}</dd>
          </div>
          <ul class="mt-1.5 grid gap-0.5 text-xs text-gray-muted">
            <li v-for="g in tranches" :key="g.prix" class="flex items-baseline justify-between gap-4">
              <span>{{ g.n }} × {{ g.libelle }}</span>
              <span v-if="exact" class="tabular-nums whitespace-nowrap">{{ g.n }} × {{ euros(g.prix) }}</span>
            </li>
          </ul>
        </div>
      </dl>
    </template>

    <!-- Plusieurs espaces : un par commune, chacun avec ses routes et ses arrêtés -->
    <div v-else class="overflow-x-auto">
      <p class="text-xs text-gray-muted leading-snug">Chaque commune a son propre espace{{ avecRoutes ? ' : ses routes au barème du kilomètre, ajustées à sa densité' : '' }}{{ avecRoutes && avecArretes ? ', et' : avecArretes ? ' :' : '' }}{{ avecArretes ? ' ses arrêtés selon sa population' : '' }}.</p>
      <table class="mt-3 w-full text-xs">
        <thead>
          <tr class="text-left text-gray-muted">
            <th class="font-medium py-1.5 pr-3">Commune</th>
            <th v-if="avecRoutes" class="font-medium py-1.5 pr-3 text-right">Routes</th>
            <th v-if="avecRoutes" class="font-medium py-1.5 pr-3 text-right">Peu dense</th>
            <th v-if="exact" class="font-medium py-1.5 text-right">Par an</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-border">
          <tr v-for="e in chiffrage.espaces" :key="e.nom">
            <td class="py-1.5 pr-3 text-dark">{{ e.nom }}</td>
            <td v-if="avecRoutes" class="py-1.5 pr-3 text-right tabular-nums">{{ nombre(e.routes?.km || 0) }} km</td>
            <td v-if="avecRoutes" class="py-1.5 pr-3 text-right tabular-nums text-green-ink">{{ reduction(e.routes) ? `-${reduction(e.routes)} %` : '' }}</td>
            <td v-if="exact" class="py-1.5 text-right tabular-nums whitespace-nowrap">{{ euros(e.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-3 pt-3 border-t-2 border-dark flex items-baseline justify-between gap-4">
      <span class="font-heading font-bold text-dark">{{ titreTotal }}, par an</span>
      <span v-if="exact" class="font-heading font-bold text-dark tabular-nums whitespace-nowrap">{{ euros(chiffrage.annuel) }}</span>
    </div>
    <p v-if="exact" class="mt-1 text-xs text-gray-muted text-right tabular-nums">soit {{ euros(chiffrage.mensuel) }} par mois, avant remises</p>
    <p v-else class="mt-1 text-xs text-gray-muted">Montants communiqués avec le tarif exact.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { euros, nombre } from '../data/tarification.mjs'
import { GRILLE_ARRETES, DENSITE_REFERENCE } from '../data/tarification-chantiers.mjs'

const props = defineProps({
  chiffrage: { type: Object, required: true },
  exact: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})

const espace = computed(() => props.chiffrage.espaces[0])
const reference = (r) => DENSITE_REFERENCE[r] || DENSITE_REFERENCE.communale

/* La densité : une réduction en pourcentage sous la moyenne, rien au-dessus */
const reduction = (routes) => (routes && routes.coefficient < 1 ? Math.round((1 - routes.coefficient) * 100) : 0)
const texteDensite = (routes) => `${nombre(routes.densite)} habitants par km de route, contre ${nombre(reference(routes.reference))} en moyenne`

/* Ce que chiffrent les espaces : les routes, les arrêtés, ou les deux */
const avecRoutes = computed(() => props.chiffrage.espaces.some((e) => e.routes))
const avecArretes = computed(() => props.chiffrage.espaces.some((e) => e.arretes.length))
const titreTotal = computed(() => (avecRoutes.value && avecArretes.value ? 'Permissions et arrêtés' : avecRoutes.value ? 'Permissions de voirie' : 'Arrêtés de circulation'))



/* Les communes regroupées par tranche de population */
const tranches = computed(() => {
  const groupes = new Map()
  for (const c of espace.value?.arretes || []) groupes.set(c.montant, (groupes.get(c.montant) || 0) + 1)
  return GRILLE_ARRETES.filter((t) => groupes.has(t.prix)).map((t) => {
    const i = GRILLE_ARRETES.indexOf(t)
    const bas = i ? GRILLE_ARRETES[i - 1].sous : 0
    const n = groupes.get(t.prix)
    const pluriel = n > 1 ? 'communes' : 'commune'
    const libelle = i === 0 ? `${pluriel} de moins de ${nombre(t.sous)} habitants`
      : t.sous === Infinity ? `${pluriel} de plus de ${nombre(bas)} habitants`
      : `${pluriel} de ${nombre(bas)} à ${nombre(t.sous)} habitants`
    return { prix: t.prix, n, libelle }
  })
})
</script>
