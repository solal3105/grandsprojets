<template>
  <div
    ref="tiltEl"
    class="image-tilt"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <div class="group relative rounded-2xl overflow-hidden border border-gray-border shadow-card">
      <div class="absolute inset-0 pointer-events-none z-10 rounded-2xl" :style="shine" />
      <div class="absolute inset-0 overflow-hidden pointer-events-none z-10">
        <div class="-translate-x-full group-hover:translate-x-[280%] -skew-x-12 w-1/3 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out" />
      </div>
      <img
        :src="src"
        :alt="alt"
        class="w-full h-auto block transition-transform duration-700 group-hover:scale-[1.03]"
        loading="lazy"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  src: { type: String, required: true },
  alt: { type: String, required: true },
})

const tiltEl = ref(null)
const shine = ref({})

function onMove(e) {
  const el = tiltEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  el.style.transition = 'transform 0.1s ease'
  el.style.transform = `perspective(900px) rotateX(${-y * 4}deg) rotateY(${x * 4}deg) translateZ(8px)`
  shine.value = {
    background: `radial-gradient(circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(255,255,255,0.18) 0%, transparent 55%)`,
  }
}

function onLeave() {
  const el = tiltEl.value
  if (!el) return
  el.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)'
  el.style.transform = ''
  shine.value = {}
}
</script>

<style scoped>
.image-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}
</style>
