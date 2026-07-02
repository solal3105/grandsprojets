/* ============================================================================
   HUB VILLE — enrichissement progressif du HTML rendu par l'edge function.

   Le contenu (liste, tags, compteurs) est déjà dans le DOM côté serveur :
   ce script n'ajoute que l'interactivité — thème, partage, filtrage par
   catégorie (avec deep-link #c=slug), bascule Liste/Carte et carte MapLibre
   chargée à la demande (la chaîne maplibre-gl + maplibre-compat n'est
   téléchargée qu'à la première ouverture de la vue carte).

   Dépendances page : /modules/thememanager.js (window.ThemeManager).
   Aucun appel Supabase : toutes les données viennent des data-attributes SSR.
   ============================================================================ */

;(function () {
  'use strict';

  /* ═══════════════ CONFIG ═══════════════ */
  const MAX_MAP_PROJECTS = 150; // au-delà, seuls les plus récents sont dessinés
  const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  const COMPAT_JS = '/modules/maplibre-compat.js';

  /* window.basemaps est injecté par l'edge function (table basemaps_v2) —
     sans lui, la carte affiche les géométries des projets sur fond neutre */

  /* ═══════════════ DOM refs ═══════════════ */
  const $ = id => document.getElementById(id);
  const el = {
    topbar:     $('vh-topbar'),
    topTitle:   $('vh-topbar-title'),
    topLogo:    $('vh-topbar-logo'),
    topLogoImg: $('vh-topbar-logo-img'),
    btnTheme:   $('vh-btn-theme'),
    btnShare:   $('vh-btn-share'),
    content:    $('vh-content'),
    grid:       $('vh-grid'),
    empty:      $('vh-empty'),
    map:        $('vh-map'),
    mapCanvas:  $('vh-map-canvas'),
    mapEmpty:   $('vh-map-empty'),
  };

  /* ═══════════════ HELPERS ═══════════════ */
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
      l.onerror = resolve; // la carte reste utilisable même sans son CSS
      document.head.appendChild(l);
    });
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"][data-loaded]`)) return resolve();
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) existing.remove(); // tag d'un chargement précédent échoué → réessai propre
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // préserve l'ordre maplibre-gl → maplibre-compat
      s.onload = () => { s.setAttribute('data-loaded', ''); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error(`load failed: ${src}`)); };
      document.head.appendChild(s);
    });
  }

  /* ═══════════════ TOPBAR : thème, partage, scroll ═══════════════ */
  function bindTheme() {
    if (!el.btnTheme) return;
    const icon = el.btnTheme.querySelector('i');
    const syncIcon = () => {
      if (icon) icon.className = currentTheme() === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    };
    el.btnTheme.addEventListener('click', () => window.ThemeManager?.toggle?.());
    new MutationObserver(syncIcon)
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    syncIcon();
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
      } catch { /* clipboard indisponible : pas de feedback */ }
    });
  }

  function initTopbarScroll() {
    if (!el.topbar) return;
    let raf = null;
    const update = () => {
      raf = null;
      el.topbar.classList.toggle('is-scrolled', window.scrollY > 24);
    };
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    update();
  }

  /** Logo ville light/dark depuis les data-attributes SSR (pas de refetch) */
  function initBranding() {
    if (!el.content) return;
    const label = el.content.dataset.label || '';
    if (el.topTitle) el.topTitle.textContent = label;

    const logoLight = el.content.dataset.logo || '';
    const logoDark = el.content.dataset.logoDark || logoLight;
    if (!logoLight) return;

    const applyLogo = () => {
      const url = currentTheme() === 'dark' ? logoDark : logoLight;
      if (el.topLogoImg) { el.topLogoImg.src = url; el.topLogoImg.alt = label; }
      if (el.topLogo) el.topLogo.hidden = false;
    };
    applyLogo();
    new MutationObserver(applyLogo)
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ═══════════════ FILTRAGE PAR CATÉGORIE ═══════════════ */
  let activeCat = '';

  function cards() {
    return el.grid ? [...el.grid.querySelectorAll('.vh-card')] : [];
  }

  function applyFilter(catSlug) {
    activeCat = catSlug || '';
    let visible = 0;
    for (const card of cards()) {
      const show = !activeCat || card.dataset.cat === activeCat;
      card.hidden = !show;
      if (show) visible++;
    }
    if (el.empty) el.empty.hidden = visible > 0 || !isListView();

    for (const tag of document.querySelectorAll('.vh-tag')) {
      const active = (tag.dataset.cat || '') === activeCat;
      tag.classList.toggle('is-active', active);
      tag.setAttribute('aria-pressed', String(active));
    }

    // Deep-link : #c={slug} (supprimé quand le filtre est « Tous »)
    const hash = activeCat ? `#c=${encodeURIComponent(activeCat)}` : '';
    history.replaceState(null, '', window.location.pathname + window.location.search + hash);

    // La carte suit le filtre si elle est déjà initialisée (fire-and-forget : ne
    // jamais laisser un rejet devenir une unhandled rejection)
    if (mapReady) renderMapLayer().catch(() => {});
  }

  function applyFilterFromHash() {
    const m = window.location.hash.match(/^#c=([a-z0-9-]+)$/i);
    const slug = m ? decodeURIComponent(m[1]) : '';
    if (!slug || cards().some(c => c.dataset.cat === slug)) applyFilter(slug);
  }

  function bindTags() {
    for (const tag of document.querySelectorAll('.vh-tag')) {
      tag.addEventListener('click', () => applyFilter(tag.dataset.cat || ''));
    }
    // Deep-link : au chargement et à chaque changement de hash
    // (replaceState dans applyFilter ne déclenche pas hashchange — pas de boucle)
    window.addEventListener('hashchange', applyFilterFromHash);
    applyFilterFromHash();
  }

  /* ═══════════════ BASCULE LISTE / CARTE ═══════════════ */
  const isListView = () => !el.grid?.hidden;

  function setView(view) {
    const showMap = view === 'carte';
    if (el.grid) el.grid.hidden = showMap;
    if (el.map) el.map.hidden = !showMap;
    if (el.empty && showMap) el.empty.hidden = true;
    if (!showMap) applyFilter(activeCat); // re-synchronise l'empty state de la liste

    for (const btn of document.querySelectorAll('.vh-view')) {
      const active = btn.dataset.view === view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }

    if (showMap) ensureMap();
  }

  function bindViews() {
    for (const btn of document.querySelectorAll('.vh-view')) {
      btn.addEventListener('click', () => setView(btn.dataset.view || 'liste'));
    }
  }

  /* ═══════════════ CARTE (chargée à la demande) ═══════════════ */
  let mapReady = false;
  let mapLoading = null;
  let map = null;
  let basemap = null;
  let projectsLayer = null;
  const geojsonCache = new Map(); // url → FeatureCollection|null

  function mapCenter() {
    const lat = parseFloat(el.content?.dataset.centerLat || '');
    const lng = parseFloat(el.content?.dataset.centerLng || '');
    const zoom = parseInt(el.content?.dataset.zoom || '', 10);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { center: [lat, lng], zoom: Number.isFinite(zoom) ? zoom : 12 };
    }
    return null;
  }

  // Cache la PROMESSE (pas la valeur) : deux rendus concurrents partagent
  // le même fetch au lieu de le dupliquer tant qu'il est en vol
  function fetchGeojson(url) {
    if (!geojsonCache.has(url)) {
      geojsonCache.set(url, fetch(url)
        .then(resp => (resp.ok ? resp.json() : null))
        .catch(() => null));
    }
    return geojsonCache.get(url);
  }

  /** Fusionne les geojsons des cards visibles en une FeatureCollection annotée */
  async function collectFeatures() {
    const sources = cards()
      .filter(c => !c.hidden && c.dataset.geojson)
      .slice(0, MAX_MAP_PROJECTS);

    const results = await Promise.all(sources.map(async card => {
      const data = await fetchGeojson(card.dataset.geojson);
      const feats = Array.isArray(data?.features) ? data.features.filter(Boolean) : [];
      if (!feats.length) return [];
      const color = getComputedStyle(card).getPropertyValue('--cat-color').trim() || '';
      return feats.map(f => ({
        ...f,
        properties: { ...(f.properties || null), _name: card.dataset.name || '', _url: card.dataset.url || '', _color: color },
      }));
    }));

    return { type: 'FeatureCollection', features: results.flat() };
  }

  let renderSeq = 0;

  async function renderMapLayer() {
    if (!map) return;
    // Jeton de séquence : un rendu obsolète (filtre précédent, fetch lent) ne
    // doit jamais écraser la couche d'un rendu plus récent
    const seq = ++renderSeq;
    const collection = await collectFeatures();
    if (seq !== renderSeq || !map) return;

    if (projectsLayer) { map.removeLayer(projectsLayer); projectsLayer = null; }
    if (el.mapEmpty) el.mapEmpty.hidden = collection.features.length > 0;
    if (!collection.features.length) return;

    projectsLayer = window.L.geoJSON(collection, {
      style: f => ({
        color: f?.properties?._color || 'var(--primary)',
        weight: 3,
        opacity: 0.85,
        fillOpacity: 0.28,
      }),
      pointToLayer: (f, latlng) => window.L.marker(latlng, {
        icon: window.L.divIcon({
          className: 'vh-map-dot-wrap',
          html: `<span class="vh-map-dot" style="--dot:${f?.properties?._color || ''}"></span>`,
        }),
      }),
    }).addTo(map);

    fitToLayer(projectsLayer);
  }

  /** Cadre la carte sur la couche — gère le cas dégénéré (projet ponctuel
      unique) que le shim ne borne pas via maxZoom */
  function fitToLayer(layer) {
    const bounds = layer.getBounds?.();
    if (!bounds || bounds.isValid?.() === false) return;
    const ne = bounds.getNorthEast?.();
    const sw = bounds.getSouthWest?.();
    const single = ne && sw && ne.lat === sw.lat && ne.lng === sw.lng;
    if (single) {
      map.setView(bounds.getCenter(), 15);
    } else {
      map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
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

  function ensureMap() {
    if (mapReady) {
      // Le conteneur vient de redevenir visible : recalculer la taille (une carte
      // créée dans un conteneur display:none aurait mal cadré) puis re-cadrer
      map?._mlMap?.resize?.();
      if (projectsLayer) fitToLayer(projectsLayer);
      return;
    }
    if (mapLoading) return;

    mapLoading = (async () => {
      await Promise.all([
        loadStyleOnce(MAPLIBRE_CSS),
        loadScriptOnce(MAPLIBRE_JS).then(() => loadScriptOnce(COMPAT_JS)),
      ]);
      if (!window.L || !el.mapCanvas) return;

      const start = mapCenter();
      map = window.L.map('vh-map-canvas', start
        ? { center: start.center, zoom: start.zoom }
        : { center: [46.6, 2.4], zoom: 5 } /* France entière tant que fitBounds n'a pas les données */
      );
      const bm = getBasemapForTheme(currentTheme());
      if (bm) basemap = window.L.createBasemapLayer(bm).addTo(map);
      observeThemeForMap();
      mapReady = true;
      // La vue a pu être quittée pendant le chargement : resize avant de cadrer
      map._mlMap?.resize?.();
      await renderMapLayer();
    })().catch(e => {
      console.debug('[vh] Init carte échouée', e);
      mapLoading = null; // autorise un nouvel essai au prochain clic
    });
  }

  /* ═══════════════ INIT ═══════════════ */
  function init() {
    window.ThemeManager?.init?.();
    bindTheme();
    bindShare();
    initTopbarScroll();
    initBranding();
    bindTags();
    bindViews();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
