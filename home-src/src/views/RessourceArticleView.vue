<template>
  <div v-if="article">
    <!-- Avancement de la lecture : le seul repere qui manque vraiment sur un
         texte de douze minutes. Il ne bouge que pendant l'article lui-meme. -->
    <div class="fixed top-16 left-0 right-0 h-[3px] z-40 pointer-events-none" aria-hidden="true">
      <div
        class="h-full bg-primary origin-left transition-transform duration-100 ease-out"
        :style="{ transform: `scaleX(${progression})` }"
      />
    </div>

    <!-- Ouverture : la meme couverture que dans la liste, en pleine largeur. -->
    <RessourceCouverture
      :titre="article.title" :slug="article.slug" :tag="article.tag"
      :teinte="teintePourArticle(article)"
      niveau="h1" echelle="article"
      interieur="max-w-container mx-auto px-6 pt-32 pb-12 sm:pb-16"
      class="min-h-[420px] sm:min-h-[500px]"
    >
      <template #avant>
        <RouterLink
          to="/ressources"
          class="flex w-fit items-center gap-1.5 mb-8 text-sm font-medium text-white/75 hover:text-white transition-colors duration-200"
        >
          <ArrowLeft class="w-4 h-4" />
          Toutes les ressources
        </RouterLink>
      </template>

      <template #apres>
        <p class="mt-6 max-w-[680px] text-white/80 text-base sm:text-lg leading-relaxed">
          {{ article.description }}
        </p>
        <p class="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/65">
          <span>Publié le {{ formatDateFr(article.date) }}</span>
          <span v-if="article.updated && article.updated !== article.date" aria-hidden="true">·</span>
          <span v-if="article.updated && article.updated !== article.date">
            mis à jour le {{ formatDateFr(article.updated) }}
          </span>
          <span v-if="article.readingTime" aria-hidden="true">·</span>
          <span v-if="article.readingTime">{{ article.readingTime }} min de lecture</span>
        </p>
      </template>
    </RessourceCouverture>

    <!-- Corps de l'article, avec son sommaire. -->
    <section class="py-14 sm:py-20 bg-white">
      <div class="max-w-container mx-auto px-6">
        <div class="lg:grid lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-14 xl:gap-20">
          <!-- Sur grand ecran le sommaire suit la lecture ; sur telephone il se
               replie, parce qu'une liste de dix titres avant le premier
               paragraphe repousse l'article hors de l'ecran. -->
          <aside class="hidden lg:block" v-if="article.sommaire.length">
            <nav class="sticky top-28" aria-label="Sommaire de l'article">
              <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-muted">
                Sommaire
              </p>
              <ol class="mt-5 border-l border-gray-border">
                <li v-for="s in article.sommaire" :key="s.id">
                  <a
                    :href="`#${s.id}`"
                    class="block -ml-px border-l-2 py-2 pl-4 text-[13px] leading-snug transition-colors duration-200"
                    :class="s.id === actif
                      ? 'border-primary text-dark font-medium'
                      : 'border-transparent text-gray-muted hover:text-dark'"
                    @click.prevent="allerA(s.id)"
                  >{{ s.texte }}</a>
                </li>
              </ol>
            </nav>
          </aside>

          <div class="min-w-0">
            <details v-if="article.sommaire.length" class="lg:hidden mb-10 rounded-2xl bg-gray-bg p-5">
              <summary class="cursor-pointer text-sm font-medium text-dark list-none flex items-center justify-between gap-3">
                Sommaire
                <ChevronDown class="w-4 h-4 shrink-0 text-gray-muted" />
              </summary>
              <ol class="mt-4 space-y-2.5">
                <li v-for="s in article.sommaire" :key="s.id">
                  <a
                    :href="`#${s.id}`"
                    class="block text-sm text-gray-text leading-snug"
                    @click.prevent="allerA(s.id)"
                  >{{ s.texte }}</a>
                </li>
              </ol>
            </details>

            <article ref="corps" class="prose-op max-w-[720px]" v-html="article.html" />
          </div>
        </div>
      </div>
    </section>

    <!-- Ce qu'on lit ensuite : trois guides proches, le meme sujet d'abord. -->
    <section v-if="lies.length" class="pb-20 sm:pb-24 bg-white">
      <div class="max-w-container mx-auto px-6">
        <h2 class="font-heading font-bold text-2xl sm:text-3xl tracking-tight text-dark">
          Sur le même sujet
        </h2>
        <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <RouterLink
            v-for="(a, i) in lies" :key="a.slug"
            :to="`/ressources/${a.slug}`"
            class="group flex flex-col rounded-2xl border border-gray-border overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white"
          >
            <RessourceCouverture
              :titre="a.title" :slug="a.slug" :tag="a.tag"
              :teinte="teintePourArticle(a)" :rang="i"
              niveau="h3"
              class="min-h-[190px]"
            />
            <span class="flex items-center gap-1.5 p-6 text-sm font-medium text-primary-ink">
              Lire le guide
              <ArrowRight class="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Ce que le guide donne en pratique. La version 2 y presente la suite
         d'outils ; le site actuel garde le bloc de capacites. -->
    <slot name="solution" :contenu="showcaseProps">
      <SolutionShowcase v-bind="showcaseProps" />
    </slot>

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
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-vue-next'
import CtaSection from '@/components/CtaSection.vue'
import SolutionShowcase from '@/components/SolutionShowcase.vue'
import RessourceCouverture from '@/components/RessourceCouverture.vue'
import { articleBySlug, articlesLies, teintePourArticle, formatDateFr } from '@/data/ressources.js'
import { setMeta, setCanonical } from '@/lib/head.js'

const BASE = 'https://openprojets.com/home'
// Hauteur de l'en-tête fixe, plus une respiration : une ancre qui atterrit
// sous la barre place le titre visé juste sous elle.
const DECALAGE = 104

const route = useRoute()
const router = useRouter()
const article = computed(() => articleBySlug[route.params.slug])
const lies = computed(() => articlesLies(route.params.slug))

const corps = ref(null)
const progression = ref(0)
const actif = ref('')

let observateur = null
let enAttente = false

function mesurer() {
  if (enAttente) return
  enAttente = true
  requestAnimationFrame(() => {
    enAttente = false
    const el = corps.value
    if (!el) return
    const haut = el.offsetTop
    const parcours = el.offsetHeight - window.innerHeight * 0.5
    if (parcours <= 0) { progression.value = 1; return }
    progression.value = Math.max(0, Math.min(1, (window.scrollY - haut + DECALAGE) / parcours))
  })
}

/* Le titre actif du sommaire : celui dont le debut est passe sous l'en-tête.
 * Un simple observateur d'intersection suffit, les titres etant deja dans le
 * DOM au montage (le contenu vient d'une chaine, pas d'une requete). */
function suivreTitres() {
  observateur?.disconnect()
  const titres = corps.value?.querySelectorAll('h2[id]')
  if (!titres?.length) return
  observateur = new IntersectionObserver(
    (entrees) => {
      const visibles = entrees.filter((e) => e.isIntersecting)
      if (visibles.length) actif.value = visibles[0].target.id
    },
    { rootMargin: `-${DECALAGE}px 0px -70% 0px`, threshold: 0 }
  )
  titres.forEach((t) => observateur.observe(t))
  actif.value = titres[0].id
}

function allerA(id) {
  const cible = document.getElementById(id)
  if (!cible) return
  const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({
    top: cible.getBoundingClientRect().top + window.scrollY - DECALAGE,
    behavior: doux ? 'smooth' : 'auto',
  })
  actif.value = id
}

onMounted(() => {
  window.addEventListener('scroll', mesurer, { passive: true })
  window.addEventListener('resize', mesurer)
  mesurer()
  suivreTitres()
})

onUnmounted(() => {
  window.removeEventListener('scroll', mesurer)
  window.removeEventListener('resize', mesurer)
  observateur?.disconnect()
})

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
    // Passer d'un guide a l'autre remonte le sommaire et l'avancement.
    nextTick(() => { suivreTitres(); mesurer() })
  },
  { immediate: true }
)
</script>

<style scoped>
/* Safari dessine encore son triangle sur le repli du sommaire. */
summary::-webkit-details-marker { display: none; }

/* Typographie de l'article (contenu injecté par v-html, d'où :deep).
   Le corps est volontairement plus grand que le reste du site : on ne lit pas
   douze minutes dans le même corps de texte qu'une carte de la page d'accueil. */
.prose-op :deep(h2) {
  @apply font-heading font-bold text-[26px] sm:text-[32px] text-dark mt-16 mb-6 leading-[1.2] tracking-tight;
  scroll-margin-top: 7rem;
}
.prose-op :deep(h2:first-child) {
  @apply mt-0;
}
.prose-op :deep(h3) {
  @apply font-heading font-semibold text-xl sm:text-[22px] text-dark mt-12 mb-4 leading-snug;
  scroll-margin-top: 7rem;
}
.prose-op :deep(p) {
  @apply text-gray-text text-[17px] sm:text-[18px] leading-[1.75] mb-6;
}
/* Le premier paragraphe fait office de chapeau. */
.prose-op :deep(> p:first-child) {
  @apply text-[19px] sm:text-[21px] leading-[1.6] text-dark mb-8;
}
.prose-op :deep(strong) {
  @apply text-dark font-semibold;
}
.prose-op :deep(em) {
  @apply text-dark;
}
.prose-op :deep(a) {
  @apply text-primary-ink underline decoration-primary/40 underline-offset-[3px] transition-colors duration-200;
}
.prose-op :deep(a:hover) {
  @apply decoration-primary;
}
.prose-op :deep(ul),
.prose-op :deep(ol) {
  @apply mb-6 pl-6 space-y-3;
}
.prose-op :deep(ul) {
  @apply list-disc;
}
.prose-op :deep(ol) {
  @apply list-decimal;
}
.prose-op :deep(li) {
  @apply text-gray-text text-[17px] sm:text-[18px] leading-[1.75] pl-1.5;
}
.prose-op :deep(li::marker) {
  @apply text-primary-ink;
}
.prose-op :deep(li p) {
  @apply mb-2;
}
/* Une citation se lit droite : douze lignes en italique fatiguent. */
.prose-op :deep(blockquote) {
  @apply border-l-[3px] border-primary bg-gray-bg rounded-r-2xl px-7 py-6 my-10;
}
.prose-op :deep(blockquote p) {
  @apply text-dark text-[18px] leading-[1.7] mb-0;
}
.prose-op :deep(hr) {
  @apply border-gray-border my-14;
}
.prose-op :deep(img) {
  @apply rounded-2xl border border-gray-border my-10 max-w-full;
}
/* Le tableau defile dans sa boite : sur telephone, il debordait la page. */
.prose-op :deep(table) {
  @apply block overflow-x-auto w-full text-[15px] text-left my-10 border-collapse;
}
.prose-op :deep(th) {
  @apply font-heading font-semibold text-dark border-b border-gray-border px-4 py-3 whitespace-nowrap;
}
.prose-op :deep(td) {
  @apply text-gray-text border-b border-gray-border px-4 py-3 align-top;
}
.prose-op :deep(code) {
  @apply bg-gray-bg text-dark text-[0.9em] rounded px-1.5 py-0.5;
}
.prose-op :deep(pre) {
  @apply bg-dark text-white rounded-2xl p-5 my-8 overflow-x-auto text-sm;
}
.prose-op :deep(pre code) {
  @apply bg-transparent text-white p-0;
}
</style>
