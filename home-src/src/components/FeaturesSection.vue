<template>
  <section id="fonctionnalites" class="py-24 bg-white">
    <div class="max-w-container mx-auto px-6">
      <!-- Title -->
      <h2 class="font-heading font-bold text-3xl sm:text-4xl lg:text-[48px] leading-tight tracking-tight text-dark max-w-[768px]">
        Vous publiez,
        <br />
        <span class="font-bold">vos habitants consultent</span>
      </h2>
      <p class="mt-5 text-gray-text text-base sm:text-lg leading-relaxed max-w-[540px]">
        Une interface pensée pour les équipes non techniques — vos agents sont opérationnels en quelques minutes, sans formation.
      </p>

      <!-- 3 Cards -->
      <div class="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="(card, i) in cards"
          :key="i"
          :ref="(el) => { cardEls[i] = el }"
          class="card-tilt"
          @mousemove="(e) => onMouseMove(e, i)"
          @mouseleave="onMouseLeave(i)"
        >
          <div class="group relative bg-gray-bg rounded-2xl border border-gray-border overflow-hidden h-full">
            <!-- Mouse-follow glare -->
            <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="shineStyles[i]" />

            <!-- Illustration area -->
            <div class="h-52 bg-gray-100 relative overflow-hidden">
              <img
                :src="card.image"
                :alt="card.imageAlt"
                class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                loading="lazy"
              />
              <!-- Shimmer sweep -->
              <div class="absolute inset-0 overflow-hidden pointer-events-none">
                <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-in-out" />
              </div>
              <div class="absolute inset-0 bg-gradient-to-t from-white/18 via-transparent to-white/45" />
              <!-- Number badge -->
              <span class="absolute top-4 right-4 font-heading font-bold text-4xl text-white/80 drop-shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:text-white">
                {{ String(i + 1).padStart(2, '0') }}
              </span>
            </div>

            <!-- Text -->
            <div class="p-6 relative z-20">
              <h3 class="font-heading font-semibold text-lg text-dark mb-2">
                {{ card.title }}
              </h3>
              <p class="text-sm text-gray-text leading-relaxed">
                {{ card.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive } from 'vue'

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
    background: `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.2) 0%, transparent 60%)`,
  }
}

function onMouseLeave(i) {
  const el = cardEls.value[i]
  if (!el) return
  el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
  el.style.transform = ''
  shineStyles[i] = {}
}

const cards = [
  {
    title: 'Vos équipes ajoutent les projets',
    description: "Interface intuitive, zéro formation requise. Géolocalisez le projet sur la carte, rédigez la fiche, ajoutez une photo : tout se gère en quelques clics.",
    image: '/home/img/features/feature-projects.jpeg',
    imageAlt: 'Interface de gestion de projets sur fond de carte',
  },
  {
    title: 'La carte adopte votre identité visuelle',
    description: "Couleurs, logotype et fond de carte : votre espace reprend automatiquement la charte graphique de votre collectivité.",
    image: '/home/img/features/feature-branding.jpeg',
    imageAlt: 'Personnalisation visuelle de la carte avec palette et composants',
  },
  {
    title: 'Vos habitants consultent sans inscription',
    description: "Carte publique, sans compte, sans téléchargement. Recherche, filtres, fiches détaillées : tout est pensé pour que l'information atteigne vraiment vos administrés.",
    image: '/home/img/features/feature-consultation.jpeg',
    imageAlt: 'Vue cartographique orientée consultation citoyenne',
  },
]
</script>

<style scoped>
.card-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}
</style>
