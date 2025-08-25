// modules/ficheprojet.js

// Hotjar (analytics)
(function(){
  try {
    function ensureHotjar(hjid){
      try {
        if (window._hjSettings && window._hjSettings.hjid === hjid) return;
        if (document.querySelector('script[src*="static.hotjar.com/c/hotjar-"]')) return;
        (function(h,o,t,j,a,r){
            h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
            h._hjSettings={hjid:hjid,hjsv:6};
            a=o.getElementsByTagName('head')[0];
            r=o.createElement('script');r.async=1;
            r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
            a.appendChild(r);
        })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
      } catch(e) {}
    }
    ensureHotjar(6496613);
  } catch(e) { console.warn('Hotjar injection failed', e); }
})();

// Assure l'icône du site (favicon) sur les pages fiche projet
function ensureFavicon() {
  try {
    if (document.querySelector('link[rel="icon"]')) return;
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = '/img/logomin.png';
    link.sizes = '32x32';
    document.head.appendChild(link);
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', ensureFavicon);

// Configuration des fonds de carte par défaut
window.basemaps = window.basemaps || [
  {
    label: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    default: true
  },
  {
    label: 'Positron',
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    attribution: '© CartoDB'
  },
  {
    label: 'Dark Matter',
    theme: 'dark',
    url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
    attribution: '© CartoDB'
  }
];

// Ajoute une carte "Voir sur Cyclopolis" pour les Voies Lyonnaises
async function appendCyclopolisCard(lineNumber, containerEl) {
  try {
    if (!containerEl) return;
    const n = String(lineNumber || '').trim().replace(/\D+/g, '');
    if (!n) return;
    const url = `https://cyclopolis.fr/voie-lyonnaise-${n}`;

    const section = document.createElement('section');
    section.className = 'cyclopolis-section';
    section.innerHTML = `
      <a class="cyclopolis-card" href="${url}" target="_blank" rel="noopener" aria-label="Voir la Voie Lyonnaise ${n} sur Cyclopolis (ouvre un nouvel onglet)">
        <div class="card-logo-wrap"><img class="card-logo" src="/img/logos/cyclopolis-logo.svg" alt="Cyclopolis" loading="lazy"></div>
        <div class="cyclo-content">
          <h2>Voir sur Cyclopolis</h2>
          <p>En savoir plus sur la Voie Lyonnaise ${n} sur cyclopolis.fr</p>
        </div>
        <div class="cyclo-cta"><span class="cta-text">Ouvrir</span> <i class="fa fa-arrow-up-right-from-square" aria-hidden="true"></i></div>
      </a>`;
    containerEl.appendChild(section);
  } catch (e) {
    console.error('[ficheprojet] appendCyclopolisCard error:', e);
  }
}

// Ajoute une carte "Voir sur grandlyon.com" pour les projets Urbanisme
async function appendGrandLyonCard(projectName, containerEl) {
  try {
    if (!containerEl || !projectName) return;
    const getUrl = window.supabaseService?.getGrandLyonUrlByProject;
    if (typeof getUrl !== 'function') return;
    const url = await getUrl(projectName);
    if (!url) return;

    const section = document.createElement('section');
    section.className = 'grandlyon-section';
    section.innerHTML = `
      <a class="grandlyon-card" href="${url}" target="_blank" rel="noopener" aria-label="Voir la fiche de ${projectName} sur grandlyon.com (ouvre un nouvel onglet)">
        <div class="card-logo-wrap"><img class="card-logo" src="/img/logos/grandlyon-logo.svg" alt="Grand Lyon" loading="lazy"></div>
        <div class="gl-content">
          <h2>Voir sur grandlyon.com</h2>
          <p>Accéder à la page officielle du projet</p>
        </div>
        <div class="gl-cta"><span class="cta-text">Ouvrir</span> <i class="fa fa-arrow-up-right-from-square" aria-hidden="true"></i></div>
      </a>`;
    containerEl.appendChild(section);
  } catch (e) {
    console.error('[ficheprojet] appendGrandLyonCard error:', e);
  }
}

// Ajoute une carte "Voir sur SYTRAL" pour les projets de transport (mobilité)
async function appendSytralCard(projectName, containerEl) {
  try {
    if (!containerEl || !projectName) return;
    const getUrl = window.supabaseService?.getSytralUrlByProject;
    if (typeof getUrl !== 'function') return;
    const url = await getUrl(projectName);
    if (!url) return;

    const section = document.createElement('section');
    section.className = 'sytral-section';
    section.innerHTML = `
      <a class="sytral-card" href="${url}" target="_blank" rel="noopener" aria-label="Voir la page de ${projectName} sur SYTRAL Mobilités (ouvre un nouvel onglet)">
        <div class="card-logo-wrap"><img class="card-logo" src="/img/logos/sytral-logo.svg" alt="SYTRAL" loading="lazy"></div>
        <div class="sy-content">
          <h2>Voir sur SYTRAL</h2>
          <p>Accéder à la page officielle du projet</p>
        </div>
        <div class="sy-cta"><span class="cta-text">Ouvrir</span> <i class="fa fa-arrow-up-right-from-square" aria-hidden="true"></i></div>
      </a>`;
    containerEl.appendChild(section);
  } catch (e) {
    console.error('[ficheprojet] appendSytralCard error:', e);
  }
}

// Marked est désormais chargé via MarkdownUtils.loadDeps()

// ---------------------------------------------------------------------------
// Pré-traitement du Markdown : conversion des directives ::content-image, ::banner
// ---------------------------------------------------------------------------
function preprocessCustomMarkdown(rawMd) {
  let md = rawMd;

  // 1. Remplacer les blocs ::content-image
  md = md.replace(/::content-image[\t\x20]*\n---([\s\S]*?)---\s*::/g, (_, yamlBlock) => {
    // Extraire les paires clé: valeur
    const lines = yamlBlock.split(/\n/).map(l => l.trim()).filter(Boolean);
    const data = {};
    lines.forEach(line => {
      const m = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (m) data[m[1]] = m[2];
    });
    if (!data.imageUrl) return '';
    const caption = data.caption ? `<figcaption>${data.caption}${data.credit ? ` – <em>${data.credit}</em>` : ''}</figcaption>` : '';
    return `\n<figure class="content-image">\n  <img src="${data.imageUrl}" alt="${data.caption || ''}">\n  ${caption}\n</figure>\n`;
  });

  // 2. Remplacer les blocs ::banner{type="..."}
  md = md.replace(/::banner\{type="([^"]+)"\}([\s\S]*?)::/g, (_, type, inner) => {
    const htmlInner = inner.trim().replace(/\n+/g, ' '); // garder simple
    return `\n<div class="banner banner-${type}">${htmlInner}</div>\n`;
  });

  // 3. Supprimer directives restant ::: or ::
  md = md.replace(/^::$/gm, '');

  // 4. Remplacer les pseudo liens :transport-link{...} ou :line-link{...}
  md = md.replace(/:[\w-]+-link\{[^}]+\}/g, '');

  return md;
}

// Fonction pour charger Font Awesome dynamiquement
function loadFontAwesome() {
  return new Promise((resolve) => {
    if (document.querySelector('link[href*="font-awesome"]')) {
      return resolve();
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.1/css/all.min.css';
    link.crossOrigin = 'anonymous';
    link.referrerPolicy = 'no-referrer';
    link.onload = resolve;
    document.head.appendChild(link);
  });
}

// Normalisation tolérante pour la correspondance (noms de couches, clés/valeurs de filtre, projets)
// - supprime les accents
// - unifie les ponctuations/quotes et tirets/underscores en espaces
// - retire les caractères non alphanumériques (hors espace)
// - compacte les espaces et met en minuscules
function normalizeText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/["'`´]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Slugify simple et robuste pour correspondre aux fichiers .md de /pages/
function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, '-et-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// --- Thème (clair/sombre) pour les fiches projets autonomes ---
const FPTheme = (function(win) {
  let osThemeMediaQuery = null;
  let osThemeHandler = null;

  function getInitialTheme() {
    const prefersDark = win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function hasSavedPreference() {
    try {
      const v = localStorage.getItem('theme');
      return v === 'dark' || v === 'light';
    } catch (_) { return false; }
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    const updateBtn = (selector) => {
      const btn = document.querySelector(selector);
      if (!btn) return;
      const iconEl = btn.querySelector('i');
      if (iconEl) iconEl.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      const title = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    };
    updateBtn('#theme-toggle');
    updateBtn('#detail-theme-toggle');
  }

  function findBasemapForTheme(theme) {
    const list = win.basemaps || [];
    if (!Array.isArray(list) || list.length === 0) return null;
    const lc = (s) => String(s || '').toLowerCase();

    // 1) Propriété explicite `theme` si fournie ("dark" | "light")
    let bm = list.find(b => lc(b.theme) === theme);
    if (bm) return bm;

    // 2) Heuristiques sur labels/noms
    const darkKeys = ['dark', 'noir', 'sombre', 'night', 'nuit'];
    const lightKeys = ['light', 'clair', 'day', 'jour', 'positron', 'osm', 'streets', 'standard'];
    const keys = theme === 'dark' ? darkKeys : lightKeys;
    bm = list.find(b => keys.some(k => lc(b.label).includes(k) || lc(b.name).includes(k)));
    if (bm) return bm;

    return null;
  }

  function syncBasemapToTheme(theme) {
    try {
      const bm = findBasemapForTheme(theme);
      if (!bm || !win.__fpMap) return;
      if (win.__fpBaseLayer) {
        try { win.__fpMap.removeLayer(win.__fpBaseLayer); } catch(_) {}
        win.__fpBaseLayer = null;
      }
      const layer = L.tileLayer(bm.url, { attribution: bm.attribution });
      win.__fpBaseLayer = layer.addTo(win.__fpMap);
    } catch (e) {
      console.warn('[ficheprojet] syncBasemapToTheme error:', e);
    }
  }

  function startOSThemeSync() {
    try {
      if (!win.matchMedia) return;
      if (!osThemeMediaQuery) {
        osThemeMediaQuery = win.matchMedia('(prefers-color-scheme: dark)');
      }
      const applyFromOS = () => {
        const next = osThemeMediaQuery.matches ? 'dark' : 'light';
        applyTheme(next);
        try { syncBasemapToTheme(next); } catch(_) {}
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

  return { getInitialTheme, applyTheme, syncBasemapToTheme, startOSThemeSync, stopOSThemeSync, hasSavedPreference };
})(window);

document.addEventListener('DOMContentLoaded', async () => {
  // S'assurer que MarkdownUtils est chargé
  if (!window.MarkdownUtils) {
    await new Promise((res, rej) => {
      const tryLoad = (srcs) => {
        if (!srcs.length) return rej(new Error('MarkdownUtils non chargé'));
        const src = srcs.shift();
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => tryLoad(srcs);
        document.head.appendChild(s);
      };
      tryLoad(['/modules/MarkdownUtils.js', '/modules/markdownutils.js']);
    });
  }
  // Charger dépendances markdown/front-matter
  await MarkdownUtils.loadDeps();
  // marked est déjà disponible via MarkdownUtils.loadDeps()
  // Initialiser le thème le plus tôt possible
  try {
    const __initialTheme = FPTheme.getInitialTheme();
    FPTheme.applyTheme(__initialTheme);
    FPTheme.startOSThemeSync();
  } catch(_) {}
  // 1. Récupération de la config depuis l'article (avec trim)
  const article      = document.getElementById('project-article');
  const projectName  = (article.dataset.projectName || '').trim();   // ex. "Voie Lyonnaise 1"
  const layerName    = (article.dataset.layerName || '').trim();     // ex. "voielyonnaise"
  const filterKey    = (article.dataset.filterKey || '').trim();     // ex. "line"
  const filterValue  = (article.dataset.filterValue || '').trim();   // ex. "1"
  console.log('[ficheprojet] dataset inputs:', {
    projectName,
    layerName,
    filterKey,
    filterValue,
    normalized: {
      layerName: normalizeText(layerName),
      filterKey: normalizeText(filterKey),
      filterValue: normalizeText(filterValue)
    }
  });
  
  // Détection du mode embed (iframe ou paramètre d'URL)
  const __isEmbedded = (() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const v = (params.get('embed') || '').toLowerCase();
      if (v === '1' || v === 'true' || v === 'yes') return true;
      if (v === '0' || v === 'false' || v === 'no') return false;
      return window.self !== window.top;
    } catch (_) { return true; }
  })();
  // Large embed mode: allow map to be visible when iframe/modal is wide
  const __isEmbedWide = (() => {
    try { return __isEmbedded && window.matchMedia('(min-width: 1025px)').matches; } catch(_) { return false; }
  })();

  // Nouvelle structure V2 (sobre, responsive)
  article.innerHTML = `
    <div class="project-v2${__isEmbedded ? ' is-embed' : ''}${__isEmbedded && !__isEmbedWide ? ' embed-noheader' : ''}">
      <div class="project-v2-main">
        ${__isEmbedded
          ? (__isEmbedWide
              ? `
        <section class="project-v2-fixed-header">
          <div class="project-v2-map-wrap">
            <div id="project-map-v2"></div>
          </div>
        </section>`
              : '')
          : `
        <section class="project-v2-fixed-header">
          <div class="project-v2-topbar">
            <a href="/" class="project-v2-back" aria-label="Retour à l'accueil" title="Accueil">
              <i class="fa fa-arrow-left" aria-hidden="true"></i>
              <img src="/img/logo.svg" class="project-v2-logo" alt="Logo" />
            </a>
            <h1 class="project-v2-title">${projectName || ''}</h1>
            <button id="detail-theme-toggle" class="theme-toggle detail-theme-toggle" aria-pressed="false" aria-label="Mode sombre" title="Mode sombre">
              <i class="fas fa-moon" aria-hidden="true"></i>
            </button>
            <button class="map-toggle" aria-label="Agrandir la carte" title="Agrandir">
              <i class="fa fa-expand" aria-hidden="true"></i>
            </button>
            <button class="map-close" aria-label="Fermer la carte" title="Fermer la carte">Fermer la carte</button>
          </div>
          <div class="project-v2-map-wrap">
            <div id="project-map-v2"></div>
          </div>
        </section>`}
        <section class="project-v2-article">
          <div class="project-v2-content" id="project-text"></div>
        </section>
      </div>
    </div>`;
  
  // Styles spécifiques au mode embed: article plein écran si pas d'en-tête, et pas de marge top sur #project-text
  if (__isEmbedded) {
    try {
      if (!document.head.querySelector('style[data-fp-embed]')) {
        const st = document.createElement('style');
        st.setAttribute('data-fp-embed', '1');
        st.textContent = `
          html, body { height: 100%; }
          .project-v2.is-embed.embed-noheader, .project-v2.is-embed.embed-noheader .project-v2-main, .project-v2.is-embed.embed-noheader .project-v2-article { height: 100vh; min-height: 100vh; }
          .project-v2.is-embed.embed-noheader .project-v2-article { overflow: auto; }
          .project-v2.is-embed .project-v2-article #project-text { margin-top: 0 !important; }
        `;
        document.head.appendChild(st);
      }
      // Re-render dynamique en cas de bascule large/étroit (>=1025px)
      try {
        const mq = window.matchMedia('(min-width: 1025px)');
        const handle = () => { try { window.location.reload(); } catch(_) {} };
        if (mq.addEventListener) mq.addEventListener('change', handle);
        else if (mq.addListener) mq.addListener(handle);
      } catch(_) {}
    } catch(_) {}
  }
  
  const textEl       = document.getElementById('project-text');
  
  // Synchronisation du bouton de thème (icône/aria) + gestionnaires
  (function() {
    const btn = document.getElementById('detail-theme-toggle');
    if (!btn) return;
    const updateFromTheme = (theme) => {
      const iconEl = btn.querySelector('i');
      if (iconEl) iconEl.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      const title = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    };
    // État initial
    updateFromTheme(document.documentElement.getAttribute('data-theme') || FPTheme.getInitialTheme());

    // Clic bascule
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      FPTheme.applyTheme(next);
      FPTheme.syncBasemapToTheme(next);
      // Rester en mode automatique: ne pas persister ni arrêter la synchro OS
    });
    // Accessibilité clavier
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
    // Observer les changements externes de thème
    try {
      const obs = new MutationObserver(() => {
        const t = document.documentElement.getAttribute('data-theme') || 'light';
        updateFromTheme(t);
      });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch(_) {}
  })();
  // Cacher l'ancien header de détail s'il est présent et non désiré
  const legacyHeader = document.getElementById('detail-header');
  if (legacyHeader) legacyHeader.style.display = 'none';
  // Contrôle du scroll: la page ne scrolle pas, seul l'article scrolle
  try {
    let el = article.parentElement;
    while (el) {
      // neutraliser d'anciens styles bloquants
      if (el !== document.body && el !== document.documentElement) {
        el.style.overflow = 'visible';
        el.style.overscrollBehavior = 'auto';
        if (el.style.height === '100vh') el.style.height = '';
      }
      el = el.parentElement;
    }
    // verrouiller le scroll global, on déléguera le scroll à .project-v2-article
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  } catch(_) {}

  // 2. Injection du Markdown (inline ou fetch .md)
  
  // Détermination du chemin du fichier Markdown
  // Harmonisé avec NavigationModule: on supprime les apostrophes/ponctuations au lieu de les transformer en tirets
  const slugify = (str) => String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // enlever les accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // retirer la ponctuation (ex: apostrophes)
    .trim()
    .replace(/\s+/g, '-') // espaces -> tirets
    .replace(/-+/g, '-')   // éviter les doubles tirets
    .replace(/^-+|-+$/g, ''); // trim des tirets
  
  // --- SEO helpers: canonical, OG/Twitter, JSON-LD ---
  const PROD_ORIGIN = 'https://grandsprojets.com';

  function ensureMeta(name, content) {
    try {
      if (!content) return;
      let el = document.head.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
      el.setAttribute('data-fp-seo', '1');
    } catch(_) {}
  }

  function ensureOG(property, content) {
    try {
      if (!content) return;
      let el = document.head.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
      el.setAttribute('data-fp-seo', '1');
    } catch(_) {}
  }

  function ensureLink(rel, href) {
    try {
      if (!href) return;
      let el = document.head.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
      el.setAttribute('data-fp-seo', '1');
    } catch(_) {}
  }

  function ensureJsonLd(id, data) {
    try {
      if (!data) return;
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('script');
        el.type = 'application/ld+json';
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(data);
      el.setAttribute('data-fp-seo', '1');
    } catch(_) {}
  }

  function toAbsolute(u) {
    try {
      if (!u) return '';
      return new URL(u, PROD_ORIGIN).href;
    } catch(_) { return ''; }
  }

  function applySEO(projectName, attrs = {}, layerName = '') {
    try {
      const siteName = 'Grands Projets de Lyon';
      const rawTitle = (attrs && (attrs.title || attrs.name)) || projectName || siteName;
      const title = rawTitle ? `${rawTitle} – ${siteName}` : siteName;
      const description = (attrs && (attrs.meta || attrs.description)) || `Fiche projet: informations, carte et documents officiels.`;
      const path = (window.location && window.location.pathname ? window.location.pathname : '/');
      const qs = (window.location && window.location.search ? window.location.search : '');
      const pageUrl = PROD_ORIGIN + path + qs;
      const cover = attrs && attrs.cover ? toAbsolute(attrs.cover) : `${PROD_ORIGIN}/img/logomin.png`;

      // Title
      try { document.title = title; } catch(_) {}

      // Basic meta
      ensureMeta('description', description);
      ensureLink('canonical', pageUrl);

      // Open Graph / Twitter
      ensureOG('og:site_name', siteName);
      ensureOG('og:type', 'article');
      ensureOG('og:locale', 'fr_FR');
      ensureOG('og:title', title);
      ensureOG('og:description', description);
      ensureOG('og:url', pageUrl);
      if (cover) ensureOG('og:image', cover);

      ensureMeta('twitter:card', 'summary_large_image');
      ensureMeta('twitter:title', title);
      ensureMeta('twitter:description', description);
      if (cover) ensureMeta('twitter:image', cover);

      // JSON-LD: WebPage
      const webPage = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: rawTitle || siteName,
        headline: rawTitle || siteName,
        description,
        url: pageUrl,
        image: cover
      };
      ensureJsonLd('fp-jsonld-webpage', webPage);

      // JSON-LD: Breadcrumbs (Accueil > Projet)
      const breadcrumbs = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: PROD_ORIGIN + '/' },
          { '@type': 'ListItem', position: 2, name: rawTitle || siteName, item: pageUrl }
        ]
      };
      ensureJsonLd('fp-jsonld-breadcrumb', breadcrumbs);
    } catch(e) {
      console.warn('[ficheprojet] applySEO error', e);
    }
  }
  
  // Ajoute une section "Documents de concertation" avec les PDF du projet s'ils existent
  async function appendConsultationDocs(projectName, containerEl) {
    try {
      if (!projectName || !containerEl) return;
      if (!window.supabaseService || typeof window.supabaseService.getConsultationDossiersByProject !== 'function') {
        console.warn('[ficheprojet] supabaseService non disponible, pas d\'affichage des dossiers');
        return;
      }
      const dossiers = await window.supabaseService.getConsultationDossiersByProject(projectName);
      if (!Array.isArray(dossiers) || dossiers.length === 0) return;

      const uniq = new Map();
      dossiers.forEach(d => {
        if (d && d.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d);
      });
      const docs = Array.from(uniq.values());
      if (docs.length === 0) return;

      // Section + grille de cartes
      const section = document.createElement('section');
      section.className = 'project-documents';
      const h2 = document.createElement('h2');
      h2.className = 'project-documents-title';
      h2.innerHTML = '<i class="fa fa-file-pdf" aria-hidden="true"></i> Documents de concertation';
      const grid = document.createElement('div');
      grid.className = 'doc-cards';

      // Helper: ouverture d'une lightbox PDF
      const openPdfPreview = (url, title = '') => {
        const overlay = document.createElement('div');
        overlay.className = 'pdf-lightbox';
        overlay.innerHTML = `
          <div class="lightbox-content">
            <div class="lightbox-header">
              <span class="lightbox-title">${title ? title : 'Prévisualisation du document'}</span>
              <button class="lightbox-close" aria-label="Fermer"><i class="fa fa-xmark" aria-hidden="true"></i></button>
            </div>
            <div class="lightbox-body">
              <iframe class="pdf-frame" src="${url}#toolbar=0" title="${title ? title : 'Prévisualisation PDF'}"></iframe>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.lightbox-close').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
     };

      docs.forEach(d => {
        const card = document.createElement('article');
        card.className = 'doc-card';
        card.setAttribute('tabindex', '0');
        const title = d.title || (d.pdf_url ? d.pdf_url.split('/').pop() : 'Document PDF');

        // Affiche la prévisualisation et le téléchargement pour tous les types de fiches (incl. urbanisme)
        card.innerHTML = `
          <div class="doc-card-icon"><i class="fa fa-file-pdf" aria-hidden="true"></i></div>
          <div class="doc-card-content">
            <h3 class="doc-card-title">${title}</h3>
            <div class="doc-card-actions">
              <button type="button" class="btn-preview"><i class="fa fa-eye" aria-hidden="true"></i> Prévisualiser</button>
              <a class="btn-download" href="${d.pdf_url}" target="_blank" rel="noopener">
                <i class="fa fa-download" aria-hidden="true"></i> Télécharger
              </a>
            </div>
          </div>`;
        // Clic sur la carte => prévisualisation
        card.addEventListener('click', () => openPdfPreview(d.pdf_url, title));
        card.addEventListener('keypress', (e) => { if (e.key === 'Enter') openPdfPreview(d.pdf_url, title); });
        // Boutons internes
        const previewBtn = card.querySelector('.btn-preview');
        previewBtn.addEventListener('click', (e) => { e.stopPropagation(); openPdfPreview(d.pdf_url, title); });
        const dl = card.querySelector('.btn-download');
        dl.addEventListener('click', (e) => { e.stopPropagation(); /* laisser le comportement par défaut */ });
        grid.appendChild(card);
      });

      // Si plus de 4 documents, activer un conteneur scrollable (max-height 400px)
      if (docs.length > 4) {
        grid.classList.add('is-scrollable');
        grid.setAttribute('aria-label', 'Documents de concertation (défilement interne)');
      }

      section.appendChild(h2);
      section.appendChild(grid);
      containerEl.appendChild(section);
    } catch (e) {
      console.error('[ficheprojet] appendConsultationDocs error:', e);
    }
  }

  // Essayer d'abord de récupérer une URL markdown depuis contribution_uploads via Supabase
  let source = '';
  let contributionMdUrl = '';
  try {
    const effCat = (() => {
      const ln = (layerName || '').toLowerCase();
      if (ln === 'urbanisme') return 'urbanisme';
      if (ln === 'voielyonnaise') return 'velo';
      return 'mobilite';
    })();
    if (window.supabaseService?.fetchProjectsByCategory && projectName) {
      const list = await window.supabaseService.fetchProjectsByCategory(effCat);
      const found = Array.isArray(list) ? list.find(p => p?.project_name && String(p.project_name).toLowerCase().trim() === String(projectName).toLowerCase().trim()) : null;
      if (found?.markdown_url) {
        contributionMdUrl = found.markdown_url;
        console.log(`[ficheprojet] Markdown depuis contribution_uploads: ${contributionMdUrl}`);
      }
    }
  } catch (e) {
    console.warn('[ficheprojet] Recherche markdown via Supabase échouée:', e);
  }

  if (contributionMdUrl) {
    source = contributionMdUrl; // URL absolue (https://...)
  } else if (layerName === 'voielyonnaise' && filterKey === 'line' && filterValue) {
    source = `pages/velo/ligne-${filterValue}.md`;
    console.log(`Chargement du fichier Markdown pour la Voie Lyonnaise ${filterValue}`);
  } else if (layerName === 'urbanisme') {
    const slug = slugify(projectName);
    source = `pages/urbanisme/${slug}.md`;
    console.log(`Chargement du fichier Markdown pour le projet urbanisme '${projectName}' → ${source}`);
  } else {
    // Projets de mobilité
    const slug = slugify(projectName);
    source = `pages/mobilite/${slug}.md`;
    console.log(`Chargement du fichier Markdown pour le projet mobilité '${projectName}' → ${source}`);
  }
  
  // Si la source se termine par .md ou si c'est une Voie Lyonnaise, on charge le fichier
  if ((typeof source === 'string' && source.trim().toLowerCase().endsWith('.md')) || 
      (layerName === 'voielyonnaise' && filterKey === 'line' && filterValue)) {
    
    // Pour les Voies Lyonnaises, on utilise le chemin construit plus haut
    const markdownPath = layerName === 'voielyonnaise'
      ? `/pages/velo/ligne-${filterValue}.md`  // chemin absolu depuis la racine du site
      : ((/^https?:\/\//i.test(source)) ? source : (source.startsWith('/') ? source : `/${source}`));
    
    console.log(`Tentative de chargement du fichier: ${markdownPath}`);
    
    fetch(markdownPath)
      .then(response => {
        if (!response.ok) throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        return response.text();
      })
      .then(async md => {
        console.log('Contenu Markdown chargé avec succès');
        // Utiliser MarkdownUtils pour parser front-matter + markdown
        const { attrs, html } = MarkdownUtils.renderMarkdown(md);

        // SEO from front matter
        try { applySEO(projectName, attrs, layerName); } catch(_) {}

        // 1. Header (cover + chips + description)
        let headerHtml = '';
        if (attrs.cover) {
          // Apply blurred background image behind content
          try {
            const articleSection = document.querySelector('.project-v2-article');
            if (articleSection) {
              articleSection.classList.add('has-cover-bg');
              articleSection.style.setProperty('--cover-bg', `url('${attrs.cover}')`);
            }
          } catch (_) { /* no-op */ }
          headerHtml += `
            <div class="project-cover-wrap">
              <img class="project-cover" src="${attrs.cover}" alt="${attrs.name || ''}">
              <button class="cover-extend-btn" aria-label="Agrandir l'image" title="Agrandir">
                <i class="fa fa-up-right-and-down-left-from-center" aria-hidden="true"></i>
              </button>
            </div>
          `;
        }
        const chipsArr = [];
        if (attrs.from && attrs.to) {
          chipsArr.push(`<span class="chip chip-route">${attrs.from} → ${attrs.to}</span>`);
        } else if (attrs.from || attrs.to) {
          chipsArr.push(`<span class="chip chip-route">${attrs.from || ''}${attrs.to ? ' → ' + attrs.to : ''}</span>`);
        }
        if (attrs.trafic) {
          chipsArr.push(`<span class="chip chip-trafic">${attrs.trafic}</span>`);
        }
        if (attrs.description || chipsArr.length) {
          headerHtml += `
            <section class="project-desc-card" aria-label="Description du projet">
              <h3 class="project-desc-title">
                <i class="fa fa-info-circle" aria-hidden="true"></i>
                Description du projet
              </h3>
              ${chipsArr.length ? `<div class="project-chips">${chipsArr.join('')}</div>` : ''}
              ${attrs.description ? `<p class="project-description">${attrs.description}</p>` : ''}
            </section>
          `;
        }

        // Injecter uniquement le header, puis Cyclopolis (si VL), puis les documents, puis le corps
        textEl.innerHTML = headerHtml;
        textEl.classList.add('markdown-body');
        if (layerName === 'voielyonnaise' && filterKey === 'line' && filterValue) {
          await appendCyclopolisCard(filterValue, textEl);
        }
        if (layerName === 'urbanisme' && projectName) {
          await appendGrandLyonCard(projectName, textEl);
        } else if (projectName && (layerName === 'reseauProjeteSitePropre' || layerName === 'metro' || layerName === 'tramway')) {
          await appendSytralCard(projectName, textEl);
        }
        await appendConsultationDocs(projectName, textEl);

        // Ne pas injecter le corps markdown pour les fiches vélo (Voie Lyonnaise)
        if (!(layerName === 'voielyonnaise' && filterKey === 'line' && filterValue)) {
          const articleDiv = document.createElement('div');
          articleDiv.className = 'project-article';
          articleDiv.innerHTML = html;
          textEl.appendChild(articleDiv);
        }

        // Styles déplacés dans style.css (cover overlay + lightbox)

        // Wire up Extend buttons
        const coverWrap = textEl.querySelector('.project-cover-wrap');
        if (coverWrap) {
          const btn = coverWrap.querySelector('.cover-extend-btn');
          const img = coverWrap.querySelector('img.project-cover');
          // Suppression: ne plus appliquer la cover comme fond flouté derrière l'article
          const openLightbox = () => {
            const overlay = document.createElement('div');
            overlay.className = 'cover-lightbox';
            overlay.innerHTML = `
              <div class="lightbox-content">
                <img src="${img.getAttribute('src')}" alt="${img.getAttribute('alt') || ''}">
                <button class="lightbox-close" aria-label="Fermer">
                  <i class="fa fa-xmark" aria-hidden="true"></i>
                </button>
              </div>
            `;
            document.body.appendChild(overlay);

            const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
            const onKey = (e) => { if (e.key === 'Escape') close(); };
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
            overlay.querySelector('.lightbox-close').addEventListener('click', close);
            document.addEventListener('keydown', onKey);
          };
          btn?.addEventListener('click', openLightbox);
        }
      })
      .catch(err => {
        console.error('Erreur lors du chargement du Markdown:', err);
        // Afficher un message d'erreur avec le nom du projet
        textEl.innerHTML = `
          <div style="padding: 1em; background: #fff3f3; border-left: 4px solid #ff6b6b; margin: 1em 0;">
            <h3>${projectName}</h3>
            <p>Impossible de charger la description détaillée pour ce projet.</p>
            <p><small>Erreur: ${err.message}</small></p>
          </div>
        `;
      });
  } else if (source) {
    // source est le markdown inline
    console.log('Utilisation du contenu Markdown inline');
    const htmlStr = marked.parse(source);
    // SEO fallback
    try { applySEO(projectName, {}, layerName); } catch(_) {}
    textEl.innerHTML = '';
    // Ajouter Cyclopolis (si VL), puis la section Documents (au-dessus du contenu)
    if (layerName === 'voielyonnaise' && filterKey === 'line' && filterValue) {
      await appendCyclopolisCard(filterValue, textEl);
    }
    if (layerName === 'urbanisme' && projectName) {
      await appendGrandLyonCard(projectName, textEl);
    }
    await appendConsultationDocs(projectName, textEl);
    // Ne pas injecter le corps markdown pour les fiches vélo (Voie Lyonnaise)
    if (!(layerName === 'voielyonnaise' && filterKey === 'line' && filterValue)) {
      const articleDiv = document.createElement('div');
      articleDiv.className = 'project-article';
      articleDiv.innerHTML = htmlStr;
      textEl.appendChild(articleDiv);
    }
  } else {
    console.warn('Aucune source de contenu trouvée pour ce projet');
    textEl.innerHTML = '';
    // SEO minimal
    try { applySEO(projectName, {}, layerName); } catch(_) {}
    // Ajouter d'abord Cyclopolis (si VL), puis la section Documents si disponible
    if (layerName === 'voielyonnaise' && filterKey === 'line' && filterValue) {
      await appendCyclopolisCard(filterValue, textEl);
    }
    if (layerName === 'urbanisme' && projectName) {
      await appendGrandLyonCard(projectName, textEl);
    }
    await appendConsultationDocs(projectName, textEl);
    // Ne pas afficher de fallback textuel pour les fiches vélo (seulement Cyclopolis + docs)
    if (!(layerName === 'voielyonnaise' && filterKey === 'line' && filterValue)) {
      const fallback = document.createElement('div');
      fallback.style.padding = '1em';
      fallback.style.background = '#fff8e6';
      fallback.style.borderLeft = '4px solid #ffcc00';
      fallback.style.margin = '1em 0';
      fallback.innerHTML = `
        <h3>${projectName}</h3>
        <p>Aucune description disponible pour ce projet.</p>
      `;
      textEl.appendChild(fallback);
    }
  }

  // S'assurer que Font Awesome est disponible (icônes back/toggle)
  await loadFontAwesome();

  // 3. Initialisation de la carte Leaflet
  // En mode embed étroit, on ne rend pas l'en-tête fixe ni la carte → on saute l'init
  if (__isEmbedded && !__isEmbedWide) {
    try { console.log('Mode embed: carte désactivée, initialisation ignorée'); } catch(_) {}
    return;
  }
  
  const mapElement = document.getElementById('project-map-v2');
  if (!mapElement) {
    console.error("Élément 'project-map-v2' non trouvé");
    return;
  }
  
  // Vérifier que L (Leaflet) est disponible
  if (typeof L === 'undefined') {
    console.warn("Leaflet n'est pas chargé à l'initialisation, attente…");
    await new Promise((resolve) => {
      const check = () => {
        if (typeof L !== 'undefined') return resolve();
        setTimeout(check, 100);
      };
      check();
    });
  }
  
  const map = L.map('project-map-v2', { preferCanvas: true }).setView([45.75, 4.85], 12);
  // Exposer la carte pour la synchronisation des fonds
  try { window.__fpMap = map; } catch(_) {}
  let geoLayerRef = null; // référence à la couche affichée pour recentrage
  // Filtered GeoJSON kept for small card preview (mobile)
  let filteredGeoJSONForPreview = null;
  // Reference to the injected map card section element
  let mapCardElRef = null;
  // Référence au fond de carte courant
  let baseLayerRef = null;

  // Draw a tiny SVG preview of the filtered GeoJSON inside the card logo
  const drawGeoPreviewToContainer = (container, featureCollection) => {
    try {
      if (!container || !featureCollection || !Array.isArray(featureCollection.features) || featureCollection.features.length === 0) return;
      const FC = featureCollection;
      // Compute bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const visitCoords = (coords) => {
        // coords is [lon, lat]
        const x = coords[0];
        const y = coords[1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      };
      const walkGeom = (geom, onlyOuter = true) => {
        if (!geom) return;
        const t = geom.type;
        const c = geom.coordinates;
        if (!t || !c) return;
        if (t === 'Point') { visitCoords(c); }
        else if (t === 'MultiPoint' || t === 'LineString') { c.forEach(visitCoords); }
        else if (t === 'MultiLineString') { c.forEach(line => line.forEach(visitCoords)); }
        else if (t === 'Polygon') {
          // Use outer ring (0) for preview
          if (c[0]) c[0].forEach(visitCoords);
        }
        else if (t === 'MultiPolygon') {
          c.forEach(poly => { if (poly[0]) poly[0].forEach(visitCoords); });
        }
      };
      FC.features.forEach(f => walkGeom(f.geometry));
      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
      if (minX === maxX) { minX -= 0.0005; maxX += 0.0005; }
      if (minY === maxY) { minY -= 0.0005; maxY += 0.0005; }

      // Build SVG
      const VB = 100; // viewBox size
      const pad = 8;  // padding inside viewBox
      const inner = VB - pad * 2;
      const sx = inner / (maxX - minX);
      const sy = inner / (maxY - minY);
      const s = Math.min(sx, sy);
      const offX = pad + (inner - (maxX - minX) * s) / 2;
      const offY = pad + (inner - (maxY - minY) * s) / 2;
      const proj = (lon, lat) => {
        const x = offX + (lon - minX) * s;
        const y = offY + (lat - minY) * s;
        // invert Y for SVG (lat increases upwards)
        return [x, VB - y];
      };

      const makePath = (coords) => {
        if (!coords || coords.length === 0) return '';
        let d = '';
        coords.forEach((p, idx) => {
          const [x, y] = proj(p[0], p[1]);
          d += (idx === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`);
        });
        return d;
      };

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`);
      svg.setAttribute('aria-hidden', 'true');
      svg.style.display = 'block';

      // Background subtle
      const bg = document.createElementNS(svgNS, 'rect');
      bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
      bg.setAttribute('width', String(VB)); bg.setAttribute('height', String(VB));
      bg.setAttribute('fill', '#ffffff');
      bg.setAttribute('opacity', '1');
      svg.appendChild(bg);

      const strokeColor = '#0a6d54';
      const fillColor = '#0a6d5415';
      const strokeWidth = 4; // tuned for 100x100 viewBox

      FC.features.forEach(f => {
        const g = f && f.geometry; if (!g) return;
        const t = g.type; const c = g.coordinates;
        if (t === 'Point') {
          const [cx, cy] = proj(c[0], c[1]);
          const circle = document.createElementNS(svgNS, 'circle');
          circle.setAttribute('cx', cx.toFixed(1));
          circle.setAttribute('cy', cy.toFixed(1));
          circle.setAttribute('r', '3.5');
          circle.setAttribute('fill', strokeColor);
          svg.appendChild(circle);
        } else if (t === 'MultiPoint') {
          c.forEach(pt => {
            const [cx, cy] = proj(pt[0], pt[1]);
            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', cx.toFixed(1));
            circle.setAttribute('cy', cy.toFixed(1));
            circle.setAttribute('r', '3.5');
            circle.setAttribute('fill', strokeColor);
            svg.appendChild(circle);
          });
        } else if (t === 'LineString') {
          const d = makePath(c);
          const path = document.createElementNS(svgNS, 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', strokeColor);
          path.setAttribute('stroke-width', String(strokeWidth));
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(path);
        } else if (t === 'MultiLineString') {
          c.forEach(line => {
            const d = makePath(line);
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', strokeColor);
            path.setAttribute('stroke-width', String(strokeWidth));
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(path);
          });
        } else if (t === 'Polygon') {
          if (c[0]) {
            const d = makePath(c[0]);
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', fillColor);
            path.setAttribute('stroke', strokeColor);
            path.setAttribute('stroke-width', String(strokeWidth));
            svg.appendChild(path);
          }
        } else if (t === 'MultiPolygon') {
          c.forEach(poly => {
            if (poly[0]) {
              const d = makePath(poly[0]);
              const path = document.createElementNS(svgNS, 'path');
              path.setAttribute('d', d);
              path.setAttribute('fill', fillColor);
              path.setAttribute('stroke', strokeColor);
              path.setAttribute('stroke-width', String(strokeWidth));
              svg.appendChild(path);
            }
          });
        }
      });

      // Replace container content with SVG
      container.innerHTML = '';
      container.appendChild(svg);
    } catch (e) {
      console.warn('Prévisualisation GeoJSON (card) impossible:', e);
    }
  };

  const updateCardPreview = () => {
    try {
      if (!mapCardElRef || !filteredGeoJSONForPreview) return;
      const container = mapCardElRef.querySelector('.card-logo-wrap');
      if (!container) return;
      drawGeoPreviewToContainer(container, filteredGeoJSONForPreview);
    } catch(_) {}
  };
  // Corriger la taille juste après init au cas où le container vient d'être injecté
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 120);
  map.whenReady(() => setTimeout(() => map.invalidateSize(), 200));
  // Observer les changements de taille du conteneur pour éviter le bug d'affichage initial
  try {
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(mapElement);
  } catch(_) {}
  
  // Mobile sticky / card open + fullscreen with topbar visible
  try {
    const root = article.querySelector('.project-v2');
    const toggleBtn = article.querySelector('.project-v2 .map-toggle');
    const closeBtn = article.querySelector('.project-v2 .map-close');
    const icon = toggleBtn?.querySelector('i');
    const articleSection = article.querySelector('.project-v2-article');
    const mapWrap = article.querySelector('.project-v2 .project-v2-map-wrap');
    const textContainer = document.getElementById('project-text');
    if (root && toggleBtn) {
      const fixSize = () => setTimeout(() => map.invalidateSize(), 160);
      // Calcule et applique la hauteur de navigation pour décaler la carte sous la nav
      const getNavElement = () => {
        return (
          document.querySelector('.site-header, header.site-header') ||
          document.querySelector('header.gp-header') ||
          document.querySelector('header') ||
          document.querySelector('.main-nav') ||
          document.querySelector('.navbar') ||
          null
        );
      };
      const setNavHeightVar = () => {
        const navEl = getNavElement();
        let navH = 0;
        if (navEl) {
          const cs = getComputedStyle(navEl);
          const rect = navEl.getBoundingClientRect();
          // Si header fixe/sticky en haut, prendre sa hauteur réelle
          if ((cs.position === 'fixed' || cs.position === 'sticky') && rect.top <= 0 + 1) {
            navH = Math.ceil(rect.height);
          } else {
            // Sinon, si c'est un header standard en haut du document, on peut quand même réserver sa hauteur sur mobile
            // uniquement si son top visuel est proche du haut
            if (rect.top <= 4) navH = Math.ceil(rect.height);
          }
        }
        root.style.setProperty('--navH', navH + 'px');
      };
      setNavHeightVar();
      const setIcon = () => {
        if (!icon) return;
        // En mode étendu (fullscreen): icône compress (minimize). Sinon: icône expand
        icon.className = 'fa ' + (root.classList.contains('is-expanded') ? 'fa-compress' : 'fa-expand');
        toggleBtn.setAttribute('aria-label', root.classList.contains('is-expanded') ? 'Réduire (taille minimale)' : 'Afficher en plein écran');
        toggleBtn.setAttribute('title', root.classList.contains('is-expanded') ? 'Minimiser' : 'Agrandir');
      };

      // Create the small "map card" (mobile only)
      const ensureMapCard = () => {
        // Ensure a container exists (fallbacks if #project-text is not available)
        const container = textContainer || articleSection || root;
        if (!container) return;

        // Create the card section if it doesn't exist yet
        if (!mapCardElRef) {
          const section = document.createElement('section');
          section.className = 'map-open-section';
          section.innerHTML = `
            <div class="map-open-card" role="region" aria-label="Accéder à la carte du projet">
              <div class="card-logo-wrap"><i class="fa fa-map fallback-icon" aria-hidden="true"></i></div>
              <div class="map-card-content">
                <h2>Carte du projet</h2>
                <p>Explorez le tracé et les informations géographiques</p>
              </div>
              <div class="map-cta">
                <button type="button" class="btn-open-map" aria-label="Ouvrir la carte">Ouvrir la carte</button>
              </div>
            </div>`;
          mapCardElRef = section;
        }

        // If the card is detached from DOM or not in the right spot, (re)insert it
        const coverWrap = (container.querySelector && container.querySelector('.project-cover-wrap')) || null;
        const targetParent = container;
        if (!mapCardElRef.isConnected || mapCardElRef.parentNode !== targetParent) {
          if (coverWrap && coverWrap.parentNode === targetParent) {
            coverWrap.insertAdjacentElement('afterend', mapCardElRef);
          } else if (targetParent.firstElementChild) {
            targetParent.insertBefore(mapCardElRef, targetParent.firstElementChild);
          } else {
            targetParent.appendChild(mapCardElRef);
          }
        }

        // Mark the article section so CSS can style the cover/card as a glued block on mobile
        if (articleSection) articleSection.classList.add('has-map-card');

        // Bind open handler once
        if (!mapCardElRef.__bound) {
          const btn = mapCardElRef.querySelector('.btn-open-map');
          btn?.addEventListener('click', (e) => { e.preventDefault(); openMap(); });
          mapCardElRef.__bound = true;
        }

        // If data already available, render preview now
        updateCardPreview();
      };

      const showCard = () => { if (mapCardElRef) mapCardElRef.style.display = ''; };
      const hideCard = () => { if (mapCardElRef) mapCardElRef.style.display = 'none'; };

      const openMap = () => {
        root.classList.remove('map-collapsed');
        root.classList.add('is-expanded');
        root.style.setProperty('--mapH', '100vh');
        if (mapWrap) mapWrap.style.removeProperty('display');
        hideCard();
        setIcon();
        fixSize();
        // recentre
        const refit = () => {
          try {
            if (geoLayerRef && typeof geoLayerRef.getBounds === 'function') {
              const b = geoLayerRef.getBounds();
              if (b && b.isValid && b.isValid()) {
                map.fitBounds(b, { padding: [20, 20] });
                setTimeout(() => map.invalidateSize(), 150);
              }
            }
          } catch(e) { console.warn('Recentrage échoué:', e); }
        };
        setTimeout(refit, 180);
      };

      const closeMap = () => {
        root.classList.remove('is-expanded');
        root.classList.add('map-collapsed');
        root.style.setProperty('--mapH', '0vh');
        if (mapWrap) mapWrap.style.display = 'none';
        showCard();
        setIcon();
        fixSize();
      };

      // Toggle étendu ↔ minimisé (mobile: card→fullscreen, desktop: noop)
      toggleBtn.addEventListener('click', () => {
        const isMobile = mql.matches;
        if (isMobile && root.classList.contains('map-collapsed')) {
          // In collapsed/card mode, clicking toggle opens fullscreen
          openMap();
          return;
        }
        const willExpand = !root.classList.contains('is-expanded');
        if (willExpand) {
          root.classList.add('is-expanded');
          root.classList.remove('map-collapsed');
          root.style.setProperty('--mapH', '100vh');
          if (mapWrap) mapWrap.style.removeProperty('display');
        } else {
          // On mobile, closing via toggle should collapse to card
          if (isMobile) {
            closeMap();
          } else {
            root.classList.remove('is-expanded');
            root.style.setProperty('--mapH', '15vh');
          }
        }
        setIcon();
        fixSize();
        // Recentrer automatiquement sur l'objet de la couche affichée
        const refit = () => {
          try {
            if (geoLayerRef && typeof geoLayerRef.getBounds === 'function') {
              const b = geoLayerRef.getBounds();
              if (b && b.isValid && b.isValid()) {
                map.fitBounds(b, { padding: [20, 20] });
                setTimeout(() => map.invalidateSize(), 150);
              }
            }
          } catch(e) { console.warn('Recentrage échoué:', e); }
        };
        setTimeout(refit, 180);
      });

      // Close button in topbar (visible only when expanded on mobile)
      closeBtn?.addEventListener('click', (e) => { e.preventDefault(); closeMap(); });

      // Resize listener
      let rTOA;
      window.addEventListener('resize', () => {
        clearTimeout(rTOA);
        rTOA = setTimeout(() => map.invalidateSize(), 150);
      });

      // Responsiveness + scroll-based shrinking (mobile only)
      const mql = window.matchMedia('(max-width: 1024px)');
      const prefersMobile = () => mql.matches;
      let ticking = false;
      const maxVH = 50; // plafond "confort" si on permet l'agrandissement auto
      const minVH = 15; // min
      const shrinkRange = maxVH - minVH; // 35
      let currentVH = minVH; // par défaut minifié au chargement

      const onScroll = () => {
        if (!prefersMobile() || root.classList.contains('is-expanded') || root.classList.contains('map-collapsed')) return;
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          // Calculer une hauteur cible entre 50 → 15 en fonction du scroll de l'article
          const top = (articleSection?.scrollTop) || 0;
          const ratio = Math.max(0, Math.min(1, top / 350)); // 0..1
          const target = maxVH - shrinkRange * ratio; // 50..15
          // On empêche l'agrandissement automatique si déjà minifié par défaut
          const next = Math.min(currentVH, target);
          currentVH = Math.max(minVH, Math.min(maxVH, next));
          root.style.setProperty('--mapH', currentVH + 'vh');
          setTimeout(() => map.invalidateSize(), 60);
          ticking = false;
        });
      };

      const applyMode = () => {
        // Mettre à jour l'offset de navigation avant d'appliquer le mode
        setNavHeightVar();
        if (prefersMobile()) {
          // Mobile: collapsed (card) by default
          root.classList.remove('is-expanded');
          root.classList.add('map-collapsed');
          currentVH = minVH;
          root.style.setProperty('--mapH', '0vh');
          if (mapWrap) mapWrap.style.display = 'none';
          ensureMapCard();
          showCard();
          // Re-check shortly to guard against late DOM mutations
          setTimeout(() => { try { ensureMapCard(); showCard(); } catch(_) {} }, 60);
          articleSection?.removeEventListener('scroll', onScroll);
        } else {
          // Desktop: no card, map visible and tall
          root.classList.remove('is-expanded');
          root.classList.remove('map-collapsed');
          root.style.removeProperty('--mapH');
          if (mapWrap) mapWrap.style.removeProperty('display');
          if (mapCardElRef) mapCardElRef.style.display = 'none';
          if (articleSection) articleSection.classList.remove('has-map-card');
          articleSection?.removeEventListener('scroll', onScroll);
        }
        setIcon();
        fixSize();
      };

      // Manage binding scroll listener to avoid duplicates
      let scrollBound = false;
      const bindScrollIfNeeded = () => {
        if (!articleSection) return;
        if (prefersMobile() && !scrollBound && !root.classList.contains('map-collapsed')) {
          articleSection.addEventListener('scroll', onScroll, { passive: true });
          scrollBound = true;
        } else if ((!prefersMobile() || root.classList.contains('map-collapsed')) && scrollBound) {
          articleSection.removeEventListener('scroll', onScroll);
          scrollBound = false;
        }
      };

      // Apply now and on resize/orientation changes
      applyMode();
      bindScrollIfNeeded();
      mql.addEventListener?.('change', () => { applyMode(); bindScrollIfNeeded(); });
      window.addEventListener('orientationchange', () => setTimeout(() => { applyMode(); bindScrollIfNeeded(); }, 50));
      // Extra: on resize, keep map correct
      let rTO2;
      window.addEventListener('resize', () => {
        clearTimeout(rTO2);
        rTO2 = setTimeout(() => {
          setNavHeightVar();
          applyMode();
          bindScrollIfNeeded();
          map.invalidateSize();
        }, 150);
      });
    }
  } catch(e) { console.warn('Sticky/extend indisponible:', e); }
  
  // Création d'une icône personnalisée avec Font Awesome
  // Badge circulaire blanc bord vert avec pictogramme caméra centré
  const cameraIcon = L.divIcon({
    html: '<i class="fa fa-camera fa-fw" aria-hidden="true"></i>',
    className: 'camera-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
  
  // Gestion d'affichage des marqueurs caméra: toujours visibles (pas de min zoom)
  const __cameraMarkers = new Set();
  function updateCameraMarkersVisibility() {
    try {
      __cameraMarkers.forEach(mk => {
        const onMap = map.hasLayer(mk);
        if (!onMap) {
          try {
            if (typeof geoLayerRef?.addLayer === 'function') {
              geoLayerRef.addLayer(mk);
            } else {
              mk.addTo(map);
            }
          } catch(_) { mk.addTo(map); }
        }
      });
    } catch(_) {}
  }
  
  // Helper: affichage plein écran avec blur (comme les covers)
  // Ouvre une lightbox avec l'image en grand, un fond flouté et une croix de fermeture
  function openImageLightbox(imgUrl, title = '') {
    try {
      // Créer l'overlay une seule fois
      if (!window.__fpLightbox) {
        const overlay = document.createElement('div');
        overlay.id = 'fp-img-lightbox';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText = [
          'position:fixed',
          'inset:0',
          'z-index:9999',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'background:rgba(0,0,0,0.55)',
          'backdrop-filter:blur(6px)',
          '-webkit-backdrop-filter:blur(6px)',
          'padding:24px'
        ].join(';');

        const box = document.createElement('div');
        box.style.cssText = [
          'position:relative',
          'max-width:90vw',
          'max-height:90vh',
          'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
          'border-radius:10px',
          'overflow:hidden',
          'background:#000'
        ].join(';');

        const img = document.createElement('img');
        img.alt = title || 'image';
        img.style.cssText = 'display:block;max-width:90vw;max-height:90vh;object-fit:contain;';

        const close = document.createElement('button');
        close.type = 'button';
        close.setAttribute('aria-label', 'Fermer');
        close.innerHTML = '&times;';
        close.style.cssText = [
          'position:absolute',
          'top:8px',
          'right:10px',
          'width:36px',
          'height:36px',
          'border:none',
          'border-radius:18px',
          'background:rgba(0,0,0,0.55)',
          'color:#fff',
          'font-size:26px',
          'line-height:36px',
          'cursor:pointer'
        ].join(';');

        close.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('fp-img-lightbox')) overlay.remove(); });

        box.appendChild(img);
        box.appendChild(close);
        overlay.appendChild(box);
        window.__fpLightbox = overlay;
        window.__fpLightboxImg = img;
      }

      window.__fpLightboxImg.src = imgUrl;
      document.body.appendChild(window.__fpLightbox);
    } catch (e) {
      console.warn('Lightbox error:', e);
      // Fallback: new tab
      try { window.open(imgUrl, '_blank'); } catch(_) {}
    }
  }
  
  // Vérifier que window.basemaps est défini et contient des éléments
  if (!window.basemaps || window.basemaps.length === 0) {
    window.basemaps = [
      {
        label: 'OSM',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        default: true
      },
      {
        label: 'Positron',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB'
      },
      {
        label: 'Dark Matter',
        theme: 'dark',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB'
      }
    ];
  }
  
  // Utiliser Positron s'il existe, sinon le premier fond de carte disponible
  const basemapCfg = window.basemaps.find(b => b.label === 'Positron') || window.basemaps[0];
  
  if (basemapCfg && basemapCfg.url) {
    try {
      baseLayerRef = L.tileLayer(basemapCfg.url, { 
        attribution: basemapCfg.attribution || '' 
      }).addTo(map);
      try { window.__fpBaseLayer = baseLayerRef; } catch(_) {}
    } catch (e) {
      console.error('Erreur lors de l\'ajout du fond de carte', e);
    }
  } else {
    console.error('Aucun fond de carte valide trouvé');
  }

  // Aligner immédiatement le fond de carte sur le thème courant si un fond correspondant existe
  try {
    FPTheme.syncBasemapToTheme(document.documentElement.getAttribute('data-theme') || FPTheme.getInitialTheme());
  } catch(_) {}

  // 4. Fonction pour charger les données de la couche spécifiée dans layerName
  let layerConfig; // Déclarer la variable dans la portée de la fonction
  
  async function loadLayerData() {
    console.log(`Début du chargement des données pour la couche: ${layerName}`);
    
    // Vérifier si supabaseService est disponible
    if (!window.supabaseService) {
      console.error('supabaseService non disponible');
      return [];
    }
    
    try {
      // 1. Charger la configuration des couches
      console.log('Chargement de la configuration des couches...');
      const layersConfig = await window.supabaseService.fetchLayersConfig();
      
      if (!layersConfig || !Array.isArray(layersConfig)) {
        console.error('Erreur: la configuration des couches est invalide');
        return [];
      }
      
      // Afficher la configuration des couches
      console.log('Configuration des couches depuis Supabase:', JSON.stringify(layersConfig, null, 2));
      
      // 2. Trouver la configuration de la couche spécifiée (avec normalisation tolérante)
      //    On retire aussi les espaces pour matcher camelCase vs libellés avec espaces
      const normTarget = normalizeText(layerName).replace(/\s+/g, '');
      layerConfig =
        layersConfig.find(l => normalizeText(l.name).replace(/\s+/g, '') === normTarget)
        || layersConfig.find(l => {
          const n = normalizeText(l.name).replace(/\s+/g, '');
          return n.includes(normTarget) || normTarget.includes(n);
        });
      
      if (!layerConfig) {
        console.error(`Configuration de la couche '${layerName}' non trouvée (norm='${normTarget}')`);
        console.log('Couches disponibles:', layersConfig.map(l => `${l.name} (norm='${normalizeText(l.name)}')`).join(', '));
        return [];
      }
      
      if (!layerConfig.url) {
        console.error(`URL manquante pour la couche '${layerName}'`);
        console.log('Configuration de la couche trouvée:', JSON.stringify(layerConfig, null, 2));
        return [];
      }
      
      console.log(`Configuration de la couche '${layerName}' trouvée:`, layerConfig);
      
      // 3. Charger le fichier GeoJSON depuis l'URL
      console.log(`Chargement du GeoJSON depuis: ${layerConfig.url}`);
      console.log(`Chargement des données depuis: ${layerConfig.url}`);
      const response = await fetch(layerConfig.url);
      
      if (!response.ok) {
        console.error(`Erreur HTTP ${response.status} pour l'URL: ${layerConfig.url}`);
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      
      const geojsonData = await response.json();
      console.log(`Données GeoJSON brutes pour '${layerName}':`, geojsonData);
      
      // Afficher un résumé des propriétés des features
      if (geojsonData.features && geojsonData.features.length > 0) {
        console.log(`Nombre de features: ${geojsonData.features.length}`);
        console.log('Propriétés disponibles:', Object.keys(geojsonData.features[0].properties || {}).join(', '));
      }
      
      // 4. Filtrer les features
      let features = geojsonData.features || [];

      // 4.a Filtrage explicite via filterKey/filterValue (ex. voies lyonnaises) avec normalisation
      if (filterKey && filterValue) {
        const normKey = normalizeText(filterKey).replace(/\s+/g, '');
        const normVal = normalizeText(String(filterValue)).replace(/\s+/g, '');
        const beforeCount = features.length;
        features = features.filter(f => {
          const props = (f && f.properties) ? f.properties : {};
          // Trouver la clé de propriété en ignorant casse/accents/ponctuation
          let matchedKey = Object.keys(props).find(k => normalizeText(k).replace(/\s+/g, '') === normKey) || (Object.prototype.hasOwnProperty.call(props, filterKey) ? filterKey : null);
          if (!matchedKey) return false;
          const v = props[matchedKey];
          if (v === undefined || v === null) return false;
          return normalizeText(String(v)).replace(/\s+/g, '') === normVal;
        });
        console.log(`Filtrage appliqué (normalisé): ${filterKey} ≈ ${filterValue} → ${features.length}/${beforeCount} features`);
      }

      // 4.b Filtrage automatique pour Urbanisme: ne garder que le projet courant (avec normalisation)
      if (layerName === 'urbanisme' && projectName) {
        const target = normalizeText(projectName);
        const beforeCount = features.length;
        features = features.filter(f => {
          const props = f && f.properties ? f.properties : {};
          const candidate = normalizeText(props.name || props.nom || props.Name || props.NOM || '');
          return candidate === target;
        });
        console.log(`Filtrage Urbanisme par nom (normalisé) « ${projectName} » → ${features.length}/${beforeCount} features`);
      }
      
      return features;
      
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      return [];
    }
  }

  // 5. Chargement et affichage des données
  loadLayerData()
    .then(data => {
      if (!data || data.length === 0) {
        console.warn(`Aucune donnée trouvée pour la couche ${layerName}`);
        return { type: 'FeatureCollection', features: [] };
      }
      
      // Convertir les données en format GeoJSON
      return {
        type: 'FeatureCollection',
        features: data.map(item => ({
          type: 'Feature',
          // Conserver des propriétés plates pour compatibilité (éviter properties.properties)
          properties: item && item.properties ? item.properties : item,
          geometry: item.geometry 
            ? (typeof item.geometry === 'string' 
              ? JSON.parse(item.geometry) 
              : item.geometry)
            : null
        })).filter(f => f.geometry) // Filtrer les entrées sans géométrie
      };
    })
    .then(data => {
      // Conserver pour l'aperçu dans la carte (mobile)
      try {
        filteredGeoJSONForPreview = data;
        updateCardPreview();
      } catch(_) {}
      
      // Créer et ajouter la couche avec le style de DataModule si disponible
      console.log('Configuration de style de la couche:', layerConfig.style);
      
      const geoLayer = L.geoJSON(data, {
        style: (feature) => {
          // Base: style provenant de la configuration de la couche (Supabase)
          const base = (layerConfig && layerConfig.style) ? layerConfig.style : {};
          // Override possible par DataModule
          const dmStyle = window.DataModule?.getFeatureStyle?.(feature, layerName) || {};
          const style = { ...base, ...dmStyle };

          // Couches sans remplissage (projets transports & vélo)
          const noFillLayers = new Set(['planVelo','amenagementCyclable','voielyonnaise','bus','tramway','metroFuniculaire','reseauProjeteSitePropre']);

          // Normaliser et fournir des valeurs par défaut compatibles Leaflet
          const computedFill = noFillLayers.has(layerName)
            ? false
            : (typeof style.fill === 'boolean' ? style.fill : true);

          // Épaissir fortement les traits dans les fiches projets
          const minLineWeight = 6; // poids minimum souhaité
          const parsedWeight = (typeof style.weight === 'number' ? style.weight : parseFloat(style.weight)) || 0;
          const lineWeight = Math.max(parsedWeight, minLineWeight);

          // Dash fixes très espacés (valeur fixe demandée) — uniquement pour les lignes
          const spacedDash = '20,10';
          const geomType = feature?.geometry?.type || '';
          const isLine = /LineString/i.test(geomType);

          const finalStyle = {
            color: style.color || '#3388ff',
            weight: lineWeight,
            opacity: typeof style.opacity === 'number' ? style.opacity : parseFloat(style.opacity) || 1.0,
            fill: computedFill,
            fillColor: style.fillColor || style.color || '#3388ff',
            fillOpacity: typeof style.fillOpacity === 'number' ? style.fillOpacity : parseFloat(style.fillOpacity) || (computedFill ? 0.2 : 0),
            dashArray: isLine ? spacedDash : null // pas de dash sur les polygones
          };

          console.log('Style appliqué (merge layerConfig/DataModule):', finalStyle);
          return finalStyle;
        },
        pointToLayer: (feature, latlng) => {
          // Créer un Marker avec l'icône caméra (badge circulaire)
          try {
            const mk = L.marker(latlng, { riseOnHover: true, icon: cameraIcon });
            try { __cameraMarkers.add(mk); } catch(_) {}
            return mk;
          } catch (_) {
            // Fallback si jamais Marker échoue pour une raison quelconque
            return L.marker(latlng, { icon: cameraIcon });
          }
        },
        onEachFeature: async (feature, layer) => {
          console.log('Feature chargée:', feature);
          if (window.DataModule?.bindFeatureEvents) {
            window.DataModule.bindFeatureEvents(layer, feature, geoLayer, layerName);
          }

          // Log console au clic + popup image (hover & clic) si props.imgUrl
          try {
            if (!layer.__fpPhotoBound) {
              layer.__fpPhotoBound = true;
              const props = (feature && feature.properties) || {};
              const logClick = () => {
                console.log('[FicheProjet] Click sur feature', {
                  layer: layerName,
                  geometryType: feature?.geometry?.type,
                  id: props.id || props.gid || props.objectid || null,
                  name: props.name || props.nom || props.titre || null,
                  props
                });
              };

              const imgUrl = props.imgUrl; // clé fournie par l'utilisateur
              if (imgUrl) {
                const title = props.titre || props.title || props.name || props.nom || '';
                const dmHtml = (window.DataModule && typeof window.DataModule.generateTooltipContent === 'function')
                  ? await window.DataModule.generateTooltipContent(feature, layerName, 'cover')
                  : `
                    <div class="map-photo" style="max-width:260px">
                      <img src="${imgUrl}" alt="photo" style="max-width:260px;max-height:180px;display:block;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.35)" />
                      ${title ? `<div style="margin-top:6px;font-weight:500;color:#333">${title}</div>` : ''}
                    </div>
                  `;
                const ensurePopup = () => { try { layer.bindPopup(dmHtml, { autoPan: true, closeButton: true, maxWidth: 300 }); } catch(_) {} };
                const openPopup = () => { ensurePopup(); try { layer.openPopup(); } catch(_) {} };
                const closePopup = () => { try { layer.closePopup(); } catch(_) {} };

                layer.on('mouseover', openPopup);
                layer.on('mouseout', closePopup);
                layer.on('click', () => {
                  logClick();
                  const open = window.DataModule?.openCoverLightbox || openImageLightbox;
                  try { open(imgUrl, title); } catch(_) { openImageLightbox(imgUrl, title); }
                });
              } else {
                // Pas d'image: on log seulement au clic
                layer.on('click', logClick);
              }
            }
          } catch (e) { console.warn('Erreur ajout listener (hover/click):', e); }
        }
      }).addTo(map);
      // Conserver une référence pour recentrage (map-toggle)
      try { geoLayerRef = geoLayer; } catch(_) {}
      // S'assurer que les marqueurs caméra sont visibles (sans contrainte de zoom)
    try { map.off('zoomend', updateCameraMarkersVisibility); } catch(_) {}
    try { updateCameraMarkersVisibility(); } catch(_) {}
      // S'assurer que la couche est au-dessus des fonds et autres couches
      try { geoLayer.bringToFront(); } catch(_) {}
      // Ajuster la vue initiale sur l'objet affiché
      try {
        if (typeof geoLayer.getBounds === 'function') {
          const b = geoLayer.getBounds();
          if (b && b.isValid && b.isValid()) {
            map.fitBounds(b, { padding: [20, 20] });
          }
        }
      } catch(_) {}

      // Animation des tirets (dash) : uniquement pour les lignes, throttle ~30fps et pause pendant le zoom
      let __dashAnimId;
      let __dashOffset = 0;
      let __pausedDash = false;
      let __lastTime = 0;
      const __animateDashes = (t = 0) => {
        // throttle ~30fps
        if (__pausedDash) { __dashAnimId = requestAnimationFrame(__animateDashes); return; }
        if (!__lastTime) __lastTime = t;
        const dt = t - __lastTime;
        if (dt < 33) { __dashAnimId = requestAnimationFrame(__animateDashes); return; }
        __lastTime = t;
        __dashOffset = (__dashOffset + 1) % 1000;
        try {
          geoLayer.eachLayer(l => {
            const gtype = l?.feature?.geometry?.type || '';
            const isLine = /LineString/i.test(gtype);
            // n'animer que les lignes qui ont un dash défini
            if (isLine && l && l.options && l.options.dashArray && typeof l.setStyle === 'function') {
              l.setStyle({ dashOffset: String(__dashOffset) });
            }
          });
        } catch (_) {}
        __dashAnimId = requestAnimationFrame(__animateDashes);
      };
      map.on('zoomstart', () => { __pausedDash = true; });
      map.on('zoomend',   () => { __pausedDash = false; });
      __animateDashes();

      // Nettoyage de l'animation si on quitte la page
      window.addEventListener('beforeunload', () => {
        if (__dashAnimId) cancelAnimationFrame(__dashAnimId);
      }, { once: true });

      // Ajustement de la vue et correction de la taille
      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
        // si le container était masqué/reflow
        setTimeout(() => map.invalidateSize(), 100);
      }
    })
    .catch(err => {
      console.error('Erreur chargement GeoJSON :', err);
      textEl.insertAdjacentHTML('beforeend',
        '<p style="color:red;">Impossible de charger la carte.</p>');
    });
});
