<template>
  <div class="print-guide">
    <!-- Print header -->
    <div class="print-header">
      <img src="/home/img/logo-min-new.svg" alt="Open Projets" class="print-logo" />
      <div>
        <h1>{{ title }}</h1>
        <p class="print-date">Généré le {{ today }}</p>
      </div>
    </div>

    <hr class="print-divider" />

    <!-- Table of contents -->
    <nav class="print-toc">
      <h2>Sommaire</h2>
      <ol>
        <li v-for="cat in categories" :key="cat.id">
          <a :href="'#section-' + cat.id">{{ cat.title }}</a>
        </li>
      </ol>
    </nav>

    <hr class="print-divider" />

    <!-- All articles rendered sequentially -->
    <div v-for="cat in categories" :key="cat.id" class="print-section">
      <div :id="'section-' + cat.id" class="print-anchor" />
      <component :is="cat.component" />
    </div>

    <!-- Print actions (hidden in print) -->
    <div class="print-actions no-print">
      <button class="print-btn" @click="doPrint">
        <Download class="w-4 h-4" />
        Enregistrer en PDF
      </button>
      <button class="print-btn print-btn--secondary" @click="goBack">
        Retour au centre d'aide
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download } from 'lucide-vue-next'
import * as Details from '@/components/help/details.js'

const route = useRoute()
const router = useRouter()
const role = computed(() => route.params.role)

const today = new Date().toLocaleDateString('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric'
})

const title = computed(() =>
  role.value === 'admin'
    ? 'Guide Administrateur — Open Projets'
    : 'Guide Contributeur — Open Projets'
)

const adminCats = [
  { id: 'general', title: 'Général', component: markRaw(Details.AdminGeneral) },
  { id: 'contributions', title: 'Gérer les contributions', component: markRaw(Details.AdminContributions) },
  { id: 'categories', title: 'Gérer les catégories', component: markRaw(Details.AdminCategories) },
  { id: 'users', title: 'Gérer les utilisateurs', component: markRaw(Details.AdminUsers) },
  { id: 'structure', title: 'Gérer ma structure', component: markRaw(Details.AdminStructure) },
]

const contribCats = [
  { id: 'general', title: 'Général', component: markRaw(Details.ContribGeneral) },
  { id: 'contributions', title: 'Gérer mes contributions', component: markRaw(Details.ContribContributions) },
]

const categories = computed(() =>
  role.value === 'admin' ? adminCats : contribCats
)

function doPrint() {
  window.print()
}

function goBack() {
  router.push({ path: '/aide', hash: '#' + role.value })
}

onMounted(async () => {
  document.title = title.value
  await nextTick()
  document.querySelectorAll('.print-guide details').forEach(d => {
    d.setAttribute('open', '')
  })
})
</script>

<style>
/* Print-optimized styles — intentionally NOT scoped so they apply to child components */
.print-guide {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 32px;
  font-family: Inter, system-ui, sans-serif;
  color: #111;
  line-height: 1.6;
  font-size: 14px;
}

.print-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
}

.print-logo {
  width: 48px;
  height: 48px;
}

.print-header h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: #111;
  margin: 0;
}

.print-date {
  font-size: 13px;
  color: #555;
  margin: 2px 0 0 0;
}

.print-divider {
  border: none;
  border-top: 1px solid rgba(0,0,0,0.08);
  margin: 24px 0;
}

.print-toc h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
}

.print-toc ol {
  margin: 0;
  padding-left: 20px;
}

.print-toc li {
  margin-bottom: 4px;
}

.print-toc a {
  color: #FF0037;
  text-decoration: none;
}

.print-toc a:hover {
  text-decoration: underline;
}

.print-anchor {
  scroll-margin-top: 20px;
}

.print-section {
  margin-bottom: 16px;
  page-break-inside: avoid;
}

/* Force all details open in print view */
.print-guide details {
  open: true;
}
.print-guide details[open] > summary {
  margin-bottom: 0;
}
/* Override collapse: show all content in print */
.print-guide .collapse-section {
  border: none !important;
  margin-bottom: 0 !important;
}
.print-guide .collapse-section[open] {
  border: none !important;
}
.print-guide .collapse-body {
  padding: 0 !important;
}
.print-guide .collapse-header {
  padding: 0 !important;
  cursor: default !important;
}
.print-guide .collapse-header::after {
  display: none !important;
}

.print-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid rgba(0,0,0,0.08);
}

.print-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  background: #FF0037;
  color: white;
  transition: opacity 0.15s;
}

.print-btn:hover {
  opacity: 0.9;
}

.print-btn--secondary {
  background: white;
  color: #555;
  border: 1px solid rgba(0,0,0,0.08);
}

.print-btn--secondary:hover {
  color: #111;
  border-color: rgba(0,0,0,0.15);
}

@media print {
  .no-print {
    display: none !important;
  }

  .print-guide {
    padding: 0;
    max-width: 100%;
  }

  /* Force all collapsible sections open */
  .print-guide details {
    display: block !important;
  }
  .print-guide details > summary {
    list-style: none;
  }
  .print-guide details > summary::-webkit-details-marker {
    display: none;
  }
  .print-guide .collapse-section {
    border: none !important;
    open: true;
  }

  .print-section {
    page-break-inside: avoid;
  }
}
</style>
