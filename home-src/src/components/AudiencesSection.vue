<template>
  <section id="a-propos" class="py-24 bg-white">
    <div class="max-w-container mx-auto px-6">

      <!-- Heading -->
      <div class="max-w-[680px] mb-16">
        <span class="inline-flex items-center gap-2.5 text-xs font-semibold text-primary uppercase tracking-widest mb-5">
          <span class="w-5 h-px bg-primary inline-block" />
          Pour qui ?
        </span>
        <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-[1.08] tracking-tight text-dark">
          Communes, intercommunalités, métropoles :<br />
          même outil, votre identité
        </h2>
      </div>

      <!-- 3 audience cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="(card, i) in audiences"
          :key="i"
          :ref="(el) => { cardEls[i] = el }"
          class="card-tilt"
          @mousemove="(e) => onMouseMove(e, i)"
          @mouseleave="onMouseLeave(i)"
        >
          <div class="group relative bg-gray-bg rounded-2xl border border-gray-border p-8 flex flex-col overflow-hidden h-full transition-shadow duration-300 hover:shadow-xl">
            <!-- Mouse-follow glare -->
            <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="shineStyles[i]" />

            <!-- Hover top accent line -->
            <div
              class="absolute top-0 left-0 right-0 h-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-2xl"
              :style="{ background: card.accentGradient }"
            />

            <!-- Icon -->
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 relative z-20"
              :class="card.bgClass"
            >
              <component :is="card.icon" class="w-6 h-6" :class="card.iconClass" />
            </div>

            <h3 class="font-heading font-semibold text-xl text-dark mb-4 relative z-20">{{ card.title }}</h3>

            <ul class="space-y-3.5 flex-1 relative z-20">
              <li
                v-for="(feature, j) in card.features"
                :key="j"
                class="flex items-start gap-3 text-sm text-gray-text leading-relaxed"
              >
                <Check class="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{{ feature }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  </section>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { UserCircle, Settings, Users, Check } from 'lucide-vue-next'

const cardEls = ref([])
const shineStyles = reactive([{}, {}, {}])

function onMouseMove(e, i) {
  const el = cardEls.value[i]
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  el.style.transition = 'transform 0.08s ease'
  el.style.transform = `perspective(700px) rotateX(${-y * 7}deg) rotateY(${x * 7}deg) translateZ(10px)`
  shineStyles[i] = {
    background: `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.18) 0%, transparent 60%)`,
  }
}

function onMouseLeave(i) {
  const el = cardEls.value[i]
  if (!el) return
  el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
  el.style.transform = ''
  shineStyles[i] = {}
}

const audiences = [
  {
    icon: UserCircle,
    title: 'Élus & direction',
    bgClass: 'bg-primary-10',
    iconClass: 'text-primary',
    accentGradient: 'linear-gradient(to right, #FF0037, #F2B327)',
    features: [
      'Valorisez l\'action publique et renforcez la transparence',
      'Aucune dépendance à un prestataire externe — vos équipes gèrent en autonomie',
      'Outil souverain, conforme RGPD, made in EU',
    ],
  },
  {
    icon: Settings,
    title: 'Services techniques',
    bgClass: 'bg-amber/10',
    iconClass: 'text-amber',
    accentGradient: 'linear-gradient(to right, #F2B327, #5AAB7D)',
    features: [
      'Publiez et gérez les projets depuis un back-office simple',
      'Centralisez les informations cartographiques',
      'Mettez à jour sans développeur, en toute autonomie',
    ],
  },
  {
    icon: Users,
    title: 'Habitants & associations',
    bgClass: 'bg-blue-500/10',
    iconClass: 'text-blue-500',
    accentGradient: 'linear-gradient(to right, #4E2BFF, #2563EB)',
    features: [
      'Consultez les projets de votre territoire en un clic',
      'Compréhension rapide grâce à la carte interactive',
      'Aucune inscription nécessaire',
    ],
  },
]
</script>

<style scoped>
.card-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}
</style>
