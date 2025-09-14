// main.js
// Version globale sans modules ES, utilisant window.supabaseService
;(function(win) {
  // Hotjar (analytics)
  (function(){
    try {
      function ensureHotjar(hjid){
        try {
          if (win._hjSettings && win._hjSettings.hjid === hjid) return;
          if (document.querySelector('script[src*="static.hotjar.com/c/hotjar-"]')) return;
          (function(h,o,t,j,a,r){
              h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
              h._hjSettings={hjid:hjid,hjsv:6};
              a=o.getElementsByTagName('head')[0];
              r=o.createElement('script');r.async=1;
              r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
              a.appendChild(r);
          })(win,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
        } catch(e) {}
      }
      ensureHotjar(6496613);
    } catch(e) { console.warn('Hotjar injection failed', e); }
  })();
  
  // Helper: apply favicon URL
  function applyFavicon(href) {
    try {
      if (!href) return;
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = href;
    } catch (_) {}
  }

  // Swap header and mobile logos based on active city, fetching branding from DB
  async function updateLogoForCity(city) {
    try {
      const targets = [
        document.querySelector('#left-nav .logo img'),
        document.querySelector('.mobile-fixed-logo img')
      ].filter(Boolean);

      // Cache defaults once on first run
      targets.forEach((img) => {
        if (!img) return;
        if (!img.dataset.defaultSrc) {
          const attrSrc = img.getAttribute('src');
          img.dataset.defaultSrc = attrSrc || img.src || 'img/logo.svg';
        }
        if (!img.dataset.defaultAlt) {
          img.dataset.defaultAlt = img.getAttribute('alt') || 'Grands Projets';
        }
        if (!img.dataset.defaultClass) {
          img.dataset.defaultClass = img.className || '';
        }
      });

      // Fetch branding
      let branding = null;
      if (win.supabaseService && typeof win.supabaseService.getCityBranding === 'function' && city) {
        branding = await win.supabaseService.getCityBranding(city);
      }
      win._cityBranding = branding || null;

      const theme = (document.documentElement.getAttribute('data-theme') || 'light').toLowerCase();
      const pickLogo = () => {
        if (branding) {
          if (theme === 'dark' && branding.dark_logo_url) return branding.dark_logo_url;
          return branding.logo_url || null;
        }
        return null;
      };

      const picked = pickLogo();
      const altText = (branding && branding.brand_name) ? branding.brand_name : (city ? city.charAt(0).toUpperCase() + city.slice(1) : (targets[0]?.dataset?.defaultAlt || ''));

      targets.forEach((img) => {
        if (!img) return;
        // Always keep existing classes (unify)
        if (img.dataset.defaultClass) img.className = img.dataset.defaultClass;

        if (picked) {
          img.style.display = '';
          img.onerror = function() {
            try {
              img.onerror = null;
              // Fallback to embedded default logo if remote fails
              img.src = img.dataset.defaultSrc;
              img.alt = img.dataset.defaultAlt || '';
              img.style.display = '';
            } catch (_) {}
          };
          img.src = picked;
          img.alt = altText;
        } else {
          // No branding: show embedded default logo
          img.onerror = null;
          img.src = img.dataset.defaultSrc;
          img.alt = img.dataset.defaultAlt || '';
          img.style.display = '';
        }
      });

      // Favicon
      if (branding && branding.favicon_url) applyFavicon(branding.favicon_url);
    } catch (_) { /* noop */ }
  }
  // Vérifie que supabaseService est bien chargé
  if (!win.supabaseService) {
    console.error('supabaseService manquant : assurez-vous de charger supabaseService.js avant main.js');
    return;
  }

  // Récupérer supabaseService sans perdre le contexte `this`
  const supabaseService = win.supabaseService;
  // Ces modules seront récupérés dynamiquement dans initApp après que tous les scripts soient bien chargés

  // -------------------- ModalManager (logic only, design unchanged) --------------------
  const ModalManager = (() => {
    const stack = [];
    let escBound = false;
    let escHandler = null;

    function el(id) { return document.getElementById(id); }
    function isOpen(id) {
      const e = el(id);
      return !!(e && getComputedStyle(e).display !== 'none');
    }
    function top() { return stack[stack.length - 1] || null; }

    function ensureOnTop(e) {
      try { document.body.appendChild(e); } catch (_) {}
    }

    function show(id) {
      const overlay = el(id);
      if (!overlay) return false;
      ensureOnTop(overlay);
      overlay.style.display = 'flex';
      overlay.setAttribute('aria-hidden', 'false');
      // prevent background scroll only on first modal
      if (stack.length === 0) { try { document.body.style.overflow = 'hidden'; } catch (_) {} }
      // Focus close button if present
      try { (overlay.querySelector('#' + id.replace('-overlay','') + '-close') || overlay.querySelector('.gp-modal-close'))?.focus(); } catch(_){}
      // Click outside → close topmost
      if (!overlay._mm_clickOutside) {
        overlay._mm_clickOutside = (ev) => {
          const panel = overlay.querySelector('.gp-modal');
          if (!panel || !panel.contains(ev.target)) {
            const t = top(); if (t && t.el === overlay) close(id);
          }
        };
        overlay.addEventListener('click', overlay._mm_clickOutside);
      }
      // ESC → close topmost
      if (!escBound) {
        escHandler = (ev) => { if (ev.key === 'Escape') { const t = top(); if (t) close(t.id); } };
        document.addEventListener('keydown', escHandler);
        escBound = true;
      }
      stack.push({ id, el: overlay });
      return true;
    }

    function hide(id) {
      const overlay = el(id);
      if (!overlay) return;
      // if focus inside, move to body
      try { if (overlay.contains(document.activeElement)) { document.body.focus(); } } catch(_){}
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      const idx = stack.findIndex(x => x.id === id);
      if (idx >= 0) stack.splice(idx, 1);
      if (stack.length === 0) {
        try { document.body.style.overflow = ''; } catch (_) {}
        if (escBound && escHandler) { document.removeEventListener('keydown', escHandler); escBound = false; escHandler = null; }
      }
    }

    function open(id) { return show(id); }
    function close(id) { return hide(id); }
    function switchTo(fromId, toId) { show(toId); hide(fromId); }

    return { open, close, switch: switchTo, isOpen, top };
  })();
  // ---- Thème (clair/sombre) : gestion simple avec persistance ----
  function getInitialTheme() {
    const prefersDark = win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const root = document.documentElement; // <html>
    root.setAttribute('data-theme', theme);
    // Mettre à jour l'icône/label du bouton si présent
    const iconEl = document.querySelector('#theme-toggle i');
    if (iconEl) {
      iconEl.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    const toggleEl = document.getElementById('theme-toggle');
    if (toggleEl) {
      toggleEl.title = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
      toggleEl.setAttribute('aria-label', toggleEl.title);
      toggleEl.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
  }

  // Trouve un fond de carte adapté au thème courant
  function findBasemapForTheme(theme) {
    const list = window.basemaps || [];
    if (!Array.isArray(list) || list.length === 0) return null;
    const lc = (s) => String(s || '').toLowerCase();

    // 1) Propriété explicite `theme` si fournie par la base ("dark" | "light")
    let bm = list.find(b => lc(b.theme) === theme);
    if (bm) return bm;

    // 2) Heuristiques sur les labels/noms
    const darkKeys = ['dark', 'noir', 'sombre', 'night', 'nuit'];
    const lightKeys = ['light', 'clair', 'day', 'jour', 'positron', 'osm', 'streets', 'standard'];
    const keys = theme === 'dark' ? darkKeys : lightKeys;
    bm = list.find(b => keys.some(k => lc(b.label).includes(k) || lc(b.name).includes(k)));
    if (bm) return bm;

    return null;
  }

  // Applique le fond de carte correspondant au thème s'il est disponible
  function syncBasemapToTheme(theme) {
    try {
      const bm = findBasemapForTheme(theme);
      if (!bm) return;
      const layer = L.tileLayer(bm.url, { attribution: bm.attribution });
      if (window.MapModule?.setBaseLayer) {
        window.MapModule.setBaseLayer(layer);
      }
      if (window.UIModule?.setActiveBasemap) {
        window.UIModule.setActiveBasemap(bm.label);
      }
    } catch (e) {
      console.warn('syncBasemapToTheme: erreur lors du changement de fond de carte', e);
    }
  }

  function initTheme() {
    // Si l'utilisateur a déjà une préférence explicite, l'appliquer
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') {
        applyTheme(stored);
        return;
      }
    } catch (_) {}
    // Sinon, utiliser la préférence système
    const initial = getInitialTheme();
    applyTheme(initial);
  }

  // Synchronisation avec la préférence système lorsque l'utilisateur
  // n'a pas enregistré de préférence explicite (localStorage)
  let osThemeMediaQuery = null;
  let osThemeHandler = null;
  function hasSavedPreference() {
    try {
      const v = localStorage.getItem('theme');
      return v === 'dark' || v === 'light';
    } catch (_) { return false; }
  }

  function startOSThemeSync() {
    try {
      // Ne pas synchroniser avec l'OS si l'utilisateur a choisi un thème explicite
      if (hasSavedPreference()) return;
      if (!win.matchMedia) return;
      if (!osThemeMediaQuery) {
        osThemeMediaQuery = win.matchMedia('(prefers-color-scheme: dark)');
      }
      const applyFromOS = () => {
        const next = osThemeMediaQuery.matches ? 'dark' : 'light';
        applyTheme(next);
        // Tenter d'aligner le fond de carte si disponible
        try { syncBasemapToTheme(next); } catch (_) {}
        // Mettre à jour le logo selon le thème (dark_logo_url si dispo)
        try { updateLogoForCity(win.activeCity); } catch (_) {}
      };
      // Appliquer immédiatement l'état courant
      applyFromOS();
      // Écouter les changements
      osThemeHandler = applyFromOS;
      if (typeof osThemeMediaQuery.addEventListener === 'function') {
        osThemeMediaQuery.addEventListener('change', osThemeHandler);
      } else if (typeof osThemeMediaQuery.addListener === 'function') {
        osThemeMediaQuery.addListener(osThemeHandler);
      }
    } catch (_) {}
  }

  function stopOSThemeSync() {
    try {
      if (!osThemeMediaQuery) return;
      if (osThemeHandler) {
        if (typeof osThemeMediaQuery.removeEventListener === 'function') {
          osThemeMediaQuery.removeEventListener('change', osThemeHandler);
        } else if (typeof osThemeMediaQuery.removeListener === 'function') {
          osThemeMediaQuery.removeListener(osThemeHandler);
        }
      }
      osThemeMediaQuery = null;
      osThemeHandler = null;
    } catch (_) {}
  }

  // --- City detection via query param ?city=... ---
  // Returns '' when missing or invalid so callers can fallback to default assets
  function getCityFromQuery(defaultCity = '') {
    try {
      const sp = new URLSearchParams(location.search);
      const raw = String(sp.get('city') || '').toLowerCase().trim();
      // Traitement spécial: ?city=default force l'absence de ville
      if (raw === 'default') return '';
      return isValidCity(raw) ? raw : '';
    } catch (_) {
      return '';
    }
  }

  // Raw helpers to detect explicit intent even if invalid
  function getRawCityFromQueryParam() {
    try {
      const sp = new URLSearchParams(location.search);
      const raw = String(sp.get('city') || '').toLowerCase().trim();
      // Aligner 'default' sur une chaîne vide ABSOLUMENT partout
      if (raw === 'default') return '';
      return raw;
    } catch (_) { return ''; }
  }

  // --- Helpers de persistance et détection de ville ---
  // Sera alimenté dynamiquement par la base (city_branding/layers/contribution_uploads)
  let VALID_CITIES = new Set();
  function isValidCity(city) {
    try { return VALID_CITIES.has(String(city || '').toLowerCase()); } catch (_) { return false; }
  }

  function parseCityFromPath(pathname) {
    try {
      const path = String(pathname || location.pathname || '').toLowerCase();
      const first = path.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] || '';
      return isValidCity(first) ? first : '';
    } catch (_) { return ''; }
  }

  function getRawCityFromPathRaw(pathname) {
    try {
      const path = String(pathname || location.pathname || '').toLowerCase();
      return path.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] || '';
    } catch (_) { return ''; }
  }

  function persistCity(city) {
    try { if (isValidCity(city)) localStorage.setItem('activeCity', city); } catch (_) {}
  }

  function restoreCity() {
    try {
      const v = localStorage.getItem('activeCity');
      return isValidCity(v) ? v : '';
    } catch (_) { return ''; }
  }

  // Supprime la ville persistée quand elle est absente ou invalide
  function clearPersistedCity() {
    try { localStorage.removeItem('activeCity'); } catch (_) {}
  }

  // Charge dynamiquement les villes valides depuis la base
  async function loadValidCities() {
    try {
      if (!win.supabaseService || typeof win.supabaseService.getValidCities !== 'function') return;
      const list = await win.supabaseService.getValidCities();
      if (Array.isArray(list) && list.length) {
        VALID_CITIES = new Set(list.map(v => String(v || '').toLowerCase().trim()).filter(Boolean));
      }
    } catch (_) { /* keep fallback */ }
  }

  // Ville par défaut dynamique à partir de VALID_CITIES
  function getDefaultCity() {
    // Suppression de la notion de ville par défaut: aucune ville si rien n'est précisé
    return '';
  }

  function resolveActiveCity() {
    const routeCity = parseCityFromPath(location.pathname);
    if (routeCity) return routeCity;
    const queryCity = getCityFromQuery('');
    if (queryCity) return queryCity;
    const saved = restoreCity();
    // Ne plus retomber sur une ville par défaut; si rien n'est valide, aucune ville active
    return saved;
  }

  // Set initial map view per city using DB-provided branding (safe no-op if unavailable)
  function applyCityInitialView(city) {
    try {
      const branding = win._cityBranding || null; // rempli par updateLogoForCity(city)
      const hasCoords = branding && typeof branding.center_lat === 'number' && typeof branding.center_lng === 'number';
      const hasZoom   = branding && typeof branding.zoom === 'number';
      if (!hasCoords || !hasZoom) return; // pas de coordonnées configurées: ne rien changer
      const center = [branding.center_lat, branding.center_lng];
      const zoom   = branding.zoom;
      if (window.MapModule?.map?.setView) {
        window.MapModule.map.setView(center, zoom);
      }
    } catch (_) { /* noop */ }
  }

  // --- City Toggle UI (top-right) ---
  let _cityMenuOpen = false;
  let _cityMenuDocHandler = null;
  const CITY_BRANDING_CACHE = new Map(); // ville -> { brand_name, logo_url, dark_logo_url }

  async function getCityBrandingSafe(ville) {
    const key = String(ville || '').toLowerCase();
    if (!key) return null;
    if (CITY_BRANDING_CACHE.has(key)) return CITY_BRANDING_CACHE.get(key);
    try {
      const data = await (win.supabaseService?.getCityBranding ? win.supabaseService.getCityBranding(key) : null);
      const minimal = data ? {
        ville: data.ville || key,
        brand_name: data.brand_name || '',
        logo_url: data.logo_url || '',
        dark_logo_url: data.dark_logo_url || ''
      } : null;
      CITY_BRANDING_CACHE.set(key, minimal);
      return minimal;
    } catch(e) {
      CITY_BRANDING_CACHE.set(key, null);
      return null;
    }
  }

  async function renderCityMenu(activeCity) {
    try {
      const menu = document.getElementById('city-menu');
      if (!menu) return;
      const items = Array.from(VALID_CITIES.values()).sort();
      if (!items.length) { menu.innerHTML = ''; return; }

      // Fetch branding for all cities in parallel (cached)
      const brandings = await Promise.all(items.map(c => getCityBrandingSafe(c)));
      const btns = items.map((c, idx) => {
        const isActive = String(c) === String(activeCity);
        const b = brandings[idx] || {};
        const displayName = (b.brand_name && b.brand_name.trim()) ? b.brand_name : (c.charAt(0).toUpperCase() + c.slice(1));
        const logo = (document.documentElement.getAttribute('data-theme') === 'dark' && b.dark_logo_url) ? b.dark_logo_url : (b.logo_url || '');
        const logoImg = logo ? `<img src="${logo}" alt="${displayName} logo" loading="lazy" />` : `<i class=\"fas fa-city\" aria-hidden=\"true\"></i>`;
        // Disable interaction: coming soon
        return (
          `<button class="city-item${isActive ? ' active' : ''} is-disabled" data-city="${c}" role="menuitem" aria-label="${displayName}" aria-disabled="true" disabled tabindex="-1" style="pointer-events:none; cursor:not-allowed;">`+
            `<div class="city-card">`+
              `<div class="city-logo">${logoImg}</div>`+
              `<div class="city-text">`+
                `<div class="city-name">${displayName}</div>`+
                `<div class="city-soon">Bientôt disponible</div>`+
              `</div>`+
            `</div>`+
          `</button>`
        );
      }).join('');
      // Propose city highlighted card
      const propose = `
        <div id="propose-city-card" class="propose-city-card" role="button" tabindex="0" aria-label="Proposer ma structure">
          <div class="city-logo"><i class="fas fa-plus" aria-hidden="true"></i></div>
          <div class="city-text">
            <div class="city-name">Proposer ma structure</div>
            <div class="city-subline">Utilisez grandsprojets pour donner de la visibilité à vos actions locales.</div>
          </div>
        </div>`;
      // City grid
      const grid = `<div class="city-grid" role="menu" aria-label="Villes disponibles (bientôt)">${btns}</div>`;
      menu.innerHTML = propose + grid;
      // Attach handler for propose-city card
      const proposeCard = document.getElementById('propose-city-card');
      if (proposeCard) {
        const open = (e) => { e.stopPropagation(); openProposeCityModal(); };
        proposeCard.addEventListener('click', open);
        proposeCard.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
        });
      }
    } catch (_) { /* noop */ }
  }

  function openProposeCityModal() {
    const overlay = document.getElementById('propose-city-overlay');
    if (!overlay) return;
    // If city modal is open, switch; otherwise open directly
    if (ModalManager.isOpen('city-overlay')) {
      ModalManager.switch('city-overlay', 'propose-city-overlay');
    } else {
      ModalManager.open('propose-city-overlay');
    }
    // Bind close button once
    const closeBtn = document.getElementById('propose-city-close');
    if (closeBtn && !closeBtn._mm_bound) { closeBtn.addEventListener('click', () => ModalManager.close('propose-city-overlay')); closeBtn._mm_bound = true; }
  }

  function closeProposeCityModal() {
    const overlay = document.getElementById('propose-city-overlay');
    if (!overlay) return;
    ModalManager.close('propose-city-overlay');
  }

  // Crée dynamiquement la modale ville si absente (fallback robuste)
  function ensureCityOverlayExists() {
    let overlay = document.getElementById('city-overlay');
    if (overlay) return overlay;
    try {
      overlay = document.createElement('div');
      overlay.id = 'city-overlay';
      overlay.className = 'gp-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'city-title');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.display = 'none';
      overlay.innerHTML = [
        '<div class="gp-modal" role="document">',
        '  <div class="gp-modal-header">',
        '    <div class="gp-modal-title" id="city-title">Changer de ville<\/div>',
        '    <button class="gp-modal-close" id="city-close" aria-label="Fermer">&times;<\/button>',
        '  <\/div>',
        '  <div class="gp-modal-body">',
        '    <div id="city-menu" role="menu" aria-label="Villes disponibles"><\/div>',
        '  <\/div>',
        '<\/div>'
      ].join('');
      document.body.appendChild(overlay);
      // Bind fermeture sur overlay click
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCityMenu(); });
      // Bouton fermer
      const closeBtn = overlay.querySelector('#city-close');
      if (closeBtn && !closeBtn._agp_bound) { closeBtn.addEventListener('click', closeCityMenu); closeBtn._agp_bound = true; }
      return overlay;
    } catch (e) {
      console.error('[city] Impossible de créer #city-overlay dynamiquement', e);
      return null;
    }
  }

  function openCityMenu() {
    let overlay = document.getElementById('city-overlay');
    if (!overlay) {
      console.warn('[city] #city-overlay introuvable – création dynamique');
      overlay = ensureCityOverlayExists();
    }
    if (!overlay) { console.error('[city] #city-overlay toujours introuvable'); return; }
    const modal = overlay.querySelector('.gp-modal');
    // Rendre le contenu si vide (sécurité)
    try {
      const menu = document.getElementById('city-menu');
      if (menu && !menu.hasChildNodes()) {
        // Utiliser la ville active courante
        console.debug('[city] Render menu (lazy)');
        renderCityMenu(win.activeCity || '');
      }
    } catch (_) {}
    console.debug('[city] Ouverture de la modale ville');
    ModalManager.open('city-overlay');
    _cityMenuOpen = true;
    // Bouton fermer
    const closeBtn = document.getElementById('city-close');
    if (closeBtn && !closeBtn._mm_bound) { closeBtn.addEventListener('click', closeCityMenu); closeBtn._mm_bound = true; }
    // Petite animation d'ouverture
    requestAnimationFrame(() => { if (modal) modal.classList.add('is-open'); });
    // Focus sur le bouton fermer pour accessibilité
    try { document.getElementById('city-close')?.focus(); } catch (_) {}
  }
  function closeCityMenu() {
    const overlay = document.getElementById('city-overlay');
    if (!overlay) return;
    const modal = overlay.querySelector('.gp-modal');
    if (modal) modal.classList.remove('is-open');
    ModalManager.close('city-overlay');
    _cityMenuOpen = false;
    // plus de binds doc-level ici: géré par ModalManager
  }

  function toggleCityMenu() { _cityMenuOpen ? closeCityMenu() : openCityMenu(); }
  function escCloseCityMenu(e) { if (e.key === 'Escape') closeCityMenu(); }

  function selectCity(next) {
    try {
      const city = String(next || '').toLowerCase();
      if (!isValidCity(city)) return;
      persistCity(city);
      if (city === win.activeCity) { closeCityMenu(); return; }
      // Update UI immediately while navigating
      win.activeCity = city;
      try { updateLogoForCity(city); } catch (_) {}
      closeCityMenu();
      // Navigate to base path with ?city=<city> (preserve other query params, handle subdirs)
      const path = String(location.pathname || '/');
      const segments = path.split('/');
      // Remove a trailing city segment if present to compute base dir
      let lastIdx = -1;
      for (let i = segments.length - 1; i >= 0; i--) { if (segments[i]) { lastIdx = i; break; } }
      let baseDir;
      if (lastIdx >= 0 && isValidCity(String(segments[lastIdx]).toLowerCase())) {
        baseDir = segments.slice(0, lastIdx).join('/') + '/';
      } else {
        // Ensure trailing slash for a directory-like base
        baseDir = path.endsWith('/') ? path : (path + '/');
      }
      const sp = new URLSearchParams(location.search);
      sp.set('city', city);
      const target = baseDir + (sp.toString() ? `?${sp.toString()}` : '');
      location.href = target;
    } catch (_) { /* noop */ }
  }

  async function initCityToggleUI(activeCity) {
    try {
      const toggle = document.getElementById('city-toggle');
      if (!toggle) {
        console.warn('[city] Bouton #city-toggle introuvable');
        return;
      }
      console.debug('[city] Binding click/keyboard sur #city-toggle');
      toggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); console.debug('[city] click #city-toggle'); openCityMenu(); });
      toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); console.debug('[city] keydown open'); openCityMenu(); }
      });
      await renderCityMenu(activeCity);
    } catch (_) { /* noop */ }
  }

  async function initApp() {
    try {
      // Initialiser le thème le plus tôt possible (n'affecte pas le basemap)
      initTheme();
      // Charger dynamiquement la liste des villes valides avant de résoudre la ville active
      await loadValidCities();

      // Rediriger /<city> -> base index avec ?city=<city> (aucune donnée en dur)
      // Gère aussi les déploiements en sous-répertoire, ex: /app/lyon -> /app/?city=lyon
      (function maybeRedirectCityPathToQuery() {
        try {
          const path = String(location.pathname || '/');
          // Découper en segments en gardant les vides de tête/queue pour reconstruire la base
          const segments = path.split('/');
          // Trouver le dernier segment non vide
          let lastIdx = -1;
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i]) { lastIdx = i; break; }
          }
          if (lastIdx < 0) return; // racine
          const lastSeg = segments[lastIdx].toLowerCase();
          if (!isValidCity(lastSeg)) return; // le dernier segment n'est pas une ville valide
          // S'assurer qu'il n'y a pas d'autre segment utile après (par construction, lastIdx est le dernier non vide)
          const sp = new URLSearchParams(location.search);
          sp.set('city', lastSeg);
          // Base dir = tout avant le dernier segment, toujours se terminer par '/'
          const baseDir = segments.slice(0, lastIdx).join('/') + '/';
          const target = baseDir + (sp.toString() ? `?${sp.toString()}` : '');
          const absolute = location.origin + target;
          if (absolute !== location.href) {
            location.replace(absolute);
          }
        } catch (_) { /* noop */ }
      })();

      // Déterminer la ville active (priorité: chemin > query > localStorage > défaut)
      // Avant toute chose: si l'utilisateur a fourni une ville explicite (query/path) mais invalide, on nettoie.
      const rawQueryCity = getRawCityFromQueryParam();
      const rawPathCity  = getRawCityFromPathRaw();
      const hasExplicitCity = !!(rawQueryCity || rawPathCity);
      // Détecter la présence explicite du paramètre ?city= (même vide) et le cas 'default'
      const spForDetect = new URLSearchParams(location.search);
      const cityParamPresent = spForDetect.has('city');
      const rawCityExact = String(spForDetect.get('city') || '').toLowerCase().trim();
      const explicitNoCity = cityParamPresent && (rawCityExact === '' || rawCityExact === 'default');
      if ((rawQueryCity && !isValidCity(rawQueryCity)) || (rawPathCity && !isValidCity(rawPathCity))) {
        // Si une ville explicite est fournie mais invalide, on nettoie.
        clearPersistedCity();
      }

      let city = resolveActiveCity();
      // Forcer "aucune ville" quand ?city= (vide) ou ?city=default est passé explicitement
      if (explicitNoCity) {
        city = '';
        win.activeCity = '';
        // Nettoyer la persistance pour que la page reflète bien l'absence de ville
        try { clearPersistedCity(); } catch (_) {}
      } else {
        win.activeCity = city;
      }
      // Persistance/Nettoyage:
      // - Si ville valide ET explicitement demandée (query/path) -> persister
      // - Si ville valide mais par défaut -> ne pas persister
      // - Si invalide/vide -> nettoyer
      try {
        if (!explicitNoCity) {
          if (city && isValidCity(city)) {
            // Persister la ville même si elle n'est pas explicitement fournie dans l'URL,
            // afin de la conserver au rafraîchissement.
            if (restoreCity() !== city) persistCity(city);
          } else {
            clearPersistedCity();
          }
        }
      } catch (_) {}
      // Update logos to match current city branding
      updateLogoForCity(city);
      // Init City toggle UI and menu
      initCityToggleUI(city);

      // 1️⃣ Charger toutes les données en une seule fois (contexte préservé)
      const {
        layersConfig,
        metroColors,
        filtersConfig,
        basemaps: remoteBasemaps
      } = await supabaseService.initAllData(city);

      // Rendre les couleurs de lignes métro disponibles
      window.dataConfig = window.dataConfig || {};
      window.dataConfig.metroColors = metroColors;

      // Mettre à jour les fonds de carte via UIModule (filtrés par ville si applicable)
      const basemapsToUse = (remoteBasemaps && remoteBasemaps.length > 0) ? remoteBasemaps : window.basemaps;
      const basemapsForCity = (basemapsToUse || []).filter(b => !b || !('ville' in b) || !b.ville || b.ville === city);

      if (window.UIModule?.updateBasemaps) {
        window.UIModule.updateBasemaps(basemapsForCity);
      } else {
        console.warn('UIModule.updateBasemaps non disponible');
      }
      
      // Initialiser la couche de base
      window.MapModule.initBaseLayer();

      // Synchroniser le fond de carte avec le thème courant (si un fond correspondant existe)
      syncBasemapToTheme(document.documentElement.getAttribute('data-theme') || getInitialTheme());
      // Appliquer la vue initiale selon la ville
      applyCityInitialView(city);

      // Initialiser le module de géolocalisation
      
      if (window.GeolocationModule) {
        window.GeolocationModule.init(window.MapModule.map);
      } else {
        console.warn('❌ ERREUR: GeolocationModule non chargé');
      }

      // Récupération dynamique des modules après chargement complet
      const {
        DataModule,
        MapModule,
        EventBindings,
        NavigationModule
      } = win;


      // 2️⃣ Construire les maps de couches (filtrées par ville si colonne "ville" présente)
      const urlMap        = {};
      const styleMap      = {};
      const defaultLayers = [];
      layersConfig.forEach(({ name, url, style, is_default, ville }) => {
        if (ville && ville !== city) return; // ignorer les couches d'une autre ville
        urlMap[name]   = url;
        styleMap[name] = style;
        if (is_default) defaultLayers.push(name);
      });
      
      // Injecter les styles pour les couches exclues (style uniquement, pas d'URL)
      try {
        const excludedStyleOnly = ['voielyonnaise', 'reseauProjeteSitePropre', 'urbanisme'];
        if (Array.isArray(excludedStyleOnly) && typeof supabaseService?.fetchLayerStylesByNames === 'function') {
          const extraStyles = await supabaseService.fetchLayerStylesByNames(excludedStyleOnly);
          Object.entries(extraStyles || {}).forEach(([lname, st]) => {
            if (!styleMap[lname] && st) {
              styleMap[lname] = st;
            }
          });
        }
      } catch (e) {
        console.warn('Impossible d\'injecter les styles des couches exclues:', e);
      }
      
      // Exposer defaultLayers globalement pour qu'il soit accessible depuis d'autres modules
      win.defaultLayers = defaultLayers;

      // Centraliser les couches par défaut par catégorie pour éviter la duplication
      win.CATEGORY_DEFAULT_LAYERS = {
        transport: ['metroFuniculaire', 'tramway', 'reseauProjeteSitePropre'],
        velo: ['planVelo', 'voielyonnaise'],
        urbanisme: ['urbanisme'],
        travaux: ['travaux']
      };

      // 3️⃣ Initialiser DataModule et charger les couches par défaut
      DataModule.initConfig({ city, urlMap, styleMap, defaultLayers });
      defaultLayers.forEach(layer => DataModule.loadLayer(layer));

      // 3️⃣.b Charger les couches de contributions pour afficher toutes les contributions par défaut
      // Ces couches sont exclues de layersConfig côté URL, mais leurs styles ont été injectés ci-dessus.
      // Le chargement s'appuie sur contribution_uploads et respecte la ville active via supabaseService.
      try {
        const contributionLayers = ['urbanisme', 'voielyonnaise', 'reseauProjeteSitePropre'];
        contributionLayers.forEach(l => {
          try { DataModule.loadLayer(l); } catch (_) { /* noop */ }
        });
      } catch (_) { /* noop */ }

      // 4️⃣ Construction et mise à jour des filtres
      populateFilters();
      updateFilterUI();
      updateFilterCount();

      window.updateFilterUI    = updateFilterUI;
      window.updateFilterCount = updateFilterCount;


      const filterContainer = document.getElementById('dynamic-filters');
      if (filterContainer) {
        new MutationObserver(() => {
          updateFilterUI();
          updateFilterCount();
        }).observe(filterContainer, {
          attributes: true,
          subtree: true,
          attributeFilter: ['class']
        });
      }

      // 5️⃣ Préchargement des couches, bindings et menus
      if (DataModule.preloadLayer) {
        Object.keys(urlMap).forEach(layer => DataModule.preloadLayer(layer));
      }
      EventBindings.bindFilterControls();
      
      // Initialisation des modules UI avec les fonds de carte si disponibles
      if (window.UIModule?.init) {
        window.UIModule.init({
          basemaps: basemapsForCity
        });
      } else {
        console.warn('UIModule.init non disponible');
      }
      
      // Initialiser le module de recherche d'adresse
      if (window.SearchModule?.init) {
        window.SearchModule.init(window.MapModule.map);
      } else {
        console.warn('SearchModule non disponible');
      }
      
      // Configuration des gestionnaires d'événements
      const filtersToggle = document.getElementById('filters-toggle');
      const basemapToggle = document.getElementById('basemap-toggle');
      const themeToggle   = document.getElementById('theme-toggle');
      
      if (filtersToggle) {
        filtersToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          window.UIModule?.togglePopup('filter');
        });
      }
      
      if (basemapToggle) {
        basemapToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          window.UIModule?.togglePopup('basemap');
        });
      }

      // À propos: ouverture/fermeture du modal
      const infoToggle    = document.getElementById('info-toggle');
      const aboutOverlay  = document.getElementById('about-overlay');
      const aboutClose    = document.getElementById('about-close');
      const aboutModal    = aboutOverlay ? aboutOverlay.querySelector('.gp-modal') : null;
      let aboutLastFocus  = null;
      let aboutCloseTimer = null;

      const closeAbout = () => {
        if (!aboutOverlay) return;
        if (aboutCloseTimer) { clearTimeout(aboutCloseTimer); aboutCloseTimer = null; }
        // play closing transition
        if (aboutModal) aboutModal.classList.remove('is-open');
        aboutOverlay.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', escHandler);
        document.body.style.overflow = '';
        // hide after transition
        aboutCloseTimer = setTimeout(() => {
          aboutOverlay.style.display = 'none';
          if (aboutLastFocus && typeof aboutLastFocus.focus === 'function') {
            try { aboutLastFocus.focus(); } catch (_) {}
          }
        }, 180);
      };

      const openAbout = () => {
        if (!aboutOverlay) return;
        if (aboutCloseTimer) { clearTimeout(aboutCloseTimer); aboutCloseTimer = null; }
        aboutLastFocus = document.activeElement;
        aboutOverlay.style.display = 'flex';
        aboutOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        // animate in on next frame
        requestAnimationFrame(() => {
          if (aboutModal) aboutModal.classList.add('is-open');
        });
        // focus sur le bouton fermer
        if (aboutClose && typeof aboutClose.focus === 'function') {
          try { aboutClose.focus(); } catch (_) {}
        }
        document.addEventListener('keydown', escHandler);
      };

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAbout();
        }
      };

      if (infoToggle) {
        infoToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          openAbout();
        });
      }
      if (aboutClose) {
        aboutClose.addEventListener('click', (e) => {
          e.stopPropagation();
          closeAbout();
        });
      }
      if (aboutOverlay) {
        aboutOverlay.addEventListener('click', (e) => {
          // Fermer si clic en dehors de la boîte de dialogue
          if (e.target === aboutOverlay) {
            closeAbout();
          }
        });
      }
      
      // Gestion du basculement du thème (sans modifier automatiquement le fond de carte)
      if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const current = document.documentElement.getAttribute('data-theme') || 'light';
          const next = current === 'dark' ? 'light' : 'dark';
          applyTheme(next);
          // Aligner automatiquement le fond de carte sur le thème choisi
          syncBasemapToTheme(next);
          // Actualiser le logo (dark vs light)
          updateLogoForCity(win.activeCity);
          // Persister le choix utilisateur et désactiver la synchro OS
          try { localStorage.setItem('theme', next); } catch(_) {}
          try { stopOSThemeSync(); } catch(_) {}
        });

        // Accessibilité clavier: Enter/Space pour activer le bouton
        themeToggle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            themeToggle.click();
          }
        });
      }

      // Démarrer la synchro avec l'OS en permanence
      startOSThemeSync();
      
      // Gestion du clic sur le logo
      function handleLogoClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Trouver la catégorie active
        let activeCategory = null;
        const activeTab = document.querySelector('.nav-category.active');
        if (activeTab) {
          activeCategory = activeTab.id.replace('nav-', '');
        }
        
        // Vérifier si NavigationModule est disponible
        if (window.NavigationModule?.resetToDefaultView) {
          window.NavigationModule.resetToDefaultView(activeCategory);
        } else {
          console.warn('NavigationModule.resetToDefaultView non disponible');
        }
        
        return false;
      }
      
      // Gestion du clic sur le conteneur du logo
      const logoContainer = document.querySelector('#left-nav .logo');
      
      if (logoContainer) {
        logoContainer.addEventListener('click', handleLogoClick, false); // Changé à false pour la phase de bouillonnement
        
        // Gestion spécifique du clic sur l'image du logo
        const logoImg = logoContainer.querySelector('img');
        
        if (logoImg) {
          logoImg.style.pointerEvents = 'none';
        }
      }

      // Exposition de NavigationModule et ajout du gestionnaire de clic (robuste aux features incomplètes)
      window.handleFeatureClick = function(feature, layerName) {
        try {
          console.log('Feature cliquée:', feature, 'Layer:', layerName);
          const p = (feature && feature.properties) || {};
          const projectName = p.name || p.Name || p.LIBELLE;
          
          if (!projectName) {
            console.warn('handleFeatureClick: nom de projet introuvable', { feature });
            return;
          }

          const category = getCategoryFromLayer(layerName);
          console.log('Ouverture du projet:', { projectName, category });
          
          // Préférer UIModule pour gérer l'historique et l'UI
          if (window.UIModule?.showDetailPanel) {
            window.UIModule.showDetailPanel(layerName, feature);
          } 
          // Sinon, fallback sur NavigationModule
          else if (typeof NavigationModule !== 'undefined' && NavigationModule.showProjectDetail) {
            NavigationModule.showProjectDetail(projectName, category);
          } else if (window.NavigationModule?.showProjectDetail) {
            window.NavigationModule.showProjectDetail(projectName, category);
          }
          // Sinon, essayer de trouver le panneau de détail et de le remplir manuellement
          else {
            console.warn('NavigationModule non disponible, tentative de chargement manuel');
            const detailPanel = document.getElementById('project-detail');
            const detailContent = document.getElementById('detail-content');
            
            if (detailPanel && detailContent) {
              // Afficher le panneau
              detailPanel.style.display = 'block';
              detailPanel.dataset.category = category;
              
              // Récupérer les détails du projet
              detailContent.innerHTML = `# ${projectName}\n\nAucun détail disponible pour ce projet.`;
            } else {
              console.error('Impossible de trouver le panneau de détail');
            }
          }
        } catch (e) {
          console.error('handleFeatureClick: erreur inattendue', e);
        }
      };
      
      // Exposer la fonction pour qu'elle soit disponible globalement
      window.getCategoryFromLayer = getCategoryFromLayer;
      // Exposer la ville active (fallback dynamique)
      window.getActiveCity = () => (parseCityFromPath(location.pathname) || getCityFromQuery('') || restoreCity() || win.activeCity || getDefaultCity());

      // --- Navigation via paramètres d'URL (cat, project) ---
      function parseUrlState() {
        try {
          const sp = new URLSearchParams(location.search);
          const rawCat = String(sp.get('cat') || '').toLowerCase().trim();
          const project = String(sp.get('project') || '').trim();
          if (!rawCat || !project) return null;
          const cat = rawCat === 'mobilite' ? 'transport' : rawCat;
          return { cat, project };
        } catch (_) { return null; }
      }

      function resolveSearchLayersByCategory(cat) {
        switch (cat) {
          case 'velo': return ['voielyonnaise'];
          case 'urbanisme': return ['urbanisme'];
          case 'transport': return ['reseauProjeteSitePropre', 'tramway', 'metroFuniculaire'];
          case 'travaux': return ['travaux'];
          default: return [];
        }
      }

      async function showFromUrlState({ cat, project }) {
        if (!cat || !project) return false;
        const layers = resolveSearchLayersByCategory(cat);
        if (!layers.length) return false;
        for (const ln of layers) {
          try {
            const feat = await DataModule.findFeatureByProjectName(ln, project);
            if (feat) {
              if (window.UIModule?.showDetailPanel) {
                window.UIModule.showDetailPanel(ln, feat, { updateHistory: false });
              } else if (window.NavigationModule?.showProjectDetail) {
                const props = feat.properties || {};
                const name = props.project_name || props.name || props.Name || props.line || props.LIBELLE;
                window.NavigationModule.showProjectDetail(name, cat, null, props);
              }
              return true;
            }
          } catch (_) {}
        }
        console.warn('Aucune feature trouvée pour', { cat, project });
        return false;
      }

      // Traiter l'état initial de l'URL si présent
      try {
        const initial = parseUrlState();
        if (initial) {
          await showFromUrlState(initial);
        }
      } catch (_) { /* noop */ }

      // Gérer la navigation arrière/avant du navigateur
      window.addEventListener('popstate', async (e) => {
        try {
          // Recalculer la ville active (priorité: chemin > query > localStorage)
          const nextCity = resolveActiveCity();
          if (nextCity && nextCity !== win.activeCity) {
            win.activeCity = nextCity;
            persistCity(nextCity);
            updateLogoForCity(nextCity);
            try { renderCityMenu(nextCity); } catch (_) {}
            // Repeupler les filtres pour refléter la nouvelle ville
            try {
              populateFilters();
              updateFilterUI();
              updateFilterCount();
              // Re-lier les événements sur les nouveaux éléments
              if (window.EventBindings?.bindFilterControls) {
                window.EventBindings.bindFilterControls();
              }
            } catch (_) { /* noop */ }
          }
          // Accepter cat+project ainsi que cat seul
          let state = e && e.state ? e.state : null;
          if (!state) {
            try {
              const sp = new URLSearchParams(location.search);
              const rawCat = String(sp.get('cat') || '').toLowerCase().trim();
              const project = String(sp.get('project') || '').trim();
              if (rawCat) {
                const cat = rawCat === 'mobilite' ? 'transport' : rawCat;
                state = { cat, project: project || null };
              }
            } catch (_) { /* noop */ }
          }

          if (state && state.cat && state.project) {
            await showFromUrlState({ cat: state.cat, project: state.project });
          } else if (state && state.cat && !state.project) {
            // Catégorie seule: réinitialiser la vue sur la catégorie sans pousser d'historique
            if (window.NavigationModule?.resetToDefaultView) {
              window.NavigationModule.resetToDefaultView(state.cat, { preserveMapView: true, updateHistory: false });
            }
          } else if (window.NavigationModule?.resetToDefaultView) {
            // Vue par défaut (sans cat ni project), sans pousser d'historique
            window.NavigationModule.resetToDefaultView(undefined, { preserveMapView: true, updateHistory: false });
          }
        } catch (_) { /* noop */ }
      });
    }
    catch (err) {
      console.error('Erreur initApp :', err);
    }
  }

  /**
   * Met à jour l'UI des filtres selon l'état des layers
   */
  function updateFilterUI() {
    document.querySelectorAll('.filter-item').forEach(item => {
      const layerName = item.dataset.layer;
      const active    = !!(window.MapModule?.layers?.[layerName]);
      item.classList.toggle('active-filter', active);
    });
  }

  /**
   * Génère dynamiquement le DOM des filtres
   */
  function populateFilters() {
    const container = document.getElementById('dynamic-filters');
    if (!container || !win.filtersConfig) return;
    container.innerHTML = '';
    const city = String(win.activeCity || '').toLowerCase();
    const layers = Array.isArray(win.layersConfig) ? win.layersConfig : [];
    const layerByName = Object.create(null);
    layers.forEach(l => { if (l && l.name) layerByName[l.name] = l; });

    win.filtersConfig.forEach(group => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'filter-group';

      const title = document.createElement('h4');
      title.textContent = group.category;
      groupDiv.appendChild(title);
      // Only items whose layer is global (ville NULL/empty) or matches active city
      const items = (group.items || []).filter(it => {
        if (!it || !it.layer) return false;
        const layer = layerByName[it.layer];
        const layerCity = layer && 'ville' in layer ? layer.ville : null;
        return !layerCity || String(layerCity).toLowerCase() === city;
      });
      if (!items.length) {
        return; // skip empty groups
      }

      items.forEach(item => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        filterItem.dataset.layer = item.layer;
        filterItem.innerHTML = `
          <span class="filter-icon"><i class="${item.icon}"></i></span>
          <span class="filter-label">${item.label}</span>
          <button class="settings-btn" data-layer="${item.layer}"><i class="fas fa-gear"></i></button>
        `;
        groupDiv.appendChild(filterItem);

        const tags = document.createElement('div');
        tags.className = 'active-filter-tags';
        tags.dataset.layer = item.layer;
        groupDiv.appendChild(tags);

        const sub = document.createElement('div');
        sub.className = 'subfilters-container';
        sub.dataset.layer = item.layer;
        groupDiv.appendChild(sub);
      });

      container.appendChild(groupDiv);
    });
  }

  /**
   * Met à jour le compteur de filtres actifs
   */
  function updateFilterCount() {
    const countEl = document.querySelector('.filter-count');
    if (countEl) {
      const activeCount = document.querySelectorAll('.filter-item.active-filter').length;
      countEl.textContent = activeCount;
    }
  }

  // Configuration des fonds de carte par défaut
  if (!win.basemaps || win.basemaps.length === 0) {
    win.basemaps = [
      {
        label: 'OSM',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        default: true,
        theme: 'light'
      },
      {
        label: 'Positron',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB',
        theme: 'light'
      },
      {
        label: 'Dark Matter',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB',
        theme: 'dark'
      }
    ];
  }

  // Attendre que le DOM soit chargé avant d'initialiser l'application
  // Fallback de sécurité: déléguer le clic sur #city-toggle même si initApp échoue
  try {
    document.addEventListener('click', function(e) {
      const btn = e.target && (e.target.id === 'city-toggle' ? e.target : e.target.closest && e.target.closest('#city-toggle'));
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        console.debug('[city] delegated click -> openCityMenu');
        openCityMenu();
      }
    }, true);
  } catch (_) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    // Le DOM est déjà chargé
    initApp();
  }
})(window);