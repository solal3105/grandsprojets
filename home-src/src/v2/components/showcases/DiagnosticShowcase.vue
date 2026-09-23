<template>
  <!-- Reproduction de l'outil Diagnostic terrain de l'admin. Markup et valeurs
       repris de admin/sections/diagnostic/ et admin/admin.css (bloc dg-*) :
       un dock de verre de 348px flottant en haut a gauche d'une carte encadree,
       pilule d'onglets detachee au-dessus du panneau. L'onglet actif est NOIR,
       le vert ne sert qu'aux accents.
       Les trois onglets suivent panel.js (Couches, Carte) et analysis.js
       (Analyse : la zone tracee, juste avant que le dossier s'ouvre dans sa
       propre page, que cette vue ne reproduit pas).
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
            <!-- Onglet Couches : les sources ajoutees depuis le catalogue -->
            <div v-if="onglet === 'layers'">
              <section class="dg-sec">
                <div class="dg-sec__head">
                  <span class="dg-sec__title"><Plug class="w-2.5 h-2.5" /> Sources connectées</span>
                  <span class="dg-sec__count">{{ SOURCES.length }} / {{ SOURCES.length }}</span>
                </div>
                <template v-for="g in GROUPES" :key="g.label">
                  <p class="dg-group-label">{{ g.label }}</p>
                  <div v-for="s in g.sources" :key="s.label" class="dg-row">
                    <span class="dg-swatch" :style="{ background: s.color }"><component :is="s.icon" class="w-2.5 h-2.5" /></span>
                    <span class="dg-row__txt">
                      <span class="dg-row__label">{{ s.label }}</span>
                      <span class="dg-row__sub"><b>{{ fmt(s.total) }}</b> points · {{ s.origine }}<template v-if="s.suivi"> · {{ s.suivi }}</template></span>
                    </span>
                    <span class="adm-switch"><span class="adm-switch__track is-on" /></span>
                  </div>
                </template>
              </section>
              <div class="dg-layers-foot">
                <span class="dgv-add"><Plus class="w-3 h-3" /> Ajouter des données</span>
              </div>
            </div>

            <!-- Onglet Carte : les reglages d'affichage -->
            <div v-else-if="onglet === 'map'" class="dg-settings">
              <div class="dg-setting">
                <span class="dg-setting__ico"><MapIcon class="w-3 h-3" /></span>
                <span class="dg-row__txt">
                  <span class="dg-row__label">Fond de carte</span>
                  <span class="dg-row__sub">plan OpenStreetMap</span>
                </span>
                <span class="dg-seg"><span class="is-active">Plan</span><span>Satellite</span></span>
              </div>
              <div v-for="r in REGLAGES" :key="r.label" class="dg-setting">
                <span class="dg-setting__ico"><component :is="r.icon" class="w-3 h-3" /></span>
                <span class="dg-row__txt">
                  <span class="dg-row__label">{{ r.label }}</span>
                  <span class="dg-row__sub">{{ r.sub }}</span>
                </span>
                <span class="adm-switch"><span class="adm-switch__track" :class="{ 'is-on': r.on }" /></span>
              </div>
            </div>

            <!-- Onglet Analyse : la zone tracee, avant le lancement -->
            <div v-else>
              <div class="dg-sel-status">
                <BoxSelect class="w-3.5 h-3.5" />
                <span>Zone de <b>0,14 km²</b></span>
                <span class="dg-sel-clear"><X class="w-3 h-3" /></span>
              </div>
              <div class="dg-dossier-intro">
                <p class="dg-dossier-title">Le dossier de cette zone</p>
                <p>
                  Cette zone réunit des données de {{ SOURCES.length }} sources, dont
                  {{ fmt(OBSERVATIONS) }} observations et {{ fmt(TEXTES) }} textes à lire.
                </p>
                <span class="dgv-label">Objet de l'étude (facultatif)</span>
                <span class="dgv-input">Par exemple : préparer une visite du quartier avec le service voirie.</span>
                <span class="dg-analyze-btn"><FileText class="w-3.5 h-3.5" /> Analyser la zone</span>
                <details class="dg-selection-sources" open>
                  <summary>Voir les sources retenues</summary>
                  <dl>
                    <div v-for="s in PAR_ZONE" :key="s.label">
                      <dt>{{ s.label }}</dt>
                      <dd>{{ fmt(s.zone) }}</dd>
                    </div>
                  </dl>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p class="dgv-hint">Faites glisser horizontalement pour voir toute la carte.</p>
    <p class="dgv-note">
      Le Diagnostic vit dans votre administration : c'est le seul module que nous ne pouvons pas
      montrer en direct, et cette vue reproduit son écran. Quand vous lancez l'analyse, le dossier
      s'ouvre dans sa propre page et l'IA y lit <b>tous</b> les textes de la zone.
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Layers, Map as MapIcon, Wand2, Maximize, Lasso, Plus, X, FileText, Plug, BoxSelect,
  MessageCircleMore, MapPin, Bike, Hash, Moon, Building2, Flame,
} from 'lucide-vue-next'

defineProps({ moduleKey: { type: String, default: 'diagnostic' } })

const fmt = (n) => n.toLocaleString('fr-FR')

// Couches d'illustration : les noms, les groupes et les provenances sont ceux
// que le catalogue donne (sources.js, sources/fub.js, sources/counters.js),
// sans nom de territoire ni de collectivite. Les couleurs suivent les points
// de la carte ci-dessous (propriete `c` des points, de 0 a 4).
const SOURCES = [
  { label: 'Signalements des habitants', groupe: 'Vos modules Open Projets', origine: 'Signalements des habitants', suivi: 'synchronisée', icon: MessageCircleMore, color: '#DC2626', total: 1284, zone: 96, textes: 81 },
  { label: 'Projets publiés', groupe: 'Vos modules Open Projets', origine: 'Projets publiés', suivi: 'synchronisée', icon: MapPin, color: '#2563EB', total: 58, zone: 2, textes: 2 },
  { label: 'Améliorations constatées · Baromètre vélo 2025', groupe: 'Baromètre vélo 2025', origine: 'Baromètre vélo (FUB)', icon: Bike, color: '#16A34A', total: 312, zone: 17, textes: 9 },
  { label: 'Souhaits de stationnement vélo · Baromètre vélo 2025', groupe: 'Baromètre vélo 2025', origine: 'Baromètre vélo (FUB)', icon: Bike, color: '#0EA5E9', total: 164, zone: 9, textes: 6 },
  // Donnees de reference : affichees et chiffrees, jamais comptees parmi les observations.
  { label: 'Compteurs vélo', groupe: 'Mobilité', origine: 'Comptages vélo', suivi: 'référence', icon: Hash, color: '#0891B2', total: 96, zone: 3, reference: true },
]

const GROUPES = SOURCES.reduce((groupes, s) => {
  const g = groupes.find((x) => x.label === s.groupe)
  if (g) g.sources.push(s)
  else groupes.push({ label: s.groupe, sources: [s] })
  return groupes
}, [])

// Les decomptes du panneau Analyse, calcules comme dans analysis.js.
const OBSERVATIONS = SOURCES.filter((s) => !s.reference).reduce((n, s) => n + s.zone, 0)
const TEXTES = SOURCES.reduce((n, s) => n + (s.textes || 0), 0)
const PAR_ZONE = [...SOURCES].sort((a, b) => b.zone - a.zone)

const REGLAGES = [
  { label: 'Fond sombre', sub: 'fait ressortir les cartes de flux', icon: Moon, on: false },
  { label: 'Bâtiments en relief', sub: 'à partir du zoom 15', icon: Building2, on: true },
  { label: 'Chaleur des témoignages', sub: 'densité des points des couches visibles', icon: Flame, on: false },
]

const ONGLETS = [
  { id: 'layers', label: 'Couches', icon: Layers, badge: '' },
  { id: 'map', label: 'Carte', icon: MapIcon, badge: '' },
  { id: 'analyse', label: 'Analyse', icon: Wand2, badge: fmt(OBSERVATIONS) },
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
  position: relative; min-width: 880px; height: 540px;
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
  border: 1px solid rgba(255,255,255,.5); background: rgba(255,255,255,.97);
  backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow: 0 4px 24px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.04), inset 0 1.5px 0 rgba(255,255,255,.95);
  color: #334155;
}
.dg-lasso-btn {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 100px;
  border: 1px solid transparent; font-size: 13px; font-weight: 700;
  box-shadow: 0 4px 24px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.04);
}
.dg-lasso-btn.is-active { background: #0D7F43; color: #fff; }

/* ── Le dock : 348px, en haut a gauche ───────────────────────── */
.dg-dock {
  position: absolute; top: 14px; left: 14px; z-index: 6;
  width: 348px; max-height: calc(100% - 28px);
  display: flex; flex-direction: column; gap: 10px;
}
.dg-tabs {
  display: inline-flex; align-self: flex-start; gap: 3px; padding: 4px; border-radius: 100px;
  background: rgba(255,255,255,.97);
  backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255,255,255,.5);
  box-shadow: 0 4px 24px rgba(0,0,0,.06), 0 1px 4px rgba(0,0,0,.04), inset 0 1.5px 0 rgba(255,255,255,.95);
}
.dg-tab {
  display: flex; align-items: center; gap: 7px; border: 0; background: transparent;
  padding: 8px 14px; border-radius: 100px; font: inherit; font-size: 12.5px; font-weight: 700;
  color: #64748B; cursor: pointer; white-space: nowrap;
  transition: all .2s cubic-bezier(.4,0,.2,1);
}
.dg-tab:hover { color: #1E293B; }
/* L'onglet actif est NOIR, jamais vert */
.dg-tab.is-active { background: #0F172A; color: #F8FAFC; box-shadow: 0 2px 8px rgba(0,0,0,.22); }
.dg-tab:focus-visible { outline: 2px solid #0F172A; outline-offset: 2px; }
.dg-tab__badge { background: #0D7F43; color: #fff; font-size: 11.5px; font-weight: 800; border-radius: 100px; padding: 1px 6px; }
.dg-tab.is-active .dg-tab__badge { background: #F8FAFC; color: #0F172A; }

.dg-tab-panel {
  background: rgba(255,255,255,.97);
  backdrop-filter: blur(40px) saturate(170%); -webkit-backdrop-filter: blur(40px) saturate(170%);
  border: 1px solid rgba(255,255,255,.5); border-radius: 18px; padding: 12px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.04), 0 12px 48px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.04), inset 0 1.5px 0 rgba(255,255,255,.95);
  overflow-y: auto; min-height: 0;
}
.dg-tab-panel::-webkit-scrollbar { width: 7px; }
.dg-tab-panel::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 99px; }

/* ── Onglet Couches : section, groupes, lignes ───────────────── */
.dg-sec { display: flex; flex-direction: column; gap: 1px; }
.dg-sec__head { display: flex; align-items: center; justify-content: space-between; padding: 2px 6px 6px; }
.dg-sec__title { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: #64748B; }
.dg-sec__count { font-size: 11px; font-weight: 700; color: #64748B; font-variant-numeric: tabular-nums; }
.dg-group-label { margin: 6px 6px 2px 37px; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-row { display: flex; align-items: center; gap: 9px; padding: 7px 8px 7px 6px; border-radius: 11px; }
.dg-swatch { width: 22px; height: 22px; flex: none; border-radius: 7px; display: inline-grid; place-items: center; color: #fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
.dg-row__txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; line-height: 1.25; }
.dg-row__label { font-size: 12.5px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dg-row__sub { font-size: 11px; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.dg-row__sub b { font-weight: 700; color: #475569; }
.adm-switch__track { display: block; width: 34px; height: 20px; border-radius: 99px; background: #CBD5E1; position: relative; flex: none; }
.adm-switch__track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
.adm-switch__track.is-on { background: rgb(20,174,92); }
.adm-switch__track.is-on::after { transform: translateX(14px); }
.dg-layers-foot { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,.06); }
.dgv-add { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; color: #fff; background: #0D7F43; box-shadow: 0 2px 8px rgba(0,0,0,.08); }

/* ── Onglet Carte : reglages d'affichage ─────────────────────── */
.dg-settings { display: flex; flex-direction: column; gap: 2px; }
.dg-setting { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 11px; }
.dg-setting__ico { width: 26px; height: 26px; flex: none; border-radius: 8px; display: grid; place-items: center; background: rgba(0,0,0,.06); color: #475569; }
.dg-seg { display: flex; flex: none; gap: 3px; padding: 2px; border-radius: 9px; background: rgba(0,0,0,.06); }
.dg-seg span { padding: 5px 9px; border-radius: 7px; font-size: 11px; font-weight: 600; color: #475569; }
.dg-seg span.is-active { background: #fff; color: #0F172A; box-shadow: 0 1px 3px rgba(0,0,0,.14); }

/* ── Onglet Analyse : la zone tracee ─────────────────────────── */
.dg-sel-status {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 8px; border-radius: 12px;
  background: rgba(20,174,92,.1); border: 1px solid rgba(20,174,92,.18);
  font-size: 12px; color: #334155;
}
.dg-sel-status > svg { color: #0D7F43; }
.dg-sel-clear { display: grid; place-items: center; width: 24px; height: 24px; margin-left: auto; flex: none; border-radius: 7px; background: rgba(0,0,0,.06); color: #475569; }
.dg-dossier-intro { padding: 4px 4px 2px; }
.dg-dossier-title { margin: 0 0 6px; font-size: 15px; font-weight: 700; color: #0F172A; }
.dg-dossier-intro > p { margin: 0 0 10px; font-size: 12.5px; line-height: 1.5; color: #475569; }
.dgv-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: #334155; }
.dgv-input {
  display: block; margin-bottom: 10px; padding: 8px 10px; border-radius: 10px;
  border: 1px solid rgba(0,0,0,.12); background: #fff;
  font-size: 12px; color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dg-analyze-btn {
  display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; padding: 11px;
  border-radius: 13px; background: #0D7F43; color: #fff; font-size: 13.5px; font-weight: 700;
  box-shadow: 0 6px 18px rgba(13,127,67,.28);
}
.dg-selection-sources { margin-top: 12px; font-size: 12px; color: #475569; }
.dg-selection-sources summary { cursor: pointer; font-weight: 600; }
.dg-selection-sources dl { margin: 8px 0 0; }
.dg-selection-sources dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px solid rgba(0,0,0,.08); }
.dg-selection-sources dt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dg-selection-sources dd { margin: 0; flex: none; font-weight: 700; color: #0F172A; font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) { .dgv-map { transition: none; } }
</style>
