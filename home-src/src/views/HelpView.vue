<template>
  <section class="relative bg-gray-bg pt-32 pb-24 min-h-screen">
    <div class="absolute top-[-124px] right-[-60px] w-[700px] h-[700px] blob-red opacity-40 blur-[120px] rounded-full pointer-events-none" />
    <div class="absolute bottom-0 left-[-156px] w-[600px] h-[600px] blob-purple opacity-30 blur-[120px] rounded-full pointer-events-none" />

    <div class="relative max-w-[720px] mx-auto px-6">

      <!-- Header -->
      <div class="text-center mb-12">
        <h1 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark">
          Centre d'aide
        </h1>
        <p class="mt-4 text-gray-text text-base sm:text-lg leading-relaxed">
          Trouvez rapidement comment utiliser la plateforme
        </p>
      </div>

      <!-- Breadcrumb -->
      <nav v-if="currentRole" class="flex items-center gap-2 text-[13px] mb-8" aria-label="Fil d'ariane">
        <button
          class="inline-flex items-center gap-1.5 text-gray-text hover:text-primary transition-colors"
          @click="goHome"
        ><Home class="w-3.5 h-3.5" /><span>Accueil</span></button>

        <ChevronRight class="w-3 h-3 text-gray-300 shrink-0" />

        <button
          v-if="currentCategory"
          class="text-gray-text hover:text-primary transition-colors"
          @click="goRole"
        >{{ roleLabels[currentRole] }}</button>
        <span v-else class="text-dark font-semibold">{{ roleLabels[currentRole] }}</span>

        <template v-if="currentCategory">
          <ChevronRight class="w-3 h-3 text-gray-300 shrink-0" />
          <span class="text-dark font-semibold truncate">{{ categoryLabel }}</span>
        </template>
      </nav>

      <!-- ===== VIEW: Role selection ===== -->
      <Transition name="fade" mode="out-in">

        <div v-if="!currentRole" key="home" class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            class="bg-white rounded-2xl border-2 border-gray-border p-8 text-center hover:border-primary hover:shadow-lg hover:shadow-primary/5 transition-all hover:-translate-y-0.5"
            @click="showRole('admin')"
          >
            <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <ShieldCheck class="w-7 h-7 text-primary" />
            </div>
            <h3 class="font-heading font-bold text-lg text-dark mb-2">Je suis Administrateur</h3>
            <p class="text-sm text-gray-text leading-relaxed">Je gère ma structure, j'approuve les projets et j'invite des utilisateurs</p>
          </button>

          <button
            class="bg-white rounded-2xl border-2 border-gray-border p-8 text-center hover:border-green hover:shadow-lg hover:shadow-green/5 transition-all hover:-translate-y-0.5"
            @click="showRole('contrib')"
          >
            <div class="w-14 h-14 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-5">
              <PenLine class="w-7 h-7 text-green" />
            </div>
            <h3 class="font-heading font-bold text-lg text-dark mb-2">Je suis Contributeur</h3>
            <p class="text-sm text-gray-text leading-relaxed">Je propose des projets et je gère mes propres contributions</p>
          </button>
        </div>

        <!-- ===== VIEW: Admin sub-menu ===== -->
        <div v-else-if="currentRole === 'admin' && !currentCategory" key="admin" class="flex flex-col gap-3">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-text/60">Choisissez un sujet</p>
            <button
              class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-text hover:text-primary transition-colors px-3 py-1.5 rounded-lg border border-gray-border hover:border-primary/30 bg-white"
              @click="openPrintGuide('admin')"
            ><Download class="w-3.5 h-3.5" /> Télécharger le guide PDF</button>
          </div>
          <CategoryCard
            v-for="cat in adminCategories" :key="cat.id"
            :icon="cat.icon" :color="cat.color"
            :title="cat.title" :desc="cat.desc"
            @click="showCategory(cat.id)"
          />
        </div>

        <!-- ===== VIEW: Contrib sub-menu ===== -->
        <div v-else-if="currentRole === 'contrib' && !currentCategory" key="contrib" class="flex flex-col gap-3">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-text/60">Choisissez un sujet</p>
            <button
              class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-text hover:text-primary transition-colors px-3 py-1.5 rounded-lg border border-gray-border hover:border-primary/30 bg-white"
              @click="openPrintGuide('contrib')"
            ><Download class="w-3.5 h-3.5" /> Télécharger le guide PDF</button>
          </div>
          <CategoryCard
            v-for="cat in contribCategories" :key="cat.id"
            :icon="cat.icon" :color="cat.color"
            :title="cat.title" :desc="cat.desc"
            @click="showCategory(cat.id)"
          />
        </div>

        <!-- ===== VIEW: Detail article ===== -->
        <div v-else key="detail">
          <component :is="detailComponent" v-if="detailComponent" />
        </div>

      </Transition>

    </div>
  </section>
</template>

<script setup>
import { ref, computed, markRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { h } from 'vue'
import {
  ShieldCheck, PenLine, LogIn, Compass, PenSquare,
  Tags, Users, Building2, ChevronRight, FolderOpen, Scale, Home, Download,
  HardHat, MapPin
} from 'lucide-vue-next'
import * as Details from '@/components/help/details.js'

/* ── CategoryCard (render function) ── */

const CategoryCard = {
  props: ['icon', 'color', 'title', 'desc'],
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('button', {
      class: 'bg-white rounded-xl border border-gray-border p-4 flex items-center gap-4 text-left hover:border-primary/30 hover:bg-primary-light transition-all hover:-translate-y-0.5 group',
      onClick: () => emit('click')
    }, [
      h('div', {
        class: `w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-${props.color}/10`
      }, [
        h(props.icon, { class: `w-5 h-5 text-${props.color}` })
      ]),
      h('div', { class: 'flex-1 min-w-0' }, [
        h('h4', { class: 'text-[15px] font-semibold text-dark' }, props.title),
        h('p', { class: 'text-[13px] text-gray-text' }, props.desc)
      ]),
      h(ChevronRight, { class: 'w-4 h-4 text-gray-300 shrink-0 group-hover:text-primary transition-colors' })
    ])
  }
}

/* ── Data ── */

const roleLabels = { admin: 'Administrateur', contrib: 'Contributeur' }

const adminCategories = [
  { id: 'general',       icon: markRaw(Compass),    color: 'primary', title: 'Général',                  desc: 'Connexion, navigation et rôles' },
  { id: 'contributions', icon: markRaw(PenSquare),   color: 'green',   title: 'Gérer les contributions',  desc: 'Créer, modifier, approuver, supprimer, filtrer' },
  { id: 'travaux',       icon: markRaw(HardHat),     color: 'amber',   title: 'Travaux',                  desc: 'Chantiers, configuration et source de données' },
  { id: 'categories',    icon: markRaw(Tags),        color: 'amber',   title: 'Gérer les catégories',     desc: 'Couleurs, styles de tracés et couches associées' },
  { id: 'users',         icon: markRaw(Users),       color: 'purple',  title: 'Gérer les utilisateurs',   desc: 'Inviter, promouvoir, rétrograder' },
  { id: 'structure',     icon: markRaw(Building2),   color: 'dark',    title: 'Gérer ma structure',       desc: 'Branding, logos, couleur et contrôles de la carte' },
  { id: 'villes',        icon: markRaw(MapPin),      color: 'primary', title: 'Gestion des villes',       desc: 'Créer et gérer les structures (admin global)' },
]

const contribCategories = [
  { id: 'general',       icon: markRaw(Compass),    color: 'primary', title: 'Général',                  desc: 'Connexion, accès, droits et permissions' },
  { id: 'contributions', icon: markRaw(PenSquare),   color: 'green',   title: 'Gérer mes contributions',  desc: 'Créer, modifier, supprimer, filtrer' },
]

const categoryLabels = {
  'general': 'Général',
  'contributions': 'Gérer les contributions',
  'travaux': 'Travaux',
  'categories': 'Gérer les catégories',
  'users': 'Gérer les utilisateurs',
  'structure': 'Gérer ma structure',
  'villes': 'Gestion des villes',
}

const detailMap = {
  'admin-general':       markRaw(Details.AdminGeneral),
  'admin-contributions': markRaw(Details.AdminContributions),
  'admin-travaux':       markRaw(Details.AdminTravaux),
  'admin-categories':    markRaw(Details.AdminCategories),
  'admin-users':         markRaw(Details.AdminUsers),
  'admin-structure':     markRaw(Details.AdminStructure),
  'admin-villes':        markRaw(Details.AdminVilles),
  'contrib-general':       markRaw(Details.ContribGeneral),
  'contrib-contributions': markRaw(Details.ContribContributions),
}

/* ── State ── */

const currentRole = ref(null)
const currentCategory = ref(null)

const categoryLabel = computed(() => {
  if (!currentCategory.value) return ''
  if (currentRole.value === 'contrib' && currentCategory.value === 'contributions') return 'Gérer mes contributions'
  return categoryLabels[currentCategory.value] || currentCategory.value
})

const detailComponent = computed(() => {
  if (!currentRole.value || !currentCategory.value) return null
  return detailMap[`${currentRole.value}-${currentCategory.value}`] || null
})

/* ── Navigation ── */

const router = useRouter()
const route = useRoute()

function goHome() {
  currentRole.value = null
  currentCategory.value = null
  router.replace({ hash: '' })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goRole() {
  currentCategory.value = null
  router.replace({ hash: '#' + currentRole.value })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function showRole(role) {
  currentRole.value = role
  currentCategory.value = null
  router.replace({ hash: '#' + role })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function showCategory(catId) {
  currentCategory.value = catId
  router.replace({ hash: '#' + currentRole.value + '-' + catId })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openPrintGuide(role) {
  const url = router.resolve({ path: '/aide/guide-' + role }).href
  window.open(url, '_blank')
}

function restoreFromHash() {
  const hash = (route.hash || '').replace('#', '')
  if (!hash) {
    currentRole.value = null
    currentCategory.value = null
    return
  }
  if (hash === 'admin' || hash === 'contrib') {
    currentRole.value = hash
    currentCategory.value = null
    return
  }
  const match = hash.match(/^(admin|contrib)-(.+)$/)
  if (match && detailMap[hash]) {
    currentRole.value = match[1]
    currentCategory.value = match[2]
  }
}

restoreFromHash()

watch(() => route.hash, restoreFromHash)
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: all 0.2s ease;
}
.fade-enter-from { opacity: 0; transform: translateY(8px); }
.fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
