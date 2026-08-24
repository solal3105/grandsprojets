<template>
  <!-- Fond d'ouverture : un degrade teinte par la couleur du module, plus des
       lignes de niveau facon carte topographique. Tout est genere ici, aucun
       fichier a telecharger, aucune requete sortante, et le motif reste le
       sujet du produit plutot qu'une illustration decorative. -->
  <div class="ground" :style="{ '--teinte': teinte }" aria-hidden="true">
    <svg class="ground-lignes" viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid slice">
      <path v-for="(d, i) in courbes" :key="i" :d="d" :style="{ opacity: 0.46 - i * 0.026 }" />
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'

defineProps({
  // Couleur d'accent du module ; le rouge de marque par defaut
  teinte: { type: String, default: '#FF0037' },
})

/* Lignes de niveau : neuf courbes fermees concentriques, deformees par une
 * table fixe pour qu'elles ondulent sans se croiser. Table fixe et non
 * aleatoire : le fond doit etre identique a chaque rendu. */
const ONDES = [0.94, 1.07, 0.89, 1.12, 0.97, 1.04, 0.86, 1.09, 0.99, 1.06, 0.91, 1.03]

const courbes = computed(() => {
  const cx = 1010, cy = 250, n = ONDES.length
  return Array.from({ length: 15 }, (_, k) => {
    const base = 64 + k * 46
    const pts = ONDES.map((onde, i) => {
      const a = (i / n) * Math.PI * 2
      const r = base * (1 + (onde - 1) * 0.34)
      return [cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r]
    })
    // Courbe fermee lissee : chaque sommet est relie par une quadratique dont
    // le point de controle est le sommet lui-meme, passant par les milieux.
    const mil = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    let d = `M ${mil(pts[n - 1], pts[0]).map(Math.round).join(' ')}`
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const m = mil(p, pts[(i + 1) % n])
      d += ` Q ${Math.round(p[0])} ${Math.round(p[1])} ${Math.round(m[0])} ${Math.round(m[1])}`
    }
    return d + ' Z'
  })
})
</script>

<style scoped>
.ground {
  position: absolute; inset: 0; overflow: hidden; pointer-events: none;
  background:
    radial-gradient(ellipse 70% 60% at 84% 10%, color-mix(in srgb, var(--teinte) 9%, transparent) 0%, transparent 62%),
    radial-gradient(ellipse 60% 55% at 8% 88%, color-mix(in srgb, var(--teinte) 6%, transparent) 0%, transparent 58%),
    radial-gradient(ellipse 55% 45% at 45% 45%, rgba(78, 43, 255, 0.035) 0%, transparent 55%),
    linear-gradient(160deg, #FBFBFC 0%, #F6F7F9 45%, #FAF8F9 100%);
}
/* Le motif s'efface vers le bas pour que le contenu garde le premier plan */
.ground-lignes {
  position: absolute; inset: 0; width: 100%; height: 100%;
  fill: none;
  stroke: color-mix(in srgb, var(--teinte) 24%, transparent);
  stroke-width: 0.9;
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 45%, transparent 92%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 45%, transparent 92%);
}
</style>
