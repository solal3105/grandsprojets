// modules/ficheprojet.js
// Fiche projet — Magazine-quality reading experience

/* ===========================================================================
   CONFIGURATION
   =========================================================================== */

const FP_CONFIG = {
  PROD_ORIGIN: 'https://grandsprojets.netlify.app',
  DEFAULT_CATEGORY: 'velo',
  MAP_DEFAULT_ZOOM: 13,
  MAP_DEFAULT_CENTER: [45.764043, 4.835659],
  CATEGORY_LABELS: {
    mobilite: 'Mobilité',
    urbanisme: 'Urbanisme',
    velo: 'Vélo'
  },
  CATEGORY_ICONS: {
    mobilite: 'fa-train-tram',
    urbanisme: 'fa-building',
    velo: 'fa-bicycle'
  }
};

window.basemaps = window.basemaps || [
  { label: 'Positron', url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', attribution: '© CartoDB' },
  { label: 'Dark Matter', theme: 'dark', url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', attribution: '© CartoDB' }
];

/* ===========================================================================
   UTILITIES
   =========================================================================== */

function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    projectName: params.get('project') || '',
    category: params.get('cat') || FP_CONFIG.DEFAULT_CATEGORY,
    city: params.get('city') || null,
    isEmbed: params.get('embed') === 'true' || params.get('embed') === '1'
  };
}

function toAbsoluteURL(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return FP_CONFIG.PROD_ORIGIN + url;
  return url;
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch (_) { return url; }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

/* ===========================================================================
   SEO
   =========================================================================== */

function applySEO(projectName, attrs, category) {
  try {
    document.title = `${projectName} – Grands Projets`;
    const canonicalUrl = `${FP_CONFIG.PROD_ORIGIN}/fiche/?cat=${category}&project=${encodeURIComponent(projectName)}`;

    const setMeta = (sel, attr, val) => {
      let el = document.querySelector(sel);
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr.split('=')[0], attr.split('=')[1] || ''); document.head.appendChild(el); }
      el.content = val;
    };

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;

    if (attrs.description) setMeta('meta[name="description"]', 'name=description', attrs.description);

    // Open Graph
    [['og:title', projectName], ['og:description', attrs.description || ''], ['og:image', toAbsoluteURL(attrs.cover) || `${FP_CONFIG.PROD_ORIGIN}/img/logomin.png`], ['og:type', 'article'], ['og:url', canonicalUrl]]
      .forEach(([prop, val]) => setMeta(`meta[property="${prop}"]`, `property=${prop}`, val));

    // Twitter
    [['twitter:title', projectName], ['twitter:description', attrs.description || ''], ['twitter:image', toAbsoluteURL(attrs.cover) || `${FP_CONFIG.PROD_ORIGIN}/img/cover/meta.png`]]
      .forEach(([name, val]) => setMeta(`meta[name="${name}"]`, `name=${name}`, val));

    // JSON-LD
    const ficheJsonLd = document.getElementById('fiche-jsonld');
    if (ficheJsonLd) {
      try {
        const data = JSON.parse(ficheJsonLd.textContent);
        data.headline = projectName;
        data.description = attrs.description || `Projet ${category} : ${projectName}`;
        data.url = canonicalUrl;
        if (attrs.cover) data.image = toAbsoluteURL(attrs.cover);
        if (attrs.created_at) data.datePublished = attrs.created_at;
        ficheJsonLd.textContent = JSON.stringify(data);
      } catch (_) {}
    }

    addBreadcrumbSchema(projectName, category);
    addArticleSchema(projectName, attrs, category);
  } catch (e) { console.warn('[SEO] Error:', e); }
}

function addBreadcrumbSchema(projectName, category) {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'breadcrumb-schema';
  script.textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Accueil", "item": `${FP_CONFIG.PROD_ORIGIN}/` },
      { "@type": "ListItem", "position": 2, "name": FP_CONFIG.CATEGORY_LABELS[category] || category, "item": `${FP_CONFIG.PROD_ORIGIN}/?cat=${category}` },
      { "@type": "ListItem", "position": 3, "name": projectName }
    ]
  });
  document.head.appendChild(script);
}

function addArticleSchema(projectName, attrs, category) {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'article-schema';
  script.textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": "Article",
    "headline": projectName,
    "description": attrs.description || `Projet ${category} : ${projectName}`,
    "image": toAbsoluteURL(attrs.cover) || `${FP_CONFIG.PROD_ORIGIN}/img/logomin.png`,
    "datePublished": attrs.created_at || new Date().toISOString(),
    "author": { "@type": "Organization", "name": "Grands Projets" },
    "publisher": { "@type": "Organization", "name": "Grands Projets", "logo": { "@type": "ImageObject", "url": `${FP_CONFIG.PROD_ORIGIN}/img/logomin.png` } }
  });
  document.head.appendChild(script);
}

/* ===========================================================================
   SIDEBAR SECTION BUILDERS — Lightweight sections, not heavy cards
   =========================================================================== */

function buildLinkSection(url) {
  if (!url) return '';
  const domain = extractDomain(url);
  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  return `
    <div class="fiche-section">
      <div class="fiche-section__label">Site officiel</div>
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="fiche-link" aria-label="Ouvrir le site">
        <img src="${favicon}" alt="" class="fiche-link__favicon" onerror="this.style.display='none'">
        <span class="fiche-link__domain">${escapeHTML(domain)}</span>
        <span class="fiche-link__arrow"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>
      </a>
    </div>`;
}

async function buildDocumentsSection(projectName) {
  try {
    if (!window.supabaseService?.getConsultationDossiersByProject) return '';
    const dossiers = await window.supabaseService.getConsultationDossiersByProject(projectName);
    if (!Array.isArray(dossiers) || !dossiers.length) return '';

    const uniq = new Map();
    dossiers.forEach(d => { if (d?.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d); });
    const docs = Array.from(uniq.values());
    if (!docs.length) return '';

    const items = docs.map(doc => {
      const title = doc.title || doc.pdf_url?.split('/').pop() || 'Document PDF';
      const pdfUrl = toAbsoluteURL(doc.pdf_url);
      return `
        <div class="fiche-doc">
          <span class="fiche-doc__icon"><i class="fa-solid fa-file-pdf"></i></span>
          <span class="fiche-doc__title">${escapeHTML(title)}</span>
          <span class="fiche-doc__actions">
            <button type="button" class="fiche-doc__btn fiche-doc__btn--view" data-pdf-preview="${pdfUrl}" data-pdf-title="${escapeHTML(title)}">
              <i class="fa-solid fa-eye"></i> Voir
            </button>
            <a href="${pdfUrl}" target="_blank" rel="noopener noreferrer" download class="fiche-doc__btn fiche-doc__btn--download" title="Télécharger" aria-label="Télécharger ${escapeHTML(title)}">
              <i class="fa-solid fa-download"></i>
            </a>
          </span>
        </div>`;
    }).join('');

    return `
      <div class="fiche-section">
        <div class="fiche-section__label">Documents</div>
        <div class="fiche-section__docs">${items}</div>
      </div>`;
  } catch (e) { console.warn('[Documents] Error:', e); return ''; }
}

/* ===========================================================================
   LIGHTBOX & PDF PREVIEW
   =========================================================================== */

function openLightbox(imageUrl) {
  if (window.Lightbox) {
    window.Lightbox.open(imageUrl, 'Image agrandie');
  }
}

function openPDFPreview(pdfUrl, title) {
  const overlay = document.getElementById('pdf-preview-overlay');
  if (!overlay) return;
  const titleEl = overlay.querySelector('#pdf-preview-title');
  const iframe = overlay.querySelector('#pdf-preview-frame');
  if (titleEl) titleEl.textContent = title || 'Prévisualisation du document';
  if (iframe) iframe.src = pdfUrl;
  if (window.ModalHelper) window.ModalHelper.open('pdf-preview-overlay');
  else overlay.style.display = 'flex';
}

/* ===========================================================================
   MAP
   =========================================================================== */

function getCategoryStyle(category) {
  const categoryIcon = window.categoryIcons?.find(c => c.category === category);
  const iconClass = categoryIcon?.icon_class || 'fa-solid fa-map-marker';
  let categoryColor = 'var(--primary)';
  if (categoryIcon?.category_styles) {
    try {
      const styles = typeof categoryIcon.category_styles === 'string' ? JSON.parse(categoryIcon.category_styles) : categoryIcon.category_styles;
      categoryColor = styles.color || categoryColor;
    } catch (_) {}
  }
  return { color: categoryColor, iconClass };
}

function createContributionMarkerIcon(category) {
  const { color, iconClass } = category ? getCategoryStyle(category) : { color: 'var(--primary)', iconClass: 'fa-solid fa-map-marker' };
  return window.L.divIcon({
    html: `<div class="gp-custom-marker" style="--marker-color: ${color};"><i class="${iconClass}"></i></div>`,
    className: 'gp-marker-container', iconSize: [32, 40], iconAnchor: [16, 40], popupAnchor: [0, -40]
  });
}

function getBasemapConfig(theme) {
  if (theme === 'dark') {
    const tm = window.ThemeManager?.findBasemapForTheme?.('dark');
    return tm || { url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', attribution: '© CartoDB' };
  }
  return { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' };
}

function createGeoJSONLayer(map, geojsonData, category) {
  return window.L.geoJSON(geojsonData, {
    style: feature => window.getFeatureStyle ? window.getFeatureStyle(feature, category) : { color: 'var(--primary)', weight: 3, opacity: 0.8, fillOpacity: 0.3 },
    onEachFeature: (feature, layer) => { if (feature.properties?.imgUrl && window.CameraMarkers) window.CameraMarkers.bindCameraMarkerEvents(feature, layer); },
    pointToLayer: (feature, latlng) => {
      const props = feature?.properties || {};
      if (props.imgUrl && window.CameraMarkers) return window.CameraMarkers.createCameraMarker(latlng, 'markerPane', props.color || '#666');
      return window.L.marker(latlng, { icon: createContributionMarkerIcon(props.category || category) });
    }
  }).addTo(map);
}

async function initProjectMap(containerId, projectName, category) {
  try {
    if (!window.L) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const map = window.L.map(containerId, { center: FP_CONFIG.MAP_DEFAULT_CENTER, zoom: FP_CONFIG.MAP_DEFAULT_ZOOM, zoomControl: true });
    const basemap = getBasemapConfig(currentTheme());
    const baseLayer = window.L.tileLayer(basemap.url, { attribution: basemap.attribution, maxZoom: 19 }).addTo(map);

    window.ficheProjectMap = map;
    window.__fpMap = map;
    window.__fpBaseLayer = baseLayer;

    // Theme observer
    new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.attributeName !== 'data-theme') return;
        const t = currentTheme();
        if (window.__fpMap && window.__fpBaseLayer) {
          const nb = getBasemapConfig(t);
          window.__fpMap.removeLayer(window.__fpBaseLayer);
          window.__fpBaseLayer = window.L.tileLayer(nb.url, { attribution: nb.attribution, maxZoom: 19 }).addTo(window.__fpMap);
        }
        updateCityLogo(t);
      });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Load GeoJSON
    try {
      const project = await window.supabaseService?.fetchProjectByCategoryAndName(category, projectName);
      if (!project?.geojson_url) return map;
      const resp = await fetch(project.geojson_url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data?.features?.length) {
        const layer = createGeoJSONLayer(map, data, category);
        map.fitBounds(layer.getBounds(), { padding: [30, 30] });
        window.__ficheProjectBounds = layer.getBounds();
        window.__ficheProjectGeoJSON = data;
        window.__ficheProjectCategory = category;
        if (window.CameraMarkers) window.CameraMarkers.initZoomControl(map);
      }
    } catch (e) { console.warn('[Map] GeoJSON error:', e); }
    return map;
  } catch (e) { console.error('[Map] Init error:', e); }
}

function updateCityLogo(theme) {
  const logo = document.getElementById('city-logo');
  const b = window._cityBranding;
  if (!logo || !b?.logo_url) return;
  const url = (theme === 'dark' && b.dark_logo_url) ? b.dark_logo_url : b.logo_url;
  const safe = window.SecurityUtils ? window.SecurityUtils.sanitizeUrl(url) : url;
  const alt = window.SecurityUtils ? window.SecurityUtils.escapeAttribute(b.brand_name || '') : (b.brand_name || '');
  logo.innerHTML = `<img src="${safe}" alt="${alt}">`;
}

/* ===========================================================================
   HTML TEMPLATE — Magazine layout with BEM classes
   =========================================================================== */

function generateFicheHTML(projectName, category, isEmbed, coverUrl, description) {
  const cover = coverUrl ? toAbsoluteURL(coverUrl) : '';
  const safeName = escapeHTML(projectName);
  const catLabel = FP_CONFIG.CATEGORY_LABELS[category] || category;
  const catIcon = FP_CONFIG.CATEGORY_ICONS[category] || 'fa-map';
  const { color: catColor } = getCategoryStyle(category);

  const heroSection = cover ? `
    <section class="fiche-hero" style="--cat-color: ${catColor}">
      <img class="fiche-hero__img" src="${cover}" alt="${safeName}" loading="eager">
      <div class="fiche-hero__scrim"></div>
      <div class="fiche-hero__content">
        <span class="fiche-hero__badge"><i class="fa-solid ${catIcon}"></i> ${escapeHTML(catLabel)}</span>
        <h1 class="fiche-hero__title">${safeName}</h1>
      </div>
      <button class="fiche-hero__expand" data-lightbox-image="${cover}" aria-label="Agrandir l'image">
        <i class="fa-solid fa-expand"></i>
      </button>
    </section>` : `
    <section class="fiche-hero fiche-hero--empty" style="--cat-color: ${catColor}">
      <div class="fiche-hero__content">
        <span class="fiche-hero__badge"><i class="fa-solid ${catIcon}"></i> ${escapeHTML(catLabel)}</span>
        <h1 class="fiche-hero__title">${safeName}</h1>
      </div>
    </section>`;

  const header = isEmbed ? '' : `
    <header class="fiche-header" id="fiche-header">
      <div class="fiche-header__accent"></div>
      <div class="fiche-header__inner">
        <a href="/" class="fiche-header__back" aria-label="Retour à l'accueil">
          <i class="fa-solid fa-arrow-left"></i>
          <span>Retour</span>
        </a>
        <span class="fiche-header__title">${safeName}</span>
        <div class="fiche-header__actions">
          <button type="button" id="btn-share-link" class="fiche-header__btn" title="Copier le lien" aria-label="Partager">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button type="button" id="btn-toggle-theme" class="fiche-header__btn" title="Changer de thème" aria-label="Changer de thème">
            <i class="fa-solid fa-moon"></i>
          </button>
          <div id="city-logo" class="fiche-header__logo"></div>
        </div>
      </div>
    </header>`;

  return `
    <div class="fiche${isEmbed ? ' fiche--embed' : ''}" style="--cat-color: ${catColor}">
      ${header}
      ${heroSection}

      <div class="fiche-body">
        <main class="fiche-main">
          <div id="fiche-lead"></div>
          <div id="project-markdown-content"></div>
        </main>

        <aside class="fiche-sidebar" id="fiche-sidebar"></aside>
      </div>

      <!-- Fullscreen map modal -->
      <div id="modal-map-fullscreen" class="gp-modal-overlay" role="dialog" aria-modal="true" aria-hidden="true" style="display:none">
        <div class="gp-modal gp-modal--xlarge" style="max-width:95vw;max-height:95vh;">
          <div class="gp-modal-header">
            <div class="gp-modal-title">Carte du projet</div>
            <button class="btn-secondary gp-modal-close" aria-label="Fermer">×</button>
          </div>
          <div class="gp-modal-body" style="height:80vh;padding:0;">
            <div id="project-map-fullscreen" style="width:100%;height:100%;"></div>
          </div>
        </div>
      </div>
    </div>`;
}

/* ===========================================================================
   MARKDOWN RENDERING
   =========================================================================== */

async function renderMarkdown(markdownUrl, container) {
  try {
    const resp = await fetch(markdownUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const md = await resp.text();

    if (window.MarkdownUtils) {
      const { html } = window.MarkdownUtils.renderMarkdown(md);
      container.innerHTML = html;
      enhanceMarkdownElements(container);
    } else {
      const safe = window.SecurityUtils ? window.SecurityUtils.escapeHtml(md) : md;
      container.innerHTML = `<p>${safe}</p>`;
    }
  } catch (e) {
    console.error('[Markdown] Load error:', e);
    container.innerHTML = '<p class="fiche-error">Erreur de chargement du contenu.</p>';
  }
}

function enhanceMarkdownElements(container) {
  // Tables: horizontal scroll wrapper
  container.querySelectorAll('table').forEach(table => {
    if (!table.parentElement.classList.contains('table-wrapper')) {
      const w = document.createElement('div');
      w.className = 'table-wrapper';
      table.parentNode.insertBefore(w, table);
      w.appendChild(table);
    }
  });

  // Images: lazy load
  container.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
  });

  // External links: target blank + icon
  container.querySelectorAll('a[href^="http"]').forEach(link => {
    if (!link.hostname.includes(window.location.hostname)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      if (!link.querySelector('.external-icon')) {
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-arrow-up-right-from-square external-icon';
        link.appendChild(icon);
      }
    }
  });

  // Code blocks: copy button
  container.querySelectorAll('pre code').forEach(code => {
    const pre = code.parentElement;
    if (pre.querySelector('.copy-button')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-button';
    btn.innerHTML = '<i class="fa-solid fa-copy"></i>';
    btn.onclick = () => {
      navigator.clipboard.writeText(code.textContent);
      btn.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 2000);
    };
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

/* ===========================================================================
   EVENT BINDING
   =========================================================================== */

function bindGlobalEvents() {
  // Delegated: lightbox images
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-lightbox-image]');
    if (btn) { e.preventDefault(); openLightbox(btn.dataset.lightboxImage); }
  });

  // Delegated: PDF preview
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-pdf-preview]');
    if (btn) { e.preventDefault(); openPDFPreview(btn.dataset.pdfPreview, btn.dataset.pdfTitle); }
  });

  // Header: floating → solid transition on scroll
  const header = document.getElementById('fiche-header');
  if (header) {
    let ticking = false;
    const threshold = 80;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          header.classList.toggle('scrolled', window.scrollY > threshold);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
    // Initial check (page may already be scrolled on load)
    header.classList.toggle('scrolled', window.scrollY > threshold);
  }
}

function bindHeaderEvents() {
  // Share
  const btnShare = document.getElementById('btn-share-link');
  if (btnShare) {
    btnShare.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const orig = btnShare.innerHTML;
        btnShare.innerHTML = '<i class="fa-solid fa-check"></i>';
        btnShare.classList.add('fiche-header__btn--success');
        setTimeout(() => { btnShare.innerHTML = orig; btnShare.classList.remove('fiche-header__btn--success'); }, 2000);
        showFicheToast('Lien copié !');
      } catch (_) { showFicheToast('Erreur lors de la copie'); }
    });
  }

  // Theme toggle
  const btnTheme = document.getElementById('btn-toggle-theme');
  if (btnTheme) {
    const updateIcon = () => {
      const icon = btnTheme.querySelector('i');
      if (icon) icon.className = currentTheme() === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    };
    updateIcon();

    btnTheme.addEventListener('click', () => {
      if (window.ThemeManager?.toggle) {
        window.ThemeManager.toggle();
        updateIcon();
      }
    });
  }
}

function showFicheToast(msg) {
  if (window.Toast) {
    window.Toast.show(msg, 'success', 2600);
  }
}

/* ===========================================================================
   MAP EXPAND (Fullscreen modal)
   =========================================================================== */

function openMapFullscreenModal() {
  if (!window.ModalHelper) return;
  window.ModalHelper.open('modal-map-fullscreen', {
    dismissible: true, lockScroll: true,
    onOpen: async () => {
      const container = document.getElementById('project-map-fullscreen');
      if (!container || !window.L) return;
      container.innerHTML = '';

      const basemap = getBasemapConfig(currentTheme());
      const fsMap = window.L.map('project-map-fullscreen', { center: FP_CONFIG.MAP_DEFAULT_CENTER, zoom: FP_CONFIG.MAP_DEFAULT_ZOOM, zoomControl: true });
      window.L.tileLayer(basemap.url, { attribution: basemap.attribution, maxZoom: 19 }).addTo(fsMap);

      if (window.__ficheProjectGeoJSON) {
        const layer = createGeoJSONLayer(fsMap, window.__ficheProjectGeoJSON, window.__ficheProjectCategory);
        setTimeout(() => { fsMap.invalidateSize(); fsMap.fitBounds(layer.getBounds(), { padding: [50, 50] }); }, 150);
      } else {
        setTimeout(() => fsMap.invalidateSize(), 100);
      }
      window.__fullscreenMap = fsMap;
    },
    onClose: () => { if (window.__fullscreenMap) { window.__fullscreenMap.remove(); window.__fullscreenMap = null; } }
  });
}

function bindMapExpandEvent() {
  const btn = document.getElementById('btn-expand-map');
  if (btn) btn.addEventListener('click', openMapFullscreenModal);
}

/* ===========================================================================
   MAIN INIT
   =========================================================================== */

async function initFicheProjet() {
  try {
    // 1. Theme
    if (window.ThemeManager) window.ThemeManager.init();

    // 2. MarkdownUtils
    if (window.MarkdownUtils) await window.MarkdownUtils.loadDeps();

    // 3. URL params
    const { projectName, category, city, isEmbed } = getURLParams();
    const article = document.getElementById('project-article');

    if (!projectName) {
      article.innerHTML = `<div class="fiche"><div class="fiche-error"><div class="fiche-error__icon"><i class="fa-solid fa-question"></i></div><h1>Projet non spécifié</h1><p>Paramètre <code>?project=nom</code> manquant.</p></div></div>`;
      return;
    }

    // 4. Fetch project data
    let projectData = null;
    try {
      projectData = await window.supabaseService?.fetchProjectByCategoryAndName(category, projectName);
      window.__fpContributionProject = projectData || null;
    } catch (e) { console.error('[FicheProjet] Data error:', e); }

    if (!projectData) {
      article.innerHTML = `<div class="fiche"><div class="fiche-error"><div class="fiche-error__icon"><i class="fa-solid fa-circle-exclamation"></i></div><h1>Projet introuvable</h1><p>Le projet « ${escapeHTML(projectName)} » n'existe pas dans la catégorie « ${escapeHTML(category)} ».</p></div></div>`;
      return;
    }

    // 5. City branding
    const projectCity = projectData?.ville || city;
    try {
      if (window.CityBrandingModule) await window.CityBrandingModule.loadAndApplyBranding(projectCity);
      if (window.supabaseService?.getCityBranding) {
        const branding = await window.supabaseService.getCityBranding(projectCity);
        if (branding) window._cityBranding = branding;
      }
    } catch (e) { console.warn('[FicheProjet] Branding error:', e); }

    // 6. Render HTML shell
    article.innerHTML = generateFicheHTML(projectName, category, isEmbed, projectData.cover_url, projectData.description);

    // 7. City logo
    if (!isEmbed) updateCityLogo(currentTheme());

    // 8. SEO
    applySEO(projectName, { description: projectData.description || '', cover: projectData.cover_url || '', created_at: projectData.created_at }, category);

    // 9. Build sidebar sections (map + links + docs)
    const sidebar = document.getElementById('fiche-sidebar');
    if (sidebar) {
      const mapSection = `
        <div class="fiche-section fiche-section--map">
          <div class="fiche-section__label">Carte du projet</div>
          <div class="fiche-map"><div id="project-map"></div></div>
          <button type="button" class="fiche-map__expand" id="btn-expand-map">
            <i class="fa-solid fa-expand"></i> Agrandir la carte
          </button>
        </div>`;

      const linkSection = buildLinkSection(projectData.official_url);
      const docsSection = await buildDocumentsSection(projectName);

      sidebar.innerHTML = [mapSection, linkSection, docsSection].filter(Boolean).join('');
    }

    // 10. Markdown + smart description
    const mdContainer = document.getElementById('project-markdown-content');
    const leadContainer = document.getElementById('fiche-lead');
    const hasMarkdown = !!projectData.markdown_url;

    if (hasMarkdown) {
      await renderMarkdown(projectData.markdown_url, mdContainer);
    } else {
      mdContainer.innerHTML = '';
    }

    // Show description as lead paragraph only when there's no article content
    if (leadContainer && projectData.description && !hasMarkdown) {
      leadContainer.innerHTML = `<p class="fiche-lead__text">${escapeHTML(projectData.description)}</p>`;
    }

    // 11. Map
    await initProjectMap('project-map', projectName, category);

    // 12. Events
    bindGlobalEvents();
    bindHeaderEvents();
    bindMapExpandEvent();

  } catch (e) {
    console.error('[FicheProjet] Fatal error:', e);
    document.getElementById('project-article').innerHTML = `<div class="fiche"><div class="fiche-error"><div class="fiche-error__icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h1>Erreur</h1><p>${escapeHTML(e.message)}</p></div></div>`;
  }
}

/* ===========================================================================
   BOOT
   =========================================================================== */

document.addEventListener('DOMContentLoaded', initFicheProjet);
