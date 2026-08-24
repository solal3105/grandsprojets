/* ============================================================================
   MAP-FX - moteur WebGL du kiosque /demo/ (window.MapFX)

   La carte est le spectacle : France en respiration lente (mode attract),
   plongée cinématique sur la commune, sonar de recensement et arcs de
   collecte convergents pendant l'analyse, orbite pendant la réflexion IA,
   recadrage continu en vue d'ensemble à mesure que les projets se localisent
   (jamais de plongée dans le relief), emprises réelles embrasées, photos
   posées sur la carte, final en vue d'ensemble.

   Deux fonds de carte, un par thème, tous deux VECTORIELS (données
   OpenStreetMap, même famille Carto) : Voyager repeint « papier lumineux »
   le jour, dark-matter repeint « navy tech » la nuit. Le raster OSM a été
   essayé pour le jour et abandonné : il se rééchantillonne en bouillie à la
   moindre rotation ou inclinaison, et ne peut recevoir aucune direction
   artistique. La scène (ciel, relief, bâtiments, points de villes) est
   reconstruite à chaque changement de style, et le contour, les emprises et
   les faisceaux déjà posés sont rejoués : la bascule marche même en pleine
   génération.

   Relief 3D : terrain Terrarium + ombrage + bâtiments extrudés.
   Sans WebGL, init() rend false : l'écran retombe sur le fond statique.
   ============================================================================ */
(() => {
  'use strict';

  /* Tout ce qui distingue les deux fonds tient dans cette table : le style,
     sa REPEINTURE en scène, le ciel, l'ombrage du relief, les bâtiments et le
     coeur des points de villes. Le reste de la scène est commun. Les deux
     styles Carto embarquent la même source vectorielle « carto » : les
     bâtiments 3D se lèvent au même zoom, jour et nuit. */
  const THEMES = {
    light: {
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      /* Direction artistique « papier lumineux » : Voyager est déjà en
         couleur, on tamise seulement le bavardage des étiquettes et on assoit
         l'eau, pour que les volumes et la couleur de la commune restent les
         vedettes. Le pendant exact de la repeinture navy de la nuit. */
      repaint(layer) {
        if (layer.type === 'fill' && /water/i.test(layer.id)) {
          map.setPaintProperty(layer.id, 'fill-color', '#a6c9dc');
        } else if (layer.type === 'symbol') {
          map.setPaintProperty(layer.id, 'text-halo-color', '#ffffff');
          map.setPaintProperty(layer.id, 'text-opacity', 0.92);
        }
      },
      sky: {
        'sky-color': '#9cc6f7',
        'horizon-color': '#e8f1fb',
        'fog-color': '#e8f1fb',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.7,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.4, 9, 0],
      },
      hillshade: {
        'hillshade-shadow-color': '#6f6757',
        'hillshade-highlight-color': '#ffffff',
        'hillshade-accent-color': '#d8cfc0',
        'hillshade-exaggeration': 0.5,
      },
      buildings: {
        source: 'carto',
        minzoom: 13,
        color: '#cbc0af',
        opacity: 0.8,
      },
      dotCore: '#b32945',
    },
    dark: {
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      // Repeinture « navy tech » : le dark-matter d'origine est presque
      // noir ; on éclaircit routes, bâtiments et eau, on tamise les labels
      repaint(layer) {
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
      },
      sky: {
        'sky-color': '#0a1730',
        'horizon-color': '#2a5aa0',
        'fog-color': '#0a1730',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.7,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.4, 9, 0],
      },
      hillshade: {
        'hillshade-shadow-color': '#040910',
        'hillshade-highlight-color': '#3d5f96',
        'hillshade-accent-color': '#0d1a30',
        'hillshade-exaggeration': 0.55,
      },
      buildings: {
        source: 'carto',
        minzoom: 13,
        color: '#28436f',
        opacity: 0.72,
      },
      dotCore: '#ffd9e0',
    },
  };

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
  // Le thème est décidé par theme.js AVANT le chargement de ce script :
  // l'attribut posé sur <html> est la seule source de vérité au démarrage.
  let theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  let rafId = null;
  let mode = 'off'; // off | attract | focus | orbit
  let attractTimer = null;
  let attractFlip = false;
  let markers = [];
  let photoMarkers = [];
  let scanMarker = null;
  let projectCoords = [];
  let communeCenter = null;
  // Point d'ou partent le radar et les arcs : la mairie des qu'on la connait,
  // le centre de la commune en attendant.
  let sourceOrigin = null;
  let reframePending = false;
  let recentrePending = false;

  /* Registre de la génération en cours, pour REJOUER la scène sur un style
     neuf : un setStyle repart d'une feuille blanche, seuls les marqueurs DOM
     (épingles, photos, sonar) survivent d'eux-mêmes. */
  let contourData = null;
  let shapes = [];   // emprises posées : { id, geometry }
  let beams = [];    // faisceaux ponctuels : { id, lng, lat }
  let shapeCount = 0;
  let beamCount = 0;
  let arcCount = 0;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hauteur des volumes de projet, en metres. Assez haut pour se lire en vue
  // inclinee au-dessus des batiments extrudes du fond de carte (~10 a 30 m).
  const PROJECT_VOLUME_M = 90;
  const BEAM_RADIUS_M = 26;
  // Une couleur par nature de source : quand deux ou trois arcs convergent sur
  // la meme punaise, on lit d'un coup d'oeil que le projet est recoupe.
  const SOURCE_COLORS = {
    mairie: '#5eead4',   // officiel
    marche: '#fbbf24',   // marche public
    presse: '#a78bfa',   // presse
    document: '#60a5fa', // PDF officiel
  };

  // Petit disque geodesique, en degres, pour extruder un faisceau au-dessus
  // d'un projet ponctuel (la longitude est corrigee de la latitude)
  function discAround(lng, lat, rayonM, cotes = 14) {
    const dLat = rayonM / 111320;
    const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
    const ring = [];
    for (let i = 0; i <= cotes; i++) {
      const a = (i / cotes) * 2 * Math.PI;
      ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
    }
    return { type: 'Polygon', coordinates: [ring] };
  }

  // Emprise englobant une liste de [lng, lat]
  function boundsOf(coords) {
    return coords.reduce(
      (acc, c) => [[Math.min(acc[0][0], c[0]), Math.min(acc[0][1], c[1])], [Math.max(acc[1][0], c[0]), Math.max(acc[1][1], c[1])]],
      [[Infinity, Infinity], [-Infinity, -Infinity]]
    );
  }

  /* Faisceau vertical au-dessus d'un projet ponctuel. Un volume translucide
     monte de terre : sans lui, une adresse restait une punaise plate au milieu
     de reliefs et de batiments en volume. */
  function beamAt(lng, lat) {
    if (!map) return;
    const id = `fx-beam-${beamCount++}`;
    beams.push({ id, lng, lat });
    addBeamLayers(id, lng, lat, false);
  }

  /* `instant` : lors d'un rejeu (changement de style), le volume est posé à sa
     hauteur finale, sans transition - la montée animée a déjà eu lieu. */
  function addBeamLayers(id, lng, lat, instant) {
    try {
      map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: discAround(lng, lat, BEAM_RADIUS_M) } });
      map.addLayer({
        id: `${id}-core`, type: 'fill-extrusion', source: id,
        paint: {
          'fill-extrusion-color': accent,
          'fill-extrusion-opacity': 0.5,
          'fill-extrusion-height': instant ? PROJECT_VOLUME_M * 1.5 : 0,
          'fill-extrusion-height-transition': { duration: 1200, delay: 100 },
        },
      });
      if (!instant) {
        requestAnimationFrame(() => {
          try { map.setPaintProperty(`${id}-core`, 'fill-extrusion-height', PROJECT_VOLUME_M * 1.5); } catch { /* retiree */ }
        });
      }
    } catch { /* style occupe : le projet garde son epingle */ }
  }

  /* Emprise d'un projet : elle SORT DE TERRE. Un volume extrude monte de 0 a
     sa hauteur en une seconde, ce qui donne au projet une presence physique
     dans le relief plutot qu'une tache de couleur. Le contour lumineux reste,
     il porte la lecture au sol. */
  function addShapeLayers(id, geometry, instant) {
    try {
      map.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry, properties: {} } });
      if (/Polygon/.test(geometry.type)) {
        map.addLayer({
          id: `${id}-fill`, type: 'fill', source: id,
          paint: { 'fill-color': accent, 'fill-opacity': instant ? 0.22 : 0, 'fill-opacity-transition': { duration: 900 } },
        });
        map.addLayer({
          id: `${id}-3d`, type: 'fill-extrusion', source: id,
          paint: {
            'fill-extrusion-color': accent,
            'fill-extrusion-opacity': 0.42,
            'fill-extrusion-height': instant ? PROJECT_VOLUME_M : 0,
            'fill-extrusion-base': 0,
            'fill-extrusion-height-transition': { duration: 1100, delay: 120 },
          },
        });
        if (!instant) {
          requestAnimationFrame(() => {
            try {
              map.setPaintProperty(`${id}-fill`, 'fill-opacity', 0.22);
              map.setPaintProperty(`${id}-3d`, 'fill-extrusion-height', PROJECT_VOLUME_M);
            } catch { /* couche retiree */ }
          });
        }
      }
      map.addLayer({
        id: `${id}-line`, type: 'line', source: id,
        paint: {
          'line-color': accent, 'line-width': /Line/.test(geometry.type) ? 5 : 2.5,
          'line-blur': 1.5, 'line-opacity': instant ? 0.95 : 0, 'line-opacity-transition': { duration: 900 },
        },
      });
      if (!instant) {
        requestAnimationFrame(() => {
          try { map.setPaintProperty(`${id}-line`, 'line-opacity', 0.95); } catch { /* couche retiree */ }
        });
      }
    } catch { /* la géométrie tombera en épingle */ }
  }

  function addContourLayers() {
    if (!contourData) return;
    try {
      if (map.getSource('fx-contour')) return;
      map.addSource('fx-contour', { type: 'geojson', data: { type: 'Feature', geometry: contourData, properties: {} } });
      map.addLayer({
        id: 'fx-contour-glow', type: 'line', source: 'fx-contour',
        paint: { 'line-color': accent, 'line-width': 12, 'line-blur': 10, 'line-opacity': 0.3 },
      });
      map.addLayer({
        id: 'fx-contour', type: 'line', source: 'fx-contour',
        paint: { 'line-color': accent, 'line-width': 1.6, 'line-opacity': 0.95 },
      });
    } catch { /* style pas encore prêt */ }
  }

  function supportsWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  /* ─── Construction de la scène sur le style courant ───
     Appelée à chaque `style.load` : au démarrage, puis à chaque bascule de
     thème (setStyle avec diff: false garantit l'événement). */

  function buildScene() {
    const t = THEMES[theme];

    try { map.setProjection({ type: 'globe' }); } catch { /* projection plane : très bien aussi */ }
    try { map.setSky(t.sky); } catch { /* sky non supporté : sans gravité */ }

    // Repeinture du style en scène, propre à chaque thème (voir THEMES)
    for (const layer of map.getStyle().layers) {
      try { t.repaint(layer); } catch { /* propriété absente sur cette couche */ }
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
      map.addLayer({ id: 'fx-hillshade', type: 'hillshade', source: 'fx-dem', paint: t.hillshade });
    } catch { /* relief indisponible : carte plate */ }

    // Bâtiments en 3D au niveau rue (source « carto » embarquée par le style)
    try {
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
      map.addLayer({
        id: 'fx-3d-buildings',
        type: 'fill-extrusion',
        source: t.buildings.source,
        'source-layer': 'building',
        minzoom: t.buildings.minzoom,
        paint: {
          'fill-extrusion-color': t.buildings.color,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': t.buildings.opacity,
        },
      }, firstSymbol);
    } catch { /* extrusions indisponibles : sans gravité */ }

    try {
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
        paint: { 'circle-radius': 3, 'circle-color': t.dotCore, 'circle-opacity': 0.9 },
      });
    } catch { /* points décoratifs : sans gravité */ }

    document.body.classList.add('has-map');
    replayScene();
  }

  /* Rejoue les éléments de la génération en cours sur un style neuf, aux
     valeurs finales : la bascule de thème ne doit pas rejouer le spectacle. */
  function replayScene() {
    addContourLayers();
    for (const s of shapes) addShapeLayers(s.id, s.geometry, true);
    for (const b of beams) addBeamLayers(b.id, b.lng, b.lat, true);
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
          style: THEMES[theme].style,
          ...FRANCE_A,
          interactive: false,
          /* Les credits restent AFFICHES (discretement, voir demo.css) :
             Carto comme OpenStreetMap exigent une attribution visible. La
             masquer exposerait le kiosque a un blocage des tuiles. */
          attributionControl: { compact: false },
          fadeDuration: 200,
        });

        // #map est cree alors qu'il est encore en display:none (body sans
        // .has-map) : MapLibre le dimensionne a 0x0 et la carte reste minuscule
        // jusqu'a un resize manuel. Un ResizeObserver resynchronise le canvas
        // des que le conteneur devient visible (ajout de .has-map) ou change de
        // taille.
        try {
          const _mapEl = document.getElementById('map');
          if (_mapEl && typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => {
              try { map.resize(); } catch { /* carte detruite */ }
            }).observe(_mapEl);
          }
        } catch { /* ResizeObserver indisponible : trackResize gerera le window */ }
        // Recadrage en attente : un point arrivé pendant un mouvement rejoue
        // le recadrage dès la fin, pour toujours converger vers "tous les points"
        map.on('moveend', () => {
          // Les projets priment sur le recalage mairie : dès qu'il y en a, la
          // vue doit les montrer tous.
          if (reframePending) { reframePending = false; recentrePending = false; MapFX.reframe(); }
          else if (recentrePending) MapFX.recentrerSurMairie();
        });
        // `style.load` se déclenche au démarrage ET à chaque bascule de thème
        map.on('style.load', buildScene);
        rafId = requestAnimationFrame(loop);
        ok = true;
        MapFX.ok = true;
        return true;
      } catch {
        return false;
      }
    },

    /* Bascule jour/nuit demandée par l'écran (theme.js). Le style repart de
       zéro (`diff: false` garantit un `style.load`), buildScene reconstruit la
       scène et rejoue la génération en cours ; les marqueurs DOM (épingles,
       photos, sonar) survivent d'eux-mêmes au changement de style.

       Un style déclaré par URL (le sombre) est TÉLÉCHARGÉ AVANT d'être posé :
       passer l'URL à setStyle retirerait le style courant avant le fetch, et
       un échec réseau (wifi de salon) laisserait une carte entièrement vide.
       Ici, l'échec laisse simplement le fond actuel en place, et le JSON
       obtenu est mis en cache pour rendre les bascules suivantes instantanées. */
    setTheme(next) {
      const t = next === 'dark' ? 'dark' : 'light';
      if (!ok || t === theme) return;
      theme = t;
      const style = THEMES[t].style;
      if (typeof style === 'string') {
        fetch(style)
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`style ${r.status}`))))
          .then((json) => {
            THEMES[t].style = json;
            if (theme === t) map.setStyle(json, { diff: false });
          })
          .catch(() => console.warn('[demo] style du theme sombre injoignable, fond conserve'));
        return;
      }
      try { map.setStyle(style, { diff: false }); } catch { /* style conservé */ }
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
        center: [lng, lat], zoom, pitch: 42, bearing: -12,
        duration: prefersReduced ? 0 : 5200, curve: 1.6, essential: true,
      });
    },

    drawContour(contourGeojson) {
      if (!ok || !contourGeojson) return;
      contourData = contourGeojson;
      map.isStyleLoaded() ? addContourLayers() : map.once('idle', addContourLayers);
    },

    /* Position de la MAIRIE, telle que l'annuaire officiel la donne. Le radar
       et les arcs de collecte partaient du centre GEOMETRIQUE de la commune,
       qui tombe régulièrement dans un champ ou une forêt : le balayage semblait
       venir de nulle part. Ils partent désormais de l'hôtel de ville, ce qui
       est à la fois juste et lisible pour un élu. Le point est reçu en cours de
       route, donc le radar déjà posé est déplacé au lieu d'être recréé. */
    setMairie({ lat, lng }) {
      if (!ok || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      sourceOrigin = { lat, lng };
      if (scanMarker) {
        try { scanMarker.setLngLat([lng, lat]); } catch { /* marqueur retiré */ }
      }
      /* La caméra se recale sur la mairie tant qu'aucun projet n'est encore
         posé. L'écart au centre géométrique atteint 7 km sur une grande
         commune : le radar se serait retrouvé au bord de l'écran, voire
         dehors. Le recalage attend la fin de la plongée en cours plutôt que
         de la couper en plein vol. */
      if (projectCoords.length) return;
      if (map.isMoving()) { recentrePending = true; return; }
      MapFX.recentrerSurMairie();
    },

    recentrerSurMairie() {
      recentrePending = false;
      if (!ok || !sourceOrigin || projectCoords.length) return;
      map.easeTo({
        center: [sourceOrigin.lng, sourceOrigin.lat],
        duration: prefersReduced ? 0 : 1400,
        essential: true,
      });
    },

    // Sonar de recensement : anneaux concentriques qui pulsent depuis la mairie
    scanStart() {
      const depart = sourceOrigin || communeCenter;
      if (!ok || !depart || scanMarker) return;
      const el = document.createElement('div');
      el.className = 'fx-sonar';
      el.innerHTML = '<span></span><span></span><span></span><i></i>';
      scanMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([depart.lng, depart.lat])
        .addTo(map);
    },

    scanStop() {
      if (scanMarker) { scanMarker.remove(); scanMarker = null; }
    },

    /* Arc de collecte : une source converge vers un point.
       `kind` colore le trait selon la nature de la source et `target` permet de
       faire converger PLUSIEURS arcs sur la punaise d'un meme projet : c'est le
       recoupement multi-sources rendu visible, deux ou trois traits de couleurs
       differentes qui se rejoignent au meme endroit. */
    pulseSource(kind, target) {
      const depart = sourceOrigin || communeCenter;
      if (!ok || !depart || prefersReduced) return;
      const to = target && Number.isFinite(target.lng) ? [target.lng, target.lat] : [depart.lng, depart.lat];
      const angle = Math.random() * 2 * Math.PI;
      const dist = 0.02 + Math.random() * 0.025; // ~2 à 5 km
      const from = [to[0] + dist * Math.cos(angle), to[1] + dist * 0.72 * Math.sin(angle)];
      const id = `fx-arc-${arcCount++}`;
      const color = SOURCE_COLORS[kind] || accent;
      try {
        map.addSource(id, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [from, to] }, properties: {} },
        });
        map.addLayer({
          id, type: 'line', source: id,
          paint: {
            'line-color': color, 'line-width': 2.4, 'line-blur': 2,
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

    /* Position ÉCRAN d'un point géographique, en pixels de la fenêtre : la
       colonne de récolte s'en sert pour faire voler une mini-fiche jusqu'à
       son emplacement réel sur la carte au moment de la localisation. */
    screenPos({ lng, lat }) {
      if (!ok || !Number.isFinite(lng)) return null;
      try {
        const p = map.project([lng, lat]);
        return { x: p.x, y: p.y };
      } catch { return null; }
    },

    // Un projet localisé : emprise embrasée, épingle étiquetée, et la caméra
    // vient le voir (file d'attente : un vol après l'autre)
    addProject({ lat, lng, geometry, precise, title }) {
      if (!ok) return;
      projectCoords.push([lng, lat]);

      if (geometry && geometry.type !== 'Point') {
        const id = `fx-shape-${shapeCount++}`;
        shapes.push({ id, geometry });
        addShapeLayers(id, geometry, false);
      } else {
        // Projet ponctuel : pas d'emprise a lever, donc un FAISCEAU vertical
        // pour qu'il ait lui aussi du volume et se voie de loin en vue inclinee
        beamAt(lng, lat);
      }

      const el = document.createElement('div');
      el.className = `fx-pin-wrap${precise ? '' : ' fx-pin-wrap--approx'}`;
      el.style.setProperty('--pin', accent);
      el.innerHTML = `<span class="fx-pin"></span>${title ? `<span class="fx-pin-label">${String(title).replace(/[<>&]/g, '')}</span>` : ''}`;
      markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
      // Même précaution que pour les vignettes : l'étiquette du projet est une
      // boîte de texte, elle se verrait en haut à gauche le temps d'une trame.
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
      setTimeout(() => el.classList.add('is-collapsed'), 6000);

      this.reframe();
    },

    // Recadrage continu : la carte se réajuste en permanence pour montrer TOUS
    // les points, en vue d'ensemble à pitch bas -> on ne plonge plus dans le
    // relief (un seul mouvement à la fois, le suivant attend la fin du courant)
    reframe() {
      if (!ok || !projectCoords.length) return;
      if (map.isMoving()) { reframePending = true; return; }
      mode = 'focus';
      if (projectCoords.length === 1) {
        map.easeTo({
          center: projectCoords[0], zoom: 13.8, pitch: 34, bearing: 0,
          duration: prefersReduced ? 0 : 1500, essential: true,
        });
        return;
      }
      map.fitBounds(boundsOf(projectCoords), {
        /* Rembourrage volontairement ASYMÉTRIQUE, contrairement à la vue finale :
           pendant la génération, le bandeau de progression mange le haut
           (stepper, pilule) et le bas (compteurs, ticker). Les punaises ne
           doivent jamais se cacher derrière. */
        padding: { top: 200, bottom: 190, left: 130, right: 130 },
        pitch: 32, bearing: 0, maxZoom: 14.5,
        duration: prefersReduced ? 0 : 1500, essential: true,
      });
    },

    /* Photo trouvée : posée sur la carte à l'emplacement du projet.

       Elle est CHARGEE AVANT d'être posée, et reste invisible le temps que la
       carte lui donne sa position. Sans ces deux précautions, la vignette
       apparaissait un instant en haut à gauche de l'écran : le marqueur est
       ajouté au conteneur avant que sa transformation ne soit appliquée, et une
       image pas encore chargée n'a aucune dimension, ce qui provoquait un
       second saut au moment où elle arrivait. */
    attachPhoto(lat, lng, url) {
      if (!ok || !url) return;
      const img = new Image();
      img.alt = '';
      img.onload = () => {
        if (!ok || !map) return;
        const el = document.createElement('div');
        el.className = 'fx-photo';
        el.appendChild(img);
        try {
          photoMarkers.push(
            new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -14] })
              .setLngLat([lng, lat])
              .addTo(map)
          );
        } catch { return; /* carte détruite entre-temps */ }
        // Deux trames : la première laisse la carte positionner le marqueur, la
        // seconde laisse le navigateur en tenir compte avant qu'on ne dévoile.
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
        setTimeout(() => el.classList.add('is-small'), 6500);
      };
      img.onerror = () => { /* photo indisponible : pas de vignette, c'est tout */ };
      img.src = String(url);
    },

    /* Survol final. Trois minutes de montee meritent mieux qu'un recadrage :
       la camera plonge sur les projets les plus marquants l'un apres l'autre,
       tourne autour, puis remonte en vue d'ensemble. C'est le moment ou le
       visiteur sort son telephone. `onFocus` laisse l'ecran afficher le titre
       et la photo du projet survole. */
    tour(points, onFocus, onDone) {
      if (!ok || !points?.length) { onDone?.(); return; }
      if (prefersReduced) { this.finale(); onDone?.(); return; }
      mode = 'focus';
      const etapes = points.slice(0, 3);
      let i = 0;
      const suivant = () => {
        if (i >= etapes.length) {
          onFocus?.(null);
          this.finale();
          setTimeout(() => onDone?.(), 2600);
          return;
        }
        const p = etapes[i];
        onFocus?.(p);
        map.flyTo({
          center: [p.lng, p.lat],
          zoom: 16.2,
          pitch: 62,
          bearing: (i * 47) % 360,
          duration: 3200,
          curve: 1.5,
          essential: true,
        });
        i++;
        setTimeout(suivant, 4600);
      };
      suivant();
    },

    /* Recadrage final : vue d'ensemble sur tous les projets, VRAIMENT centrée.

       Deux corrections. D'abord le pitch : `fitBounds` calcule son cadrage
       comme si la caméra était à plat, puis applique l'inclinaison par-dessus.
       Le résultat dérivait vers le haut de l'écran, d'autant plus que
       l'inclinaison était forte. La vue finale se fait donc à plat, ce qui la
       rend exacte, et c'est aussi la vue la plus lisible pour compter les
       punaises. Ensuite le rembourrage : celui d'origine réservait 200 px en
       haut et 190 px en bas pour le bandeau de progression, qui n'existe plus à
       ce moment-là. Un rembourrage égal sur les quatre côtés remet les projets
       au milieu. */
    finale() {
      if (!ok || !projectCoords.length) return;
      reframePending = false;
      recentrePending = false;
      mode = 'focus';
      if (projectCoords.length === 1) {
        map.easeTo({ center: projectCoords[0], zoom: 14, pitch: 0, bearing: 0, duration: prefersReduced ? 0 : 2400, essential: true });
        return;
      }
      const marge = Math.round(Math.min(110, Math.max(56, map.getContainer().clientWidth * 0.07)));
      map.fitBounds(boundsOf(projectCoords), {
        padding: { top: marge, bottom: marge, left: marge, right: marge },
        pitch: 0, bearing: 0, maxZoom: 14.8,
        duration: prefersReduced ? 0 : 2800, essential: true,
      });
    },

    // Retour à l'accueil : on nettoie la scène (et le registre de rejeu)
    reset() {
      if (!ok) return;
      this.scanStop();
      reframePending = false;
      recentrePending = false;
      markers.forEach((m) => m.remove());
      photoMarkers.forEach((m) => m.remove());
      markers = [];
      photoMarkers = [];
      projectCoords = [];
      communeCenter = null;
      sourceOrigin = null;
      for (const s of shapes) {
        // '-3d' inclus : sans lui, les volumes de la commune precedente
        // restaient plantes dans le paysage au passage a la suivante
        for (const suffix of ['-fill', '-line', '-3d']) {
          try { if (map.getLayer(`${s.id}${suffix}`)) map.removeLayer(`${s.id}${suffix}`); } catch { /* absente */ }
        }
        try { if (map.getSource(s.id)) map.removeSource(s.id); } catch { /* absente */ }
      }
      shapes = [];
      shapeCount = 0;
      for (const b of beams) {
        try { if (map.getLayer(`${b.id}-core`)) map.removeLayer(`${b.id}-core`); } catch { /* absente */ }
        try { if (map.getSource(b.id)) map.removeSource(b.id); } catch { /* absente */ }
      }
      beams = [];
      beamCount = 0;
      contourData = null;
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
