/* ============================================================================
   HUB VILLE - enrichissement progressif du HTML rendu par l'edge function.

   Le contenu (héros, cards, filtres) est déjà dans le DOM côté serveur ; ce
   script ajoute : thème, partage, filtrage combiné catégorie + recherche
   (cards + compteur aria-live + carte + lien vers l'app), et la carte-héros
   de la ville, chargée après le premier rendu (maplibre-gl à la demande).

   La carte du héros est un DÉCOR cliquable (verrouillée, un clic sur un projet
   ouvre sa fiche) ; l'exploration spatiale complète se fait dans l'app carte.

   Dépendances page : /modules/thememanager.js. Aucun appel Supabase :
   tout vient des data-attributes et de window.basemaps injectés par l'edge.
   ============================================================================ */

;(function () {
  'use strict';

  const MAX_MAP_PROJECTS = 200;
  const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  const COMPAT_JS = '/modules/maplibre-compat.js';
  const MAP_HANDLERS = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'dragRotate', 'touchZoomRotate', 'keyboard', 'boxZoom'];

  /* window.basemaps est injecté par l'edge function (table basemaps_v2) ;
     sans lui, la carte affiche les tracés sur fond neutre */

  const $ = id => document.getElementById(id);
  const el = {
    topbar:     $('vh-topbar'),
    topTitle:   $('vh-topbar-title'),
    topLogo:    $('vh-topbar-logo'),
    topLogoImg: $('vh-topbar-logo-img'),
    btnTheme:   $('vh-btn-theme'),
    btnShare:   $('vh-btn-share'),
    content:    $('vh-content'),
    heroMap:    $('vh-hero-map'),
    grid:       $('vh-grid'),
    empty:      $('vh-empty'),
    search:     $('vh-search'),
    count:      $('vh-count'),
    openMap:    $('vh-open-map'),
  };

  const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

  function getBasemapForTheme(theme) {
    const tm = window.ThemeManager?.findBasemapForTheme?.(theme);
    if (tm) return tm;
    const list = window.basemaps || [];
    return list.find(b => b.theme === theme) || list[0];
  }

  function loadStyleOnce(href) {
    return new Promise(resolve => {
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = resolve;
      l.onerror = resolve;
      document.head.appendChild(l);
    });
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"][data-loaded]`)) return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) existing.remove();
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // préserve l'ordre maplibre-gl → maplibre-compat
      s.onload = () => { s.setAttribute('data-loaded', ''); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error(`load failed: ${src}`)); };
      document.head.appendChild(s);
    });
  }

  /* ═══════════════ TOPBAR : thème, partage, scroll, branding ═══════════════ */
  function bindTheme() {
    if (!el.btnTheme) return;
    const icon = el.btnTheme.querySelector('i');
    const sync = () => { if (icon) icon.className = currentTheme() === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'; };
    el.btnTheme.addEventListener('click', () => window.ThemeManager?.toggle?.());
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    sync();
  }

  function bindShare() {
    if (!el.btnShare) return;
    const icon = el.btnShare.querySelector('i');
    el.btnShare.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        el.btnShare.classList.add('is-copied');
        if (icon) icon.className = 'fa-solid fa-check';
        setTimeout(() => {
          el.btnShare.classList.remove('is-copied');
          if (icon) icon.className = 'fa-solid fa-link';
        }, 2000);
      } catch { /* clipboard indisponible */ }
    });
  }

  function initTopbarScroll() {
    if (!el.topbar) return;
    let raf = null;
    const update = () => { raf = null; el.topbar.classList.toggle('is-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }

  function initBranding() {
    if (!el.content) return;
    const label = el.content.dataset.label || '';
    if (el.topTitle) el.topTitle.textContent = label;
    const logoLight = el.content.dataset.logo || '';
    const logoDark = el.content.dataset.logoDark || logoLight;
    if (!logoLight) return;
    const apply = () => {
      const url = currentTheme() === 'dark' ? logoDark : logoLight;
      if (el.topLogoImg) { el.topLogoImg.src = url; el.topLogoImg.alt = label; }
      if (el.topLogo) el.topLogo.hidden = false;
    };
    apply();
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ═══════════════ FILTRAGE (catégorie + recherche) ═══════════════ */
  let activeCat = '';
  let query = '';

  const cards = () => (el.grid ? [...el.grid.querySelectorAll('.vh-card')] : []);

  function applyFilters() {
    const q = query.trim().toLowerCase();
    let visible = 0;
    for (const card of cards()) {
      const okCat = !activeCat || card.dataset.cat === activeCat;
      const okQuery = !q || (card.dataset.search || '').includes(q);
      const show = okCat && okQuery;
      card.hidden = !show;
      if (show) visible++;
    }

    // Compteur (annoncé aux lecteurs d'écran via aria-live)
    if (el.count) el.count.textContent = `${visible} ${visible > 1 ? 'projets' : 'projet'}`;
    if (el.empty) el.empty.hidden = visible > 0;

    // État actif des chips
    for (const tag of document.querySelectorAll('.vh-tag')) {
      const active = (tag.dataset.cat || '') === activeCat;
      tag.classList.toggle('is-active', active);
      tag.setAttribute('aria-pressed', String(active));
    }

    // Le CTA « Ouvrir la carte » transporte le filtre catégorie vers l'app
    if (el.openMap) {
      const base = el.content?.dataset.mapUrl || '/';
      el.openMap.setAttribute('href', activeCat ? `${base}&cat=${encodeURIComponent(activeCat)}` : base);
    }

    // Deep-link #c={slug} (retiré quand « Tous »)
    const hash = activeCat ? `#c=${encodeURIComponent(activeCat)}` : '';
    history.replaceState(null, '', window.location.pathname + window.location.search + hash);

    // La carte-héros suit la sélection
    if (heroReady) renderHeroLayer().catch(() => {});
  }

  function applyFilterFromHash() {
    const m = window.location.hash.match(/^#c=([a-z0-9-]+)$/i);
    const slug = m ? decodeURIComponent(m[1]) : '';
    if (!slug || cards().some(c => c.dataset.cat === slug)) { activeCat = slug; applyFilters(); }
  }

  function bindTags() {
    for (const tag of document.querySelectorAll('.vh-tag')) {
      tag.addEventListener('click', () => { activeCat = tag.dataset.cat || ''; applyFilters(); });
    }
    window.addEventListener('hashchange', applyFilterFromHash);
    applyFilterFromHash();
  }

  function bindSearch() {
    if (!el.search) return;
    let raf = null;
    el.search.addEventListener('input', () => {
      query = el.search.value;
      if (!raf) raf = requestAnimationFrame(() => { raf = null; applyFilters(); });
    });
  }

  /* ═══════════════ CARTE-HÉROS (décor cliquable, chargée à la demande) ═══════════════ */
  let heroReady = false;
  let map = null;
  let basemap = null;
  let projectsLayer = null;
  let renderSeq = 0;
  const geojsonCache = new Map();

  function fetchGeojson(url) {
    if (!geojsonCache.has(url)) {
      geojsonCache.set(url, fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null));
    }
    return geojsonCache.get(url);
  }

  async function collectFeatures() {
    const sources = cards().filter(c => !c.hidden && c.dataset.geojson).slice(0, MAX_MAP_PROJECTS);
    const results = await Promise.all(sources.map(async card => {
      const data = await fetchGeojson(card.dataset.geojson);
      const feats = Array.isArray(data?.features) ? data.features.filter(Boolean) : [];
      if (!feats.length) return [];
      const color = getComputedStyle(card).getPropertyValue('--cat-color').trim() || '';
      return feats.map(f => ({
        ...f,
        properties: { ...(f.properties || null), _url: card.dataset.url || '', _color: color },
      }));
    }));
    return { type: 'FeatureCollection', features: results.flat() };
  }

  async function renderHeroLayer() {
    if (!map) return;
    const seq = ++renderSeq;
    const collection = await collectFeatures();
    if (seq !== renderSeq || !map) return;

    if (projectsLayer) { map.removeLayer(projectsLayer); projectsLayer = null; }
    if (!collection.features.length) return;

    projectsLayer = window.L.geoJSON(collection, {
      style: f => ({ color: f?.properties?._color || 'var(--primary)', weight: 3, opacity: 0.9, fillOpacity: 0.28 }),
      pointToLayer: (f, latlng) => window.L.marker(latlng, {
        icon: window.L.divIcon({ className: 'vh-map-dot-wrap', html: `<span class="vh-map-dot" style="--dot:${f?.properties?._color || ''}"></span>` }),
      }),
      onEachFeature: (f, layer) => {
        const url = f?.properties?._url;
        if (url) layer.on('click', () => { window.location.href = url; });
      },
    }).addTo(map);

    fitToLayer(projectsLayer);
  }

  function fitToLayer(layer) {
    const bounds = layer.getBounds?.();
    if (!bounds || bounds.isValid?.() === false) return;
    const ne = bounds.getNorthEast?.();
    const sw = bounds.getSouthWest?.();
    if (ne && sw && ne.lat === sw.lat && ne.lng === sw.lng) {
      map.setView(bounds.getCenter(), 14);
    } else {
      map.fitBounds(bounds, { padding: 56, maxZoom: 15 });
    }
  }

  function observeThemeForMap() {
    new MutationObserver(() => {
      if (!map || !basemap) return;
      const bm = getBasemapForTheme(currentTheme());
      if (!bm) return;
      map.removeLayer(basemap);
      basemap = window.L.createBasemapLayer(bm).addTo(map);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function heroCenter() {
    const lat = parseFloat(el.content?.dataset.centerLat || '');
    const lng = parseFloat(el.content?.dataset.centerLng || '');
    const zoom = parseInt(el.content?.dataset.zoom || '', 10);
    return (Number.isFinite(lat) && Number.isFinite(lng))
      ? { center: [lat, lng], zoom: Number.isFinite(zoom) ? zoom : 12 }
      : { center: [46.6, 2.4], zoom: 5 };
  }

  async function initHeroMap() {
    if (!el.heroMap) return;
    try {
      await Promise.all([
        loadStyleOnce(MAPLIBRE_CSS),
        loadScriptOnce(MAPLIBRE_JS).then(() => loadScriptOnce(COMPAT_JS)),
      ]);
      if (!window.L) return;

      const start = heroCenter();
      map = window.L.map('vh-hero-map', { center: start.center, zoom: start.zoom, attributionControl: false });
      const bm = getBasemapForTheme(currentTheme());
      if (bm) basemap = window.L.createBasemapLayer(bm).addTo(map);

      // Décor : on verrouille les interactions (le vrai zoom/pan est dans l'app)
      const mlMap = map._mlMap;
      if (mlMap) MAP_HANDLERS.forEach(h => mlMap[h]?.disable());

      // Le conteneur a pu ne pas être encore dimensionné à la création
      // (init différé) → forcer un recalcul avant de cadrer
      requestAnimationFrame(() => mlMap?.resize?.());

      observeThemeForMap();
      heroReady = true;
      el.heroMap.classList.add('is-ready');
      mlMap?.resize?.();
      await renderHeroLayer();
    } catch (e) {
      console.debug('[vh] Carte héros indisponible', e);
    }
  }

  /* ═══════════════ INIT ═══════════════ */
  function init() {
    // La ville est injectée par l'edge function ville-hub dans le conteneur.
    const ville = el.content?.dataset.ville || '';
    if (ville) window.OPAnalytics?.setCity(ville);

    window.ThemeManager?.init?.();
    bindTheme();
    bindShare();
    initTopbarScroll();
    initBranding();
    bindTags();
    bindSearch();
    // Départ vers une fiche : mesure le taux de clic réel du hub d'une ville.
    el.grid?.addEventListener('click', (e) => {
      const card = e.target.closest('.vh-card');
      if (card) window.OPAnalytics?.capture('city_project_clicked', { category: card.dataset.cat || null });
    });
    // La carte enrichit après le premier rendu : on ne bloque pas le LCP
    if ('requestIdleCallback' in window) {
      requestIdleCallback(initHeroMap, { timeout: 2000 });
    } else {
      setTimeout(initHeroMap, 400);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
