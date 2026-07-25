/* ============================================================================
   MAP-FX - moteur WebGL du kiosque /demo/ (window.MapFX)

   La carte est le spectacle : France en respiration lente (mode attract),
   plongée cinématique sur la commune, sonar de recensement et arcs de
   collecte convergents pendant l'analyse, orbite pendant la réflexion IA,
   zoom cinématique sur chaque projet localisé (file d'attente), emprises
   réelles embrasées, photos posées sur la carte, final en vue d'ensemble.

   Relief 3D : terrain Terrarium + ombrage + bâtiments extrudés.
   Sans WebGL, init() rend false : l'écran retombe sur le fond statique.
   ============================================================================ */
(() => {
  'use strict';

  const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const FRANCE_A = { center: [2.6, 46.4], zoom: 5.15, pitch: 22, bearing: 0 };
  const FRANCE_B = { center: [3.4, 45.4], zoom: 5.75, pitch: 40, bearing: -7 };

  // Villes françaises : points lumineux du mode attract (précision ~1 km)
  const CITY_DOTS = [
    [2.35, 48.86], [5.37, 43.30], [4.84, 45.76], [1.44, 43.60], [7.27, 43.70],
    [-1.55, 47.22], [3.88, 43.61], [7.75, 48.58], [-0.58, 44.84], [3.06, 50.63],
    [-1.68, 48.11], [4.03, 49.26], [5.93, 43.12], [5.72, 45.19], [5.04, 47.32],
    [-0.55, 47.47], [4.36, 43.84], [3.08, 45.78], [0.20, 48.00], [-4.49, 48.39],
    [0.69, 47.39], [2.30, 49.89], [1.26, 45.83], [2.90, 42.70], [6.18, 49.12],
    [6.02, 47.24], [1.90, 47.90], [1.10, 49.44], [-0.37, 49.18], [6.18, 48.69],
    [4.81, 43.95], [0.34, 46.58], [-1.15, 46.16], [-0.37, 43.30], [-1.47, 43.49],
    [8.74, 41.92], [9.45, 42.70], [6.13, 45.90], [5.92, 45.56], [4.89, 44.93],
    [4.39, 45.44], [7.34, 47.75], [7.36, 48.08], [4.08, 48.30], [3.57, 47.80],
    [2.40, 47.08], [1.69, 46.81], [-0.46, 46.32], [0.16, 45.65], [0.72, 45.19],
    [0.62, 44.20], [0.07, 43.23], [2.35, 43.21], [2.15, 43.93], [2.57, 44.35],
    [2.44, 44.92], [3.88, 45.04], [6.08, 44.56], [5.23, 46.21], [4.83, 46.31],
    [6.15, 47.62], [6.45, 48.17], [4.72, 49.77], [3.62, 49.56], [2.08, 49.43],
    [1.15, 49.02], [0.09, 48.43], [-1.09, 49.12], [-4.10, 48.99], [-2.76, 47.66],
    [-0.77, 48.07], [1.33, 47.59], [1.48, 48.45], [2.66, 48.54], [1.61, 42.96],
    [1.44, 44.45], [-0.50, 43.89], [1.87, 46.17], [3.33, 46.57], [3.16, 46.99],
  ];

  let map = null;
  let ok = false;
  const DEFAULT_ACCENT = '#ff4d6a';
  let accent = DEFAULT_ACCENT;
  let rafId = null;
  let mode = 'off'; // off | attract | focus | orbit | spotlight
  let attractTimer = null;
  let attractFlip = false;
  let markers = [];
  let photoMarkers = [];
  let scanMarker = null;
  let shapeCount = 0;
  let arcCount = 0;
  let projectCoords = [];
  let communeCenter = null;
  let spotQueue = [];
  let spotBusy = false;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function supportsWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  /* ─── Boucle d'animation : pulsations, orbite ─── */

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (!map || document.hidden) return;

    if (map.getLayer('fx-dots')) {
      const k = (Math.sin(ts / 600) + 1) / 2;
      map.setPaintProperty('fx-dots', 'circle-radius', 2.4 + k * 2.2);
      map.setPaintProperty('fx-dots', 'circle-opacity', 0.5 + k * 0.5);
    }
    if (map.getLayer('fx-contour-glow')) {
      const k = (Math.sin(ts / 900) + 1) / 2;
      map.setPaintProperty('fx-contour-glow', 'line-opacity', 0.18 + k * 0.22);
    }

    if (prefersReduced || map.isMoving()) return;
    if (mode === 'orbit') map.setBearing(map.getBearing() + 0.06);
  }

  /* ─── Mode attract : la France respire, sans jamais quitter le pays ─── */

  function attractCycle() {
    if (mode !== 'attract') return;
    attractFlip = !attractFlip;
    const view = attractFlip ? FRANCE_B : FRANCE_A;
    map.easeTo({ ...view, duration: prefersReduced ? 0 : 16000, easing: (t) => t * t * (3 - 2 * t), essential: true });
    attractTimer = setTimeout(attractCycle, 18000);
  }

  /* ─── API publique ─── */

  const MapFX = {
    ok: false,

    init() {
      if (!window.maplibregl || !supportsWebGL()) return false;
      try {
        map = new maplibregl.Map({
          container: 'map',
          style: STYLE_URL,
          ...FRANCE_A,
          interactive: false,
          attributionControl: { compact: true },
          fadeDuration: 200,
        });
        map.on('style.load', () => {
          try { map.setProjection({ type: 'globe' }); } catch { /* projection plane : très bien aussi */ }

          try {
            map.setSky({
              'sky-color': '#0a1730',
              'horizon-color': '#2a5aa0',
              'fog-color': '#0a1730',
              'sky-horizon-blend': 0.6,
              'horizon-fog-blend': 0.7,
              'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.4, 9, 0],
            });
          } catch { /* sky non supporté : sans gravité */ }

          // Recoloration « navy tech » : le dark-matter d'origine est presque
          // noir ; on éclaircit routes, bâtiments et eau, on tamise les labels
          for (const layer of map.getStyle().layers) {
            try {
              if (layer.type === 'background') {
                map.setPaintProperty(layer.id, 'background-color', '#0a1120');
              } else if (layer.type === 'fill') {
                if (/water/i.test(layer.id)) map.setPaintProperty(layer.id, 'fill-color', '#0d2b4d');
                else if (/building/i.test(layer.id)) map.setPaintProperty(layer.id, 'fill-color', '#20345c');
                else map.setPaintProperty(layer.id, 'fill-color', '#0f1a30');
              } else if (layer.type === 'line') {
                map.setPaintProperty(layer.id, 'line-color', /minor|service|tunnel|path|track/i.test(layer.id) ? '#26405f' : '#3d6291');
              } else if (layer.type === 'symbol') {
                map.setPaintProperty(layer.id, 'text-color', '#6c81a8');
                map.setPaintProperty(layer.id, 'text-halo-color', '#0a1120');
                map.setPaintProperty(layer.id, 'text-opacity', 0.75);
              }
            } catch { /* propriété absente sur cette couche */ }
          }

          // Relief 3D : terrain mondial (tuiles Terrarium AWS, libres) + ombrage
          try {
            map.addSource('fx-dem', {
              type: 'raster-dem',
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              encoding: 'terrarium',
              tileSize: 256,
              maxzoom: 14,
              attribution: 'Terrain: Mapzen/AWS',
            });
            map.setTerrain({ source: 'fx-dem', exaggeration: 1.12 });
            map.addLayer({
              id: 'fx-hillshade',
              type: 'hillshade',
              source: 'fx-dem',
              paint: {
                'hillshade-shadow-color': '#040910',
                'hillshade-highlight-color': '#3d5f96',
                'hillshade-accent-color': '#0d1a30',
                'hillshade-exaggeration': 0.55,
              },
            });
          } catch { /* relief indisponible : carte plate */ }

          // Bâtiments en 3D au niveau rue
          try {
            const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
            map.addLayer({
              id: 'fx-3d-buildings',
              type: 'fill-extrusion',
              source: 'carto',
              'source-layer': 'building',
              minzoom: 13,
              paint: {
                'fill-extrusion-color': '#28436f',
                'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
                'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                'fill-extrusion-opacity': 0.72,
              },
            }, firstSymbol);
          } catch { /* extrusions indisponibles : sans gravité */ }

          map.addSource('fx-dots', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: CITY_DOTS.map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })) },
          });
          map.addLayer({
            id: 'fx-dots-halo', type: 'circle', source: 'fx-dots',
            paint: { 'circle-radius': 9, 'circle-color': accent, 'circle-blur': 1, 'circle-opacity': 0.35 },
          });
          map.addLayer({
            id: 'fx-dots', type: 'circle', source: 'fx-dots',
            paint: { 'circle-radius': 3, 'circle-color': '#ffd9e0', 'circle-opacity': 0.9 },
          });
          document.body.classList.add('has-map');
        });
        rafId = requestAnimationFrame(loop);
        ok = true;
        MapFX.ok = true;
        return true;
      } catch {
        return false;
      }
    },

    setAccent(color) {
      if (!ok || !color) return;
      accent = color;
      try {
        if (map.getLayer('fx-dots-halo')) map.setPaintProperty('fx-dots-halo', 'circle-color', color);
        if (map.getLayer('fx-contour')) map.setPaintProperty('fx-contour', 'line-color', color);
        if (map.getLayer('fx-contour-glow')) map.setPaintProperty('fx-contour-glow', 'line-color', color);
      } catch { /* couche absente : sans gravité */ }
    },

    attractStart() {
      if (!ok) return;
      clearTimeout(attractTimer);
      mode = 'attract';
      attractTimer = setTimeout(attractCycle, 1200);
    },

    attractStop() {
      if (!ok) return;
      clearTimeout(attractTimer);
      if (mode === 'attract') mode = 'off';
    },

    // Plongée cinématique du ciel vers la commune
    focusCommune({ lat, lng, population }) {
      if (!ok) return;
      this.attractStop();
      mode = 'focus';
      communeCenter = { lat, lng };
      const zoom = population > 100000 ? 12.4 : population > 20000 ? 13.2 : population > 5000 ? 13.8 : 14.4;
      map.flyTo({
        center: [lng, lat], zoom, pitch: 47, bearing: -18,
        duration: prefersReduced ? 0 : 5200, curve: 1.6, essential: true,
      });
    },

    drawContour(contourGeojson) {
      if (!ok || !contourGeojson) return;
      const apply = () => {
        try {
          if (map.getSource('fx-contour')) return;
          map.addSource('fx-contour', { type: 'geojson', data: { type: 'Feature', geometry: contourGeojson, properties: {} } });
          map.addLayer({
            id: 'fx-contour-glow', type: 'line', source: 'fx-contour',
            paint: { 'line-color': accent, 'line-width': 12, 'line-blur': 10, 'line-opacity': 0.3 },
          });
          map.addLayer({
            id: 'fx-contour', type: 'line', source: 'fx-contour',
            paint: { 'line-color': accent, 'line-width': 1.6, 'line-opacity': 0.95 },
          });
        } catch { /* style pas encore prêt */ }
      };
      map.isStyleLoaded() ? apply() : map.once('idle', apply);
    },

    // Sonar de recensement : anneaux concentriques qui pulsent depuis la commune
    scanStart() {
      if (!ok || !communeCenter || scanMarker) return;
      const el = document.createElement('div');
      el.className = 'fx-sonar';
      el.innerHTML = '<span></span><span></span><span></span><i></i>';
      scanMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([communeCenter.lng, communeCenter.lat])
        .addTo(map);
    },

    scanStop() {
      if (scanMarker) { scanMarker.remove(); scanMarker = null; }
    },

    // Arc de collecte : une source trouvée converge vers la commune
    pulseSource() {
      if (!ok || !communeCenter || prefersReduced) return;
      const angle = Math.random() * 2 * Math.PI;
      const dist = 0.02 + Math.random() * 0.025; // ~2 à 5 km
      const from = [communeCenter.lng + dist * Math.cos(angle), communeCenter.lat + dist * 0.72 * Math.sin(angle)];
      const id = `fx-arc-${arcCount++}`;
      try {
        map.addSource(id, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [from, [communeCenter.lng, communeCenter.lat]] }, properties: {} },
        });
        map.addLayer({
          id, type: 'line', source: id,
          paint: {
            'line-color': accent, 'line-width': 2.4, 'line-blur': 2,
            'line-opacity': 0, 'line-opacity-transition': { duration: 350 },
          },
        });
        requestAnimationFrame(() => { try { map.setPaintProperty(id, 'line-opacity', 0.85); } catch { /* retirée */ } });
        setTimeout(() => { try { map.setPaintProperty(id, 'line-opacity', 0); } catch { /* retirée */ } }, 900);
        setTimeout(() => {
          try { if (map.getLayer(id)) map.removeLayer(id); } catch { /* déjà retirée */ }
          try { if (map.getSource(id)) map.removeSource(id); } catch { /* déjà retirée */ }
        }, 1500);
      } catch { /* style occupé : arc suivant */ }
    },

    orbitStart() { if (ok && mode !== 'orbit') mode = 'orbit'; },
    orbitStop() { if (ok && mode === 'orbit') mode = 'focus'; },

    // Un projet localisé : emprise embrasée, épingle étiquetée, et la caméra
    // vient le voir (file d'attente : un vol après l'autre)
    addProject({ lat, lng, geometry, precise, title }) {
      if (!ok) return;
      projectCoords.push([lng, lat]);

      if (geometry && geometry.type !== 'Point') {
        const id = `fx-shape-${shapeCount++}`;
        try {
          map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry, properties: {} } });
          if (/Polygon/.test(geometry.type)) {
            map.addLayer({
              id: `${id}-fill`, type: 'fill', source: id,
              paint: { 'fill-color': accent, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 900 } },
            });
            requestAnimationFrame(() => map.setPaintProperty(`${id}-fill`, 'fill-opacity', 0.28));
          }
          map.addLayer({
            id: `${id}-line`, type: 'line', source: id,
            paint: {
              'line-color': accent, 'line-width': /Line/.test(geometry.type) ? 5 : 2.5,
              'line-blur': 1.5, 'line-opacity': 0, 'line-opacity-transition': { duration: 900 },
            },
          });
          requestAnimationFrame(() => map.setPaintProperty(`${id}-line`, 'line-opacity', 0.95));
        } catch { /* la géométrie tombera en épingle */ }
      }

      const el = document.createElement('div');
      el.className = `fx-pin-wrap${precise ? '' : ' fx-pin-wrap--approx'}`;
      el.style.setProperty('--pin', accent);
      el.innerHTML = `<span class="fx-pin"></span>${title ? `<span class="fx-pin-label">${String(title).replace(/[<>&]/g, '')}</span>` : ''}`;
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
      setTimeout(() => el.classList.add('is-collapsed'), 9000);

      this.spotlight(lat, lng);
    },

    // Zoom cinématique sur un point, en file (jamais deux vols simultanés)
    spotlight(lat, lng) {
      if (!ok) return;
      spotQueue.push([lng, lat]);
      const next = () => {
        if (!spotQueue.length) { spotBusy = false; return; }
        spotBusy = true;
        const target = spotQueue.shift();
        mode = 'spotlight';
        map.easeTo({
          center: target, zoom: 15.3, pitch: 50,
          bearing: map.getBearing() + 14,
          duration: prefersReduced ? 0 : 1700,
          easing: (t) => 1 - Math.pow(1 - t, 3),
          essential: true,
        });
        map.once('moveend', () => setTimeout(next, 650));
      };
      if (!spotBusy) next();
    },

    // Photo trouvée : posée sur la carte à l'emplacement du projet
    attachPhoto(lat, lng, url) {
      if (!ok || !url) return;
      const el = document.createElement('div');
      el.className = 'fx-photo';
      el.innerHTML = `<img src="${String(url).replace(/"/g, '')}" alt="" onerror="this.parentNode.remove()">`;
      photoMarkers.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] }).setLngLat([lng, lat]).addTo(map));
      setTimeout(() => el.classList.add('is-small'), 6500);
    },

    // Recadrage final sur l'ensemble des projets
    finale() {
      if (!ok || !projectCoords.length) return;
      spotQueue = [];
      const b = projectCoords.reduce(
        (acc, c) => [[Math.min(acc[0][0], c[0]), Math.min(acc[0][1], c[1])], [Math.max(acc[1][0], c[0]), Math.max(acc[1][1], c[1])]],
        [[Infinity, Infinity], [-Infinity, -Infinity]]
      );
      mode = 'focus';
      map.fitBounds(b, {
        padding: { top: 120, bottom: 140, left: 110, right: 110 },
        pitch: 42, bearing: 0, maxZoom: 15.2,
        duration: prefersReduced ? 0 : 3200, essential: true,
      });
    },

    // Retour à l'accueil : on nettoie la scène
    reset() {
      if (!ok) return;
      this.scanStop();
      spotQueue = [];
      spotBusy = false;
      markers.forEach((m) => m.remove());
      photoMarkers.forEach((m) => m.remove());
      markers = [];
      photoMarkers = [];
      projectCoords = [];
      communeCenter = null;
      for (let i = 0; i < shapeCount; i++) {
        for (const suffix of ['-fill', '-line']) {
          try { if (map.getLayer(`fx-shape-${i}${suffix}`)) map.removeLayer(`fx-shape-${i}${suffix}`); } catch { /* absente */ }
        }
        try { if (map.getSource(`fx-shape-${i}`)) map.removeSource(`fx-shape-${i}`); } catch { /* absente */ }
      }
      shapeCount = 0;
      for (const id of ['fx-contour', 'fx-contour-glow']) {
        try { if (map.getLayer(id)) map.removeLayer(id); } catch { /* absente */ }
      }
      try { if (map.getSource('fx-contour')) map.removeSource('fx-contour'); } catch { /* absente */ }
      this.setAccent(DEFAULT_ACCENT);
      map.flyTo({ ...FRANCE_A, duration: 3000, essential: true });
      this.attractStart();
    },
  };

  window.MapFX = MapFX;
  window.addEventListener('pagehide', () => cancelAnimationFrame(rafId));
})();
