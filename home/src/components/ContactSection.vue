<template>
  <section id="contact" class="py-24 bg-gray-bg">
    <div class="max-w-container mx-auto px-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <!-- Left: Info -->
        <div class="pt-4">
          <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[44px] leading-tight tracking-tight text-dark">
            Prêt à informer
            <br />
            <span class="text-gradient">vos administrés ?</span>
          </h2>

          <p class="mt-6 text-gray-text text-base leading-relaxed max-w-md">
            Remplissez le formulaire et notre équipe vous recontactera sous 24h pour organiser une démonstration personnalisée.
          </p>

          <!-- Info card -->
          <div class="mt-8 bg-white rounded-xl border border-gray-border p-6">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin class="w-5 h-5 text-primary" />
              </div>
              <div>
                <p class="text-sm font-medium text-dark">Open Projets</p>
                <p class="text-xs text-gray-text">Métropole de Lyon</p>
              </div>
            </div>
            <router-link
              to="/"
              class="inline-flex items-center gap-2 text-primary text-sm font-medium hover:underline"
            >
              <MapIcon class="w-3.5 h-3.5" />
              Explorer la carte
              <ArrowRight class="w-3 h-3" />
            </router-link>
          </div>
        </div>

        <!-- Right: Form -->
        <div class="bg-white rounded-2xl border border-gray-border p-8 sm:p-10 shadow-lg shadow-black/5">
          <form @submit.prevent="handleSubmit" class="space-y-6">
            <!-- Row 1: Nom + Email -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label for="name" class="block text-sm text-gray-text mb-1.5">Nom *</label>
                <input
                  id="name"
                  v-model="form.name"
                  type="text"
                  required
                  placeholder="Votre nom"
                  class="form-input"
                />
              </div>
              <div>
                <label for="email" class="block text-sm text-gray-text mb-1.5">Email *</label>
                <input
                  id="email"
                  v-model="form.email"
                  type="email"
                  required
                  placeholder="email@collectivite.fr"
                  class="form-input"
                />
              </div>
            </div>

            <!-- Row 2: Téléphone + Organisation -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label for="phone" class="block text-sm text-gray-text mb-1.5">Téléphone</label>
                <input
                  id="phone"
                  v-model="form.phone"
                  type="tel"
                  placeholder="06 XX XX XX XX"
                  class="form-input"
                />
              </div>
              <div>
                <label for="org" class="block text-sm text-gray-text mb-1.5">Organisation *</label>
                <input
                  id="org"
                  v-model="form.organization"
                  type="text"
                  required
                  placeholder="Nom de la collectivité"
                  class="form-input"
                />
              </div>
            </div>

            <!-- Message -->
            <div>
              <label for="message" class="block text-sm text-gray-text mb-1.5">Message</label>
              <textarea
                id="message"
                v-model="form.message"
                rows="4"
                placeholder="Parlez-nous de votre territoire et de vos besoins…"
                class="form-input resize-none"
              />
            </div>

            <!-- Submit -->
            <button
              type="submit"
              :disabled="submitting"
              class="w-full inline-flex items-center justify-center gap-2.5 bg-primary text-white text-sm font-medium px-7 py-4 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send class="w-4 h-4" />
              {{ submitting ? 'Envoi en cours...' : 'Envoyer la demande' }}
              <ArrowRight v-if="!submitting" class="w-4 h-4" />
            </button>

            <!-- Success message -->
            <p v-if="submitted" class="text-center text-sm text-green-600 font-medium">
              Merci ! Nous vous recontactons rapidement.
            </p>

            <!-- Error message -->
            <p v-if="errorMsg" class="text-center text-sm text-red-600 font-medium">
              {{ errorMsg }}
            </p>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { Send, ArrowRight, MapPin, MapIcon } from 'lucide-vue-next'

const SUPABASE_URL = 'https://wqqsuybmyqemhojsamgq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0'

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
      referrer: 'home',
    }

    // 1. Insert into contact_requests table via Supabase REST API
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
    })

    if (!insertRes.ok) {
      const errBody = await insertRes.text()
      throw new Error(`DB insert failed: ${insertRes.status} ${errBody}`)
    }

    const [insertedData] = await insertRes.json()

    // 2. Call Edge Function for email notification (fire-and-forget)
    fetch(`${SUPABASE_URL}/functions/v1/clever-endpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(insertedData),
    }).catch(() => {})

    submitted.value = true
    Object.assign(form, { name: '', email: '', phone: '', organization: '', message: '' })
  } catch (err) {
    console.error('[Contact] Error:', err)
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
