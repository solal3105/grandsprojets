/**
 * Diagnostic terrain — carte MapLibre.
 * Fond OSM classique, bâtiments 3D (tuiles vectorielles OpenFreeMap), centre
 * depuis city_branding, rendu des couches piloté par leur config (style jsonb),
 * sélection lasso dessinée sur un canvas overlay.
 */

import { esc, escAttr } from '../../components/ui.js';
import { dg, onCleanup, safeColor } from './state.js';
import { pointInPolygon, someVertex } from './data.js';

const EMPTY_FC = () => ({ type: 'FeatureCollection', features: [] });

// Fond OSM classique — même choix que les cartes des sections Contributions
// et Travaux : un rendu familier, lisible, sans dépendance de configuration.
const OSM_STYLE = {
  version: 8,
  sources: {
    'osm-raster': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-raster-layer', type: 'raster', source: 'osm-raster' }],
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
};

/* ── Bâtiments 3D ───────────────────────────────────────────────── */

// Tuiles vectorielles OpenFreeMap (schéma OpenMapTiles, données OSM) : source
// indépendante du fond, donc compatible avec un fond raster. Même source et
// même rendu que le mode 3D de la carte publique.
const BUILDINGS_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
const BUILDINGS_LAYER_ID = 'dg-buildings-3d';
const BUILDINGS_COLOR = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10],
  0, '#e8e4e0', 20, '#d5d0cc', 60, '#bfc5cc', 150, '#a0b0c0', 300, '#8fa8bd'];

/**
 * Ajoute ou retire l'extrusion des bâtiments. Visible à partir du zoom 15,
 * c'est-à-dire à l'échelle où l'on analyse un carrefour ou un tronçon.
 * @param {boolean} enabled
 * @param {string} [beforeId] - couche sous laquelle insérer (garde les données au-dessus)
 */
export function setBuildings3D(enabled, beforeId) {
  const map = dg.map;
  if (!map || !dg.mapReady) return;
  if (!enabled) {
    if (map.getLayer(BUILDINGS_LAYER_ID)) map.removeLayer(BUILDINGS_LAYER_ID);
    return;
  }
  if (map.getLayer(BUILDINGS_LAYER_ID)) return;
  if (!map.getSource('dg-buildings-src')) {
    map.addSource('dg-buildings-src', { type: 'vector', url: BUILDINGS_SOURCE_URL });
  }
  map.addLayer({
    id: BUILDINGS_LAYER_ID,
    type: 'fill-extrusion',
    source: 'dg-buildings-src',
    'source-layer': 'building',
    minzoom: 15,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': BUILDINGS_COLOR,
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.92,
    },
  }, beforeId && map.getLayer(beforeId) ? beforeId : undefined);
}

/** Attend l'événement load de la carte, avec délai maximal. */
function _waitForLoad(map, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (map.loaded()) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error('Fond de carte indisponible (délai dépassé)')), timeoutMs);
    map.once('load', () => { clearTimeout(timer); resolve(); });
  });
}

/** Crée la carte et ses sources utilitaires. Résout quand la carte est prête. */
export async function createMap(el) {
  const b = dg.branding || {};
  const center = [parseFloat(b.center_lng) || 4.835, parseFloat(b.center_lat) || 45.764];
  const zoom = parseFloat(b.zoom) || 12;

  const map = new maplibregl.Map({
    container: el,
    style: OSM_STYLE,
    center,
    zoom,
    attributionControl: false,
  });
  // Boussole inclinable : l'affordance pour basculer en vue 3D.
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  dg.map = map;

  await _waitForLoad(map, 12000);
  dg.mapReady = true;
  // Bâtiments d'abord : ils restent sous la heatmap, la zone et les données.
  setBuildings3D(dg.buildings3D);
  _installUtilitySources(map);
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

/* ── Cadrage ────────────────────────────────────────────────────── */

// Emprise minimale, en degrés, appliquée à une sélection dégénérée (un seul
// point, ou N points de coordonnées identiques — plusieurs signalements à la
// même adresse). Sans elle, MapLibre calcule une échelle infinie et retombe
// exactement sur maxZoom, ce qui produit un saut de zoom brutal.
const MIN_SPAN_DEG = 0.0009; // ≈ 100 m

/**
 * Emprise de la zone : l'anneau TRACÉ réuni aux features retenues. On cadre
 * sur ce que l'utilisateur a dessiné, pas seulement sur ce qu'il a attrapé —
 * c'est ce qui donne la marge de contexte autour de la sélection. Les
 * géométries non ponctuelles sont prises sur leur emprise réelle, jamais
 * réduites à leur centre.
 */
export function zoneBounds(ring, features) {
  const bounds = new maplibregl.LngLatBounds();
  for (const c of ring || []) bounds.extend(c);
  for (const f of features || []) {
    if (f.__bbox) {
      bounds.extend([f.__bbox[0], f.__bbox[1]]);
      bounds.extend([f.__bbox[2], f.__bbox[3]]);
    } else if (f.__pt) {
      bounds.extend(f.__pt);
    }
  }
  if (bounds.isEmpty()) return null;
  // Élargir une emprise dégénérée avant tout calcul de caméra.
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const dx = Math.max(0, (MIN_SPAN_DEG - (ne.lng - sw.lng)) / 2);
  const dy = Math.max(0, (MIN_SPAN_DEG - (ne.lat - sw.lat)) / 2);
  if (dx || dy) {
    bounds.extend([sw.lng - dx, sw.lat - dy]);
    bounds.extend([ne.lng + dx, ne.lat + dy]);
  }
  return bounds;
}

/**
 * Marges de cadrage en pixels. Le dock est superposé à la carte : en desktop
 * il occupe une bande à gauche, sous 768px un bandeau en haut. On mesure sa
 * géométrie réelle plutôt que de coder ses dimensions en dur, et on borne le
 * total : dès que la somme des marges dépasse une dimension du canvas,
 * MapLibre abandonne le recadrage sans rien dire (warnOnce + no-op).
 */
function _framePadding(map, base = 48) {
  const cv = map.getCanvas();
  const w = cv.clientWidth || 1;
  const h = cv.clientHeight || 1;
  const pad = { top: base, right: base, bottom: base, left: base };

  const wrap = dg.container?.querySelector('#dg-mapwrap');
  const dock = wrap?.querySelector('.dg-dock');
  if (dock && wrap) {
    const r = dock.getBoundingClientRect();
    const m = wrap.getBoundingClientRect();
    // Le dock se colle à un bord : on dégage celui qu'il occupe le plus.
    const coversWidth = r.width / m.width;
    if (coversWidth > 0.6) pad.top = Math.max(pad.top, r.bottom - m.top + 16);
    else pad.left = Math.max(pad.left, r.right - m.left + 16);
  }

  // Bornage : chaque axe garde au moins 40 % de place utile.
  const capX = w * 0.3;
  const capY = h * 0.3;
  pad.left = Math.min(pad.left, capX);
  pad.right = Math.min(pad.right, capX);
  pad.top = Math.min(pad.top, capY);
  pad.bottom = Math.min(pad.bottom, capY);
  return pad;
}

/**
 * Cadre la carte sur une emprise sans jamais dézoomer : le lasso est tracé à
 * l'écran, la zone tient donc déjà dans la vue — reculer n'apporte rien et
 * fait perdre le détail que l'utilisateur était allé chercher.
 */
export function fitBoundsSafely(bounds, { maxZoom = 17.5, duration = 550, base = 48, allowZoomOut = false } = {}) {
  const map = dg.map;
  if (!map || !bounds || bounds.isEmpty?.()) return;
  const padding = _framePadding(map, base);
  // cameraForBounds force bearing 0 si on ne le lui passe pas : la carte
  // reviendrait au nord à chaque sélection alors que l'utilisateur l'a tournée.
  const cam = map.cameraForBounds(bounds, { padding, maxZoom, bearing: map.getBearing() });
  if (!cam) return; // emprise incadrable dans ce canvas
  map.easeTo({
    center: cam.center,
    zoom: allowZoomOut ? cam.zoom : Math.max(cam.zoom, map.getZoom()),
    bearing: map.getBearing(),
    duration,
  });
}

/**
 * Cadre la carte sur l'ensemble des données chargées. Contrairement au cadrage
 * d'une sélection, celui-ci a le droit de reculer : au premier rendu, les
 * données peuvent déborder de la vue initiale de la ville.
 */
export function fitFeatures(features, { maxZoom = 15, base = 48 } = {}) {
  if (!features?.length) return;
  fitBoundsSafely(zoneBounds(null, features), { maxZoom, base, allowZoomOut: true });
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

