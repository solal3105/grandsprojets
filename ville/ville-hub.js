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
      el.openMap.setAttribute('href', activeCat ? `${base}${base.includes('?') ? '&' : '?'}cat=${encodeURIComponent(activeCat)}` : base);
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
    // Hub d'une ville seulement : sur l'index, le hash sert aux ancres de
    // région et applyFilters() l'effacerait
    if (!el.grid) return;
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

  /* ═══════════════ INDEX DES VILLES (/ville/) ═══════════════
     Recherche instantanée sur les 100+ villes, lien vivant entre la carte et
     la liste, et zoom sur la carte pour séparer les villes qui se touchent
     autour de Paris et de Lyon. */

  function foldAccents(text) {
    return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /* ─── Carte : zoom et déplacement ───
     On agit sur le viewBox du SVG, pas sur un transform : les points gardent
     ainsi leur taille à l'écran (leur rayon est recalculé), donc grossir la
     carte SÉPARE les villes au lieu de les épaissir. */
  // Au-delà de cinq fois, la côte sort du cadre et la carte n'apprend plus rien
  const ZOOM_MAX = 5;
  // À partir du double, chaque ville visible porte son nom : c'est ce qui
  // remplace la silhouette de la France quand on est entré dedans
  const ZOOM_NOMS = 2;

  function initMapZoom() {
    const wrap = $('vh-ixmap');
    const svg = $('vh-ixmap-svg');
    const zoomBox = $('vh-ixmap-zoom');
    if (!wrap || !svg) return null;

    const [bx, by, bw, bh] = (svg.dataset.viewbox || '').split(/\s+/).map(Number);
    if (![bx, by, bw, bh].every(Number.isFinite) || bw <= 0) return null;

    // Rayon et position d'origine de chaque point : le zoom les recalcule
    const dots = [...svg.querySelectorAll('.vh-ixmap__dot')].map(c => ({
      c,
      label: c.parentElement.querySelector('text'),
      r: Number(c.getAttribute('r')),
      cy: Number(c.getAttribute('cy')),
    }));

    const view = { x: bx, y: by, w: bw, h: bh };

    function clamp() {
      view.w = Math.min(bw, Math.max(bw / ZOOM_MAX, view.w));
      view.h = view.w * (bh / bw);
      view.x = Math.min(bx + bw - view.w, Math.max(bx, view.x));
      view.y = Math.min(by + bh - view.h, Math.max(by, view.y));
    }

    function apply() {
      clamp();
      const k = view.w / bw;
      svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
      svg.style.setProperty('--k', String(k));
      for (const d of dots) {
        d.c.setAttribute('r', (d.r * k).toFixed(4));
        if (d.label) d.label.setAttribute('y', (d.cy - (d.r + 0.14) * k).toFixed(4));
      }
      wrap.classList.toggle('is-zoomed', k < 0.999);
      wrap.classList.toggle('is-labelled', k <= 1 / ZOOM_NOMS + 1e-6);
      if (zoomBox) {
        zoomBox.querySelector('[data-zoom="in"]').disabled = view.w <= bw / ZOOM_MAX + 1e-6;
        zoomBox.querySelector('[data-zoom="out"]').disabled = k >= 0.999;
        zoomBox.querySelector('[data-zoom="reset"]').disabled = k >= 0.999;
      }
    }

    /** Grossit autour d'un point donné en coordonnées du SVG (0→1 dans la vue). */
    function zoomBy(facteur, ancreX = 0.5, ancreY = 0.5) {
      const px = view.x + view.w * ancreX;
      const py = view.y + view.h * ancreY;
      view.w = view.w / facteur;
      view.h = view.h / facteur;
      view.x = px - view.w * ancreX;
      view.y = py - view.h * ancreY;
      apply();
    }

    function reset() {
      view.x = bx; view.y = by; view.w = bw; view.h = bh;
      apply();
    }

    if (zoomBox) {
      zoomBox.hidden = false;
      zoomBox.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-zoom]');
        if (!btn) return;
        if (btn.dataset.zoom === 'reset') reset();
        else zoomBy(btn.dataset.zoom === 'in' ? 1.6 : 1 / 1.6);
      });
    }

    // Molette : on grossit là où est le curseur, pas au centre
    svg.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      const b = svg.getBoundingClientRect();
      zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    }, { passive: false });

    svg.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const b = svg.getBoundingClientRect();
      zoomBy(1.8, (e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height);
    });

    // Glisser : seulement une fois la carte grossie, sinon on volerait le
    // défilement de la page au doigt
    let drag = null;
    svg.addEventListener('pointerdown', (e) => {
      if (!wrap.classList.contains('is-zoomed') || e.button !== 0) return;
      const b = svg.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, ech: view.w / b.width, bouge: false };
      svg.setPointerCapture(e.pointerId);
      wrap.classList.add('is-dragging');
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.bouge = true;
      view.x = drag.vx - dx * drag.ech;
      view.y = drag.vy - dy * drag.ech;
      apply();
    });
    const finDrag = (e) => {
      if (!drag) return;
      // Un glisser ne doit pas ouvrir la ville qui se trouvait sous le doigt
      if (drag.bouge) svg.addEventListener('click', (ev) => ev.preventDefault(), { capture: true, once: true });
      drag = null;
      wrap.classList.remove('is-dragging');
      if (e?.pointerId !== undefined && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    };
    svg.addEventListener('pointerup', finDrag);
    svg.addEventListener('pointercancel', finDrag);

    apply();
    return { reset, zoomSur(cx, cy) { view.w = bw / 4; view.h = bh / 4; view.x = cx - view.w / 2; view.y = cy - view.h / 2; apply(); } };
  }

  /* ─── Logos : à chacun le fond qui le rend lisible ───
     Les logos de communes sont des tracés sur fond transparent, tantôt
     sombres, tantôt blancs. On regarde la clarté moyenne des pixels opaques
     pour choisir la pastille, et on repasse à la pastille de couleur quand
     l'image manque ou qu'elle est vide. */
  function initLogoPlates(root) {
    const logos = [...root.querySelectorAll('.vh-ville__logo')];
    if (!logos.length) return;
    const cv = document.createElement('canvas');
    cv.width = 24;
    cv.height = 24;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const pastille = (img) => {
      const span = document.createElement('span');
      span.className = 'vh-ville__dot';
      span.setAttribute('aria-hidden', 'true');
      img.replaceWith(span);
    };

    const juger = (img) => {
      if (!img.naturalWidth) return pastille(img);
      let somme = 0;
      let poids = 0;
      try {
        ctx.clearRect(0, 0, 24, 24);
        ctx.drawImage(img, 0, 0, 24, 24);
        const px = ctx.getImageData(0, 0, 24, 24).data;
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3] / 255;
          if (a < 0.15) continue;
          somme += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) * a;
          poids += a;
        }
      } catch {
        return; // image d'un autre domaine sans CORS : on garde le fond clair
      }
      if (poids < 2) return pastille(img); // rien de visible dans l'image
      img.classList.toggle('is-light', somme / poids > 176);
    };

    for (const img of logos) {
      img.addEventListener('error', () => pastille(img), { once: true });
      if (img.complete) juger(img);
      else img.addEventListener('load', () => juger(img), { once: true });
    }
  }

  /* ─── Barre collante : étiquette flottante, état collé, région courante ─── */
  function initStickyBar(root) {
    const bar = $('vh-ix-bar');
    const nav = root.querySelector('.vh-ix-nav');
    if (bar) {
      // Le rail se resserre dès qu'il vient toucher la barre du haut. Une
      // sentinelle d'un pixel juste au-dessus le dit sans écouter le défilement.
      const haut = Math.round(parseFloat(getComputedStyle(bar).top) || 0);
      const sentinelle = document.createElement('div');
      sentinelle.className = 'vh-ix-bar__sentinel';
      sentinelle.setAttribute('aria-hidden', 'true');
      bar.parentNode.insertBefore(sentinelle, bar);
      new IntersectionObserver(
        ([e]) => bar.classList.toggle('is-stuck', !e.isIntersecting),
        { rootMargin: `-${haut + 1}px 0px 0px 0px` },
      ).observe(sentinelle);
    }
    if (!nav) return;

    // Toutes les régions tiennent sur la largeur : plus besoin de défilement
    const mesurer = () => nav.classList.toggle('is-complete', nav.scrollWidth <= nav.clientWidth + 1);
    mesurer();
    window.addEventListener('resize', mesurer, { passive: true });

    // La région qu'on est en train de lire s'allume dans le rail
    const liens = new Map([...nav.querySelectorAll('.vh-ix-nav__link')].map(a => [a.dataset.region, a]));
    const sections = [...root.querySelectorAll('.vh-ix-region')];
    if (!sections.length) return;
    const vus = new Set();
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) vus.add(e.target); else vus.delete(e.target);
      }
      const courant = sections.find(sec => vus.has(sec));
      for (const [code, a] of liens) a.classList.toggle('is-current', Boolean(courant) && code === courant.dataset.region);
    }, { rootMargin: '-40% 0px -50% 0px' });
    sections.forEach(sec => obs.observe(sec));
  }

  function initIndex() {
    const root = $('vh-index');
    if (!root) return;

    const champ = root.querySelector('.vh-ix-search');
    const input = $('vh-ix-q');
    const count = $('vh-ix-count');
    const empty = $('vh-ix-empty');
    const emptyQ = $('vh-ix-empty-q');
    const emptyCta = $('vh-ix-empty-cta');
    const footDemo = $('vh-foot-demo');
    const items = [...root.querySelectorAll('.vh-ville')];
    const regions = [...root.querySelectorAll('.vh-ix-region')];
    const navLinks = [...root.querySelectorAll('.vh-ix-nav__link')];
    const pins = new Map([...root.querySelectorAll('.vh-ixmap__pin')].map(p => [p.dataset.ville, p]));

    // On garde le texte plein sous la main : la recherche le remplace, l'effacer le rend
    for (const meta of root.querySelectorAll('.vh-ix-region__meta')) meta.dataset.full = meta.textContent.trim();
    for (const puce of root.querySelectorAll('.vh-ix-nav__link span')) puce.dataset.total = puce.textContent.trim();

    const carte = initMapZoom();
    initStickyBar(root);
    initLogoPlates(root);

    /* ─── Recherche ─── */
    function filter() {
      const saisie = input ? input.value.trim() : '';
      const q = foldAccents(saisie);
      if (champ) champ.classList.toggle('is-filled', Boolean(input && input.value));
      let visible = 0;
      for (const li of items) {
        const show = !q || (li.dataset.search || '').includes(q);
        li.hidden = !show;
        pins.get(li.dataset.ville)?.classList.toggle('is-dimmed', Boolean(q) && !show);
        if (show) visible++;
      }
      for (const section of regions) {
        const restants = section.querySelectorAll('.vh-ville:not([hidden])').length;
        section.hidden = restants === 0;
        const nav = navLinks.find(a => a.dataset.region === section.dataset.region);
        if (nav) {
          nav.hidden = restants === 0;
          const puce = nav.querySelector('span');
          if (puce) puce.textContent = q ? String(restants) : (puce.dataset.total || puce.textContent);
        }
        // Le titre de région annoncerait sinon 32 villes au-dessus d'une seule
        const meta = section.querySelector('.vh-ix-region__meta');
        if (meta) {
          meta.textContent = q
            ? `${restants} ${restants > 1 ? 'villes' : 'ville'} sur ${meta.dataset.villes}`
            : (meta.dataset.full || meta.textContent);
        }
      }
      if (count) {
        count.textContent = visible === 0 ? 'Aucune ville' : `${visible} ${visible > 1 ? 'villes' : 'ville'}`;
      }
      // Rien trouvé : la démonstration sait construire la carte d'une commune
      // qui n'a pas encore d'espace, et on lui passe le nom déjà tapé.
      if (empty) {
        empty.hidden = visible > 0;
        // Le pied de page proposerait la même chose, mot pour mot
        if (footDemo) footDemo.hidden = visible === 0;
        if (visible === 0) {
          if (emptyQ) emptyQ.textContent = `« ${saisie} »`;
          if (emptyCta) {
            emptyCta.href = `/demo/?q=${encodeURIComponent(saisie)}`;
            emptyCta.querySelector('span').textContent = `Construire la carte de ${saisie}`;
          }
        }
      }
    }

    if (input) {
      let raf = null;
      input.addEventListener('input', () => {
        if (!raf) raf = requestAnimationFrame(() => { raf = null; filter(); });
      });
      // Échap vide le champ : sur une liste filtrée, c'est le geste attendu
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && input.value) { input.value = ''; filter(); }
      });
      filter(); // le navigateur peut avoir restauré une saisie
    }

    /* ─── Carte et liste se répondent ─── */
    const light = (slug, on) => {
      pins.get(slug)?.classList.toggle('is-lit', on);
      root.querySelector(`.vh-ville[data-ville="${CSS.escape(slug)}"] .vh-ville__link`)?.classList.toggle('is-lit', on);
    };
    for (const li of items) {
      const slug = li.dataset.ville;
      li.addEventListener('mouseenter', () => light(slug, true));
      li.addEventListener('mouseleave', () => light(slug, false));
    }
    for (const [slug, pin] of pins) {
      pin.addEventListener('mouseenter', () => light(slug, true));
      pin.addEventListener('mouseleave', () => light(slug, false));
    }
    root.addEventListener('click', (e) => {
      const lien = e.target.closest('.vh-ville__link, .vh-ixmap__pin');
      if (lien) window.OPAnalytics?.capture('city_index_clicked', { depuis: lien.closest('.vh-ixmap') ? 'carte' : 'liste' });
    });
    if (carte) window.addEventListener('hashchange', () => { if (!window.location.hash) carte.reset(); });
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
    initIndex();
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
