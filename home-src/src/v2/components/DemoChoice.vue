<template>
  <!-- Une seule proposition, et elle commence ici : le visiteur tape sa commune
       dans la page, il n'a pas a choisir entre deux tuiles avant d'avoir rien
       vu. L'espace deja en service reste accessible, en retrait. -->
  <section id="essayer" class="py-20 sm:py-28 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="max-w-[720px] mx-auto text-center">
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-dark">
          Voyez la carte de votre commune
        </h2>
        <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed">
          Tapez son nom. Nous cherchons ses projets sur le web public et nous construisons sa carte
          sous vos yeux, sans compte et sans installation.
        </p>
      </div>

      <form
        class="mt-10 sm:mt-12 max-w-[620px] mx-auto"
        @submit.prevent="lancer()"
      >
        <div class="relative">
          <div
            class="flex flex-col sm:flex-row sm:items-center gap-2 bg-white rounded-3xl sm:rounded-full border border-gray-border p-2 shadow-pill transition-shadow duration-200 focus-within:shadow-card"
          >
            <label for="commune-demo" class="sr-only">Nom de votre commune</label>
            <span class="flex items-center gap-3 flex-1 min-w-0 px-4 py-2">
              <Search class="w-4 h-4 shrink-0 text-gray-muted" />
              <input
                id="commune-demo"
                ref="champ"
                v-model="saisie"
                type="text"
                autocomplete="off"
                placeholder="Nom de votre commune"
                class="w-full bg-transparent text-[15px] text-dark placeholder:text-gray-muted outline-none"
                role="combobox"
                aria-controls="commune-suggestions"
                :aria-expanded="ouvert"
                :aria-activedescendant="index >= 0 ? `commune-option-${index}` : undefined"
                @input="chercher"
                @keydown.down.prevent="deplacer(1)"
                @keydown.up.prevent="deplacer(-1)"
                @keydown.esc="ouvert = false"
                @blur="fermerBientot"
              />
            </span>
            <button
              type="submit" v-tilt-btn
              class="group inline-flex items-center justify-center gap-2 bg-primary-ink text-white text-[15px] font-medium px-7 py-3.5 rounded-full hover:bg-red-700 transition-colors shrink-0"
            >
              Voir ma carte
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>

          <ul
            v-show="ouvert && communes.length"
            id="commune-suggestions"
            role="listbox"
            class="absolute left-0 right-0 top-full mt-2 z-20 bg-white border border-gray-border rounded-2xl shadow-card p-2 text-left overflow-hidden"
          >
            <li
              v-for="(c, i) in communes" :key="c.code"
              :id="`commune-option-${i}`"
              role="option"
              :aria-selected="i === index"
              class="flex items-baseline justify-between gap-4 px-4 py-2.5 rounded-xl cursor-pointer transition-colors"
              :class="i === index ? 'bg-gray-bg' : 'hover:bg-gray-bg'"
              @mousedown.prevent="lancer(c)"
              @mouseenter="index = i"
            >
              <span class="text-[15px] font-medium text-dark truncate">{{ c.nom }}</span>
              <span class="text-xs text-gray-muted shrink-0">{{ c.departement?.nom }}</span>
            </li>
          </ul>
        </div>

        <!-- Le repli quand personne ne trouve sa commune : le simulateur a son
             propre champ, il ne renvoie pas le visiteur les mains vides. -->
        <p class="mt-5 text-center text-sm text-gray-muted">
          Vous préférez visiter un espace déjà en service&nbsp;?
          <a
            :href="MAP_LYON_URL" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1 text-dark underline underline-offset-4 decoration-gray-300 hover:decoration-dark transition-colors"
          >
            Ouvrez celui d'une métropole
            <ArrowUpRight class="w-3.5 h-3.5" />
          </a>
        </p>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { ArrowRight, ArrowUpRight, Search } from 'lucide-vue-next'
import { DEMO_KIOSK_URL, MAP_LYON_URL } from '@/data/siteUrls.js'

const saisie = ref('')
const communes = ref([])
const ouvert = ref(false)
const index = ref(-1)
const champ = ref(null)

let minuteur = null
// Les reponses de l'API n'arrivent pas dans l'ordre des frappes : sans ce
// compteur, une requete lente ecrase une reponse plus recente.
let sequence = 0

function chercher() {
  index.value = -1
  clearTimeout(minuteur)
  const q = saisie.value.trim()
  if (q.length < 2) { communes.value = []; ouvert.value = false; return }
  minuteur = setTimeout(async () => {
    const seq = ++sequence
    try {
      const r = await fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=departement&boost=population&limit=6`
      )
      const liste = r.ok ? await r.json() : []
      if (seq !== sequence) return
      communes.value = liste
      ouvert.value = liste.length > 0
    } catch {
      if (seq !== sequence) return
      communes.value = []
      ouvert.value = false
    }
  }, 250)
}

function deplacer(pas) {
  if (!communes.value.length) return
  ouvert.value = true
  const n = communes.value.length
  index.value = (index.value + pas + n) % n
}

// Le clic sur une suggestion arrive apres le blur du champ : sans ce delai, la
// liste disparait avant que le clic soit compte.
function fermerBientot() {
  setTimeout(() => { ouvert.value = false }, 150)
}

/* Sans commune reconnue, le simulateur s'ouvre sur son propre champ : mieux
 * vaut une page ou l'on peut taper qu'un bouton qui ne fait rien. */
function lancer(commune) {
  const choix = commune || communes.value[index.value] || communes.value[0] || null
  const url = choix ? `${DEMO_KIOSK_URL}?commune=${encodeURIComponent(choix.code)}&auto=1` : DEMO_KIOSK_URL
  window.OPAnalytics?.capture?.('demo_commune_lancee', { commune: choix?.code || null })
  ouvert.value = false
  window.open(url, '_blank', 'noopener')
}

onUnmounted(() => clearTimeout(minuteur))
</script>
