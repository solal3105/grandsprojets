<template>
  <!-- Reproduction de l'outil Diagnostic terrain de l'admin. Markup et valeurs
       repris de admin/sections/diagnostic/ et admin/admin.css (bloc dg-*) :
       un dock de verre de 348px flottant en haut a gauche d'une carte encadree,
       pilule d'onglets detachee au-dessus du panneau. L'onglet actif est NOIR,
       le vert ne sert qu'aux accents, les references sont bleues.
       Le trace de zone et les halos reprennent les peintures MapLibre reelles. -->
  <div ref="root" class="dgv" :class="{ 'is-visible': visible }">
    <div class="dgv-scroll">
      <div class="dgv-stage">
        <div ref="mapEl" class="dgv-map" />
        <span class="dgv-attr">© OpenStreetMap</span>

        <!-- Outils de carte, en haut a droite -->
        <div class="dg-maptools">
          <span class="dg-tool-btn"><Maximize class="w-3.5 h-3.5" /></span>
          <span class="dg-lasso-btn is-active"><Lasso class="w-3.5 h-3.5" /> Sélectionner une zone</span>
        </div>

        <!-- Le dock -->
        <div class="dg-dock">
          <div class="dg-tabs" role="tablist" aria-label="Diagnostic terrain">
            <button
              v-for="t in ONGLETS" :key="t.id"
              type="button" role="tab" class="dg-tab" :class="{ 'is-active': onglet === t.id }"
              :aria-selected="onglet === t.id" @click="onglet = t.id"
            >
              <component :is="t.icon" class="w-3 h-3" />
              {{ t.label }}
              <span v-if="t.badge" class="dg-tab__badge">{{ t.badge }}</span>
            </button>
          </div>

          <div class="dg-tab-panel">
            <!-- Onglet Couches -->
            <div v-if="onglet === 'layers'" class="dg-layers-list">
              <p class="dg-group-label">Sources de la collectivité</p>
              <div v-for="s in SOURCES" :key="s.label" class="dg-row">
                <span class="dg-swatch" :style="{ background: s.color }" />
                <span class="dg-row__txt"><span class="dg-row__label">{{ s.label }}</span></span>
                <span class="dg-count">{{ s.total }}</span>
                <span class="adm-switch"><span class="adm-switch__track is-on" /></span>
              </div>
              <div class="dg-layers-foot">
                <span class="dg-row dg-row--tool">
                  <span class="dg-swatch" style="background:linear-gradient(135deg,#22d3ee,#f59e0b,#dc2626)" />
                  <span class="dg-row__txt"><span class="dg-row__label">Heatmap de densité</span></span>
                  <span class="adm-switch"><span class="adm-switch__track" /></span>
                </span>
                <span class="dgv-add"><Plus class="w-3 h-3" /> Ajouter une couche</span>
              </div>
            </div>

            <!-- Onglet Analyse : la restitution -->
            <div v-else>
              <div class="dg-rbar">
                <span class="dg-rbar__meta"><b>182</b> points lus · 5 sources · 12 sujets</span>
                <span class="dg-rbar__spacer" />
                <span class="dg-rbar__btn"><RotateCw class="w-3 h-3" /></span>
                <span class="dg-rbar__btn"><X class="w-3 h-3" /></span>
              </div>

              <div class="dg-mix">
                <div class="dg-mix__bar">
                  <span
                    v-for="s in SOURCES" :key="s.label" class="dg-mix__seg"
                    :style="{ width: `${(s.zone / 182) * 100}%`, background: s.color }"
                    :title="`${s.label} : ${s.zone} points`"
                  />
                </div>
              </div>

              <p class="dg-resume">
                Les points de la zone portent surtout sur les conflits d'usage entre vélos et piétons
                et sur l'état de la chaussée. Quelques relevés positifs et des demandes de
                stationnement figurent également dans la sélection.
              </p>

              <div class="dg-layers-detail">
                <div class="dg-couche is-open">
                  <div class="dg-couche__head">
                    <span class="dg-couche__dot" :style="{ background: SOURCES[0].color }" />
                    <span class="dg-couche__name">{{ SOURCES[0].label }}</span>
                    <span class="dg-couche__count">{{ SOURCES[0].zone }}</span>
                    <ChevronDown class="dg-couche__chev w-2.5 h-2.5" />
                  </div>
                  <p class="dg-couche__synth">
                    Ces points signalent des problèmes de sécurité pour les cyclistes : conflits
                    d'usage avec les piétons et les voitures, aménagements peu adaptés.
                  </p>
                  <div class="dg-couche__body">
                    <div class="dg-sujet">
                      <div class="dg-sujet__head">
                        <span class="dg-sujet__title">Conflit d'usage vélo-piéton</span>
                        <span class="dg-sujet__count">4 points</span>
                      </div>
                      <div class="dg-ins__refs">
                        <span v-for="r in ['#18', '#60', '#74', '#109']" :key="r" class="dg-ref">{{ r }}</span>
                      </div>
                      <p class="dg-ins__verb">« Le conflit d'usage sur ce pont n'est jamais loin. Aux heures de pointe le flux vélo est important et les piétons passent également par là… »</p>
                      <p class="dg-ins__verb">« Conflit d'usage entre piétons et vélos sur la passerelle cyclable »</p>
                    </div>
                    <div class="dg-sujet">
                      <div class="dg-sujet__head">
                        <span class="dg-sujet__title">Chaussée dégradée</span>
                        <span class="dg-sujet__count">3 points</span>
                      </div>
                      <div class="dg-ins__refs">
                        <span v-for="r in ['#6', '#41', '#88']" :key="r" class="dg-ref">{{ r }}</span>
                      </div>
                      <p class="dg-ins__verb">« Revêtement très abîmé sur tout le tronçon, dangereux à vélo »</p>
                    </div>
                  </div>
                </div>

                <div class="dg-couche">
                  <div class="dg-couche__head">
                    <span class="dg-couche__dot" :style="{ background: SOURCES[3].color }" />
                    <span class="dg-couche__name">{{ SOURCES[3].label }}</span>
                    <span class="dg-couche__count">{{ SOURCES[3].zone }}</span>
                    <ChevronDown class="dg-couche__chev w-2.5 h-2.5" />
                  </div>
                  <p class="dg-couche__synth">
                    Ces points ne portent pas de texte descriptif : seul leur décompte est exploitable.
                  </p>
                </div>
              </div>

              <span class="dg-report-btn"><FileText class="w-3 h-3" /> Générer le rapport de zone</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="dgv-hint">Faites glisser horizontalement pour voir toute la carte.</p>
    <p class="dgv-note">
      Le Diagnostic vit dans votre administration : c'est le seul module qu'on ne peut pas montrer
      en direct. Il lit <b>tous</b> les points de la zone, dans la limite de 300. Il ne note pas,
      ne hiérarchise pas et ne recommande rien.
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Layers, Wand2, Maximize, Lasso, Plus, RotateCw, X, ChevronDown, FileText } from 'lucide-vue-next'

defineProps({ moduleKey: { type: String, default: 'diagnostic' } })

// Sources d'illustration : la structure est celle du produit, les intitules
// sont neutres, aucune collectivite n'est nommee.
const SOURCES = [
  { label: 'Signalements cyclables', color: '#DC2626', total: '1 284', zone: 151 },
  { label: 'Relevés favorables', color: '#16A34A', total: '312', zone: 17 },
  { label: 'Demandes de stationnement', color: '#0EA5E9', total: '164', zone: 9 },
  { label: 'Comptages de trafic', color: '#0891B2', total: '96', zone: 4 },
  { label: 'Remontées terrain', color: '#2563EB', total: '58', zone: 1 },
]

const ONGLETS = [
  { id: 'layers', label: 'Couches', icon: Layers, badge: '' },
  { id: 'analyse', label: 'Analyse', icon: Wand2, badge: '182' },
]
const onglet = ref('analyse')

const CENTER = [4.8565, 45.7668]
const ZONE = {
  type: 'Feature', properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [4.8541, 45.7681], [4.8556, 45.7689], [4.8578, 45.7686], [4.8589, 45.7671],
      [4.8583, 45.7654], [4.8566, 45.7648], [4.8546, 45.7653], [4.8536, 45.7667], [4.8541, 45.7681],
    ]],
  },
}
const pt = (lng, lat, c) => ({ type: 'Feature', properties: { c }, geometry: { type: 'Point', coordinates: [lng, lat] } })
const DEDANS = { type: 'FeatureCollection', features: [
  pt(4.8548, 45.7678, 0), pt(4.8562, 45.7683, 0), pt(4.8575, 45.7676, 1), pt(4.8558, 45.7671, 0),
  pt(4.8570, 45.7666, 2), pt(4.8547, 45.7666, 0), pt(4.8580, 45.7662, 3), pt(4.8560, 45.7660, 0),
  pt(4.8572, 45.7655, 1), pt(4.8551, 45.7657, 0), pt(4.8564, 45.7651, 4),
] }
const DEHORS = { type: 'FeatureCollection', features: [
  pt(4.8510, 45.7695, 0), pt(4.8602, 45.7690, 1), pt(4.8622, 45.7668, 2), pt(4.8605, 45.7645, 0),
  pt(4.8592, 45.7632, 0), pt(4.8540, 45.7628, 3), pt(4.8514, 45.7645, 0), pt(4.8500, 45.7670, 1),
  pt(4.8527, 45.7706, 0), pt(4.8618, 45.7704, 2),
] }

const root = ref(null)
const mapEl = ref(null)
const visible = ref(false)
let observer = null
let map = null

async function initMap() {
  try {
    const maplibregl = (await import('maplibre-gl')).default
    await import('maplibre-gl/dist/maplibre-gl.css')
    if (!mapEl.value) return
    map = new maplibregl.Map({
      container: mapEl.value,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: CENTER, zoom: 14.9,
      interactive: false, attributionControl: false, fadeDuration: 0,
    })
    map.on('load', () => {
      const couleur = ['match', ['get', 'c'], 0, '#DC2626', 1, '#16A34A', 2, '#0EA5E9', 3, '#0891B2', 4, '#2563EB', '#DC2626']

      // Zone validee : remplissage a 6 %, trait tirete 3/2 (peintures reelles)
      map.addSource('zone', { type: 'geojson', data: ZONE })
      map.addLayer({ id: 'zone-fill', source: 'zone', type: 'fill', paint: { 'fill-color': 'rgb(20,174,92)', 'fill-opacity': 0.06 } })
      map.addLayer({ id: 'zone-line', source: 'zone', type: 'line', paint: { 'line-color': '#0ea55a', 'line-width': 2, 'line-dasharray': [3, 2] } })

      map.addSource('dehors', { type: 'geojson', data: DEHORS })
      map.addLayer({ id: 'dehors', source: 'dehors', type: 'circle', paint: {
        'circle-radius': 4, 'circle-color': couleur, 'circle-opacity': 0.88,
        'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(255,255,255,.85)',
      } })

      // Halo vert des points selectionnes, sous les points eux-memes
      map.addSource('dedans', { type: 'geojson', data: DEDANS })
      map.addLayer({ id: 'halo', source: 'dedans', type: 'circle', paint: {
        'circle-radius': 10, 'circle-color': '#14AE5C', 'circle-opacity': 0.18,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#0ea55a',
      } })
      map.addLayer({ id: 'dedans', source: 'dedans', type: 'circle', paint: {
        'circle-radius': 4, 'circle-color': couleur, 'circle-opacity': 0.88,
        'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(255,255,255,.85)',
      } })
    })
  } catch (e) {
    console.debug('[DiagnosticShowcase] carte non initialisee:', e)
  }
}

onMounted(() => {
  observer = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { visible.value = true; observer.disconnect(); initMap() }
  }, { threshold: 0.2 })
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => { observer?.disconnect(); map?.remove() })
</script>

<style scoped>
/* ── Le cadre de carte : .dg-mapwrap ─────────────────────────── */
.dgv-scroll { overflow-x: auto; border-radius: 20px; }
.dgv-stage {
  position: relative; min-width: 880px; height: 520px;
  border-radius: 20px; overflow: hidden; background: #F1F5F9;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04), 0 12px 48px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04);
}
.dgv-map { position: absolute; inset: 0; opacity: 0; transition: opacity .6s ease; }
.is-visible .dgv-map { opacity: 1; }
.dgv-attr { position: absolute; right: 8px; bottom: 6px; z-index: 2; font-size: 9px; color: rgba(0,0,0,.55); background: rgba(255,255,255,.7); padding: 1px 5px; border-radius: 4px; }
.dgv-hint { display: none; margin: 10px 0 0; font-size: 12px; color: #6B6B6B; }
@media (max-width: 960px) { .dgv-hint { display: block; } }
.dgv-note { margin: 14px 0 0; font-size: 12.5px; line-height: 1.6; color: #555; }
.dgv-note b { color: #111; font-weight: 600; }

/* ── Outils de carte ─────────────────────────────────────────── */
.dg-maptools { position: absolute; top: 14px; right: 14px; z-index: 6; display: flex; align-items: center; gap: 8px; }
.dg-tool-btn {
  display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,.5); background: rgba(255,255,255,.72);
  backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow: 0 4px 24px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.04), inset 0 1.5px 0 rgba(255,255,255,.95);
  color: #334155;
}
.dg-lasso-btn {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 100px;
  border: 1px solid transparent; font-size: 13px; font-weight: 700;
  box-shadow: 0 4px 24px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.04);
}
.dg-lasso-btn.is-active { background: rgb(20,174,92); color: #fff; }

/* ── Le dock : 348px, en haut a gauche ───────────────────────── */
.dg-dock {
  position: absolute; top: 14px; left: 14px; z-index: 6;
  width: 348px; max-height: calc(100% - 28px);
  display: flex; flex-direction: column; gap: 10px;
}
.dg-tabs {
  display: inline-flex; align-self: flex-start; gap: 3px; padding: 4px; border-radius: 100px;
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255,255,255,.5);
  box-shadow: 0 4px 24px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.04), inset 0 1.5px 0 rgba(255,255,255,.95);
}
.dg-tab {
  display: flex; align-items: center; gap: 7px; border: 0; background: transparent;
  padding: 8px 15px; border-radius: 100px; font: inherit; font-size: 12.5px; font-weight: 700;
  color: #64748B; cursor: pointer; white-space: nowrap;
  transition: all .2s cubic-bezier(.4,0,.2,1);
}
.dg-tab:hover { color: #1E293B; }
/* L'onglet actif est NOIR, jamais vert */
.dg-tab.is-active { background: #0F172A; color: #F8FAFC; box-shadow: 0 2px 8px rgba(0,0,0,.22); }
.dg-tab:focus-visible { outline: 2px solid #0F172A; outline-offset: 2px; }
.dg-tab__badge { background: rgb(20,174,92); color: #fff; font-size: 10px; font-weight: 800; border-radius: 100px; padding: 1px 6px; }
.dg-tab.is-active .dg-tab__badge { background: #F8FAFC; color: #0F172A; }

.dg-tab-panel {
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(40px) saturate(170%); -webkit-backdrop-filter: blur(40px) saturate(170%);
  border: 1px solid rgba(255,255,255,.5); border-radius: 18px; padding: 12px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 12px 48px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.04), inset 0 1.5px 0 rgba(255,255,255,.95);
  overflow-y: auto; min-height: 0;
}
.dg-tab-panel::-webkit-scrollbar { width: 7px; }
.dg-tab-panel::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 99px; }

/* ── Onglet Couches ──────────────────────────────────────────── */
.dg-layers-list { display: flex; flex-direction: column; gap: 2px; }
.dg-group-label { margin: 2px 6px 3px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; color: #94A3B8; }
.dg-row { display: flex; align-items: center; gap: 9px; padding: 8px; border-radius: 11px; }
.dg-swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; box-shadow: 0 0 0 2px rgba(255,255,255,.7); }
.dg-row__txt { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
.dg-row__label { font-size: 12.5px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-count { flex: none; font-size: 10.5px; font-weight: 700; color: #64748B; background: rgba(0,0,0,.06); padding: 2px 7px; border-radius: 100px; }
.adm-switch__track { display: block; width: 34px; height: 20px; border-radius: 99px; background: #CBD5E1; position: relative; flex: none; }
.adm-switch__track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
.adm-switch__track.is-on { background: rgb(20,174,92); }
.adm-switch__track.is-on::after { transform: translateX(14px); }
.dg-layers-foot { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,.06); }
.dgv-add { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 7px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; color: #334155; background: rgba(255,255,255,.55); border: 1px solid rgba(255,255,255,.5); box-shadow: 0 2px 8px rgba(0,0,0,.04); }

/* ── Onglet Analyse : la restitution ─────────────────────────── */
.dg-rbar { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,.08); }
.dg-rbar__meta { font-size: 11.5px; font-weight: 700; color: #475569; }
.dg-rbar__meta b { color: #0F172A; }
.dg-rbar__spacer { flex: 1; }
.dg-rbar__btn { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border: 1px solid rgba(0,0,0,.1); border-radius: 8px; background: #F8FAFC; color: #64748B; }

.dg-mix { position: relative; margin: 6px 0 10px; }
.dg-mix__bar { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: rgba(0,0,0,.06); box-shadow: inset 0 0 0 1px rgba(0,0,0,.04); }
.dg-mix__seg { display: block; min-width: 3px; }

.dg-resume { margin: 0 0 8px; font-size: 12px; line-height: 1.55; color: #334155; padding: 10px 12px; background: rgba(0,0,0,.04); border-radius: 11px; border-left: 3px solid #CBD5E1; }

.dg-layers-detail { display: flex; flex-direction: column; gap: 8px; }
.dg-couche { border: 1px solid rgba(0,0,0,.08); border-radius: 13px; background: #F8FAFC; overflow: hidden; }
.dg-couche.is-open { box-shadow: 0 4px 14px rgba(0,0,0,.07); }
.dg-couche__head { display: flex; align-items: center; gap: 9px; width: 100%; padding: 10px 12px; }
.dg-couche__dot { width: 10px; height: 10px; border-radius: 3px; flex: none; box-shadow: 0 0 0 2px rgba(255,255,255,.7); }
.dg-couche__name { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-couche__count { flex: none; font-size: 11px; font-weight: 800; color: #475569; background: rgba(0,0,0,.06); padding: 2px 8px; border-radius: 100px; }
.dg-couche__chev { flex: none; color: #94A3B8; }
.dg-couche.is-open .dg-couche__chev { transform: rotate(180deg); }
/* La synthese reste visible hors du corps repliable */
.dg-couche__synth { margin: 0; padding: 0 12px 11px; font-size: 12px; line-height: 1.5; color: #475569; }
.dg-couche__body { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px; }

.dg-sujet { display: flex; flex-direction: column; gap: 6px; padding: 11px 12px; border: 1px solid rgba(0,0,0,.06); border-radius: 13px; background: rgba(0,0,0,.015); }
.dg-sujet__head { display: flex; align-items: baseline; gap: 10px; }
.dg-sujet__title { flex: 1; font-size: 13px; font-weight: 700; color: #0F172A; line-height: 1.3; }
.dg-sujet__count { flex: none; font-size: 11px; font-weight: 800; color: #475569; background: rgba(0,0,0,.06); padding: 2px 9px; border-radius: 100px; }
/* Les references sont bleues */
.dg-ins__refs { display: flex; flex-wrap: wrap; gap: 3px; }
.dg-ref { border-radius: 6px; padding: 0 6px; font-size: 10.5px; font-weight: 800; line-height: 1.6; background: rgba(37,99,235,.12); color: #2563EB; }
.dg-ins__verb { margin: 0; font-size: 11px; line-height: 1.4; font-style: italic; color: #475569; border-left: 2px solid rgba(0,0,0,.15); padding: 1px 0 1px 9px; }

.dg-report-btn {
  display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; margin-top: 10px;
  border: 1px solid rgba(0,0,0,.1); border-radius: 11px; background: #F8FAFC; padding: 10px;
  font-size: 12px; font-weight: 700; color: #334155;
}

@media (prefers-reduced-motion: reduce) { .dgv-map { transition: none; } }
</style>
