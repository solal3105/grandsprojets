<template>
  <!-- L'outil lui-meme, en direct, ouvert sur le bon module par ?module=.
       Une reproduction finit toujours par mentir : ici il n'y a rien a
       maintenir, ce que le visiteur manipule EST le produit.
       L'iframe n'est chargee qu'une fois le bloc a l'ecran : la carte est une
       application complete, on ne la charge pas trois fois pour rien. -->
  <div ref="root" class="live">
    <div class="live-bar">
      <span class="live-dots"><i /><i /><i /></span>
      <span class="live-url"><Lock class="w-3 h-3" /> {{ affichage }}</span>
      <span class="live-tag"><span class="live-pip" /> En direct</span>
    </div>

    <div class="live-frame">
      <iframe
        v-if="charge"
        :src="url"
        :title="titre"
        class="live-iframe"
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        @load="pret = true"
      />
      <div v-if="!pret" class="live-wait">
        <span class="live-spin" />
        <span>Chargement de l'espace…</span>
      </div>
    </div>

    <div class="live-foot">
      <p class="live-note"><slot /></p>
      <a :href="url" target="_blank" rel="noopener" class="live-open">
        Ouvrir en plein écran
        <ArrowUpRight class="w-3.5 h-3.5" />
      </a>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Lock, ArrowUpRight } from 'lucide-vue-next'
import { spaceUrl } from '@/data/siteUrls.js'

const props = defineProps({
  city: { type: String, required: true },
  moduleKey: { type: String, required: true },
  titre: { type: String, required: true },
})

const url = computed(() => spaceUrl(props.city, props.moduleKey))
const affichage = computed(() => url.value.replace(/^https?:\/\//, ''))

const root = ref(null)
const charge = ref(false)
const pret = ref(false)
let observer = null

onMounted(() => {
  observer = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { charge.value = true; observer.disconnect() }
  }, { threshold: 0.15 })
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => observer?.disconnect())
</script>

<style scoped>
.live {
  border-radius: 18px; overflow: hidden; background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 22px 60px -30px rgba(0, 0, 0, 0.45), 0 4px 16px -8px rgba(0, 0, 0, 0.08);
}
.live-bar { display: flex; align-items: center; gap: 12px; padding: 11px 16px; border-bottom: 1px solid rgba(0, 0, 0, 0.06); background: #fcfcfc; }
.live-dots { display: inline-flex; gap: 5px; flex: none; }
.live-dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(0, 0, 0, 0.12); }
.live-url {
  flex: 1; min-width: 0; display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: #6B6B6B; background: #fff; border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 999px; padding: 5px 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.live-tag {
  flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  color: #0E7C46; background: rgba(20, 174, 92, 0.12); border-radius: 999px; padding: 4px 10px;
}
.live-pip { width: 6px; height: 6px; border-radius: 50%; background: #14AE5C; animation: pip 2s ease-in-out infinite; }
@keyframes pip { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }

.live-frame { position: relative; height: 480px; background: #eef0f1; }
.live-iframe { display: block; width: 100%; height: 100%; border: 0; }
.live-wait {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px; font-size: 13px; color: #6B6B6B; pointer-events: none;
}
.live-spin {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2.5px solid rgba(0, 0, 0, 0.1); border-top-color: #14AE5C;
  animation: spin .9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.live-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; padding: 13px 16px; border-top: 1px solid rgba(0, 0, 0, 0.06); background: #fcfcfc; }
.live-note { flex: 1; min-width: 240px; margin: 0; font-size: 12.5px; line-height: 1.55; color: #555; }
.live-open { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #C4002A; text-decoration: none; }
.live-open:hover { text-decoration: underline; text-underline-offset: 3px; }

@media (max-width: 720px) { .live-frame { height: 380px; } }
@media (prefers-reduced-motion: reduce) { .live-pip, .live-spin { animation: none; } }
</style>
