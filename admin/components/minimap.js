/**
 * Mini-carte MapLibre 3D pour les panneaux de détail admin.
 *
 * Reprend fidèlement le rendu de la carte publique :
 * - basemap configurée de la ville (basemaps_v2 + city_branding.default_basemap),
 *   sinon celle adaptée au thème (mêmes heuristiques que ThemeManager.findBasemapForTheme) ;
 * - bâtiments 3D via les tuiles vectorielles OpenFreeMap (même source et même
 *   rendu que le mode 3D de la carte publique et du Diagnostic terrain) ;
 * - tracé stylé par la config `category_styles` de la catégorie (couleur, épaisseur,
 *   opacité, pointillés, remplissage).
 */

const BUILDINGS_SOURCE_URL = 'https://tiles.openfreemap.org/planet';
const BUILDINGS_LAYER_ID = 'mm-buildings-3d';

// Rampes de couleur par hauteur - claire (identique au Diagnostic) et ardoise pour le dark
const BUILDINGS_COLOR_LIGHT = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10],
  0, '#e8e4e0', 20, '#d5d0cc', 60, '#bfc5cc', 150, '#a0b0c0', 300, '#8fa8bd'];
const BUILDINGS_COLOR_DARK = ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 10],
  0, '#252f45', 20, '#2b3752', 60, '#334160', 150, '#3d4c70', 300, '#475782'];

const OSM_FALLBACK = {
  name: 'osm-fallback',
  kind: 'raster',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
};

function _styleForBasemap(bm) {
  if (bm.kind === 'vector' && bm.style_url) return bm.style_url;
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: [bm.url], tileSize: 256, maxzoom: 19, attribution: bm.attribution || '' },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  };
}

/**
 * Choisit le fond de carte : basemap configurée de la ville en priorité (elle prime
 * sur le thème, comme sur la carte publique), sinon heuristiques de thème.
 */
export function pickBasemap(basemaps, { preferred, theme = 'light' } = {}) {
  const list = Array.isArray(basemaps) ? basemaps : [];
  const lc = (s) => String(s || '').toLowerCase();

  if (preferred) {
    const bm = list.find((b) => lc(b.name) === lc(preferred) || lc(b.label) === lc(preferred));
    if (bm) return bm;
  }
  let bm = list.find((b) => lc(b.theme) === theme);
  if (bm) return bm;
  const darkKeys = ['dark', 'noir', 'sombre', 'night', 'nuit'];
  const lightKeys = ['light', 'clair', 'day', 'jour', 'positron', 'osm', 'streets', 'standard'];
  const keys = theme === 'dark' ? darkKeys : lightKeys;
  bm = list.find((b) => keys.some((k) => lc(b.label).includes(k) || lc(b.name).includes(k)));
  if (bm) return bm;
  return list.find((b) => b.is_default) || list[0] || OSM_FALLBACK;
}

/** Parse `category_styles` (jsonb ou chaîne) - mêmes clés que l'éditeur de catégories. */
export function parseCategoryStyles(category) {
  const raw = category?.category_styles;
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.debug('[minimap] parse category_styles', e);
    return {};
  }
}

function _addBuildings(map, theme) {
  if (map.getLayer(BUILDINGS_LAYER_ID)) return;
  if (!map.getSource('mm-buildings-src')) {
    map.addSource('mm-buildings-src', { type: 'vector', url: BUILDINGS_SOURCE_URL });
  }
  map.addLayer({
    id: BUILDINGS_LAYER_ID,
    type: 'fill-extrusion',
    source: 'mm-buildings-src',
    'source-layer': 'building',
    minzoom: 14.5,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': theme === 'dark' ? BUILDINGS_COLOR_DARK : BUILDINGS_COLOR_LIGHT,
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.92,
    },
  });
}

/** Couches du tracé (remplissage polygone, ligne, points). */
function _addTrackLayers(map, geojson, styles, fallbackColor) {
  const s = styles || {};
  const color = s.color || fallbackColor;
  const weight = Number(s.weight) || 3;
  const opacity = s.opacity !== undefined ? Number(s.opacity) : 0.9;

  if (!map.getSource('mm-track')) {
    map.addSource('mm-track', { type: 'geojson', data: geojson });
  }

  map.addLayer({
    id: 'mm-track-fill',
    type: 'fill',
    source: 'mm-track',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': (s.fill && s.fillColor) || color,
      'fill-opacity': s.fill ? (Number(s.fillOpacity) || 0.3) : 0.15,
    },
  });

  const linePaint = {
    'line-color': color,
    'line-width': weight,
    'line-opacity': opacity,
  };
  if (s.dashArray) {
    const da = String(s.dashArray).split(/[, ]+/).map(Number).filter((n) => !isNaN(n));
    if (da.length) linePaint['line-dasharray'] = da;
  }
  map.addLayer({
    id: 'mm-track-line',
    type: 'line',
    source: 'mm-track',
    filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'LineString']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: linePaint,
  });

  map.addLayer({
    id: 'mm-track-circle',
    type: 'circle',
    source: 'mm-track',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': color,
      'circle-radius': 8,
      'circle-opacity': opacity,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });
}

function _collectCoords(g, out) {
  if (!g) return;
  switch (g.type) {
    case 'Point': out.push(g.coordinates); break;
    case 'MultiPoint':
    case 'LineString': out.push(...g.coordinates); break;
    case 'MultiLineString':
    case 'Polygon': g.coordinates.forEach((r) => out.push(...r)); break;
    case 'MultiPolygon': g.coordinates.forEach((p) => p.forEach((r) => out.push(...r))); break;
    case 'GeometryCollection': (g.geometries || []).forEach((gg) => _collectCoords(gg, out)); break;
    case 'FeatureCollection': (g.features || []).forEach((f) => _collectCoords(f.geometry, out)); break;
    case 'Feature': _collectCoords(g.geometry, out); break;
  }
}

function geojsonBounds(geojson) {
  const coords = [];
  _collectCoords(geojson, coords);
  if (!coords.length) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/**
 * Crée la mini-carte 3D. Résout quand le fond est chargé.
 * `cooperativeGestures` : le zoom exige Ctrl/Cmd - la molette continue de faire
 * défiler le panneau qui héberge la carte.
 */
export async function createMiniMap({ container, center, zoom = 12, basemap, geojson, trackStyles, fallbackColor = '#14AE5C', theme = 'light', pitch = 52, bearing = -17 }) {
  const state = { theme, basemap: basemap || OSM_FALLBACK };

  const map = new maplibregl.Map({
    container,
    style: _styleForBasemap(state.basemap),
    center,
    zoom,
    pitch,
    bearing,
    attributionControl: false,
    cooperativeGestures: true,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  // Re-déclenché après chaque setStyle : les overlays survivent aux changements de fond
  const addOverlays = () => {
    try {
      _addBuildings(map, state.theme);
      if (geojson) _addTrackLayers(map, geojson, trackStyles, fallbackColor);
    } catch (e) { console.debug('[minimap] overlays', e); }
  };
  map.on('style.load', addOverlays);

  await new Promise((resolve) => {
    if (map.loaded()) { resolve(); return; }
    const timer = setTimeout(resolve, 12000);
    map.once('load', () => { clearTimeout(timer); resolve(); });
  });

  return {
    map,
    fitTo(geo, opts = {}) {
      const bounds = geojsonBounds(geo);
      if (!bounds) return;
      map.fitBounds(bounds, { padding: 48, maxZoom: 16.5, duration: 700, bearing, ...opts });
    },
    setTheme(newTheme, newBasemap) {
      state.theme = newTheme;
      if (newBasemap && newBasemap !== state.basemap) {
        state.basemap = newBasemap;
        map.setStyle(_styleForBasemap(newBasemap)); // addOverlays rejoue sur style.load
      } else if (map.getLayer(BUILDINGS_LAYER_ID)) {
        map.setPaintProperty(BUILDINGS_LAYER_ID, 'fill-extrusion-color',
          newTheme === 'dark' ? BUILDINGS_COLOR_DARK : BUILDINGS_COLOR_LIGHT);
      }
    },
    destroy() {
      try { map.remove(); } catch (e) { console.debug('[minimap] destroy', e); }
    },
  };
}
