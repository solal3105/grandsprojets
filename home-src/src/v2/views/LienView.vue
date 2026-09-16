<template>
  <div class="bg-gray-bg min-h-screen pb-24">
    <section class="max-w-container mx-auto px-6 pt-12 sm:pt-16">
      <p class="etiquette-interne">Page interne, hors du menu et des moteurs de recherche</p>
      <h1 class="mt-4 font-heading font-bold text-3xl sm:text-4xl leading-[1.1] tracking-tight text-dark">
        Fabriquez un lien à partager
      </h1>
      <p class="mt-4 text-gray-text text-base leading-relaxed max-w-[62ch]">
        Collez l'adresse que vous voulez envoyer, dites où vous allez la partager, et repartez avec un
        lien qui nous dira d'où viennent les visites. Les statistiques se lisent ensuite dans PostHog,
        sans rien avoir à installer.
      </p>
    </section>

    <section class="max-w-container mx-auto px-6 mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      <!-- ── Les quatre questions ─────────────────────────────────────── -->
      <div class="flex flex-col gap-5">
        <!-- 1. La page à partager -->
        <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
          <div class="flex items-center gap-3">
            <span class="etape">1</span>
            <h2 id="lien-cible-titre" class="font-heading font-bold text-lg tracking-tight">Quelle page voulez-vous partager ?</h2>
          </div>
          <input
            id="lien-cible"
            v-model="cible"
            type="url"
            inputmode="url"
            autocomplete="off"
            class="form-input mt-4"
            placeholder="https://openprojets.com/ville/metropole-lyon/carte"
            aria-labelledby="lien-cible-titre"
            aria-describedby="lien-cible-aide"
          />
          <p v-if="erreurCible" id="lien-cible-erreur" class="mt-2 text-sm text-primary-ink">{{ erreurCible }}</p>
          <p id="lien-cible-aide" class="mt-3 text-sm text-gray-text">Ou prenez une page que vous partagez souvent :</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="p in pagesCourantes"
              :key="p.url"
              type="button"
              class="rounded-full border border-gray-border bg-gray-bg px-3.5 py-2 text-sm text-dark hover:border-gray-300 transition-colors"
              @click="cible = p.url"
            >{{ p.label }}</button>
          </div>
        </div>

        <!-- 2. Le support -->
        <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
          <div class="flex items-center gap-3">
            <span class="etape">2</span>
            <h2 class="font-heading font-bold text-lg tracking-tight">Où allez-vous le partager ?</h2>
          </div>
          <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              v-for="s in SUPPORTS"
              :key="s.key"
              type="button"
              :data-support="s.key"
              :aria-pressed="support === s.key"
              class="flex items-start gap-3 text-left rounded-2xl border-2 p-4 transition duration-200"
              :class="support === s.key ? 'border-dark bg-white shadow-card' : 'border-gray-border bg-gray-bg hover:border-gray-300'"
              @click="support = s.key"
            >
              <span class="w-9 h-9 rounded-xl bg-white border border-gray-border flex items-center justify-center shrink-0">
                <component :is="ICONES[s.icon]" class="w-4 h-4 text-dark" />
              </span>
              <span class="min-w-0">
                <span class="block font-heading font-semibold text-sm leading-snug">{{ s.label }}</span>
                <span class="block mt-1 text-xs text-gray-text leading-snug">{{ s.aide }}</span>
              </span>
            </button>

            <button
              type="button"
              data-support="autre"
              :aria-pressed="support === 'autre'"
              class="flex items-start gap-3 text-left rounded-2xl border-2 p-4 transition duration-200"
              :class="support === 'autre' ? 'border-dark bg-white shadow-card' : 'border-gray-border bg-gray-bg hover:border-gray-300'"
              @click="support = 'autre'"
            >
              <span class="w-9 h-9 rounded-xl bg-white border border-gray-border flex items-center justify-center shrink-0">
                <MoreHorizontal class="w-4 h-4 text-dark" />
              </span>
              <span class="min-w-0">
                <span class="block font-heading font-semibold text-sm leading-snug">Autre chose</span>
                <span class="block mt-1 text-xs text-gray-text leading-snug">Un support qui ne figure pas dans cette liste, que vous nommez vous-même.</span>
              </span>
            </button>
          </div>

          <!-- Le support saisi à la main -->
          <div v-if="support === 'autre'" class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="lien-autre-nom" class="block text-sm text-gray-text mb-1.5">Comment s'appelle ce support ?</label>
              <input id="lien-autre-nom" v-model="autreNom" type="text" class="form-input" placeholder="Annuaire des solutions" />
              <p v-if="autreNom" class="mt-1.5 text-xs text-gray-muted">Enregistré sous le nom {{ normaliser(autreNom) }}.</p>
            </div>
            <div>
              <label for="lien-autre-nature" class="block text-sm text-gray-text mb-1.5">De quelle nature est-il ?</label>
              <select id="lien-autre-nature" v-model="autreNature" class="form-input">
                <option v-for="n in NATURES" :key="n.value" :value="n.value">{{ n.label }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 3. L'opération -->
        <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
          <div class="flex items-center gap-3">
            <span class="etape">3</span>
            <h2 id="lien-campagne-titre" class="font-heading font-bold text-lg tracking-tight">De quelle opération s'agit-il ?</h2>
          </div>
          <input
            id="lien-campagne"
            v-model="campagne"
            type="text"
            class="form-input mt-4"
            placeholder="Salon des maires 2026"
            aria-labelledby="lien-campagne-titre"
            aria-describedby="lien-campagne-aide"
          />
          <p id="lien-campagne-aide" class="mt-2 text-sm text-gray-text">
            Donnez-lui un nom que vous reconnaîtrez dans six mois, et reprenez exactement le même nom
            quand vous partagez la même opération ailleurs : c'est ce qui permet de comparer les supports
            entre eux.
          </p>
          <div v-if="operationsConnues.length" class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="o in operationsConnues"
              :key="o"
              type="button"
              class="rounded-full border border-gray-border bg-gray-bg px-3 py-1.5 text-xs text-dark hover:border-gray-300 transition-colors"
              @click="campagne = o"
            >{{ o }}</button>
          </div>
        </div>

        <!-- 4. Qui partage -->
        <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
          <div class="flex items-center gap-3">
            <span class="etape">4</span>
            <h2 id="lien-auteur-titre" class="font-heading font-bold text-lg tracking-tight">Qui partage ce lien ?</h2>
          </div>
          <input
            id="lien-auteur"
            v-model="auteur"
            type="text"
            class="form-input mt-4 sm:max-w-xs"
            placeholder="Votre prénom"
            aria-labelledby="lien-auteur-titre"
            aria-describedby="lien-auteur-aide"
          />
          <p id="lien-auteur-aide" class="mt-2 text-sm text-gray-text">
            Votre prénom suffit, et ce navigateur s'en souvient pour les prochains liens. Il sert à voir
            quelles visites viennent de vous.
          </p>
        </div>
      </div>

      <!-- ── Le résultat ──────────────────────────────────────────────── -->
      <aside class="lg:sticky lg:top-24 flex flex-col gap-5">
        <div class="rounded-3xl bg-dark text-white p-6 shadow-card">
          <h2 class="font-heading font-bold text-lg tracking-tight">Votre lien</h2>

          <p v-if="!lien" id="lien-attente" class="mt-3 text-sm text-white/70 leading-relaxed">
            Il apparaîtra ici dès que vous aurez collé une adresse et choisi un support.
          </p>

          <template v-else>
            <p id="lien-resultat" class="mt-3 rounded-2xl bg-white/10 p-3 text-[13px] leading-relaxed break-all font-mono">{{ lien }}</p>
            <button
              id="lien-copier"
              type="button"
              class="mt-4 w-full inline-flex items-center justify-center gap-2 bg-white text-dark text-sm font-medium px-5 py-3.5 rounded-full hover:bg-white/90 transition-colors"
              @click="copier(lien, 'long')"
            >
              <component :is="copie === 'long' ? Check : Copy" class="w-4 h-4" />
              {{ copie === 'long' ? 'Lien copié' : 'Copier le lien' }}
            </button>

            <dl class="mt-5 text-xs text-white/70 leading-relaxed">
              <div v-for="m in marqueurs" :key="m.cle" class="flex justify-between gap-4 py-1 border-t border-white/10">
                <dt>{{ m.label }}</dt>
                <dd class="text-white font-medium text-right break-all">{{ m.valeur }}</dd>
              </div>
            </dl>
          </template>
        </div>

        <!-- L'adresse courte -->
        <div v-if="lien" class="rounded-3xl border border-gray-border bg-white p-6 shadow-pill">
          <h2 class="font-heading font-bold text-base tracking-tight">Une adresse courte</h2>
          <p class="mt-2 text-sm text-gray-text leading-relaxed">
            Plus lisible sur un imprimé ou sous un QR code, et elle mesure exactement la même chose.
          </p>

          <template v-if="!lienCourt">
            <div class="mt-4 flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-bg px-3 py-2.5 text-sm">
              <span class="text-gray-muted shrink-0">openprojets.com/l/</span>
              <input
                id="lien-court-code"
                v-model="code"
                type="text"
                class="min-w-0 flex-1 bg-transparent text-dark focus:outline-none"
                aria-label="La fin de l'adresse courte"
                :placeholder="codeSuggere || 'salon-2026'"
              />
            </div>
            <p v-if="erreurCourt" class="mt-2 text-sm text-primary-ink">{{ erreurCourt }}</p>
            <button
              id="lien-court-creer"
              type="button"
              class="mt-3 w-full inline-flex items-center justify-center gap-2 bg-primary-ink text-white text-sm font-medium px-5 py-3.5 rounded-full hover:bg-red-700 transition-colors disabled:opacity-50"
              :disabled="creation"
              @click="creerCourt"
            >
              <Link2 class="w-4 h-4" />
              {{ creation ? 'Enregistrement en cours' : 'Créer cette adresse courte' }}
            </button>
          </template>

          <template v-else>
            <p id="lien-court-url" class="mt-4 rounded-xl bg-gray-bg p-3 text-sm break-all font-mono">{{ lienCourt }}</p>
            <button
              id="lien-court-copier"
              type="button"
              class="mt-3 w-full inline-flex items-center justify-center gap-2 bg-dark text-white text-sm font-medium px-5 py-3.5 rounded-full hover:bg-black transition-colors"
              @click="copier(lienCourt, 'court')"
            >
              <component :is="copie === 'court' ? Check : Copy" class="w-4 h-4" />
              {{ copie === 'court' ? 'Adresse copiée' : 'Copier l\'adresse courte' }}
            </button>
          </template>
        </div>

        <!-- Le QR code -->
        <div v-if="lien" class="rounded-3xl border border-gray-border bg-white p-6 shadow-pill">
          <h2 class="font-heading font-bold text-base tracking-tight">Le QR code</h2>
          <p class="mt-2 text-sm text-gray-text leading-relaxed">
            À poser sur une plaquette, un kakémono ou une diapositive. Il mène au même lien et se
            compte de la même façon.
          </p>
          <div class="mt-4 flex items-center gap-4">
            <div class="w-28 h-28 rounded-xl border border-gray-border p-2 bg-white shrink-0" v-html="qrSvg" />
            <button
              id="lien-qr"
              type="button"
              class="flex-1 inline-flex items-center justify-center gap-2 border border-gray-border text-dark text-sm font-medium px-4 py-3 rounded-full hover:border-gray-300 transition-colors"
              @click="telechargerQr"
            >
              <Download class="w-4 h-4" />
              Télécharger le QR code
            </button>
          </div>
        </div>
      </aside>
    </section>

    <!-- ── Les liens déjà fabriqués ───────────────────────────────────── -->
    <section v-if="historique.length" class="max-w-container mx-auto px-6 mt-12">
      <div class="rounded-3xl border border-gray-border bg-white p-6 sm:p-7 shadow-pill">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-heading font-bold text-lg tracking-tight">Vos derniers liens</h2>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm text-gray-text hover:text-dark transition-colors"
            @click="viderHistorique"
          >
            <Trash2 class="w-4 h-4" />
            Vider cette liste
          </button>
        </div>
        <p class="mt-2 text-sm text-gray-text">
          Cette liste reste dans ce navigateur : elle n'est envoyée nulle part et vos collègues ne la voient pas.
        </p>
        <ul id="lien-historique" class="mt-5 flex flex-col divide-y divide-gray-border">
          <li v-for="(h, i) in historique" :key="h.url + i" class="flex flex-wrap items-center gap-3 py-3">
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-dark">{{ h.campagne || 'Sans nom d\'opération' }}</span>
              <span class="block text-xs text-gray-muted break-all">{{ h.court || h.url }}</span>
            </span>
            <button
              type="button"
              class="rounded-full border border-gray-border px-3 py-1.5 text-xs text-dark hover:border-gray-300 transition-colors"
              :aria-label="`Copier le lien ${h.campagne || 'sans nom'}`"
              @click="copier(h.court || h.url, `h${i}`)"
            >{{ copie === `h${i}` ? 'Copié' : 'Copier' }}</button>
            <button
              type="button"
              class="rounded-full border border-gray-border px-3 py-1.5 text-xs text-dark hover:border-gray-300 transition-colors"
              :aria-label="`Reprendre les réglages du lien ${h.campagne || 'sans nom'}`"
              @click="reprendre(h)"
            >Reprendre ces réglages</button>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup>
/* La fabrique de liens de l'équipe commerciale : /lien.
 *
 * Hors du menu et des moteurs, sans compte à créer : ce qu'on y fabrique n'a
 * rien de confidentiel, et demander une connexion chaque matin découragerait
 * l'usage, donc la mesure.
 *
 * Tout le calcul est dans lib/utm.mjs, partagé avec la fonction qui enregistre
 * les adresses courtes. Ici, seulement l'écran, la mémoire du navigateur et le
 * QR code. */
import { ref, computed, watch, onMounted } from 'vue'
import {
  Check, Copy, Download, Facebook, Instagram, Link2, Linkedin, Mail, MoreHorizontal,
  Newspaper, PenLine, Presentation, Printer, Send, Trash2, Users,
} from 'lucide-vue-next'
import qrcode from 'qrcode-generator'
import { SUPPORTS, NATURES } from '@/data/partages.js'
import { analyserCible, construire, normaliser, codepropose, CODE_VALIDE } from '@/lib/utm.mjs'
import { SITE_URL, CARTES_URL, MAP_LYON_URL } from '@/data/siteUrls.js'

const ICONES = { Facebook, Instagram, Linkedin, Mail, Newspaper, PenLine, Presentation, Printer, Send, Users }

const CLE_AUTEUR = 'op.lien.auteur'
const CLE_HISTORIQUE = 'op.lien.historique'
const MAX_HISTORIQUE = 24

const pagesCourantes = [
  { label: "L'accueil du site", url: `${SITE_URL}/` },
  { label: 'La page Carte', url: `${SITE_URL}/carte` },
  { label: 'La page Travaux', url: `${SITE_URL}/travaux` },
  { label: 'La page Chantiers', url: `${SITE_URL}/chantiers` },
  { label: 'La page Diagnostic', url: `${SITE_URL}/diagnostic` },
  { label: "L'estimation de prix", url: `${SITE_URL}/tarification` },
  { label: 'La Métropole de Lyon', url: MAP_LYON_URL },
  { label: 'Les cartes des communes', url: CARTES_URL },
]

const cible = ref('')
const support = ref('')
const autreNom = ref('')
const autreNature = ref('social')
const campagne = ref('')
const auteur = ref('')
const code = ref('')
const lienCourt = ref('')
const erreurCourt = ref('')
const creation = ref(false)
const copie = ref('')
const historique = ref([])

const erreurCible = computed(() => (cible.value.trim() ? analyserCible(cible.value).erreur : ''))

const supportChoisi = computed(() => SUPPORTS.find((s) => s.key === support.value) || null)

const source = computed(() => (support.value === 'autre' ? autreNom.value : supportChoisi.value?.source || ''))
const nature = computed(() => (support.value === 'autre' ? autreNature.value : supportChoisi.value?.medium || ''))

const lien = computed(() => construire({
  cible: cible.value,
  source: source.value,
  medium: nature.value,
  campagne: campagne.value,
  contenu: auteur.value,
}))

const marqueurs = computed(() => [
  { cle: 'source', label: 'Support', valeur: normaliser(source.value) },
  { cle: 'medium', label: 'Nature', valeur: normaliser(nature.value) },
  { cle: 'campagne', label: 'Opération', valeur: normaliser(campagne.value) || 'aucune' },
  { cle: 'auteur', label: 'Partagé par', valeur: normaliser(auteur.value) || 'personne' },
])

const codeSuggere = computed(() => codepropose({ campagne: campagne.value, source: source.value }))

// Les opérations déjà nommées, pour ne pas réinventer un nom à chaque fois.
const operationsConnues = computed(() => {
  const vues = []
  for (const h of historique.value) {
    if (h.campagne && !vues.includes(h.campagne)) vues.push(h.campagne)
  }
  return vues.slice(0, 8)
})

/* Le QR code, dessiné module par module : un SVG pour l'écran, un canvas pour
 * l'image téléchargée. Il pointe sur l'adresse courte dès qu'elle existe,
 * puisque c'est elle qu'on imprime. */
const aEncoder = computed(() => lienCourt.value || lien.value)

function grille(texte) {
  const qr = qrcode(0, 'M')
  qr.addData(texte)
  qr.make()
  return qr
}

const qrSvg = computed(() => {
  if (!aEncoder.value) return ''
  const qr = grille(aEncoder.value)
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="100%" height="100%" shape-rendering="crispEdges" role="img" aria-label="QR code du lien"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`
})

function telechargerQr() {
  if (!aEncoder.value) return
  const qr = grille(aEncoder.value)
  const n = qr.getModuleCount()
  const marge = 4
  const cote = 16 // 16 pixels par module : net même imprimé en grand
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = (n + marge * 2) * cote
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111111'
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (qr.isDark(r, c)) ctx.fillRect((c + marge) * cote, (r + marge) * cote, cote, cote)
    }
  }
  canvas.toBlob((blob) => {
    if (!blob) return
    const nom = normaliser(campagne.value) || normaliser(source.value) || 'open-projets'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `qr-${nom}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }, 'image/png')
}

async function copier(texte, marque) {
  try {
    await navigator.clipboard.writeText(texte)
  } catch {
    // Presse-papiers refusé (navigateur ancien, page non sécurisée) : on
    // sélectionne le texte pour que le raccourci clavier prenne le relais.
    const champ = document.createElement('textarea')
    champ.value = texte
    document.body.appendChild(champ)
    champ.select()
    document.execCommand('copy')
    champ.remove()
  }
  copie.value = marque
  window.OPAnalytics?.capture?.('lien_copie', { source: normaliser(source.value) })
  setTimeout(() => { if (copie.value === marque) copie.value = '' }, 2500)
}

async function creerCourt() {
  const choisi = normaliser(code.value || codeSuggere.value)
  if (!CODE_VALIDE.test(choisi)) {
    erreurCourt.value = "Donnez une fin d'adresse d'au moins deux caractères, sans accent ni espace."
    return
  }
  creation.value = true
  erreurCourt.value = ''
  try {
    const r = await fetch('/api/lien-court', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: choisi,
        target_url: lien.value,
        label: campagne.value.trim(),
        author: auteur.value.trim(),
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      // Fin d'adresse déjà prise, souvent parce que la même opération est
      // partagée sur deux supports : on en propose une libre plutôt que de
      // laisser chercher.
      const repli = normaliser(`${choisi}-${source.value}`)
      if (r.status === 409 && repli !== choisi && CODE_VALIDE.test(repli)) {
        code.value = repli
        erreurCourt.value = `${data.error} Essayez ${repli}.`
      } else {
        erreurCourt.value = data.error || "L'adresse courte n'a pas pu être créée."
      }
      return
    }
    lienCourt.value = data.url
    code.value = choisi
    enregistrer()
  } catch {
    erreurCourt.value = "Le serveur n'a pas répondu. Vérifiez votre connexion et réessayez."
  } finally {
    creation.value = false
  }
}

/* L'historique local : un lien y entre quand il est copié ou raccourci, pas à
 * chaque frappe. */
function enregistrer() {
  if (!lien.value) return
  const entree = {
    url: lien.value,
    court: lienCourt.value || '',
    campagne: campagne.value.trim(),
    support: support.value,
    autreNom: autreNom.value.trim(),
    autreNature: autreNature.value,
    cible: cible.value.trim(),
    date: new Date().toISOString(),
  }
  const reste = historique.value.filter((h) => h.url !== entree.url)
  historique.value = [entree, ...reste].slice(0, MAX_HISTORIQUE)
  try {
    localStorage.setItem(CLE_HISTORIQUE, JSON.stringify(historique.value))
  } catch {
    // Navigation privée ou stockage plein : la page marche sans mémoire.
  }
}

function reprendre(h) {
  cible.value = h.cible || h.url
  support.value = h.support || ''
  autreNom.value = h.autreNom || ''
  autreNature.value = h.autreNature || 'social'
  campagne.value = h.campagne || ''
  lienCourt.value = ''
  code.value = ''
  erreurCourt.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function viderHistorique() {
  historique.value = []
  try {
    localStorage.removeItem(CLE_HISTORIQUE)
  } catch {
    // Sans stockage, il n'y avait rien à vider.
  }
}

// Un lien copié mérite d'être retrouvé : on l'enregistre à la copie.
watch(copie, (marque) => { if (marque === 'long') enregistrer() })

// Changer un réglage remet l'adresse courte en jeu : elle vise l'ancien lien.
watch([cible, support, autreNom, autreNature, campagne, auteur], () => {
  lienCourt.value = ''
  erreurCourt.value = ''
})

watch(auteur, (v) => {
  try {
    localStorage.setItem(CLE_AUTEUR, v)
  } catch {
    // Sans stockage, le prénom se ressaisit à chaque visite.
  }
})

onMounted(() => {
  try {
    auteur.value = localStorage.getItem(CLE_AUTEUR) || ''
    const brut = JSON.parse(localStorage.getItem(CLE_HISTORIQUE) || '[]')
    historique.value = Array.isArray(brut) ? brut.filter((h) => h && typeof h.url === 'string') : []
  } catch {
    historique.value = []
  }
})
</script>

<style scoped>
.form-input {
  @apply w-full px-4 py-3.5 bg-gray-bg border border-gray-200 rounded-xl text-sm text-dark placeholder:text-gray-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors;
}

.etape {
  @apply w-8 h-8 rounded-full bg-dark text-white font-heading font-bold text-sm flex items-center justify-center shrink-0;
}

.etiquette-interne {
  @apply inline-flex items-center rounded-full border border-gray-border bg-white px-3 py-1.5 text-xs text-gray-text;
}
</style>
