<template>
  <!-- La recherche d'une collectivité : on tape son nom, on choisit dans la
       liste. Même combobox que la démo de l'accueil (DemoChoice). -->
  <div class="relative">
    <label :for="id" class="sr-only">{{ etiquette }}</label>
    <div class="flex items-center gap-3 bg-white rounded-2xl border border-gray-border px-4 py-3.5 shadow-pill transition-shadow duration-200 focus-within:shadow-card focus-within:border-dark">
      <Search class="w-4 h-4 shrink-0 text-gray-muted" />
      <input
        :id="id"
        ref="champ"
        v-model="saisie"
        type="text"
        autocomplete="off"
        :placeholder="placeholder"
        class="w-full bg-transparent text-[15px] text-dark placeholder:text-gray-muted outline-none"
        role="combobox"
        :aria-controls="`${id}-suggestions`"
        :aria-expanded="ouvert"
        :aria-activedescendant="index >= 0 ? `${id}-option-${index}` : undefined"
        @input="chercher"
        @keydown.down.prevent="deplacer(1)"
        @keydown.up.prevent="deplacer(-1)"
        @keydown.enter.prevent="choisirCourant"
        @keydown.esc.stop="ouvert = false"
        @blur="fermerBientot"
      />
      <Loader2 v-if="recherche" class="w-4 h-4 shrink-0 text-gray-muted animate-spin" aria-hidden="true" />
    </div>

    <ul
      v-show="ouvert && propositions.length"
      :id="`${id}-suggestions`"
      role="listbox"
      class="mt-2 bg-white border border-gray-border rounded-2xl p-2 text-left overflow-hidden"
      :class="enLigne ? '' : 'absolute left-0 right-0 top-full z-30 shadow-card'"
    >
      <li
        v-for="(p, i) in propositions" :key="p.cle"
        :id="`${id}-option-${i}`"
        role="option"
        :aria-selected="i === index"
        :data-territoire="p.cle"
        class="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
        :class="i === index ? 'bg-gray-bg' : 'hover:bg-gray-bg'"
        @mousedown.prevent="choisir(p)"
        @mouseenter="index = i"
      >
        <span class="min-w-0">
          <span class="block text-[15px] font-medium text-dark truncate">{{ p.nom }}</span>
          <span class="block text-xs text-gray-muted">{{ p.detail }}</span>
        </span>
        <span v-if="p.population" class="text-xs text-gray-muted tabular-nums shrink-0">{{ nombre(p.population) }} hab.</span>
      </li>
    </ul>
    <p v-if="aucun" class="mt-2 text-sm text-gray-muted" role="status">Nous n'avons trouvé aucune collectivité à ce nom. Vérifiez l'orthographe.</p>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { Search, Loader2 } from 'lucide-vue-next'
import { chercherTerritoires } from '../data/territoires.mjs'
import { nombre } from '../data/tarification.mjs'

const props = defineProps({
  id: { type: String, required: true },
  etiquette: { type: String, default: 'Nom de votre collectivité' },
  placeholder: { type: String, default: 'Le nom de votre commune ou de votre intercommunalité' },
  departements: { type: Boolean, default: false },
  // Dans une fenêtre qui défile, une liste flottante serait coupée : elle
  // prend alors sa place dans le flux, sous le champ
  enLigne: { type: Boolean, default: false },
})
const emit = defineEmits(['choisir'])

const saisie = ref('')
const propositions = ref([])
const ouvert = ref(false)
const index = ref(-1)
const recherche = ref(false)
const aucun = ref(false)
const champ = ref(null)

let minuteur = null
// Les réponses n'arrivent pas dans l'ordre des frappes : sans ce compteur, une
// requête lente écraserait une réponse plus récente.
let sequence = 0

function chercher() {
  index.value = -1
  aucun.value = false
  clearTimeout(minuteur)
  const q = saisie.value.trim()
  if (q.length < 2) { propositions.value = []; ouvert.value = false; recherche.value = false; return }
  recherche.value = true
  minuteur = setTimeout(async () => {
    const seq = ++sequence
    const liste = await chercherTerritoires(q, { departements: props.departements }).catch(() => [])
    if (seq !== sequence) return
    recherche.value = false
    propositions.value = liste
    ouvert.value = liste.length > 0
    aucun.value = liste.length === 0
  }, 250)
}

function deplacer(pas) {
  if (!propositions.value.length) return
  ouvert.value = true
  const n = propositions.value.length
  index.value = (index.value + pas + n) % n
}

function choisir(p) {
  ouvert.value = false
  saisie.value = ''
  propositions.value = []
  emit('choisir', p)
}

function choisirCourant() {
  const p = propositions.value[index.value >= 0 ? index.value : 0]
  if (p) choisir(p)
}

let fermeture = null
function fermerBientot() {
  fermeture = setTimeout(() => { ouvert.value = false }, 150)
}

onUnmounted(() => { clearTimeout(minuteur); clearTimeout(fermeture) })

defineExpose({ focus: () => champ.value?.focus() })
</script>
