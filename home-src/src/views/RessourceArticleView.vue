<template>
  <div v-if="article">
    <!-- En-tête article -->
    <section class="relative bg-gray-bg pt-36 pb-14 overflow-hidden">
      <PageBlobs top="blob-green" bottom="blob-amber" top-offset="-70px" />

      <div class="relative max-w-container mx-auto px-6">
        <div class="max-w-[820px]">
          <RouterLink
            to="/ressources"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-text hover:text-primary-ink transition-colors duration-200 mb-8"
          >
            <ArrowLeft class="w-4 h-4" />
            Toutes les ressources
          </RouterLink>

          <div class="flex flex-wrap items-center gap-3 mb-6">
            <span v-if="article.tag" class="text-xs font-medium text-primary-ink bg-primary-10 px-2.5 py-1 rounded-full">
              {{ article.tag }}
            </span>
            <span class="text-xs text-gray-text">Publié le {{ formatDateFr(article.date) }}</span>
            <span v-if="article.updated && article.updated !== article.date" class="text-xs text-gray-text">
              Mis à jour le {{ formatDateFr(article.updated) }}
            </span>
            <span v-if="article.readingTime" class="text-xs text-gray-text">{{ article.readingTime }} min de lecture</span>
          </div>

          <h1 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[52px] leading-[1.08] tracking-tight text-dark">
            {{ article.title }}
          </h1>
          <p class="mt-6 text-gray-text text-base sm:text-lg leading-relaxed max-w-[640px]">
            {{ article.description }}
          </p>
        </div>
      </div>
    </section>

    <!-- Corps de l'article -->
    <section class="py-16 sm:py-20 bg-white">
      <div class="max-w-container mx-auto px-6">
        <article class="prose-op max-w-[760px]" v-html="article.html" />
      </div>
    </section>

    <!-- Bloc solution : démo embarquée + capacités liées au sujet de l'article -->
    <SolutionShowcase
      v-bind="showcaseProps"
    />

    <!-- CTA (substituable : la version 2 y place son propre bloc de clôture) -->
    <slot name="cta">
      <CtaSection
        heading="Montrez vos projets"
        heading-line2="sur votre carte"
        heading-gradient="text-gradient-green"
        subtitle="Demandez une démo : on prépare la carte de votre commune avec vos vrais projets avant l'appel."
      />
    </slot>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import PageBlobs from '@/components/PageBlobs.vue'
import CtaSection from '@/components/CtaSection.vue'
import SolutionShowcase from '@/components/SolutionShowcase.vue'
import { articleBySlug, formatDateFr } from '@/data/ressources.js'
import { setMeta, setCanonical } from '@/lib/head.js'

const BASE = 'https://openprojets.com/home'

const route = useRoute()
const router = useRouter()
const article = computed(() => articleBySlug[route.params.slug])

// Ne transmettre que les champs renseignés : les autres gardent les
// valeurs par défaut du composant
const showcaseProps = computed(() => {
  const a = article.value
  if (!a) return {}
  const props = {}
  if (a.solutionHeading) props.heading = a.solutionHeading
  if (a.solutionIntro) props.intro = a.solutionIntro
  if (a.solutionPoints.length) props.points = a.solutionPoints
  return props
})

// Metas par article : la route est dynamique, le routeur ne peut pas les
// porter en meta statique. Posées ici, elles sont figées par le prerender.
watch(
  article,
  (a) => {
    if (!a) {
      router.replace('/ressources')
      return
    }
    const title = `${a.title} | Open Projets`
    const canonical = `${BASE}/ressources/${a.slug}`
    document.title = title
    setMeta('og:title', title, 'property')
    setMeta('twitter:title', title, 'name')
    setMeta('description', a.description)
    setMeta('og:description', a.description, 'property')
    setMeta('twitter:description', a.description)
    setCanonical(canonical)
    setMeta('og:url', canonical, 'property')
  },
  { immediate: true }
)
</script>

<style scoped>
/* Typographie de l'article (contenu injecté par v-html, d'où :deep) */
.prose-op :deep(h2) {
  @apply font-heading font-bold text-2xl sm:text-3xl text-dark mt-14 mb-5 leading-snug;
}
.prose-op :deep(h3) {
  @apply font-heading font-semibold text-xl text-dark mt-10 mb-4;
}
.prose-op :deep(p) {
  @apply text-gray-text text-base leading-[1.8] mb-5;
}
.prose-op :deep(strong) {
  @apply text-dark font-semibold;
}
.prose-op :deep(a) {
  @apply text-primary-ink underline decoration-primary/30 underline-offset-2 transition-colors duration-200;
}
.prose-op :deep(a:hover) {
  @apply decoration-primary;
}
.prose-op :deep(ul),
.prose-op :deep(ol) {
  @apply mb-5 pl-6 space-y-2;
}
.prose-op :deep(ul) {
  @apply list-disc;
}
.prose-op :deep(ol) {
  @apply list-decimal;
}
.prose-op :deep(li) {
  @apply text-gray-text text-base leading-[1.8];
}
.prose-op :deep(li::marker) {
  @apply text-primary-ink;
}
.prose-op :deep(blockquote) {
  @apply border-l-2 border-primary bg-gray-bg rounded-r-xl px-6 py-4 my-8;
}
.prose-op :deep(blockquote p) {
  @apply text-dark mb-0 italic;
}
.prose-op :deep(hr) {
  @apply border-gray-border my-12;
}
.prose-op :deep(img) {
  @apply rounded-2xl border border-gray-border my-8 max-w-full;
}
.prose-op :deep(table) {
  @apply w-full text-sm text-left my-8 border-collapse;
}
.prose-op :deep(th) {
  @apply font-heading font-semibold text-dark border-b border-gray-border px-4 py-3;
}
.prose-op :deep(td) {
  @apply text-gray-text border-b border-gray-border px-4 py-3 align-top;
}
</style>
