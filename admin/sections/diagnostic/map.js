/**
 * Diagnostic terrain — carte MapLibre.
 * Fond de carte résolu depuis basemaps_v2 (fallback OSM raster), centre depuis
 * city_branding, rendu des couches piloté par leur config (style jsonb),
 * sélection lasso dessinée sur un canvas overlay.
 */

import { esc, escAttr } from '../../components/ui.js';
import { dg, onCleanup, safeColor } from './state.js';
import { pointInPolygon, someVertex } from './data.js';

const EMPTY_FC = () => ({ type: 'FeatureCollection', features: [] });

const OSM_FALLBACK_STYLE = {
  version: 8,
  sources: {
    'osm-raster': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};

/**
 * Style MapLibre depuis le fond de carte de la structure :
 * city_branding.default_basemap → défaut du catalogue basemaps_v2 → OSM.
 */
function _resolveBasemapStyle(basemaps) {
  const active = (basemaps || []).filter((b) => b.active !== false);
  const cityDefault = dg.branding?.default_basemap;
  const preferred = active.find((b) => b.name === cityDefault)
    || active.find((b) => b.is_default)
    || active[0];
  if (!preferred) return OSM_FALLBACK_STYLE;
  if (preferred.kind === 'vector' && preferred.style_url) return preferred.style_url;
  if (preferred.url) {
    return {
      version: 8,
      sources: {
        'city-raster': {
          type: 'raster',
          tiles: [preferred.url],
          tileSize: 256,
          attribution: preferred.attribution || '',
        },
      },
      layers: [{ id: 'city-raster-layer', type: 'raster', source: 'city-raster' }],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    };
  }
  return OSM_FALLBACK_STYLE;
}

/** Attend l'événement load de la carte, avec délai maximal. */
function _waitForLoad(map, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (map.loaded()) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error('Fond de carte indisponible (délai dépassé)')), timeoutMs);
    map.once('load', () => { clearTimeout(timer); resolve(); });
  });
}

/**
 * Crée la carte et ses sources utilitaires. Résout quand la carte est prête ;
 * si le fond configuré ne charge pas, retente avec le fallback OSM avant
 * d'échouer (throw).
 */
export async function createMap(el, basemaps) {
  const b = dg.branding || {};
  const center = [parseFloat(b.center_lng) || 4.835, parseFloat(b.center_lat) || 45.764];
  const zoom = parseFloat(b.zoom) || 12;
  const style = _resolveBasemapStyle(basemaps);

  const map = new maplibregl.Map({
    container: el,
    style,
    center,
    zoom,
    attributionControl: false,
    preserveDrawingBuffer: true, // requis pour la capture du rapport
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  dg.map = map;

  try {
    await _waitForLoad(map, 12000);
  } catch (err) {
    if (style === OSM_FALLBACK_STYLE) throw err;
    console.warn('[admin/diagnostic] Fond configuré en échec, repli OSM:', err.message);
    map.setStyle(OSM_FALLBACK_STYLE);
    await _waitForLoad(map, 12000);
  }
  _installUtilitySources(map);
  dg.mapReady = true;
  return map;
}

function _installUtilitySources(map) {
  // Heatmap (sous les couches de données).
  map.addSource('dg-heat-src', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({
    id: 'dg-heat',
    type: 'heatmap',
    source: 'dg-heat-src',
    layout: { visibility: 'none' },
    paint: {
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 13, 1.3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 12, 13, 28],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 14, 0.4],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(37,99,235,0)', 0.2, '#22d3ee', 0.45, '#84cc16', 0.7, '#f59e0b', 1, '#dc2626'],
    },
  });
  // Polygone de sélection + points sélectionnés + survol (au-dessus des données).
  map.addSource('dg-zone-src', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({ id: 'dg-zone-fill', type: 'fill', source: 'dg-zone-src', paint: { 'fill-color': 'rgb(20,174,92)', 'fill-opacity': 0.06 } });
  map.addLayer({ id: 'dg-zone-line', type: 'line', source: 'dg-zone-src', paint: { 'line-color': '#0ea55a', 'line-width': 2, 'line-dasharray': [3, 2] } });
  map.addSource('dg-sel-src', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({ id: 'dg-sel-halo', type: 'circle', source: 'dg-sel-src', paint: { 'circle-radius': 10, 'circle-color': '#14AE5C', 'circle-opacity': 0.18, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#0ea55a' } });
  map.addSource('dg-hov-src', { type: 'geojson', data: EMPTY_FC() });
  map.addLayer({ id: 'dg-hov', type: 'circle', source: 'dg-hov-src', paint: { 'circle-radius': 11, 'circle-color': '#4E2BFF', 'circle-opacity': 0.35, 'circle-stroke-width': 2, 'circle-stroke-color': '#3416b8' } });
}

/* ── Rendu des couches de données ──────────────────────────────── */

const _srcId = (id) => `dg-src-${id}`;
const _layerIds = (id) => [`dg-${id}-fill`, `dg-${id}-line`, `dg-${id}-pt`];

/** Expression de couleur MapLibre depuis la config style d'une couche. */
export function colorExpression(style) {
  const s = style || {};
  if (s.mode === 'category' && s.category_field && s.cat_colors && Object.keys(s.cat_colors).length) {
    const expr = ['match', ['to-string', ['get', s.category_field]]];
    for (const [value, color] of Object.entries(s.cat_colors)) expr.push(value, color);
    expr.push(s.color || '#94a3b8');
    return expr;
  }
  return s.color || '#2563EB';
}

function _radiusExpression(base) {
  const r = Math.max(2, Math.min(9, Number(base) || 4));
  return ['interpolate', ['linear'], ['zoom'], 10, r - 1, 14, r + 1, 17, r + 4];
}

/** Crée ou met à jour le rendu carte d'une couche depuis sa config + ses données. */
export function syncLayerRender(layer) {
  const map = dg.map;
  const rt = dg.runtime.get(layer.id);
  if (!map || !dg.mapReady || !rt || rt.status !== 'ready') return;

  const srcId = _srcId(layer.id);
  const [fillId, lineId, ptId] = _layerIds(layer.id);
  const fc = { type: 'FeatureCollection', features: rt.features };
  const color = colorExpression(layer.style);
  const radius = _radiusExpression(layer.style?.radius);

  if (!map.getSource(srcId)) {
    map.addSource(srcId, { type: 'geojson', data: fc });
    // Insérées sous le polygone de sélection pour garder halos et zone au-dessus.
    const beforeId = map.getLayer('dg-zone-fill') ? 'dg-zone-fill' : undefined;
    map.addLayer({ id: fillId, type: 'fill', source: srcId, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': color, 'fill-opacity': 0.14 } }, beforeId);
    map.addLayer({ id: lineId, type: 'line', source: srcId, filter: ['any', ['==', ['geometry-type'], 'LineString'], ['==', ['geometry-type'], 'Polygon']], paint: { 'line-color': color, 'line-width': 2.5, 'line-opacity': 0.85 } }, beforeId);
    map.addLayer({ id: ptId, type: 'circle', source: srcId, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': color, 'circle-radius': radius, 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(255,255,255,.85)', 'circle-opacity': 0.88 } }, beforeId);
    _wirePopup(layer.id, ptId);
    _wirePopup(layer.id, fillId);
    _wirePopup(layer.id, lineId);
  } else {
    map.getSource(srcId).setData(fc);
    map.setPaintProperty(fillId, 'fill-color', color);
    map.setPaintProperty(lineId, 'line-color', color);
    map.setPaintProperty(ptId, 'circle-color', color);
    map.setPaintProperty(ptId, 'circle-radius', radius);
  }
  setLayerVisibility(layer.id, rt.visible);
}

/** Affiche ou masque une couche rendue. */
export function setLayerVisibility(id, visible) {
  const map = dg.map;
  if (!map || !dg.mapReady) return;
  for (const layerId of _layerIds(id)) {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }
}

/** Retire entièrement une couche de la carte. */
export function removeLayerRender(id) {
  const map = dg.map;
  if (!map || !dg.mapReady) return;
  closePopup();
  for (const layerId of _layerIds(id)) {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource(_srcId(id))) map.removeSource(_srcId(id));
}

/* ── Popups ─────────────────────────────────────────────────────── */

let _popup = null;

/** Ferme la popup ouverte (suppression de couche, destroy…). */
export function closePopup() {
  _popup?.remove();
}

function _popupHtml(layer, props) {
  const popup = layer.popup || {};
  const title = popup.title_field && props[popup.title_field] != null && props[popup.title_field] !== ''
    ? String(props[popup.title_field])
    : layer.label;
  const rows = (popup.fields || [])
    .filter((f) => f !== popup.title_field)
    .map((f) => {
      const v = props[f];
      if (v === null || v === undefined || v === '') return '';
      return `<div class="dg-pop__row"><b>${esc(f)}</b> : ${esc(String(v).slice(0, 300))}</div>`;
    })
    .join('');
  const color = safeColor(layer.style?.color);
  return `<div class="dg-pop">
    <div class="dg-pop__title"><span class="dg-pop__dot" style="background:${escAttr(color)}"></span>${esc(String(title).slice(0, 120))}</div>
    ${rows}
  </div>`;
}

function _wirePopup(layerConfigId, mapLayerId) {
  // Les handlers survivent au removeLayer : ne jamais câbler deux fois le même id.
  if (dg.wiredPopups.has(mapLayerId)) return;
  dg.wiredPopups.add(mapLayerId);
  const map = dg.map;
  map.on('click', mapLayerId, (e) => {
    if (dg.lasso.armed) return;
    const feature = e.features && e.features[0];
    const layer = dg.layers.find((l) => l.id === layerConfigId);
    if (!feature || !layer) return;
    if (!_popup) _popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px', className: 'dg-popup' });
    _popup.setLngLat(e.lngLat).setHTML(_popupHtml(layer, feature.properties || {})).addTo(map);
  });
  map.on('mouseenter', mapLayerId, () => {
    if (!dg.lasso.armed) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', mapLayerId, () => {
    if (!dg.lasso.armed) map.getCanvas().style.cursor = '';
  });
}

/* ── Heatmap ────────────────────────────────────────────────────── */

export function updateHeatmap(enabled) {
  const map = dg.map;
  if (!map || !dg.mapReady) return;
  if (enabled) {
    const features = [];
    for (const layer of dg.layers) {
      const rt = dg.runtime.get(layer.id);
      if (!rt || rt.status !== 'ready' || !rt.visible) continue;
      for (const f of rt.features) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: f.__pt }, properties: {} });
      }
    }
    map.getSource('dg-heat-src')?.setData({ type: 'FeatureCollection', features });
  }
  if (map.getLayer('dg-heat')) map.setLayoutProperty('dg-heat', 'visibility', enabled ? 'visible' : 'none');
}

/* ── Sélection / survol ─────────────────────────────────────────── */

function _toPointFC(features) {
  return {
    type: 'FeatureCollection',
    features: (features || []).map((f) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: f.__pt }, properties: {} })),
  };
}

/** Affiche la sélection courante (points + polygone de zone). */
export function renderSelection(selection) {
  const map = dg.map;
  if (!map || !dg.mapReady) return;
  map.getSource('dg-sel-src')?.setData(_toPointFC(selection?.features));
  const poly = selection?.polygon;
  map.getSource('dg-zone-src')?.setData(poly
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: poly, properties: {} }] }
    : EMPTY_FC());
}

/** Met en surbrillance des features (survol d'un constat / d'une référence). */
export function setHover(features) {
  dg.map?.getSource('dg-hov-src')?.setData(_toPointFC(features));
}

/** Recentre la carte sur des features préparées. */
export function fitFeatures(features, { maxZoom = 15, padding = 60 } = {}) {
  const map = dg.map;
  if (!map || !features?.length) return;
  if (features.length === 1) {
    map.easeTo({ center: features[0].__pt, zoom: Math.max(map.getZoom(), 15), duration: 450 });
    return;
  }
  const bounds = new maplibregl.LngLatBounds(features[0].__pt, features[0].__pt);
  for (const f of features) bounds.extend(f.__pt);
  map.fitBounds(bounds, { padding, maxZoom, duration: 500 });
}

/* ── Lasso ──────────────────────────────────────────────────────── */

/**
 * Câble la sélection lasso : bouton d'armement + canvas de dessin.
 * `onSelect(screenPoints)` reçoit le polygone écran une fois le tracé terminé.
 */
export function wireLasso(mapWrap, onSelect) {
  const map = dg.map;
  const canvas = document.createElement('canvas');
  canvas.className = 'dg-lasso-canvas';
  mapWrap.appendChild(canvas);

  const resize = () => {
    canvas.width = mapWrap.clientWidth;
    canvas.height = mapWrap.clientHeight;
  };
  resize();
  map.on('resize', resize);
  window.addEventListener('resize', resize);
  onCleanup(() => window.removeEventListener('resize', resize));

  const ctx = () => canvas.getContext('2d');
  const clear = () => ctx()?.clearRect(0, 0, canvas.width, canvas.height);
  const draw = () => {
    const c = ctx();
    if (!c) return;
    clear();
    const pts = dg.lasso.points;
    if (pts.length < 2) return;
    c.strokeStyle = '#0ea55a';
    c.fillStyle = 'rgba(20,174,92,.12)';
    c.lineWidth = 2;
    c.setLineDash([6, 4]);
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath();
    c.fill();
    c.stroke();
  };

  const setArmed = (armed) => {
    dg.lasso.armed = armed;
    map.getCanvas().style.cursor = armed ? 'crosshair' : '';
    if (armed) map.dragPan.disable(); else map.dragPan.enable();
    mapWrap.querySelector('#dg-lasso-btn')?.classList.toggle('is-active', armed);
    const hint = mapWrap.querySelector('#dg-lasso-hint');
    if (hint) hint.hidden = !armed;
    if (!armed) { dg.lasso.drawing = false; dg.lasso.points = []; clear(); }
  };

  // Pointer Events : souris ET tactile (le bouton arme le lasso, Maj+glisser
  // reste un raccourci souris).
  const mapCanvas = map.getCanvas();
  mapCanvas.addEventListener('pointerdown', (e) => {
    if (!dg.lasso.armed && !e.shiftKey) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dg.lasso.armed) setArmed(true); // Maj + glisser = armement direct
    dg.lasso.drawing = true;
    dg.lasso.points = [[e.offsetX, e.offsetY]];
    try { mapCanvas.setPointerCapture(e.pointerId); } catch { /* capture non supportée */ }
    draw();
  });
  mapCanvas.addEventListener('pointermove', (e) => {
    if (!dg.lasso.drawing) return;
    e.preventDefault();
    // Décimation : inutile d'accumuler des sommets à moins de 3 px.
    const pts = dg.lasso.points;
    const last = pts[pts.length - 1];
    if (Math.abs(e.offsetX - last[0]) + Math.abs(e.offsetY - last[1]) < 3) return;
    pts.push([e.offsetX, e.offsetY]);
    draw();
  });
  const onUp = () => {
    if (!dg.lasso.drawing) return;
    dg.lasso.drawing = false;
    const pts = dg.lasso.points.slice();
    setArmed(false);
    if (pts.length >= 3) onSelect(pts);
  };
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  onCleanup(() => {
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  });

  const onKey = (e) => {
    if (e.key === 'Escape' && dg.lasso.armed) setArmed(false);
  };
  window.addEventListener('keydown', onKey);
  onCleanup(() => window.removeEventListener('keydown', onKey));

  mapWrap.querySelector('#dg-lasso-btn')?.addEventListener('click', () => setArmed(!dg.lasso.armed));
}

/**
 * Sélectionne les features des couches VISIBLES contenues dans un anneau
 * géographique : un point est retenu si son ancrage y tombe, une ligne ou un
 * polygone si l'un de ses sommets y tombe. Le test est géographique (et non
 * écran), donc rejouable après un déplacement de carte ou un changement de
 * couches. Pré-filtre par emprise pour rester fluide sur de gros jeux.
 */
export function selectInRing(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const inRing = (lngLat) => pointInPolygon(lngLat, ring);

  const selected = [];
  for (const layer of dg.layers) {
    const rt = dg.runtime.get(layer.id);
    if (!rt || rt.status !== 'ready' || !rt.visible) continue;
    for (const f of rt.features) {
      const [bMinX, bMinY, bMaxX, bMaxY] = f.__bbox;
      if (bMaxX < minX || bMinX > maxX || bMaxY < minY || bMinY > maxY) continue;
      const hit = f.geometry.type === 'Point'
        ? inRing(f.__pt)
        : (inRing(f.__pt) || someVertex(f.geometry, (lng, lat) => inRing([lng, lat])));
      if (hit) selected.push({ ...f, __layerId: layer.id });
    }
  }
  return selected;
}

/** Convertit le tracé écran du lasso en anneau géographique puis sélectionne. */
export function resolveSelection(screenPoints) {
  const map = dg.map;
  const ring = screenPoints.map(([x, y]) => {
    const ll = map.unproject([x, y]);
    return [ll.lng, ll.lat];
  });
  ring.push(ring[0]);
  return { features: selectInRing(ring), polygon: { type: 'Polygon', coordinates: [ring] } };
}

/* ── Capture pour le rapport ────────────────────────────────────── */

/** Capture la carte cadrée sur la sélection (data URL PNG, ou null). */
export async function captureZoneImage(features) {
  const map = dg.map;
  if (!map || !features?.length) return null;
  const prev = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  try {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      map.once('idle', finish);
      try {
        const bounds = new maplibregl.LngLatBounds(features[0].__pt, features[0].__pt);
        for (const f of features) bounds.extend(f.__pt);
        map.fitBounds(bounds, { padding: 60, animate: false, maxZoom: 16, duration: 0 });
      } catch { finish(); }
      setTimeout(finish, 3000);
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { return map.getCanvas().toDataURL('image/png'); } catch { return null; }
  } finally {
    try { map.jumpTo(prev); } catch { /* carte détruite entre-temps */ }
  }
}
