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
        <textarea
          :id="`${idPrefix}-message`"
          v-model="form.message"
          rows="4"
          placeholder="Parlez-nous de votre territoire et de vos besoins…"
          class="form-input resize-none"
        />
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
import { ref, reactive } from 'vue'
import { Send, ArrowRight } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase.js'

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
</style>
