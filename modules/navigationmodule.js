// modules/NavigationModule.js
const NavigationModule = (() => {
  const projectDetailPanel = document.getElementById('project-detail');
  
  // Fonction helper pour obtenir les catégories de contribution dynamiquement
  const getContributionLayers = () => {
    return (typeof window.getAllCategories === 'function') ? window.getAllCategories() : [];
  };

  function normalizeCategoryName(category) {
    return (category === 'transport') ? 'mobilite' : category;
  }

  /**
   * Récupère les layers associés à une catégorie depuis categoryLayersMap
   * @param {string} category - Nom de la catégorie
   * @returns {string[]} - Liste des layers à afficher
   */
  function getCategoryLayers(category) {
    const normalized = normalizeCategoryName(category);
    return window.categoryLayersMap?.[normalized] || [normalized];
  }

  /**
   * S'assure qu'un layer est chargé (données en mémoire)
   * @param {string} layerName - Nom du layer
   */
  async function ensureLayerLoaded(layerName) {
    if (!window.DataModule?.layerData?.[layerName]) {
      try {
        await window.DataModule.preloadLayer(layerName);
      } catch (e) {
        console.warn(`[NavigationModule] Erreur chargement layer ${layerName}:`, e);
        throw e;
      }
    }
  }

  // SYSTÈME DE HIGHLIGHT
  
  // État du highlight actuel
  let currentHighlight = {
    highlightedLayers: [],  // Marker features with DOM-based highlight (pulse ring, class)
    pulseElements: []       // Pulse ring DOM elements to clean up
  };

  /**
   * Restaure le style DOM d'un marker (classes CSS)
   * @param {Object} featureLayer 
   */
  function restoreStyle(featureLayer) {
    if (featureLayer instanceof L.Marker) {
      const el = featureLayer.getElement?.();
      if (el) {
        el.classList.remove('is-dimmed');
        el.classList.remove('is-highlighted');
      }
    }
  }

  /**
   * Nettoie tous les highlights précédents (visuels + DOM markers)
   */
  function clearProjectHighlight() {
    window.FeatureInteractions?.clearSelection();
    currentHighlight.highlightedLayers.forEach(layer => {
      try { layer.__gpHighlighted = false; restoreStyle(layer); } catch (e) { console.debug('[nav] restoreStyle failed:', e); }
    });
    currentHighlight.highlightedLayers = [];
    currentHighlight.pulseElements.forEach(el => { try { el.remove(); } catch (e) { console.debug('[nav] pulse remove failed:', e); } });
    currentHighlight.pulseElements = [];
  }

  /**
   * Calcule le padding carte selon les panneaux UI actuellement visibles.
   * Source unique de vérité — utilisée par panToProject et showProjectDetail.
   * @returns {{ top, right, bottom, left }}
   */
  /**
   * Returns the padding (px) that fitBounds/flyTo should apply so the target
   * is centred in the area NOT covered by any UI panel.
   *
   * Design rule: always read live offsetWidth / offsetHeight from the DOM
   * so we never need to keep hardcoded panel-size constants in sync.
   *
   * This is the single source of truth for all camera moves.  callers MUST
   * reset MapLibre's persistent internal padding to {0,0,0,0} (jumpTo) before
   * calling fitBounds/flyTo with these values, otherwise MapLibre v4 stacks them.
   */
  function _computeMapPadding() {
    const detailPanel = document.getElementById('project-detail');
    const detailOpen  = detailPanel?.offsetHeight > 0 && detailPanel.style.display !== 'none';

    if (window.innerWidth <= 720) {
      // Mobile: UI panels stack at the bottom as drawers.
      // Priority: detail panel (higher) > nav panel > bare map.
      const navPanelEl = document.querySelector('.nav-panel.open:not(.collapsed)');
      const bottomH = detailOpen
        ? (detailPanel.offsetHeight  || 0) + 20
        : navPanelEl
          ? (navPanelEl.offsetHeight || 0) + 20
          : 70;
      return { top: 80, left: 20, right: 20, bottom: Math.max(70, bottomH) };
    }

    // Desktop: nav panel on the left, detail panel on the right.
    const sidebarW  = 78 + 14; // sidebar icon strip + inset gap — fixed in CSS
    const navPanel  = document.querySelector('.nav-panel.open:not(.collapsed)');
    const navW      = navPanel ? navPanel.offsetWidth + 14 : 0;
    const detailW   = detailOpen ? detailPanel.offsetWidth + 20 : 0;
    return {
      top:    90,
      bottom: 40,
      left:   sidebarW + navW + 20,
      right:  detailW || 40,
    };
  }

  /**
   * Applique le highlight visuel d'un projet sur la carte (feature-state + pulse rings).
   * Ne déplace PAS la caméra — appeler panToProject() séparément pour ça.
   * @param {string} projectName
   * @param {string} category
   * @param {{ fadeOthers?: boolean }} options
   */
  function highlightProjectOnMap(projectName, category, options = {}) {
    const { fadeOthers = false } = options;
    clearProjectHighlight();

    // Lines/polygons : feature-state via FeatureInteractions pool
    window.FeatureInteractions?.spotlightByName(projectName, { dimOthers: fadeOthers });

    // DOM markers : pulse ring (markers don't use the pool)
    const targetLayer = window.MapModule?.layers?.[normalizeCategoryName(category)];
    if (!targetLayer || typeof targetLayer.eachLayer !== 'function') return;
    const { color: categoryColor } = getCategoryStyle(category);

    targetLayer.eachLayer((featureLayer) => {
      const props = featureLayer.feature?.properties || {};
      if (props.project_name !== projectName) return;
      const geomType = featureLayer.feature?.geometry?.type || '';
      if ((geomType === 'Point' || geomType === 'MultiPoint') && featureLayer instanceof L.Marker) {
        currentHighlight.highlightedLayers.push(featureLayer);
        featureLayer.__gpHighlighted = true;
        const el = featureLayer.getElement?.();
        if (el) {
          el.classList.add('is-highlighted');
          const customMarker = el.querySelector('.gp-custom-marker');
          if (customMarker) {
            const pulseRing = document.createElement('div');
            pulseRing.className = 'gp-marker-pulse-ring';
            pulseRing.style.setProperty('--marker-color', categoryColor);
            customMarker.appendChild(pulseRing);
            currentHighlight.pulseElements.push(pulseRing);
          }
        }
      }
    });
  }

  /**
   * Déplace la caméra vers un projet sans modifier le highlight visuel.
   * Cherche les bornes dans les pools (lignes/polygones), puis fallback markers.
   * @param {string} projectName
   * @param {string} category
   */
  function panToProject(projectName, category) {
    const mlMap = window.MapModule?.map?._mlMap;
    if (!mlMap || !projectName) return;

    // 1. Pool features (lines / polygons)
    let bounds = window.FeatureInteractions?.getProjectBounds?.(projectName);

    // 2. Fallback: DOM markers
    if (!bounds) {
      const targetLayer = window.MapModule?.layers?.[normalizeCategoryName(category)];
      if (targetLayer && typeof targetLayer.eachLayer === 'function') {
        let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
        let found = false;
        targetLayer.eachLayer((fl) => {
          if (fl.feature?.properties?.project_name !== projectName) return;
          const ll = fl.getLatLng?.();
          if (!ll) return;
          if (ll.lng < minLng) minLng = ll.lng; if (ll.lng > maxLng) maxLng = ll.lng;
          if (ll.lat < minLat) minLat = ll.lat; if (ll.lat > maxLat) maxLat = ll.lat;
          found = true;
        });
        if (found) bounds = { minLng, maxLng, minLat, maxLat };
      }
    }

    if (!bounds) return;
    try {
      // Reset any persistent internal padding (set by _updateMapPadding) before
      // fitBounds so values don't stack — same pattern as showProjectDetail.
      // _computeMapPadding() is then the sole source of truth for all UI offsets.
      mlMap.jumpTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 } });
      mlMap.fitBounds(
        [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
        { padding: _computeMapPadding(), duration: 500, pitch: 0, maxZoom: 16 }
      );
    } catch (e) { console.debug('[nav] panToProject fitBounds failed:', e); }
  }

  const getCategoryStyle = window.getCategoryStyle;

  // Race-guard generation counter for showCategoryLayers
  let _showCategoryGen = 0;

  /**
   * Affiche tous les layers d'une catégorie sur la carte.
   * Source unique de vérité — appelée par NavPanel et resetToDefaultView.
   * @param {string} category
   * @param {{ skipFitBounds?: boolean, preserveTravaux?: boolean }} [opts]
   */
  async function showCategoryLayers(category, opts = {}) {
    const generation = ++_showCategoryGen;
    const layers = getCategoryLayers(category);
    const layersMap = window.categoryLayersMap || {};
    const travauxSet = opts.preserveTravaux
      ? new Set(layersMap['travaux'] || ['travaux'])
      : new Set();

    // Close project detail if open
    if (projectDetailPanel) projectDetailPanel.style.display = 'none';
    _lastShownProject = null;

    // Remove all layers except targets (+ optionally travaux)
    const keep = new Set([...layers, ...travauxSet]);
    window.MapModule?.removeAllLayers?.(keep);
    window.FilterModule?.resetAll?.();
    // Clear persisted MapLibre filter so it doesn't leak into new layers
    const mlMap = window.MapModule?.map?._mlMap || window.MapModule?.map;
    if (mlMap && window.L?._sourcePool) window.L._sourcePool.clearFilter(mlMap);

    // Preload uncached data in parallel
    const uncached = layers.filter(n => !window.DataModule?.layerData?.[n]);
    if (uncached.length > 0) {
      await Promise.all(uncached.map(n =>
        window.DataModule?.preloadLayer?.(n)?.catch(() => {})
      ));
    }

    // Guard: abort if a newer call happened during async fetch
    if (generation !== _showCategoryGen) return;

    // Create layers from cache
    for (const name of layers) {
      if (window.DataModule?.layerData?.[name]) {
        try { window.DataModule.createGeoJsonLayer(name, window.DataModule.layerData[name]); } catch (e) { console.warn('[nav] createGeoJsonLayer failed:', e); }
      }
    }

    // Fit to combined bounds (unless caller opted out)
    if (!opts.skipFitBounds) _fitBoundsForLayers(layers);
  }

  /**
   * Compute combined bounds for a list of loaded map layers.
   * Returns null if no valid bounds found.
   * @param {string[]} layerNames
   * @returns {{ isValid, toBBoxArray }|null}
   */
  function _combinedBoundsForLayers(layerNames) {
    let combined = null;
    for (const name of layerNames) {
      const layer = window.MapModule?.layers?.[name];
      if (!layer || typeof layer.getBounds !== 'function') continue;
      const b = layer.getBounds();
      if (!b?.isValid?.()) continue;
      combined = combined ? combined.extend(b.getSouthWest()).extend(b.getNorthEast()) : b;
    }
    return combined;
  }

  /**
   * Fit the MapLibre camera to show all layers in `layerNames`.
   * Resets persistent internal padding first (MapLibre v4 stacks it otherwise),
   * then applies _computeMapPadding() so the target is clear of all UI panels.
   * @param {string[]} layerNames
   */
  function _fitBoundsForLayers(layerNames) {
    const combined = _combinedBoundsForLayers(layerNames);
    if (!combined) return;
    const mlMap = window.MapModule?.map?._mlMap;
    if (!mlMap) return;
    // toBBoxArray() → [west, south, east, north] — compat-bounds convention
    const [west, south, east, north] = combined.toBBoxArray();
    mlMap.jumpTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    mlMap.fitBounds([[west, south], [east, north]],
      { padding: _computeMapPadding(), duration: 500, pitch: 0, maxZoom: 16 });
  }

  /**
   * Fit the map to show all loaded layers for a given category.
   * Public — called by NavPanel's collapse button.
   * @param {string} category
   */
  function fitCategoryBounds(category) {
    _fitBoundsForLayers(getCategoryLayers(category));
  }

  /**
   * Affiche une contribution spécifique (panneau de détail + zoom)
   * Utilisé pour les clics directs sur la carte
   * @param {string} projectName - Nom du projet
   * @param {string} category - Catégorie de la contribution
   * @param {Object} contributionData - Données de la contribution (optionnel)
   */
  async function showSpecificContribution(projectName, category, contributionData = null) {
    const layerName = normalizeCategoryName(category);
    
    // S'assurer que le layer est chargé
    try {
      await ensureLayerLoaded(layerName);
    } catch (e) {
      console.warn('[NavigationModule] Layer non disponible:', e);
    }
    
    // Afficher le panneau de détail (le centrage est géré par highlightProjectOnMap)
    showProjectDetail(projectName, category, null, contributionData);
  }

  // Fonction utilitaire pour ajuster la vue de la carte
  function zoomOutOnLoadedLayers() {
    let combinedBounds = null;
    Object.values(MapModule.layers).forEach(layer => {
      if (typeof layer.getBounds === "function") {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          combinedBounds = combinedBounds ? combinedBounds.extend(bounds) : bounds;
        }
      }
    });
    if (combinedBounds) {
      MapModule.map.fitBounds(combinedBounds, { padding: [100, 100], pitch: 0, maxZoom: 16 });
    } else {
      MapModule.map.setView([45.75, 4.85], 12);
    }
  }

  // Guard pour éviter les appels redondants (CRITIQUE pour performances)
  let _lastShownProject = null;
  let _showProjectDebounceTimer = null;

  async function showProjectDetail(projectName, category, event, enrichedProps = null) {
  if (event?.stopPropagation) {
    event.stopPropagation();
  }
  
  // GUARD: Éviter les appels redondants qui causent out of memory
  const projectKey = `${projectName}::${category}`;
  
  if (_lastShownProject === projectKey) {
    return; // Déjà affiché, skip
  }
  
  // Debounce pour éviter les appels en rafale
  if (_showProjectDebounceTimer) {
    clearTimeout(_showProjectDebounceTimer);
  }
  
  _showProjectDebounceTimer = setTimeout(() => {
    _showProjectDebounceTimer = null;
  }, 100);
  
  _lastShownProject = projectKey;
  
  // Stop any in-flight map animation (e.g. hover-triggered fitBounds) before
  // starting our own sequence — otherwise the collapse easeTo will cancel it
  // mid-flight, producing a visible zoom-out glitch.
  try {
    const mlMap = window.MapModule?.map?._mlMap;
    if (mlMap?.stop) mlMap.stop();
  } catch (e) { console.debug('[nav] stop map animation failed:', e); }

  // Hide NavPanel if open — preserve state so it can be restored on back
  window.NavPanel?.collapse();
  // Reset any persistent map padding BEFORE fitBounds runs.
  // In MapLibre GL v4, fitBounds ADDS its padding to the map's internal
  // padding (set by easeTo). If we don't reset first, the two stack and
  // the total can exceed the viewport — especially on mobile where
  // bottom padding alone would be 2 × 62 vh ≈ 124 % of screen height.
  try {
    const mlMap = window.MapModule?.map?._mlMap;
    if (mlMap && typeof mlMap.jumpTo === 'function') {
      mlMap.jumpTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    }
  } catch (e) { console.debug('[nav] reset map padding failed:', e); }

  const resolveAssetUrl = (u) => {
    try {
      if (!u) return u;
      if (/^https?:\/\//i.test(u)) return u;
      if (location.protocol === 'file:' && u.startsWith('/')) {
        return '.' + u;
      }
      if (u.startsWith('/')) {
        const baseDir = location.pathname.replace(/[^/]*$/, '');
        return (baseDir.endsWith('/') ? baseDir.slice(0, -1) : baseDir) + u;
      }
      return u;
    } catch (e) { console.debug('[nav] resolveAssetUrl failed:', e); return u; }
  };

  const panel = document.getElementById('project-detail');
  panel.innerHTML = '<p style="padding:1em">Chargement…</p>';
  panel.style.display = 'flex';
  panel.style.removeProperty('max-height');
  panel.style.removeProperty('overflow');

  // Apply category color to the detail panel
  const { color: catColor } = getCategoryStyle(category);
  panel.style.setProperty('--cat-color', catColor);

  // Debug: vérifier la couleur primaire
  const computedPrimary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
  if (!computedPrimary || computedPrimary === '') {
    console.warn('[NavigationModule] --color-primary not set, applying city branding...');
    const currentCity = new URLSearchParams(location.search).get('city');
    if (currentCity && window.CityBrandingModule) {
      await window.CityBrandingModule.loadAndApplyBranding(currentCity, true);
    }
  }

  try {
    let contributionProject = null;
    
    if (enrichedProps) {
      contributionProject = {
        project_name: enrichedProps.project_name,
        category: enrichedProps.category,
        cover_url: enrichedProps.cover_url,
        description: enrichedProps.description,
        markdown_url: enrichedProps.markdown_url
      };
    } else if (window.supabaseService?.fetchProjectByCategoryAndName) {
      try {
        contributionProject = await window.supabaseService.fetchProjectByCategoryAndName(category, projectName);
      } catch (error) {
        console.warn('[NavigationModule] Error fetching project:', error);
      }
    }

    // Vérifier si contributionProject existe avant d'accéder à ses propriétés
    if (!contributionProject) {
      _lastShownProject = null; // allow re-click after dismissal
      panel.innerHTML = `
      <div style="padding: 2em; text-align: center; color: var(--text-secondary, #666);">
        <h3>Projet non trouvé</h3>
        <p>Le projet "${projectName}" n'a pas été trouvé dans la base de données.</p>
        <p>Seuls les projets de la table contribution_uploads sont disponibles.</p>
      </div>
      `;
      return;
    }

    projectName = contributionProject.project_name;
    category = contributionProject.category;
    let cover_url = contributionProject.cover_url;
    let description = contributionProject.description;
    let markdown_url = contributionProject.markdown_url;

    let markdown = null;
    let hasDossiers = false;

    // Fetch markdown + check dossiers concurrently
    await Promise.all([
      markdown_url
        ? fetch(markdown_url)
            .then(r => r.ok ? r.text() : null)
            .then(text => { markdown = text; })
            .catch(e => console.warn('[NavigationModule] Error fetching markdown:', e))
        : Promise.resolve(),
      window.supabaseService?.getConsultationDossiersByProject?.(projectName)
        .then(d => { hasDossiers = Array.isArray(d) && d.length > 0; })
        .catch(() => {})
    ]);
    
    let attrs = {};
    let html = '';
    if (markdown) {
      // Charger MarkdownUtils si nécessaire, puis ses dépendances
      if (!window.MarkdownUtils) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/modules/MarkdownUtils.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Échec du chargement de MarkdownUtils'));
          document.head.appendChild(script);
        });
      }
      await window.MarkdownUtils.ensure();
      ({ attrs, html } = window.MarkdownUtils.renderMarkdown(markdown));
    }
    

    const extractFirstImageSrc = (markup) => {
      try {
        if (!markup) return null;
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        const img = doc.querySelector('img');
        const src = img?.getAttribute('src') || img?.getAttribute('data-src');
        return src || null;
      } catch (e) { console.debug('[nav] extractFirstImageSrc failed:', e); return null; }
    };

    // Utiliser les données de contribution_uploads en priorité
    const coverCandidate = cover_url || attrs.cover || extractFirstImageSrc(html);
    const icons = { velo: 'fa-bicycle', mobilite: 'fa-train-tram', urbanisme: 'fa-building' };
    const safeName = window.SecurityUtils ? window.SecurityUtils.escapeHtml(projectName) : projectName;

    // Chips
    const chips = [];
    if (attrs.from || attrs.to) chips.push(`<span class="detail-chip"><i class="fa-solid fa-route"></i>${attrs.from || ''}${attrs.to ? ` → ${attrs.to}` : ''}</span>`);
    if (attrs.trafic) chips.push(`<span class="detail-chip"><i class="fa-solid fa-car"></i>${attrs.trafic}</span>`);

    // Description
    description = description || attrs.description;

    // Full page URL
    const params = new URLSearchParams();
    if (category) params.set('cat', category);
    if (projectName) params.set('project', projectName);
    const currentCity = new URLSearchParams(location.search).get('city');
    if (currentCity) params.set('city', currentCity);
    const fullPageUrl = `/fiche/?${params.toString()}`;

    // Hero cover (expand btn only — back/close live in the permanent overlay bar)
    const heroHTML = coverCandidate
      ? `<div class="detail-hero"><img class="detail-hero__img" src="${resolveAssetUrl(coverCandidate)}" alt="${attrs.name || projectName || ''}" loading="eager"><div class="detail-hero__grad"></div><button class="detail-hero__expand" aria-label="Agrandir l'image" title="Agrandir"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button></div>`
      : '';

    const hasRichContent = !!(contributionProject.markdown_url || contributionProject.official_url || hasDossiers);
    const footerHTML = hasRichContent
      ? `<div class="detail-footer"><button type="button" class="detail-fullpage-btn" data-fiche-url="${fullPageUrl}" data-fiche-name="${safeName}"><i class="fa-solid fa-newspaper"></i>Voir la fiche complète</button></div>`
      : '';

    panel.innerHTML = `<div class="detail-overlay-btns"><button id="detail-back-btn" class="detail-back-floating" aria-label="Retour"><i class="fa-solid fa-arrow-left"></i></button><button id="detail-close-btn" class="detail-close-floating" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button></div><div class="detail-scroll-body${coverCandidate ? '' : ' detail-scroll-body--no-hero'}">${heroHTML}<div class="detail-content-wrap"><div class="detail-title-row"><span class="detail-cat-icon"><i class="fa-solid ${icons[category] || 'fa-map'}"></i></span><h3 class="detail-title">${safeName}</h3></div>${chips.length ? `<div class="detail-chips">${chips.join('')}</div>` : ''}${description ? `<p class="detail-description">${description}</p>` : ''}</div></div>${footerHTML}`;
    

    // Wire up Extend button in this panel
    (function(){
      const heroEl = panel.querySelector('.detail-hero');
      if (!heroEl) return;
      const btn = heroEl.querySelector('.detail-hero__expand');
      const img = heroEl.querySelector('.detail-hero__img');
      if (!btn || !img) return;
      btn?.addEventListener('click', () => {
        if (window.Lightbox) window.Lightbox.open(img.getAttribute('src'), img.getAttribute('alt'));
      });
    })();

    // Bouton "Retour" : retour au submenu de la catégorie
    const backButton = document.getElementById('detail-back-btn');
    if (backButton) {
      backButton.onclick = () => NavigationModule.resetToDefaultView(category, { preserveMapView: true, updateHistory: true });
    }

    // Bouton "Fermer" (X) : ferme le détail + collapse nav + rezoom sur les projets visibles
    const closeButton = document.getElementById('detail-close-btn');
    if (closeButton) {
      closeButton.onclick = () => {
        const projectDetail = document.getElementById('project-detail');
        if (projectDetail) projectDetail.style.display = 'none';
        restoreAllLayerOpacity();
        window.FeatureInteractions?.clearSelection?.(true);
        clearProjectHighlight();
        window.NavPanel?.collapse?.();
        requestAnimationFrame(() => fitVisibleLayers());
        try { history.pushState({}, '', location.pathname + location.search); } catch (e) {}
      };
    }
    
    
    // Highlight visuel + centrage caméra (deux responsabilités séparées)
    highlightProjectOnMap(projectName, category);
    panToProject(projectName, category);

  }catch(e){
    console.error('[NavigationModule] Error in showProjectDetail:', e);
    const safeProjectName = window.SecurityUtils ? window.SecurityUtils.escapeHtml(projectName) : projectName;
    panel.innerHTML=`<h3>${safeProjectName}</h3><p>Aucun détail disponible.</p>`;
  }

  // Stocker la catégorie pour le bouton retour
  if (category) {
    projectDetailPanel.dataset.filterLayer = normalizeCategoryName(category);
  }

}


  /**
   * Restaure l'opacité normale de tous les layers
   */
  function restoreAllLayerOpacity() {
    try {
      const layersObj = window.MapModule?.layers || {};
      Object.keys(layersObj).forEach(name => {
        const layer = layersObj[name];
        if (!layer) return;
        window.DataModule?.safeSetStyle?.(layer, { opacity: 1, fillOpacity: 0.5 });
        if (typeof layer.setOpacity === 'function') {
          layer.setOpacity(1);
        }
      });
    } catch (e) { console.warn('[nav] restoreAllLayerOpacity failed:', e); }
  }

  /**
   * Réinitialise la vue à l'état par défaut de l'application
   * 
   * COMPORTEMENTS :
   * - Avec category : Affiche toutes les contributions de la catégorie (bouton "Retour")
   * - Sans category : Affiche tous les layers par défaut + contributions (bouton "Fermer")
   * 
   * @param {string} [category] - Catégorie à afficher (optionnel)
   * @param {{ preserveMapView?: boolean, updateHistory?: boolean }} [options] - Options
   */
  const resetToDefaultView = async (category, options = {}) => {
    const { preserveMapView = false, updateHistory = false } = options;

    _lastShownProject = null;

    // ── Common: hide detail panel, restore nav bar, reset map padding ──
    const projectDetail = document.getElementById('project-detail');
    if (projectDetail) projectDetail.style.display = 'none';

    // Restore NavPanel if it was collapsed when showing project detail
    if (window.NavPanel?.getState?.()?.level > 0) {
      window.NavPanel.expand();
    } else {
      try {
        const mlMap = window.MapModule?.map?._mlMap;
        if (mlMap?.easeTo) mlMap.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 300 });
      } catch (e) { console.debug('[nav] reset padding failed:', e); }
    }

    restoreAllLayerOpacity();
    window.FeatureInteractions?.clearSelection?.(true);
    clearProjectHighlight();

    // ── CAS 1: Back to a specific category (same path as tab click) ──
    if (category) {
      await showCategoryLayers(category);

      if (updateHistory) {
        try { history.pushState({ cat: category }, '', `${location.pathname}?cat=${encodeURIComponent(category)}`); } catch (e) { console.debug('[nav] pushState failed:', e); }
      }
      return;
    }

    // ── CAS 2: Full close (back to initial state) ──
    FilterModule.resetAll();

    // Remove all layers first — clean slate
    window.MapModule?.removeAllLayers?.();

    // Build a set of all layers to restore (defaults + contributions)
    const toRestore = new Set(window.defaultLayers || []);
    for (const cat of getContributionLayers()) {
      const catLayers = getCategoryLayers(cat);
      catLayers.forEach(l => toRestore.add(l));
    }

    // Load and create each layer
    for (const name of toRestore) {
      try {
        await ensureLayerLoaded(name);
        if (window.DataModule?.layerData?.[name]) {
          window.DataModule.createGeoJsonLayer(name, window.DataModule.layerData[name]);
        }
      } catch (e) { console.warn('[nav] restore layer failed:', e); }
    }

    if (!preserveMapView) window.NavigationModule?.zoomOutOnLoadedLayers?.();

    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    window.UIModule?.updateLayerControls?.();

    if (updateHistory) {
      try { history.pushState(null, '', location.pathname); } catch (e) { console.debug('[nav] pushState failed:', e); }
    }
  }

  /**
   * Fit the map to show all layers currently loaded in MapModule.layers.
   * Uses proper padding so no layer is hidden behind UI panels.
   * Called by NavPanel's "Voir la carte" button at any level.
   */
  function fitVisibleLayers() {
    const layerNames = Object.keys(window.MapModule?.layers || {});
    if (!layerNames.length) return;
    _fitBoundsForLayers(layerNames);
  }

  const publicAPI = {
    showProjectDetail,
    showSpecificContribution,
    showCategoryLayers,
    fitCategoryBounds,
    fitVisibleLayers,
    zoomOutOnLoadedLayers,
    resetToDefaultView,
    _resetProjectGuard: () => { _lastShownProject = null; },
    highlightProjectOnMap,
    panToProject,
    clearProjectHighlight,
    computeMapPadding: _computeMapPadding,
  };
  
  window.NavigationModule = publicAPI;
  
  return publicAPI;
})();
