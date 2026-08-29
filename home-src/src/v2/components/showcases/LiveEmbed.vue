<template>
  <!-- L'outil lui-meme, en direct, ouvert sur le bon module par ?module=.
       Une reproduction finit toujours par mentir : ici il n'y a rien a
       maintenir, ce que le visiteur manipule EST le produit.
       L'iframe n'est chargee qu'une fois le bloc a l'ecran : la carte est une
       application complete, on ne la charge pas trois fois pour rien.

       Tant qu'on n'a pas cliqué dedans, un voile invisible couvre le cadre :
       sans lui, la molette au-dessus du bloc zoome la carte au lieu de faire
       défiler la page, et le visiteur reste coincé au milieu du site. -->
  <div ref="root" class="live" @mouseleave="verrouiller">
    <div class="live-bar">
      <span class="live-dots"><i /><i /><i /></span>
      <span class="live-url"><Lock class="w-3 h-3" /> {{ affichage }}</span>
      <span class="live-tag"><span class="live-pip" /> En direct</span>
    </div>

    <div class="live-frame">
      <iframe
        v-if="charge"
        :src="props.url"
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

      <button
        v-if="pret && !actif"
        type="button"
        class="live-shield"
        @click="actif = true"
      >
        <span class="live-shield-pill">
          <MousePointerClick class="w-4 h-4" />
          Explorer cet espace
        </span>
      </button>
    </div>

    <div class="live-foot">
      <p v-if="!actif" class="live-note"><slot /></p>
      <button v-else type="button" class="live-note live-release" @click="verrouiller">
        <ArrowUpDown class="w-3.5 h-3.5" />
        Reprendre le défilement de la page
      </button>
      <a :href="props.url" target="_blank" rel="noopener" class="live-open">
        Ouvrir en plein écran
        <ArrowUpRight class="w-3.5 h-3.5" />
      </a>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Lock, ArrowUpRight, ArrowUpDown, MousePointerClick } from 'lucide-vue-next'

const props = defineProps({
  url: { type: String, required: true },
  titre: { type: String, required: true },
})

const affichage = computed(() => props.url.replace(/^https?:\/\//, '').replace(/\/$/, ''))

const root = ref(null)
const charge = ref(false)
const pret = ref(false)
const actif = ref(false)
let observer = null

const verrouiller = () => { actif.value = false }

/* Le clavier a le meme droit de sortie que la souris. */
const auClavier = (e) => { if (e.key === 'Escape') verrouiller() }

onMounted(() => {
  observer = new IntersectionObserver(([e]) => {
    if (e.intersectionRatio >= 0.15) charge.value = true
    // Sur un ecran tactile il n'y a pas de sortie de souris : le cadre se
    // reverrouille des qu'il quitte l'ecran.
    if (!e.isIntersecting) verrouiller()
  }, { threshold: [0, 0.15] })
  if (root.value) observer.observe(root.value)
  window.addEventListener('keydown', auClavier)
})
onUnmounted(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', auClavier)
})
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

/* Une carte plein ecran a besoin de hauteur : a 480 pixels, le panneau
   lateral de l'outil mangeait la moitie de ce qu'on venait voir. */
.live-frame { position: relative; height: min(72vh, 660px); min-height: 520px; background: #eef0f1; }
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

/* Le voile laisse voir la carte en entier : il ne prend une teinte qu'au
   survol, le temps de dire qu'on peut entrer. */
.live-shield {
  position: absolute; inset: 0; width: 100%; border: 0; padding: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: transparent; transition: background-color .25s ease-in-out;
}
.live-shield:hover, .live-shield:focus-visible { background: rgba(17, 17, 17, 0.18); }
.live-shield-pill {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: #111; background: rgba(255, 255, 255, 0.96);
  border-radius: 999px; padding: 10px 18px;
  box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.35), inset 0 1.5px 0 rgba(255, 255, 255, 0.95);
  opacity: 0; transform: translateY(6px); transition: opacity .25s ease-in-out, transform .25s ease-in-out;
}
.live-shield:hover .live-shield-pill, .live-shield:focus-visible .live-shield-pill { opacity: 1; transform: none; }

.live-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; padding: 13px 16px; border-top: 1px solid rgba(0, 0, 0, 0.06); background: #fcfcfc; }
.live-note { flex: 1; min-width: 240px; margin: 0; font-size: 12.5px; line-height: 1.55; color: #555; }
.live-release {
  display: inline-flex; align-items: center; gap: 7px; text-align: left;
  border: 0; background: none; padding: 0; cursor: pointer; font-weight: 600; color: #111;
}
.live-release:hover { color: #C4002A; }
.live-open { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #C4002A; text-decoration: none; }
.live-open:hover { text-decoration: underline; text-underline-offset: 3px; }

@media (max-width: 720px) { .live-frame { height: 460px; min-height: 0; } }
@media (prefers-reduced-motion: reduce) {
  .live-pip, .live-spin { animation: none; }
  .live-shield-pill { transition: none; opacity: 1; transform: none; }
}
</style>
