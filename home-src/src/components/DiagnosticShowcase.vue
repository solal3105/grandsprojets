<template>
  <!-- Reproduction de l'outil sur une vraie carte MapLibre (illustrative, non
       interactive) : une zone entourée, ses relevés, la lecture sourcée. -->
  <div ref="root" class="dg" :class="{ 'is-visible': visible }">
    <div class="dg-bar">
      <span class="dg-wdots"><i /><i /><i /></span>
      <span class="dg-title">
        <ScanSearch class="w-3.5 h-3.5 text-teal" />
        Diagnostic terrain - Secteur Gare
      </span>
      <span class="dg-run"><Sparkles class="w-3 h-3" /> Analyser la zone</span>
    </div>

    <div class="dg-body">
      <div class="dg-map">
        <div ref="mapEl" class="dg-canvas" />
        <span class="dg-chip"><MapPinned class="w-3.5 h-3.5" /> Zone sélectionnée · <b>142 relevés</b></span>
        <span class="dg-attr">© OpenStreetMap</span>
      </div>

      <div class="dg-read">
        <p class="dg-read-head">Ce que l'IA lit dans la zone</p>
        <div v-for="(src, i) in sources" :key="src.code" class="dg-src" :style="{ '--d': 0.15 + i * 0.12 + 's' }">
          <div class="dg-src-top">
            <span class="dg-code" :class="src.cls">{{ src.code }}</span>
            <span class="dg-src-name">{{ src.label }}</span>
            <span class="dg-src-n">{{ src.count }}</span>
          </div>
          <p class="dg-src-syn">{{ src.synthesis }}</p>
        </div>
        <div class="dg-guar">
          <ShieldCheck class="w-4 h-4 shrink-0 text-teal" />
          <span>Chaque ligne cite ses relevés - <b>aucune recommandation générée.</b></span>
        </div>
      </div>
    </div>

    <ol class="dg-steps">
      <li><span>1</span> Entourez une zone</li>
      <li><span>2</span> L'IA lit les relevés qui s'y trouvent</li>
      <li><span>3</span> Synthèse sourcée, prête à partager</li>
    </ol>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ScanSearch, Sparkles, MapPinned, ShieldCheck } from 'lucide-vue-next'

const TEAL = '#0E7C86', AMBER = '#E0940E', PURPLE = '#6D4BFF'
const CENTER = [4.8565, 45.7668]

const zone = {
  type: 'Feature', properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [4.8541, 45.7681], [4.8556, 45.7689], [4.8578, 45.7686], [4.8589, 45.7671],
      [4.8583, 45.7654], [4.8566, 45.7648], [4.8546, 45.7653], [4.8536, 45.7667], [4.8541, 45.7681],
    ]],
  },
}
const mk = (lng, lat, s) => ({ type: 'Feature', properties: { s }, geometry: { type: 'Point', coordinates: [lng, lat] } })
const inside = {
  type: 'FeatureCollection', features: [
    mk(4.8548, 45.7678, 1), mk(4.8562, 45.7683, 2), mk(4.8575, 45.7676, 1), mk(4.8558, 45.7671, 3),
    mk(4.8570, 45.7666, 2), mk(4.8547, 45.7666, 2), mk(4.8580, 45.7662, 1), mk(4.8560, 45.7660, 2),
    mk(4.8572, 45.7655, 3), mk(4.8551, 45.7657, 1), mk(4.8564, 45.7651, 2),
  ],
}
const outside = {
  type: 'FeatureCollection', features: [
    mk(4.8510, 45.7695, 2), mk(4.8602, 45.7690, 1), mk(4.8622, 45.7668, 3), mk(4.8605, 45.7645, 2),
    mk(4.8592, 45.7632, 1), mk(4.8540, 45.7628, 2), mk(4.8514, 45.7645, 3), mk(4.8500, 45.7670, 1),
    mk(4.8527, 45.7706, 2), mk(4.8618, 45.7704, 3),
  ],
}

const sources = [
  { code: 'S1', cls: 'is-teal', label: 'Signalements voirie', count: 34, synthesis: 'Dégradations de chaussée et marquages effacés sur plusieurs tronçons.' },
  { code: 'S2', cls: 'is-amber', label: 'Contributions citoyennes', count: 61, synthesis: "Stationnement gênant et points d'éclairage défaillants, surtout." },
  { code: 'S3', cls: 'is-purple', label: 'Comptages vélo', count: 47, synthesis: '47 passages recensés sur la période, sans texte associé.' },
]

const root = ref(null)
const mapEl = ref(null)
const visible = ref(false)
let observer = null, map = null

async function initMap() {
  try {
    const maplibregl = (await import('maplibre-gl')).default
    await import('maplibre-gl/dist/maplibre-gl.css')
    if (!mapEl.value) return
    map = new maplibregl.Map({
      container: mapEl.value,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: CENTER, zoom: 15.15, pitch: 46, bearing: -17,
      interactive: false, attributionControl: false, fadeDuration: 0,
    })
    map.on('load', () => {
      // Bâtiments 3D légers pour l'effet « vraie carte »
      if (map.getSource('openmaptiles')) {
        map.addLayer({
          id: 'dg-3d', source: 'openmaptiles', 'source-layer': 'building',
          type: 'fill-extrusion', minzoom: 14,
          paint: {
            'fill-extrusion-color': '#e4e7ea',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.85,
          },
        })
      }
      map.addSource('zone', { type: 'geojson', data: zone })
      map.addLayer({ id: 'zone-fill', source: 'zone', type: 'fill', paint: { 'fill-color': TEAL, 'fill-opacity': 0.14 } })
      map.addLayer({ id: 'zone-line', source: 'zone', type: 'line', paint: { 'line-color': TEAL, 'line-width': 2.5 } })

      const color = ['match', ['get', 's'], 1, TEAL, 2, AMBER, 3, PURPLE, TEAL]
      map.addSource('out', { type: 'geojson', data: outside })
      map.addLayer({ id: 'out', source: 'out', type: 'circle', paint: { 'circle-radius': 3.4, 'circle-color': color, 'circle-opacity': 0.4 } })
      map.addSource('in', { type: 'geojson', data: inside })
      map.addLayer({
        id: 'in', source: 'in', type: 'circle',
        paint: {
          'circle-radius': 6, 'circle-color': color,
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff',
        },
      })
    })
  } catch (e) {
    console.debug('[DiagnosticShowcase] carte non initialisée:', e)
  }
}

onMounted(() => {
  observer = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { visible.value = true; observer.disconnect(); initMap() }
  }, { threshold: 0.25 })
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => { observer?.disconnect(); map?.remove() })
</script>

<style scoped>
.dg {
  container-type: inline-size;
  border-radius: 18px; background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08); overflow: hidden;
  box-shadow: 0 22px 60px -30px rgba(14, 124, 134, 0.5), 0 4px 16px -8px rgba(0, 0, 0, 0.08);
}

.dg-bar { display: flex; align-items: center; gap: 12px; padding: 11px 16px; border-bottom: 1px solid rgba(0, 0, 0, 0.06); background: #fcfcfc; }
.dg-wdots { display: inline-flex; gap: 5px; }
.dg-wdots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(0, 0, 0, 0.12); }
.dg-title { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #111; white-space: nowrap; }
.dg-run { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #0E7C86; background: rgba(14, 124, 134, 0.1); padding: 5px 10px; border-radius: 999px; white-space: nowrap; }

.dg-body { display: flex; flex-direction: column; }
@container (min-width: 620px) {
  .dg-body { flex-direction: row; align-items: stretch; }
  .dg-map { flex: 1 1 58%; }
  .dg-read { flex: 1 1 42%; border-top: none; border-left: 1px solid rgba(0, 0, 0, 0.06); }
}

.dg-map { position: relative; min-height: 300px; background: #eef0f1; overflow: hidden; }
.dg-canvas { position: absolute; inset: 0; opacity: 0; transition: opacity .6s ease; }
.is-visible .dg-canvas { opacity: 1; }
.dg-chip {
  position: absolute; left: 12px; bottom: 12px; z-index: 2;
  display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #333;
  background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 999px; padding: 5px 11px; box-shadow: 0 4px 14px -6px rgba(0, 0, 0, 0.3);
}
.dg-chip b { color: #0E7C86; }
.dg-attr { position: absolute; right: 8px; bottom: 6px; z-index: 2; font-size: 9px; color: rgba(0, 0, 0, 0.4); background: rgba(255, 255, 255, 0.6); padding: 1px 5px; border-radius: 4px; }

.dg-read { padding: 18px 18px 16px; background: #fff; display: flex; flex-direction: column; }
.dg-read-head { font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #9a9a9a; margin: 0 0 14px; }
.dg-src { margin-bottom: 15px; opacity: 0; transform: translateY(8px); }
.is-visible .dg-src { animation: dgrise .5s ease var(--d) forwards; }
.dg-src-top { display: flex; align-items: center; gap: 9px; }
.dg-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 700; color: #fff; border-radius: 5px; padding: 2px 6px; }
.dg-code.is-teal { background: #0E7C86; }
.dg-code.is-amber { background: #B87E0C; }
.dg-code.is-purple { background: #4E2BFF; }
.dg-src-name { font-size: 13px; font-weight: 600; color: #111; }
.dg-src-n { margin-left: auto; font-size: 11.5px; color: #777; font-variant-numeric: tabular-nums; }
.dg-src-syn { margin: 5px 0 0; font-size: 12.5px; line-height: 1.5; color: #555; }
.dg-guar { display: flex; align-items: center; gap: 9px; margin-top: auto; padding-top: 13px; border-top: 1px solid rgba(0, 0, 0, 0.06); font-size: 11.5px; line-height: 1.4; color: #666; }
.dg-guar b { color: #111; font-weight: 600; }

.dg-steps { list-style: none; margin: 0; padding: 12px 16px; border-top: 1px solid rgba(0, 0, 0, 0.06); background: #fcfcfc; display: flex; flex-wrap: wrap; gap: 8px 22px; }
.dg-steps li { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #555; font-weight: 500; }
.dg-steps span { width: 18px; height: 18px; border-radius: 50%; background: rgba(14, 124, 134, 0.12); color: #0E7C86; font-size: 10.5px; font-weight: 700; display: grid; place-items: center; flex: none; }

@keyframes dgrise { to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .dg-canvas { transition: none; }
  .dg-src { opacity: 1; transform: none; animation: none; }
}
</style>
