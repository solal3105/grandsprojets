/* ============================================================================
   FICHE V2 — JavaScript
   
   Self-contained page logic. No ModalHelper, no Lightbox module.
   Uses site modules: supabaseService, ThemeManager, CityBrandingModule,
   datamodule (getFeatureStyle, createContributionMarkerIcon, getCategoryStyle),
   MarkdownUtils, L (maplibre-compat shim).
   ============================================================================ */
;(function () {
  'use strict';

  /* ═══════════════ CONFIG ═══════════════ */
  const CFG = {
    PROD: 'https://grandsprojets.netlify.app',
    DEFAULT_CENTER: [45.764043, 4.835659],
    DEFAULT_ZOOM: 13,
    DEFAULT_CAT: 'velo',
    CAT_LABELS: { mobilite: 'Mobilité', urbanisme: 'Urbanisme', velo: 'Vélo' },
    CAT_ICONS:  { mobilite: 'fa-train-tram', urbanisme: 'fa-building', velo: 'fa-bicycle' },
  };

  /* ═══════════════ BASEMAPS ═══════════════ */
  window.basemaps = window.basemaps || [
    { label: 'Positron',    kind: 'raster', url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', attribution: '© CartoDB', theme: 'light' },
    { label: 'Dark Matter', kind: 'raster', url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', attribution: '© CartoDB', theme: 'dark' },
  ];

  /* ═══════════════ DOM refs ═══════════════ */
  const $ = id => document.getElementById(id);
  const el = {
    root:         $('fv2'),
    topbar:       $('fv2-topbar'),
    topTitle:     $('fv2-topbar-title'),
    topLogo:      $('fv2-topbar-logo'),
    topLogoImg:   $('fv2-topbar-logo-img'),
    btnTheme:     $('fv2-btn-theme'),
    btnShare:     $('fv2-btn-share'),
    hero:         $('fv2-hero'),
    heroInner:    $('fv2-hero-inner'),
    heroCity:     $('fv2-hero-city'),
    heroCityLogo: $('fv2-hero-city-logo'),
    body:         $('fv2-body'),
    main:         $('fv2-main'),
    aside:        $('fv2-aside'),
    descBlock:    $('fv2-desc-block'),
    mapBlock:     null, // carte maintenant dans le héro
    coverBlock:   $('fv2-cover-block'),
    coverImg:     $('fv2-cover-img'),
    btnCoverExpand: $('fv2-btn-cover-expand'),
    map:          $('fv2-map'),
    btnMapFs:     $('fv2-btn-map-fs'),
    proseBlock:   $('fv2-prose-block'),
    prose:        $('fv2-prose'),
    relatedBlock: $('fv2-related-block'),
    related:      $('fv2-related'),
    brandCard:    $('fv2-brand-card'),
    cityLogo:     $('fv2-city-logo'),
    cityName:     $('fv2-city-name'),
    linkCard:     $('fv2-link-card'),
    linkFavicon:  $('fv2-link-favicon'),
    linkDomain:   $('fv2-link-domain'),
    docsCard:     $('fv2-docs-card'),
    docs:         $('fv2-docs'),
    error:        $('fv2-error'),
    errorTitle:   $('fv2-error-title'),
    errorMsg:     $('fv2-error-msg'),
    ovPdf:        $('fv2-ov-pdf'),
    pdfTitle:     $('fv2-pdf-title'),
    pdfFrame:     $('fv2-pdf-frame'),
    lightbox:     $('fv2-lightbox'),
    lbImg:        $('fv2-lb-img'),
    btnMapLock:   $('fv2-btn-map-lock'),
  };

  /* ═══════════════ HELPERS ═══════════════ */
  const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';
  const isDark = () => currentTheme() === 'dark';

  function getBasemapForTheme(theme) {
    const tm = window.ThemeManager?.findBasemapForTheme?.(theme);
    if (tm) return tm;
    const list = window.basemaps || [];
    return list.find(b => b.theme === theme) || list[0] || { kind: 'raster', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OSM' };
  }

  function sanitizeText(str) {
    if (typeof str !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function urlParams() {
    const p = new URLSearchParams(window.location.search);
    return {
      project:  p.get('project') || '',
      category: p.get('cat') || CFG.DEFAULT_CAT,
      city:     p.get('city') || '',
    };
  }

  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function faviconOf(url) {
    try { const u = new URL(url); return `https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}`; } catch { return ''; }
  }

  /* ═══════════════ OVERLAY SYSTEM ═══════════════ */
  function openOverlay(overlay) {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeOverlay(overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function bindOverlayClose(overlay) {
    overlay.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeOverlay(overlay));
    });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeOverlay(overlay);
    });
  }

  /* ═══════════════ LIGHTBOX ═══════════════ */
  function openLightbox(src) {
    el.lbImg.src = src;
    el.lightbox.classList.add('is-open');
    el.lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    el.lightbox.classList.remove('is-open');
    el.lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(() => { el.lbImg.src = ''; }, 300);
  }

  /* ═══════════════ SCROLL REVEALS ═══════════════ */
  function initReveal() {
    const blocks = document.querySelectorAll('.fv2-block');
    if (!blocks.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    blocks.forEach(b => obs.observe(b));
  }

  /* ═══════════════ TOPBAR SCROLL ═══════════════ */
  function initTopbarScroll() {
    let ticking = false;
    const heroH = () => el.hero.offsetHeight || 300;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        el.topbar.classList.toggle('is-scrolled', window.scrollY > heroH() - 80);
        ticking = false;
      });
    }, { passive: true });
  }

  /* ═══════════════ TOC (autogenerated from prose) ═══════════════ */
  function buildTOC() {
    const headings = el.prose?.querySelectorAll('h2, h3');
    if (!headings || headings.length < 3) return; // Only show if 3+ headings

    const toc = document.createElement('nav');
    toc.className = 'fv2-toc';
    toc.innerHTML = `<div class="fv2-toc__label">Sommaire</div><ul class="fv2-toc__list"></ul>`;
    const list = toc.querySelector('.fv2-toc__list');

    headings.forEach((h, i) => {
      const id = h.id || `fv2-heading-${i}`;
      h.id = id;
      const li = document.createElement('li');
      li.className = 'fv2-toc__item';
      const a = document.createElement('a');
      a.className = `fv2-toc__link${h.tagName === 'H3' ? ' fv2-toc__link--h3' : ''}`;
      a.href = `#${id}`;
      a.textContent = h.textContent;
      a.addEventListener('click', e => {
        e.preventDefault();
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(a);
      list.appendChild(li);
    });

    el.root.appendChild(toc);

    // Active tracking
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const link = toc.querySelector(`a[href="#${e.target.id}"]`);
        if (link) link.classList.toggle('fv2-toc__link--active', e.isIntersecting);
      });
    }, { rootMargin: '-20% 0px -60% 0px' });
    headings.forEach(h => obs.observe(h));

    // Show after scroll
    const showObs = new IntersectionObserver(([e]) => {
      toc.classList.toggle('is-visible', !e.isIntersecting);
    });
    showObs.observe(el.hero);
  }

  /* ═══════════════ MAP ═══════════════ */
  let primaryMap = null;
  let primaryBasemap = null;

  // Rotation cinématique
  let rotationRafId = null;
  let orbitCenter = null;   // LngLat natif — centre géographique de l'objet
  let rotationStartTs = null; // timestamp de départ pour drift-free bearing
  let rotationStartBearing = 0;
  let mapInteractionLocked = false;
  const MAP_HANDLERS = ['dragPan', 'scrollZoom', 'doubleClickZoom', 'dragRotate', 'touchZoomRotate', 'keyboard', 'boxZoom'];

  function createGeoJSONLayer(map, data, category) {
    return window.L.geoJSON(data, {
      style: feature => {
        return window.DataModule?.getFeatureStyle
          ? window.DataModule.getFeatureStyle(feature, category)
          : { color: 'var(--primary)', weight: 3, opacity: 0.8, fillOpacity: 0.3 };
      },
      pointToLayer: (feature, latlng) => {
        const cat = feature?.properties?.category || category;
        return window.L.marker(latlng, {
          icon: window.createContributionMarkerIcon
            ? window.createContributionMarkerIcon(cat)
            : window.L.divIcon({ className: 'gp-custom-marker', html: '<div></div>' }),
        });
      },
    }).addTo(map);
  }

  async function initMap(containerId, geojsonUrl, category) {
    if (!window.L) return;
    const container = document.getElementById(containerId);
    if (!container) return;

    const theme = currentTheme();
    const map = window.L.map(containerId, {
      center: CFG.DEFAULT_CENTER,
      zoom: CFG.DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    const bm = getBasemapForTheme(theme);
    const base = window.L.createBasemapLayer(bm).addTo(map);

    if (!geojsonUrl) return { map, base, layer: null };

    try {
      const resp = await fetch(geojsonUrl);
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();

      if (data?.features?.length) {
        const layer = createGeoJSONLayer(map, data, category);
        map.fitBounds(layer.getBounds(), { padding: [30, 30] });
        return { map, base, layer };
      }
    } catch (e) {
      console.warn('[fv2] GeoJSON fetch failed', e);
    }

    return { map, base, layer: null };
  }

  /* ═══════════════ MAP ROTATION / INTERACTION LOCK ═══════════════ */
  function startMapRotation() {
    if (rotationRafId) return;
    const mlMap = primaryMap?._mlMap;
    if (!mlMap) return;

    // Drift-free : on mémorise le bearing courant et le timestamp de départ.
    // Le bearing résulte d'une fonction linéaire du temps → pas d'accumulation d'erreur.
    rotationStartBearing = mlMap.getBearing();
    rotationStartTs = null;
    const DEG_PER_MS = 0.00030; // ~0.3°/s → 1 tour en ~20 min

    function frame(ts) {
      if (rotationStartTs === null) rotationStartTs = ts;
      const bearing = (rotationStartBearing + (ts - rotationStartTs) * DEG_PER_MS) % 360;
      mlMap.easeTo({
        bearing,
        // Paramètre clé natif MapLibre : la caméra orbite autour
        // du centre géographique de l'objet, pas du centre de l'écran.
        around: orbitCenter,
        duration: 0,
        essential: true,
      });
      rotationRafId = requestAnimationFrame(frame);
    }
    rotationRafId = requestAnimationFrame(frame);
  }

  function stopMapRotation() {
    if (rotationRafId) {
      cancelAnimationFrame(rotationRafId);
      rotationRafId = null;
    }
    rotationStartTs = null;
  }

  function lockMapInteraction() {
    const mlMap = primaryMap?._mlMap;
    if (!mlMap) return;

    // Capturer le centre géographique de l'objet (après fitBounds)
    // pour que la rotation orbite autour de lui et non du centre de l'écran.
    orbitCenter = mlMap.getCenter();

    MAP_HANDLERS.forEach(h => mlMap[h]?.disable());
    mapInteractionLocked = true;
    mlMap.easeTo({ pitch: 45, duration: 1000, essential: true });
    // Démarrer la rotation après la fin de l'animation de pitch
    setTimeout(startMapRotation, 1000);
    if (el.btnMapLock) {
      el.btnMapLock.classList.add('is-locked');
      el.btnMapLock.setAttribute('aria-label', "Activer l'interaction carte");
      el.btnMapLock.querySelector('i').className = 'fa-solid fa-lock';
    }
  }

  function unlockMapInteraction() {
    stopMapRotation();
    const mlMap = primaryMap?._mlMap;
    if (!mlMap) return;
    MAP_HANDLERS.forEach(h => mlMap[h]?.enable());
    mapInteractionLocked = false;
    mlMap.easeTo({ pitch: 0, duration: 700 });
    if (el.btnMapLock) {
      el.btnMapLock.classList.remove('is-locked');
      el.btnMapLock.setAttribute('aria-label', 'Désactiver l\'interaction carte');
      el.btnMapLock.querySelector('i').className = 'fa-solid fa-lock-open';
    }
  }

  /* Theme observer for maps */
  function observeThemeForMaps() {
    new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.attributeName !== 'data-theme') return;
        const t = currentTheme();
        const nb = getBasemapForTheme(t);
        if (primaryMap && primaryBasemap) {
          primaryMap.removeLayer(primaryBasemap);
          primaryBasemap = window.L.createBasemapLayer(nb).addTo(primaryMap);
          // Mettre à jour la couleur des bâtiments 3D pour le nouveau thème
          primaryMap.updateBuildings3DTheme?.();
        }
      });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ═══════════════ CITY BRANDING ═══════════════ */
  async function loadBranding(ville) {
    console.group('[fv2:branding] loadBranding()');
    console.log('  ville:', ville);

    if (!ville) {
      console.warn('  ⚠️ ville null — pas de branding à charger pour cette contribution');
      console.groupEnd();
      return;
    }
    const v = String(ville).toLowerCase().trim();

    console.log('  window.supabaseService disponible :', !!window.supabaseService);

    let data;
    try {
      data = await window.supabaseService?.getCityBranding?.(v);
    } catch (err) {
      console.error('  ❌ getCityBranding exception:', err);
    }
    console.log('  data city_branding:', data);

    if (!data) {
      console.warn('  ⚠️ Aucune entrée city_branding pour la ville « ' + v + ' »');
      console.groupEnd();
      return;
    }

    console.log('  primary_color:', data.primary_color ?? '(absent)');
    console.log('  logo_url     :', data.logo_url ?? '(absent)');
    console.log('  brand_name   :', data.brand_name ?? '(absent)');

    // Couleur primaire
    if (data.primary_color && window.CityBrandingModule?.applyPrimaryColor) {
      window.CityBrandingModule.applyPrimaryColor(data.primary_color);
      const tc = document.querySelector('meta[name="theme-color"]');
      if (tc) tc.content = data.primary_color;
    }

    // Favicon
    if (window.CityBrandingModule?.applyFavicon) {
      window.CityBrandingModule.applyFavicon(data.favicon_url || null);
    }

    const logoLight = data.logo_url || '';
    const logoDark  = data.dark_logo_url || data.logo_url || '';
    const brandName = data.brand_name || ville;

    function applyLogo() {
      const url = isDark() ? logoDark : logoLight;
      console.log('[fv2:branding] applyLogo() url:', url);
      if (!url) return;

      // Sidebar brand card
      if (el.cityLogo)   { el.cityLogo.src = url; el.cityLogo.alt = brandName; }
      if (el.cityName)   { el.cityName.textContent = brandName; }
      if (el.brandCard)  { el.brandCard.hidden = false; }

      // Topbar logo
      if (el.topLogoImg) { el.topLogoImg.src = url; el.topLogoImg.alt = brandName; }
      if (el.topLogo)    { el.topLogo.classList.add('has-logo'); el.topLogo.removeAttribute('hidden'); }
    }

    applyLogo();
    console.groupEnd();

    new MutationObserver(applyLogo)
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ═══════════════ SEO ═══════════════ */
  function updateSEO(project, category) {
    const name = project.project_name;
    const desc = project.description || '';
    const cover = project.cover_url || '';
    const canonical = `${CFG.PROD}/fiche/?cat=${encodeURIComponent(category)}&project=${encodeURIComponent(name)}`;

    document.title = `${name} – Grands Projets`;

    const setMeta = (attr, key, val) => {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (tag) tag.content = val;
    };

    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', name);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', canonical);
    if (cover) setMeta('property', 'og:image', cover);
    setMeta('name', 'twitter:title', name);
    setMeta('name', 'twitter:description', desc);
    if (cover) setMeta('name', 'twitter:image', cover);

    const link = document.querySelector('link[rel="canonical"]');
    if (link) link.href = canonical;

    // JSON-LD
    const ld = document.getElementById('fiche-jsonld');
    if (ld) {
      try {
        const j = JSON.parse(ld.textContent);
        j.headline = name;
        j.description = desc;
        j.url = canonical;
        if (cover) j.image = cover;
        ld.textContent = JSON.stringify(j);
      } catch {}
    }
  }

  /* ═══════════════ DOCUMENTS ═══════════════ */
  function renderDocs(docs) {
    if (!docs?.length) return;
    el.docsCard.hidden = false;

    el.docs.innerHTML = '';
    docs.forEach(doc => {
      const title = doc.title || 'Document';

      const item = document.createElement('div');
      item.className = 'fv2-doc';

      // Top strip: icon + full title
      const strip = document.createElement('div');
      strip.className = 'fv2-doc__strip';

      const icon = document.createElement('div');
      icon.className = 'fv2-doc__icon';
      icon.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';

      const meta = document.createElement('div');
      meta.className = 'fv2-doc__meta';
      meta.innerHTML =
        `<span class="fv2-doc__title">${sanitizeText(title)}</span>` +
        `<span class="fv2-doc__type">PDF</span>`;

      strip.append(icon, meta);

      // Action row
      const actions = document.createElement('div');
      actions.className = 'fv2-doc__actions';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'fv2-doc__btn fv2-doc__btn--primary';
      viewBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Ouvrir le document';
      viewBtn.addEventListener('click', () => {
        el.pdfTitle.textContent = title;
        el.pdfFrame.src = doc.pdf_url;
        openOverlay(el.ovPdf);
      });

      const dlBtn = document.createElement('a');
      dlBtn.className = 'fv2-doc__btn fv2-doc__btn--dl';
      dlBtn.href = doc.pdf_url;
      dlBtn.target = '_blank';
      dlBtn.rel = 'noopener noreferrer';
      dlBtn.setAttribute('aria-label', 'Télécharger');
      dlBtn.innerHTML = '<i class="fa-solid fa-download"></i>';

      actions.append(viewBtn, dlBtn);
      item.append(strip, actions);
      el.docs.appendChild(item);
    });
  }

  /* ═══════════════ RELATED PROJECTS ═══════════════ */
  async function loadRelated(category, currentName) {
    try {
      const projects = await window.supabaseService?.fetchProjectsByCategory?.(category);
      if (!projects?.length) return;

      const others = projects.filter(p => p.project_name !== currentName).slice(0, 6);
      if (!others.length) return;

      el.relatedBlock.hidden = false;
      el.related.innerHTML = '';

      others.forEach(p => {
        const link = document.createElement('a');
        link.className = 'fv2-related-card';
        link.href = `/fiche/?cat=${encodeURIComponent(category)}&project=${encodeURIComponent(p.project_name)}`;

        if (p.cover_url) {
          const img = document.createElement('img');
          img.className = 'fv2-related-card__cover';
          img.src = p.cover_url;
          img.alt = '';
          img.loading = 'lazy';
          link.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'fv2-related-card__placeholder';
          ph.innerHTML = '<i class="fa-solid fa-map-location-dot"></i>';
          link.appendChild(ph);
        }

        const body = document.createElement('div');
        body.className = 'fv2-related-card__body';
        body.innerHTML = `
          <span class="fv2-related-card__name">${sanitizeText(p.project_name)}</span>
          <i class="fa-solid fa-arrow-right fv2-related-card__arrow"></i>`;
        link.appendChild(body);

        el.related.appendChild(link);
      });
    } catch (e) {
      console.warn('[fv2] Related projects failed', e);
    }
  }

  /* ═══════════════ PROSE IMAGE LIGHTBOX ═══════════════ */
  function bindProseImages() {
    el.prose?.querySelectorAll('img').forEach(img => {
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => openLightbox(img.src));
    });
  }

  /* ═══════════════ SHARE ═══════════════ */
  function bindShare() {
    el.btnShare?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        el.btnShare.classList.add('is-copied');
        const icon = el.btnShare.querySelector('i');
        icon.className = 'fa-solid fa-check';
        setTimeout(() => {
          el.btnShare.classList.remove('is-copied');
          icon.className = 'fa-solid fa-link';
        }, 2000);
      } catch {}
    });
  }

  /* ═══════════════ THEME TOGGLE ═══════════════ */
  function bindTheme() {
    const updateIcon = () => {
      const icon = el.btnTheme?.querySelector('i');
      if (icon) icon.className = isDark() ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    };
    updateIcon();

    el.btnTheme?.addEventListener('click', () => {
      window.ThemeManager?.toggle?.();
      updateIcon();
    });

    new MutationObserver(updateIcon)
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ═══════════════ SHOW ERROR ═══════════════ */
  function showError(title, msg) {
    el.hero.hidden = true;
    el.body.hidden = true;
    el.error.hidden = false;
    el.errorTitle.textContent = title;
    el.errorMsg.textContent = msg;
  }

  /* ═══════════════ RENDER HERO ═══════════════ */
  function renderHero(project, category) {
    const name = project.project_name;
    const cover = project.cover_url;
    const catLabel = CFG.CAT_LABELS[category] || category;
    const catIcon = CFG.CAT_ICONS[category] || 'fa-map';

    // Title in topbar
    el.topTitle.textContent = name;

    // Hero — clear skeletons and populate
    el.heroInner.innerHTML = '';

    // Badge catégorie
    const meta = document.createElement('div');
    meta.className = 'fv2-hero__meta';
    meta.innerHTML = `<span class="fv2-hero__badge"><i class="fa-solid ${sanitizeText(catIcon)}"></i> ${sanitizeText(catLabel)}</span>`;
    el.heroInner.appendChild(meta);

    // Titre
    const h1 = document.createElement('h1');
    h1.className = 'fv2-hero__title';
    h1.textContent = name;
    el.heroInner.appendChild(h1);

    // Photo de couverture → bloc de contenu (plus dans le héro)
    if (cover) {
      el.coverImg.src = cover;
      el.coverImg.alt = name;
      el.coverBlock.hidden = false;
      el.btnCoverExpand?.addEventListener('click', () => openLightbox(cover), { once: true });
    }
  }

  /* ═══════════════ RENDER BODY ═══════════════ */
  function renderDescription(desc) {
    if (!desc) {
      el.descBlock.hidden = true;
      return;
    }
    el.descBlock.innerHTML = `<p class="fv2-desc">${sanitizeText(desc)}</p>`;
  }

  function renderLink(url) {
    if (!url) return;
    const domain = domainOf(url);
    const favicon = faviconOf(url);
    el.linkCard.href = url;
    el.linkFavicon.src = favicon;
    el.linkFavicon.alt = domain;
    el.linkDomain.textContent = domain;
    el.linkCard.hidden = false;
  }

  async function renderMarkdown(markdownUrl) {
    if (!markdownUrl) return;
    try {
      await window.MarkdownUtils?.ensure?.();
      const resp = await fetch(markdownUrl);
      if (!resp.ok) return;
      const md = await resp.text();
      const result = window.MarkdownUtils?.renderMarkdown?.(md);
      if (result?.html) {
        el.prose.innerHTML = result.html;
        el.proseBlock.hidden = false;
        bindProseImages();
        buildTOC();
      }
    } catch (e) {
      console.warn('[fv2] Markdown render failed', e);
    }
  }

  /* ═══════════════ DATA MODULE INIT (same as main.js) ═══════════════ */
  async function initDataModuleStyles(ville) {
    const svc = window.supabaseService;
    if (!svc) return;

    // Lowercase so getActiveCity() / fetchLayersConfig / fetchCategoryIcons all work
    const v = String(ville || '').toLowerCase().trim();
    if (!v) return;

    // Set active city so getActiveCity() in supabaseService returns the right value
    window.activeCity = v;

    // Fetch layers_config + category_icons in parallel (same as main.js)
    const [layersConfig, categoryIconsData] = await Promise.all([
      svc.fetchLayersConfig?.() || [],
      svc.fetchCategoryIcons?.() || [],
    ]);

    // Build styleMap, iconMap, iconColorMap from layers_config
    const styleMap = {};
    const iconMap = {};
    const iconColorMap = {};
    layersConfig.forEach(({ name, style, icon, icon_color }) => {
      if (style) styleMap[name] = style;
      if (icon) iconMap[name] = icon;
      if (icon_color) iconColorMap[name] = icon_color;
    });

    // Merge category_styles into styleMap (same priority logic as main.js)
    if (svc.buildCategoryStylesMap) {
      const categoryStylesFromDB = svc.buildCategoryStylesMap(categoryIconsData);
      Object.keys(categoryStylesFromDB).forEach(category => {
        const categoryStyle = categoryStylesFromDB[category];
        if (categoryStyle && Object.keys(categoryStyle).length > 0) {
          styleMap[category] = { ...styleMap[category], ...categoryStyle };

          const catIcon = categoryIconsData.find(ic => ic.category === category);
          if (catIcon && Array.isArray(catIcon.layers_to_display)) {
            catIcon.layers_to_display.forEach(layerName => {
              if (layerName !== category) {
                styleMap[layerName] = { ...categoryStyle, ...styleMap[layerName] };
              }
            });
          }
        }
      });
    }

    // Expose categoryIcons globally (needed by getCategoryStyle / createContributionMarkerIcon)
    window.categoryIcons = categoryIconsData;
    window.iconMap = iconMap;
    window.iconColorMap = iconColorMap;

    // Init DataModule with the full config (same call as main.js)
    if (window.DataModule?.initConfig) {
      window.DataModule.initConfig({ urlMap: {}, styleMap, iconMap, iconColorMap, defaultLayers: [] });
    }
  }

  /* ═══════════════ MAIN INIT ═══════════════ */
  async function init() {
    // Theme
    window.ThemeManager?.init?.();
    bindTheme();
    bindShare();
    initTopbarScroll();

    // Map lock toggle
    el.btnMapLock?.addEventListener('click', () => {
      if (mapInteractionLocked) unlockMapInteraction();
      else lockMapInteraction();
    });

    // Overlays
    bindOverlayClose(el.ovPdf);

    // Lightbox
    el.lightbox?.addEventListener('click', e => {
      if (e.target === el.lightbox || e.target.matches('[data-close], [data-close] *')) {
        closeLightbox();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (el.lightbox.classList.contains('is-open')) closeLightbox();
      }
    });

    // Parse URL
    const { project, category, city } = urlParams();

    if (!project) {
      showError('Projet introuvable', "Aucun nom de projet n'a été fourni dans l'URL.");
      return;
    }

    // Start Markdown lib loading in parallel
    const mdReady = window.MarkdownUtils?.ensure?.();

    // Fetch project data + city branding + docs in parallel
    let data, docs;
    try {
      [data, docs] = await Promise.all([
        window.supabaseService?.fetchProjectByCategoryAndName?.(category, project),
        window.supabaseService?.getConsultationDossiersByProject?.(project),
      ]);
    } catch {
      showError('Erreur de chargement', 'Impossible de récupérer les données du projet.');
      return;
    }

    if (!data) {
      showError('Projet introuvable', `Le projet « ${sanitizeText(project)} » n'existe pas ou n'est pas encore approuvé.`);
      return;
    }

    // Render hero
    renderHero(data, category);

    // SEO
    updateSEO(data, category);

    // La ville est celle de la contribution en DB (contribution_uploads.ville → city_branding)
    const ville = data.ville || city || null;
    console.log('[fv2:init] ville résolu:', ville, '| data.ville (DB):', data.ville, '| city (URL):', city);

    // City branding + DataModule styles init in parallel
    await Promise.all([
      loadBranding(ville),
      initDataModuleStyles(ville),
    ]);

    // Description — masquée si un article markdown est présent
    if (!data.markdown_url) {
      renderDescription(data.description);
    }

    // External link
    renderLink(data.official_url);

    // Documents
    renderDocs(docs);

    // Scroll reveals
    initReveal();

    // Carte dans le héro (APRÈS DataModule init)
    if (data.geojson_url) {
      const mapResult = await initMap('fv2-map', data.geojson_url, category);
      if (mapResult) {
        primaryMap = mapResult.map;
        primaryBasemap = mapResult.base;

        // Démarrer la rotation cinématique après fitBounds
        if (primaryMap?._mlMap) {
          if (el.btnMapLock) el.btnMapLock.hidden = false;
          primaryMap._mlMap.once('moveend', lockMapInteraction);
        }
      }
      observeThemeForMaps();
    }

    // Markdown
    await mdReady;
    await renderMarkdown(data.markdown_url);

    // Related projects
    loadRelated(category, data.project_name);
  }

  /* ═══════════════ BOOT ═══════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
