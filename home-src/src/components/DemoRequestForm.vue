<template>
  <div class="bg-white rounded-2xl border border-gray-border p-8 sm:p-10 shadow-lg shadow-black/5">
    <form @submit.prevent="handleSubmit" class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label :for="`${idPrefix}-name`" class="block text-sm text-gray-text mb-1.5">Nom *</label>
          <input
            :id="`${idPrefix}-name`"
            v-model="form.name"
            type="text"
            required
            placeholder="Votre nom"
            class="form-input"
          />
        </div>
        <div>
          <label :for="`${idPrefix}-email`" class="block text-sm text-gray-text mb-1.5">Email *</label>
          <input
            :id="`${idPrefix}-email`"
            v-model="form.email"
            type="email"
            required
            placeholder="email@collectivite.fr"
            class="form-input"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label :for="`${idPrefix}-phone`" class="block text-sm text-gray-text mb-1.5">Téléphone</label>
          <input
            :id="`${idPrefix}-phone`"
            v-model="form.phone"
            type="tel"
            placeholder="06 XX XX XX XX"
            class="form-input"
          />
        </div>
        <div>
          <label :for="`${idPrefix}-org`" class="block text-sm text-gray-text mb-1.5">Organisation *</label>
          <input
            :id="`${idPrefix}-org`"
            v-model="form.organization"
            type="text"
            required
            placeholder="Nom de la collectivité"
            class="form-input"
          />
        </div>
      </div>

      <div>
        <label :for="`${idPrefix}-message`" class="block text-sm text-gray-text mb-1.5">Message</label>
        <!-- L'invite n'est pas le placeholder natif : Safari ne le fait pas
             revenir a la ligne, la phrase sortait du champ. Ce calque se
             comporte comme du texte ordinaire, et il disparait des le premier
             caractere saisi. -->
        <div class="relative">
          <textarea
            :id="`${idPrefix}-message`"
            v-model="form.message"
            rows="4"
            class="form-input resize-none"
            @focus="suspendreInvite"
            @blur="reprendreInvite"
          />
          <p v-if="!form.message" class="form-invite" aria-hidden="true">{{ invite }}</p>
        </div>
      </div>

      <button
        type="submit"
        :disabled="submitting"
        class="w-full inline-flex items-center justify-center gap-2.5 bg-primary-ink text-white text-sm font-medium px-7 py-4 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send class="w-4 h-4" />
        {{ submitting ? 'Envoi en cours...' : submitLabel }}
        <ArrowRight v-if="!submitting" class="w-4 h-4" />
      </button>

      <p v-if="submitted" class="text-center text-sm text-green-600 font-medium">
        Merci ! Nous vous recontactons rapidement.
      </p>

      <p v-if="errorMsg" class="text-center text-sm text-red-600 font-medium">
        {{ errorMsg }}
      </p>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { Send, ArrowRight } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase.js'

/* Le champ message s'ecrit tout seul tant qu'on n'y a pas touche.
 *
 * Un champ vide avec une consigne generique ne dit pas quoi ecrire : ces
 * quatre phrases montrent le niveau de detail attendu, et le fait qu'un
 * message court suffit. Aucune ne nomme de collectivite. */
const EXEMPLES = [
  "Nous préparons notre plan de mandat, j'aimerais voir ce que ça donnerait chez nous.",
  "J'ai vu votre carte des travaux, au plaisir d'en discuter pour notre agglomération.",
  "Notre service voirie croule sous les arrêtés. Une démonstration serait la bienvenue.",
  'Nous sommes une commune de 4 000 habitants. Quel budget faut-il prévoir ?',
]
const INVITE_FIXE = 'Parlez-nous de votre territoire et de vos besoins…'

const invite = ref(INVITE_FIXE)
let minuteur = null
let enPause = false

const doux = () => typeof window !== 'undefined'
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* Une seule boucle : on ecrit une phrase, on la laisse lire, on l'efface,
 * on passe a la suivante. */
function animerInvite() {
  let phrase = 0
  let lettres = 0
  let efface = false

  const etape = () => {
    if (enPause) { minuteur = setTimeout(etape, 600); return }
    const texte = EXEMPLES[phrase]
    lettres += efface ? -1 : 1
    invite.value = texte.slice(0, lettres) || INVITE_FIXE

    let attente = efface ? 18 : 38
    if (!efface && lettres >= texte.length) { efface = true; attente = 2600 }
    else if (efface && lettres <= 0) {
      efface = false
      phrase = (phrase + 1) % EXEMPLES.length
      attente = 700
    }
    minuteur = setTimeout(etape, attente)
  }
  etape()
}

// Pendant la saisie, plus rien ne bouge sous les doigts du visiteur.
const suspendreInvite = () => { enPause = true }
const reprendreInvite = () => { enPause = false }

onMounted(() => { if (doux()) animerInvite() })
onUnmounted(() => clearTimeout(minuteur))

const props = defineProps({
  referrer: { type: String, default: 'home' },
  submitLabel: { type: String, default: 'Envoyer la demande' },
  idPrefix: { type: String, default: 'demo' },
})

const form = reactive({
  name: '',
  email: '',
  phone: '',
  organization: '',
  message: '',
})

const submitting = ref(false)
const submitted = ref(false)
const errorMsg = ref('')

async function handleSubmit() {
  submitting.value = true
  submitted.value = false
  errorMsg.value = ''

  try {
    const payload = {
      full_name: form.name,
      email: form.email,
      phone: form.phone || null,
      organization: form.organization,
      message: form.message || '',
      referrer: props.referrer,
    }

    const { data: insertedData, error } = await supabase
      .from('contact_requests')
      .insert(payload)
      .select()
      .single()

    if (error) throw error

    supabase.functions.invoke('clever-endpoint', { body: insertedData }).catch(() => {})

    // La conversion du site vitrine. `referrer` dit d'où vient la demande
    // (page d'accueil, page alternative, bannière de la carte...), l'identité
    // du demandeur reste dans contact_requests et n'est pas envoyée ici.
    window.OPAnalytics?.capture('contact_request_submitted', {
      referrer: props.referrer,
      has_phone: !!form.phone,
      has_message: !!form.message,
    })

    submitted.value = true
    Object.assign(form, { name: '', email: '', phone: '', organization: '', message: '' })
  } catch (err) {
    console.error('[DemoRequestForm] Error:', err)
    window.OPAnalytics?.capture('contact_request_failed', { referrer: props.referrer })
    errorMsg.value = 'Une erreur est survenue. Veuillez réessayer ou nous contacter directement.'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.form-input {
  @apply w-full px-4 py-3.5 bg-gray-bg border border-gray-200 rounded-xl text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors;
}

/* Le champ message revenait a la ligne mais gardait une barre de defilement
   horizontale, et une adresse collee d'un seul tenant le faisait deborder.
   Seul le defilement vertical a un sens dans un textarea. */
textarea.form-input {
  overflow-x: hidden;
  overflow-y: auto;
  overflow-wrap: break-word;
}

/* Le calque se cale exactement sur le champ : meme typographie, memes
   reserves, et une bordure transparente qui remplace celle du champ pour que
   la premiere lettre tombe au meme endroit. */
.form-invite {
  position: absolute; inset: 0; margin: 0; pointer-events: none;
  border: 1px solid transparent; padding: 14px 16px;
  font-size: 0.875rem; line-height: 1.25rem; color: #9CA3AF;
  white-space: pre-wrap; overflow-wrap: break-word; overflow: hidden;
}
</style>
