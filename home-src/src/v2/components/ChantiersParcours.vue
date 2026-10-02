<template>
  <!-- Le parcours qui chiffre Chantiers : quelques questions pré-remplies avec
       les données publiques, puis le calcul. Il s'ouvre quand on coche le
       module, quand on change de collectivité, et par « Modifier les réponses ». -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div v-if="ouvert" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-dark/50 backdrop-blur-sm p-0 sm:p-6" @mousedown.self="fermer">
        <div
          ref="boite"
          role="dialog"
          aria-modal="true"
          aria-labelledby="parcours-titre"
          class="parcours relative w-full sm:max-w-[620px] max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-card"
          @keydown.esc.prevent="fermer"
          @keydown.tab="garderLeFocus"
        >
          <div class="px-6 sm:px-8 pt-6 sm:pt-7">
            <div class="flex items-center justify-between gap-4">
              <span class="inline-flex items-center gap-2.5">
                <span class="w-8 h-8 rounded-xl flex items-center justify-center bg-mod-chantiers-soft">
                  <ClipboardCheck class="w-4 h-4 text-mod-chantiers" />
                </span>
                <span class="text-sm font-semibold text-dark">Chantiers et arrêtés</span>
              </span>
              <button type="button" class="w-9 h-9 rounded-full flex items-center justify-center text-gray-muted hover:text-dark hover:bg-gray-bg transition-colors" aria-label="Fermer sans enregistrer" @click="fermer">
                <X class="w-5 h-5" />
              </button>
            </div>
            <div v-if="etapes.length > 1" class="mt-5 flex items-center gap-3">
              <div class="flex-1 h-1.5 rounded-full bg-gray-bg overflow-hidden" aria-hidden="true">
                <span class="block h-full rounded-full bg-mod-chantiers transition-all duration-300 motion-reduce:transition-none" :style="{ width: `${((rang + 1) / etapes.length) * 100}%` }" />
              </div>
              <span class="text-xs text-gray-muted tabular-nums whitespace-nowrap">{{ etape === 'recap' ? 'Votre prix' : `Question ${rang + 1} sur ${nbQuestions}` }}</span>
            </div>
          </div>

          <div class="px-6 sm:px-8 py-6 overflow-y-auto">
            <!-- La collectivité, quand la page n'en a pas encore -->
            <template v-if="etape === 'territoire'">
              <h2 id="parcours-titre" class="titre">Pour quelle collectivité ?</h2>
              <div class="mt-5">
                <TerritoireRecherche id="parcours-territoire" ref="recherche" :departements="true" en-ligne placeholder="Votre commune, intercommunalité ou département" @choisir="(p) => emit('choisir-territoire', p)" />
              </div>
              <p v-if="chargement" class="mt-4 inline-flex items-center gap-2 text-sm text-gray-muted" role="status"><Loader2 class="w-4 h-4 animate-spin" /> Lecture des chiffres publics</p>
              <p v-if="erreur" class="mt-4 text-sm text-primary-ink" role="alert">{{ erreur }}</p>
            </template>

            <!-- 1. Ce que l'on veut faire, et au nom de qui -->
            <template v-else-if="etape === 'usage'">
              <h2 id="parcours-titre" class="titre">Que voulez-vous faire dans l'outil ?</h2>
              <div class="mt-5 grid gap-2.5" role="radiogroup" aria-labelledby="parcours-titre">
                <button
                  v-for="c in CHOIX_USAGE" :key="c.libelle"
                  type="button" role="radio" :aria-checked="usageAffiche === c.valeur"
                  :disabled="!permissionsPossibles && c.valeur !== 'arretes'"
                  :data-choix-usage="c.valeur || 'les-deux'"
                  class="option disabled:opacity-40 disabled:cursor-not-allowed" :class="usageAffiche === c.valeur ? 'option--choisie' : ''"
                  @click="brouillon.usage = c.valeur"
                >
                  <span class="pastille" :class="usageAffiche === c.valeur ? 'pastille--choisie' : ''" aria-hidden="true"><Check v-if="usageAffiche === c.valeur" class="w-3 h-3 text-white" /></span>
                  <span>{{ c.libelle }}</span>
                </button>
              </div>
              <!-- Une commune dont l'intercommunalité délivre les permissions -->
              <p v-if="!permissionsPossibles" class="source"><Info class="w-3.5 h-3.5 shrink-0" />
                <span>
                  À {{ territoire.nom }}, les permissions de voirie sont délivrées par {{ territoire.epci.nom }}.
                  <button v-if="corrigeable" type="button" data-corriger="commune" class="underline underline-offset-2" @click="brouillon.nom = 'commune'">La commune délivre les siennes</button>
                </span>
              </p>
              <button v-if="territoire.type === 'commune' && territoire.epci" type="button" data-vers-interco class="mt-4 inline-flex items-center gap-1.5 text-sm text-dark underline underline-offset-4 decoration-gray-300 hover:decoration-dark" @click="versInterco">
                Chiffrer plutôt pour toute l'intercommunalité
                <ArrowRight class="w-3.5 h-3.5" />
              </button>
              <template v-if="nomModifiable">
                <p id="parcours-nom" class="mt-6 text-sm font-semibold text-dark">Qui s'abonne ?</p>
                <div class="mt-3 grid gap-2.5" role="radiogroup" aria-labelledby="parcours-nom">
                  <button
                    v-for="c in choixDuNom" :key="c.valeur"
                    type="button" role="radio" :aria-checked="brouillon.nom === c.valeur"
                    :data-nom="c.valeur"
                    class="option" :class="brouillon.nom === c.valeur ? 'option--choisie' : ''"
                    @click="brouillon.nom = c.valeur"
                  >
                    <span class="pastille" :class="brouillon.nom === c.valeur ? 'pastille--choisie' : ''" aria-hidden="true"><Check v-if="brouillon.nom === c.valeur" class="w-3 h-3 text-white" /></span>
                    <span>{{ c.libelle }}</span>
                  </button>
                </div>
                <p v-if="presume && brouillon.nom === presume" class="source"><Sparkles class="w-3.5 h-3.5 shrink-0" /> Pré-rempli d'après la base nationale de l'intercommunalité.</p>
              </template>
            </template>

            <!-- 2. Les kilomètres de routes gérés -->
            <template v-else-if="etape === 'km'">
              <h2 id="parcours-titre" class="titre">{{ questionKm }}</h2>
              <div class="mt-5 flex flex-wrap items-baseline gap-x-2">
                <label for="parcours-km" class="sr-only">Kilomètres de routes</label>
                <input
                  id="parcours-km"
                  v-model="kmSaisis"
                  type="text" inputmode="numeric"
                  :style="{ width: `${Math.max(2, String(kmSaisis).length) + 0.5}ch` }"
                  class="bg-transparent font-heading font-bold text-5xl tracking-tight text-dark tabular-nums outline-none border-b-2 border-gray-border focus:border-mod-chantiers transition-colors"
                  @blur="lireKm"
                  @keydown.enter.prevent="lireKm(); suivante()"
                />
                <span class="text-gray-text text-lg">km</span>
              </div>
              <p class="source"><Sparkles class="w-3.5 h-3.5 shrink-0" /> {{ sourceKm }}</p>
              <button v-if="brouillon.km !== kmOfficiel" type="button" class="mt-2 text-sm text-dark underline underline-offset-4 decoration-gray-300 hover:decoration-dark" @click="brouillon.km = kmOfficiel; kmSaisis = nombre(kmOfficiel)">Revenir à {{ nombre(kmOfficiel) }} km</button>
            </template>

            <!-- 3. Les communes incluses -->
            <template v-else-if="etape === 'communes'">
              <h2 id="parcours-titre" class="titre">{{ espaceParCommune ? 'Quelles communes s\'équipent ?' : 'Pour quelles communes prendrez-vous les arrêtés ?' }}</h2>
              <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
                <span class="text-sm font-medium text-dark tabular-nums">{{ brouillon.retenues.size }} sur {{ territoire.communes.length }} communes</span>
                <span class="flex gap-2">
                  <button type="button" class="petit-bouton" @click="toutes(true)">Toutes</button>
                  <button type="button" class="petit-bouton" @click="toutes(false)">Aucune</button>
                </span>
              </div>
              <label v-if="territoire.communes.length > 10" class="mt-3 flex items-center gap-2 rounded-xl border border-gray-border px-3 py-2">
                <Search class="w-4 h-4 text-gray-muted" />
                <span class="sr-only">Filtrer les communes</span>
                <input v-model="filtre" type="text" placeholder="Filtrer les communes" class="w-full bg-transparent text-sm outline-none" />
              </label>
              <ul class="mt-3 max-h-[38vh] overflow-y-auto rounded-2xl border border-gray-border divide-y divide-gray-border">
                <li v-for="c in communesAffichees" :key="c.code">
                  <label class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-bg transition-colors">
                    <input type="checkbox" class="case" :checked="brouillon.retenues.has(c.code)" :data-commune="c.code" @change="basculerCommune(c.code)" />
                    <span class="flex-1 min-w-0 text-sm text-dark truncate">{{ c.nom }}</span>
                    <span class="text-xs text-gray-muted tabular-nums shrink-0">{{ nombre(c.population) }} hab.</span>
                  </label>
                </li>
              </ul>
            </template>

            <!-- 4. Le prix et son calcul -->
            <template v-else-if="etape === 'recap'">
              <h2 id="parcours-titre" class="titre">Chantiers pour {{ territoire.nom }}</h2>
              <!-- Le prix d'abord : sur un petit écran, le calcul défile dessous -->
              <p v-if="chiffrage.espaces.length" id="parcours-prix" class="mt-3 flex flex-wrap items-baseline gap-x-2">
                <span class="font-heading font-bold text-3xl tracking-tight text-dark tabular-nums">{{ exact ? euros(chiffrage.annuel) : `de ${eurosFourchette(chiffrage.annuel)}` }}</span>
                <span class="text-sm text-gray-muted">HT par an, avant remises</span>
              </p>
              <p class="aide">{{ resume }}</p>
              <div class="mt-5 rounded-2xl border border-gray-border p-4 sm:p-5">
                <ChantiersCalcul v-if="chiffrage.espaces.length" :chiffrage="chiffrage" :exact="exact" />
                <p v-else class="text-sm text-gray-text">Aucune commune n'est incluse.</p>
              </div>
            </template>
          </div>

          <div v-if="territoire" class="px-6 sm:px-8 py-5 border-t border-gray-border flex items-center justify-between gap-3">
            <button v-if="rang > 0" type="button" class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-text hover:text-dark transition-colors" @click="rang--">
              <ArrowLeft class="w-4 h-4" /> Précédent
            </button>
            <button v-else type="button" class="text-sm font-medium text-gray-text hover:text-dark transition-colors" @click="emit('choisir-territoire', null)">Changer de collectivité</button>
            <button
              v-if="etape !== 'recap'"
              type="button" :disabled="!peutAvancer" data-parcours="suivante"
              class="inline-flex items-center gap-2 bg-dark text-white text-[15px] font-medium px-6 py-3 rounded-full hover:bg-black transition-colors disabled:opacity-40"
              @click="suivante"
            >
              {{ rang === etapes.length - 2 ? 'Voir le prix' : 'Question suivante' }}
              <ArrowRight class="w-4 h-4" />
            </button>
            <button
              v-else
              type="button" :disabled="!chiffrage.espaces.length" data-parcours="valider"
              class="inline-flex items-center gap-2 bg-mod-chantiers text-white text-[15px] font-medium px-6 py-3 rounded-full hover:opacity-90 transition-opacity disabled:opacity-40"
              @click="valider"
            >
              {{ dejaRetenu ? 'Mettre à jour l\'estimation' : 'Ajouter à l\'estimation' }}
              <Check class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue'
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Info, Loader2, Search, Sparkles, X } from 'lucide-vue-next'
import TerritoireRecherche from './TerritoireRecherche.vue'
import ChantiersCalcul from './ChantiersCalcul.vue'
import { nombre, euros, eurosFourchette } from '../data/tarification.mjs'
import { chiffrerChantiers } from '../data/tarification-chantiers.mjs'
import {
  nomADemander, nomCorrigeable, nomPresume, choixNom, organisation, gestionnaireDesRoutes, resumeVoirie,
  chaqueCommuneASonEspace, espacesChantiers, kmOfficiel as kmDe, usageAuChoix,
} from '../data/voirie.mjs'

const props = defineProps({
  ouvert: { type: Boolean, default: false },
  territoire: { type: Object, default: null },
  reponses: { type: Object, default: null },
  chargement: { type: Boolean, default: false },
  erreur: { type: String, default: '' },
  exact: { type: Boolean, default: false },
  dejaRetenu: { type: Boolean, default: false },
})
const emit = defineEmits(['update:ouvert', 'choisir-territoire', 'valider', 'abandonner'])

const CHOIX_USAGE = [
  { valeur: null, libelle: 'Délivrer les permissions de voirie et prendre les arrêtés de circulation' },
  { valeur: 'permissions', libelle: 'Délivrer les permissions de voirie seulement' },
  { valeur: 'arretes', libelle: 'Prendre les arrêtés de circulation seulement' },
]

const boite = ref(null)
const recherche = ref(null)
const rang = ref(0)
const filtre = ref('')
const brouillon = reactive({ nom: null, usage: null, km: 0, retenues: new Set() })
const kmSaisis = ref('')
let kmTouche = false

const t = computed(() => props.territoire)
const presume = computed(() => (t.value ? nomPresume(t.value) : null))
const org = computed(() => (t.value ? organisation(t.value, brouillon.nom) : null))
const choixDuNom = computed(() => (t.value && nomADemander(t.value) ? choixNom(t.value) : []))
const gestionnaire = computed(() => (t.value ? gestionnaireDesRoutes(t.value, org.value) : null))
const espaceParCommune = computed(() => chaqueCommuneASonEspace(org.value))
const nomModifiable = computed(() => (t.value ? nomADemander(t.value) : false))
const corrigeable = computed(() => (t.value ? nomCorrigeable(t.value) : false))
/* Une commune dont l'intercommunalité délivre les permissions n'a que ses
 * arrêtés : les deux autres réponses restent visibles, grisées */
const permissionsPossibles = computed(() => (t.value ? usageAuChoix(t.value, org.value) : false))
const usage = computed(() => (permissionsPossibles.value ? brouillon.usage : null))
const usageAffiche = computed(() => (permissionsPossibles.value ? brouillon.usage : 'arretes'))
const kmOfficiel = computed(() => (t.value ? kmDe(t.value) : 0))

const etapes = computed(() => {
  if (!t.value) return ['territoire']
  const liste = []
  if (t.value.type !== 'departement') liste.push('usage')
  // Les kilomètres ne servent qu'aux permissions, les communes qu'aux arrêtés
  // ou à leurs propres espaces
  if (gestionnaire.value && usage.value !== 'arretes') liste.push('km')
  if (t.value.type === 'epci' && (espaceParCommune.value || usage.value !== 'permissions')) liste.push('communes')
  liste.push('recap')
  return liste
})
const etape = computed(() => etapes.value[Math.min(rang.value, etapes.value.length - 1)])
const nbQuestions = computed(() => etapes.value.filter((e) => e !== 'recap').length)

const peutAvancer = computed(() => {
  if (etape.value === 'usage') return !nomModifiable.value || !!brouillon.nom
  if (etape.value === 'km') return brouillon.km > 0
  if (etape.value === 'communes') return brouillon.retenues.size > 0
  return true
})

const questionKm = computed(() => {
  if (gestionnaire.value?.type === 'departement') return 'Combien de kilomètres de routes départementales ?'
  return `Combien de kilomètres de routes ${t.value?.nom} gère-t-elle ?`
})
const sourceKm = computed(() => (gestionnaire.value?.type === 'epci' && org.value === 'axes'
  ? "Toutes les routes de ses communes, d'après l'État (2026). Indiquez ses seuls grands axes si vous les connaissez."
  : "D'après la longueur retenue par l'État pour 2026."))

const communesAffichees = computed(() => {
  const f = filtre.value.trim().toLowerCase()
  return f ? t.value.communes.filter((c) => c.nom.toLowerCase().includes(f)) : t.value.communes
})

const chiffrage = computed(() => {
  if (!t.value) return { espaces: [], annuel: 0, mensuel: 0 }
  return chiffrerChantiers(espacesChantiers(t.value, { org: org.value, km: brouillon.km, retenues: brouillon.retenues, usage: usage.value }))
})
const resume = computed(() => (t.value ? resumeVoirie(t.value, org.value) : ''))

/* Le brouillon repart des réponses enregistrées pour ce territoire, sinon
 * des données publiques */
function initialiser() {
  const r = props.reponses && props.reponses.cle === t.value?.cle ? props.reponses : null
  brouillon.nom = r?.nom ?? presume.value
  brouillon.usage = r?.usage || null
  kmTouche = r?.km != null
  brouillon.km = r?.km ?? kmOfficiel.value
  kmSaisis.value = nombre(brouillon.km)
  const tous = t.value?.communes?.map((c) => c.code) || []
  brouillon.retenues = new Set(r?.sans ? tous.filter((c) => !r.sans.includes(c)) : tous)
  filtre.value = ''
  rang.value = 0
}

function lireKm() {
  const n = Number(String(kmSaisis.value).replace(/[^\d]/g, ''))
  if (n > 0) { brouillon.km = n; kmTouche = true }
  kmSaisis.value = nombre(brouillon.km)
}

function basculerCommune(code) {
  const s = new Set(brouillon.retenues)
  if (s.has(code)) s.delete(code)
  else s.add(code)
  brouillon.retenues = s
}
function toutes(oui) {
  brouillon.retenues = new Set(oui ? t.value.communes.map((c) => c.code) : [])
}

/* Chiffrer l'intercommunalité de la commune, en gardant ce que l'on veut faire */
function versInterco() {
  const e = t.value.epci
  emit('choisir-territoire', { cle: `epci-${e.code}`, type: 'epci', nom: e.nom }, { nom: 'interco', usage: brouillon.usage })
}

function suivante() {
  if (etape.value === 'km') lireKm()
  if (peutAvancer.value && rang.value < etapes.value.length - 1) rang.value++
}

function valider() {
  const tous = t.value.communes?.map((c) => c.code) || []
  emit('valider', {
    cle: t.value.cle,
    nom: nomModifiable.value || corrigeable.value ? brouillon.nom : null,
    usage: usage.value,
    km: gestionnaire.value && brouillon.km !== kmOfficiel.value ? brouillon.km : null,
    sans: tous.filter((c) => !brouillon.retenues.has(c)),
  })
  emit('update:ouvert', false)
}

/* Fermer sans valider : la page mesure où le visiteur s'est arrêté */
function fermer() {
  emit('abandonner', etape.value)
  emit('update:ouvert', false)
}

/* Les kilomètres suivent l'organisation tant qu'on ne les a pas tapés */
watch(org, () => {
  if (!kmTouche) { brouillon.km = kmOfficiel.value; kmSaisis.value = nombre(brouillon.km) }
})

/* Le focus reste dans la boîte, et revient où il était à la fermeture */
let focusAvant = null
const focusables = () => [...(boite.value?.querySelectorAll('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])') || [])]
function garderLeFocus(ev) {
  const liste = focusables()
  if (!liste.length) return
  const premier = liste[0]
  const dernier = liste[liste.length - 1]
  if (ev.shiftKey && document.activeElement === premier) { ev.preventDefault(); dernier.focus() }
  else if (!ev.shiftKey && document.activeElement === dernier) { ev.preventDefault(); premier.focus() }
}
async function placerLeFocus() {
  await nextTick()
  if (etape.value === 'territoire') recherche.value?.focus()
  else (boite.value?.querySelector('[data-parcours]') || focusables()[0])?.focus()
}

watch(() => props.ouvert, (oui) => {
  if (oui) {
    focusAvant = document.activeElement
    document.body.style.overflow = 'hidden'
    initialiser()
    placerLeFocus()
  } else {
    document.body.style.overflow = ''
    focusAvant?.focus?.()
  }
})
/* Un territoire choisi dans la boîte : le parcours reprend à sa première question */
watch(() => props.territoire?.cle, () => {
  if (props.ouvert) { initialiser(); placerLeFocus() }
})
watch(etape, () => { if (props.ouvert) placerLeFocus() })

onUnmounted(() => { document.body.style.overflow = '' })
</script>

<style scoped>
.titre {
  font-family: "Space Grotesk", sans-serif;
  font-weight: 700;
  font-size: 1.6rem;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #111111;
  text-wrap: balance;
}
.aide { margin-top: 0.75rem; font-size: 0.9375rem; line-height: 1.6; color: #555555; }
.source { margin-top: 1rem; display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.8125rem; line-height: 1.5; color: #0B7A4A; }
.source :deep(svg) { margin-top: 0.15rem; }
.option {
  display: flex; align-items: center; gap: 0.875rem; width: 100%; text-align: left;
  border: 2px solid rgba(0, 0, 0, 0.08); border-radius: 1rem; padding: 0.85rem 1.1rem;
  font-size: 0.9375rem; color: #111111; background: #FAFAFA;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}
.option:hover { border-color: rgba(0, 0, 0, 0.2); }
.option--choisie { border-color: #0B7A4A; background: #E7F2ED; }
.pastille {
  width: 1.25rem; height: 1.25rem; border-radius: 999px; flex-shrink: 0;
  border: 2px solid rgba(0, 0, 0, 0.2); background: #ffffff;
  display: flex; align-items: center; justify-content: center;
}
.pastille--choisie { border-color: #0B7A4A; background: #0B7A4A; }
.petit-bouton {
  font-size: 0.8125rem; font-weight: 500; color: #111111;
  border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 999px; padding: 0.3rem 0.85rem;
  transition: border-color 0.2s ease;
}
.petit-bouton:hover { border-color: #111111; }
.case { width: 1.05rem; height: 1.05rem; accent-color: #0B7A4A; }
.option:focus-visible, .petit-bouton:focus-visible, .parcours button:focus-visible { outline: 2px solid #0B7A4A; outline-offset: 2px; }
</style>
