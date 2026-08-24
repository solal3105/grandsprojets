<template>
  <div class="max-w-[896px] mx-auto">
    <div class="rounded-xl border border-gray-border bg-white shadow-2xl shadow-black/5 overflow-hidden">

      <!-- Browser chrome bar -->
      <div class="flex items-center px-4 h-[46px] border-b border-gray-100 bg-gray-50 gap-3">
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span class="w-2.5 h-2.5 rounded-full bg-amber" />
          <span class="w-2.5 h-2.5 rounded-full" style="background:#5AAB7D" />
        </div>
        <div class="flex-1 bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-600 flex items-center gap-1.5 min-w-0">
          <Lock class="w-3 h-3 text-gray-300 shrink-0" />
          <span class="truncate transition-all duration-500">{{ activeSpace.urlDisplay }}</span>
        </div>
        <RotateCw class="w-3.5 h-3.5 text-gray-300 shrink-0" />
      </div>

      <!-- Space switcher tab bar -->
      <div class="flex items-center gap-0.5 px-2 h-10 bg-gray-50/60 border-b border-gray-100">
        <button
          v-for="space in spaces"
          :key="space.id"
          @click="setActiveSpace(space)"
          class="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium select-none transition-all duration-200 group"
          :class="activeSpace.id === space.id
            ? 'bg-white text-dark shadow-sm border border-gray-200/70'
            : 'text-gray-600 hover:text-gray-700 hover:bg-white/60'"
        >
          <span
            class="w-2 h-2 rounded-full shrink-0 transition-transform duration-150 group-hover:scale-110"
            :style="{ backgroundColor: space.color }"
          />
          <span>{{ space.name }}</span>
          <span
            v-if="activeSpace.id === space.id"
            class="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
            :style="{ backgroundColor: space.color }"
          />
        </button>

        <div class="ml-auto mr-1 flex items-center gap-1.5 text-[11px] text-gray-600 font-medium">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
            <span class="relative inline-flex rounded-full h-2 w-2" style="background:#5AAB7D" />
          </span>
          Live
        </div>
      </div>

      <!-- Iframe container - content scaled down to 65% -->
      <div class="relative bg-gray-100" style="height: 480px; overflow: hidden;">
        <div
          v-for="space in spaces"
          :key="space.id"
          class="absolute inset-0 transition-opacity duration-350"
          :class="activeSpace.id === space.id ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'"
        >
          <iframe
            v-if="loadedIds.includes(space.id)"
            :src="space.src"
            :title="`Aperçu carte ${space.name}`"
            class="absolute top-0 left-0 border-0"
            style="
              width: calc(100% / 0.65);
              height: calc(100% / 0.65);
              transform: scale(0.65);
              transform-origin: top left;
            "
            loading="lazy"
          />
        </div>
      </div>
    </div>

    <!-- Bottom row: badge + dot nav -->
    <div class="mt-4 flex items-center justify-between px-1">
      <div class="inline-flex items-center gap-3 bg-white rounded-xl shadow-lg shadow-black/5 border border-gray-border px-4 py-2.5 transition-all duration-300">
        <div
          class="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-300"
          :style="{ backgroundColor: activeSpace.color + '18' }"
        >
          <MapPin class="w-4 h-4" :style="{ color: activeSpace.color }" />
        </div>
        <div class="text-left">
          <p class="text-[11px] text-gray-600 leading-tight">{{ activeSpace.type }}</p>
          <p class="text-[13px] font-medium text-dark leading-tight">{{ activeSpace.name }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          v-for="space in spaces"
          :key="space.id"
          @click="setActiveSpace(space)"
          class="h-2 rounded-full transition-all duration-300 focus:outline-none"
          :class="activeSpace.id === space.id ? 'w-6' : 'w-2'"
          :style="{
            backgroundColor: space.color,
            opacity: activeSpace.id === space.id ? 1 : 0.3,
          }"
          :aria-label="`Voir ${space.name}`"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { MapPin, Lock, RotateCw } from 'lucide-vue-next'

// En dev, l'origine est localhost - on pointe sur la prod (les pages publiques
// n'ont plus de X-Frame-Options, les iframes fonctionnent donc en preview).
const base = import.meta.env.VITE_MAP_BASE_URL || 'https://openprojets.com'

const spaces = [
  {
    id: 'default',
    name: 'Métropole de Lyon',
    type: 'Métropole - Espace démonstration',
    src: `${base}/default`,
    urlDisplay: 'openprojets.com/default',
    color: '#5AAB7D',
  },
  {
    id: 'projet',
    name: 'Villeurbanne',
    type: 'Ville - Espace démonstration',
    src: `${base}/projet`,
    urlDisplay: 'openprojets.com/projet',
    color: '#4E2BFF',
  },
  {
    id: 'besancon',
    name: 'Besançon',
    type: 'Ville - Espace démonstration',
    src: `${base}/besancon`,
    urlDisplay: 'openprojets.com/besancon',
    color: '#F2B327',
  },
]

const activeSpace = ref(spaces[0])
const loadedIds = ref([spaces[0].id])

function setActiveSpace(space) {
  activeSpace.value = space
  if (!loadedIds.value.includes(space.id)) {
    loadedIds.value = [...loadedIds.value, space.id]
  }
}
</script>
