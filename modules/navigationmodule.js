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
        console.debug(`[NavigationModule] Erreur chargement layer ${layerName}:`, e);
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
   * Source unique de vérité - utilisée par panToProject et showProjectDetail.
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
    const sidebarW  = 78 + 14; // sidebar icon strip + inset gap - fixed in CSS
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
   * Ne déplace PAS la caméra - appeler panToProject() séparément pour ça.
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
      // fitBounds so values don't stack - same pattern as showProjectDetail.
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
   * Source unique de vérité - appelée par NavPanel et resetToDefaultView.
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
        try { window.DataModule.createGeoJsonLayer(name, window.DataModule.layerData[name]); } catch (e) { console.debug('[nav] createGeoJsonLayer failed:', e); }
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
    // toBBoxArray() → [west, south, east, north] - compat-bounds convention
    const [west, south, east, north] = combined.toBBoxArray();
    mlMap.jumpTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    mlMap.fitBounds([[west, south], [east, north]],
      { padding: _computeMapPadding(), duration: 500, pitch: 0, maxZoom: 16 });
  }

  /**
   * Fit the map to show all loaded layers for a given category.
   * Public - called by NavPanel's collapse button.
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
    try {
      await ensureLayerLoaded(layerName);
    } catch (e) {
      console.debug('[NavigationModule] Layer non disponible:', e);
    }
    // Utilise l'ID si disponible pour un lookup fiable
    if (contributionData?.id) {
      showProjectDetailById(contributionData.id, null);
    } else {
      showProjectDetail(projectName, category, null, contributionData);
    }
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

  // ── Carte périmée ────────────────────────────────────────────────────────
  // Un onglet laissé ouvert pendant qu'un espace est régénéré (démo salon) ou
  // republié continue d'afficher des projets supprimés : leur fiche n'existe
  // plus côté serveur. Plutôt que d'afficher une impasse, on resynchronise les
  // données de la carte, une seule fois par fenêtre de temps pour ne jamais
  // boucler si le serveur est réellement en panne.
  const RESYNC_COOLDOWN_MS = 30000;
  let _lastResyncAt = 0;
  let _resyncPromise = null;

  /**
   * @returns {Promise<boolean>} true si une resynchronisation vient d'avoir lieu
   */
  async function resyncStaleProjects() {
    if (_resyncPromise) {
      await _resyncPromise;
      return true;
    }
    if (_lastResyncAt && Date.now() - _lastResyncAt < RESYNC_COOLDOWN_MS) return false;
    const resync = window.DataModule?.resyncContributions;
    if (typeof resync !== 'function') return false;

    _lastResyncAt = Date.now();
    _resyncPromise = (async () => {
      try {
        await resync(window.supabaseService?.getActiveCity?.());
      } catch (e) {
        console.debug('[NavigationModule] Resynchronisation des projets impossible:', e);
      }
    })();
    try {
      await _resyncPromise;
    } finally {
      _resyncPromise = null;
    }
    return true;
  }

  /**
   * Message affiché quand un projet a disparu de la carte entre son affichage
   * et le clic. Seul endroit qui rend ce cas - la fiche ne parle jamais de base
   * de données au visiteur.
   * @param {HTMLElement|null} panel
   * @param {string} [projectName]
   */
  function renderProjectGone(panel, projectName) {
    if (!panel) return;
    const named = projectName ? ` « ${window.SecurityUtils.escapeHtml(String(projectName))} »` : '';
    panel.style.display = 'flex';
    panel.innerHTML = `
      <div class="project-detail__gone">
        <i class="fas fa-rotate" aria-hidden="true"></i>
        <h3>Ce projet n'est plus sur la carte</h3>
        <p>Le projet${named} a été retiré ou remplacé depuis l'ouverture de cette page. La carte vient d'être mise à jour.</p>
      </div>
    `;
  }

  /**
   * @param {number|string} projectId
   * @param {Event} [event]
   * @param {{projectName?:string, category?:string}} [fallback] - identité de la
   *   feature cliquée : le nom survit à une régénération, l'identifiant non.
   */
  async function showProjectDetailById(projectId, event, fallback = null) {
    if (!projectId) return;
    // Guard: éviter les appels redondants
    const projectKey = `id::${projectId}`;
    if (_lastShownProject === projectKey) return;
    _lastShownProject = projectKey;
    let contributionProject = null;
    try {
      contributionProject = await window.supabaseService.getContributionById(projectId);
    } catch (error) {
      console.debug('[NavigationModule] Error fetching project by ID:', error);
    }
    if (!contributionProject) {
      _lastShownProject = null;
      // La carte affiche un projet que le serveur ne connaît plus : on
      // resynchronise, puis on retente par le nom, qui lui a survécu.
      const resynced = await resyncStaleProjects();
      if (resynced && fallback?.projectName && fallback?.category) {
        await showProjectDetail(fallback.projectName, fallback.category, event);
        return;
      }
      renderProjectGone(document.getElementById('project-detail'), fallback?.projectName);
      return;
    }
    // Délègue au rendu complet avec toutes les données
    showProjectDetail(contributionProject.project_name, contributionProject.category, event, contributionProject);
  }

  /**
   * Adresse d'une image d'article. Une adresse qui commence par « / » part de
   * la racine du site : la carte vit sous /ville/{ville}/carte, la faire suivre
   * le chemin de la page la cassait.
   */
  function resolveAssetUrl(u) {
    if (u && location.protocol === 'file:' && u.startsWith('/')) return '.' + u;
    return u;
  }

  /** Première image d'un article rendu, faute de couverture déclarée. */
  function extractFirstImageSrc(markup) {
    try {
      if (!markup) return null;
      const img = new DOMParser().parseFromString(markup, 'text/html').querySelector('img');
      return img?.getAttribute('src') || img?.getAttribute('data-src') || null;
    } catch (e) { console.debug('[nav] extractFirstImageSrc failed:', e); return null; }
  }

  /** Charge MarkdownUtils à la demande (la carte ne l'embarque pas au démarrage). */
  async function ensureMarkdownUtils() {
    if (!window.MarkdownUtils) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/modules/markdownutils.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Échec du chargement de MarkdownUtils'));
        document.head.appendChild(script);
      });
    }
    await window.MarkdownUtils.ensure();
  }

  /**
   * Ce qui complète la ligne du projet : l'en-tête de son article markdown
   * (couverture, tracé, trafic, description) et la présence de dossiers de
   * concertation, chargés en parallèle.
   * @returns {Promise<{ attrs: Object, html: string, hasDossiers: boolean }>}
   */
  async function loadProjectExtras(project) {
    let markdown = null;
    let hasDossiers = false;
    await Promise.all([
      project.markdown_url
        ? fetch(project.markdown_url)
            .then(r => r.ok ? r.text() : null)
            .then(text => { markdown = text; })
            .catch(e => console.debug('[NavigationModule] Error fetching markdown:', e))
        : Promise.resolve(),
      window.supabaseService?.getConsultationDossiersByProject?.(project.project_name)
        .then(d => { hasDossiers = Array.isArray(d) && d.length > 0; })
        .catch(() => {})
    ]);
    if (!markdown) return { attrs: {}, html: '', hasDossiers };
    await ensureMarkdownUtils();
    return { ...window.MarkdownUtils.renderMarkdown(markdown), hasDossiers };
  }

  const CATEGORY_ICONS = { velo: 'fa-bicycle', mobilite: 'fa-train-tram', urbanisme: 'fa-building' };

  /** Contenu HTML de la fiche projet (barre Retour / Fermer comprise). */
  function projectDetailHTML(project, { attrs, html, hasDossiers }) {
    const esc = window.SecurityUtils.escapeHtml;
    const { project_name: name, category } = project;
    const safeName = esc(name);
    const cover = project.cover_url || attrs.cover || extractFirstImageSrc(html);
    const description = project.description || attrs.description;

    const chips = [];
    if (attrs.from || attrs.to) chips.push(`<span class="detail-chip"><i class="fa-solid fa-route"></i>${esc(attrs.from || '')}${attrs.to ? ` → ${esc(attrs.to)}` : ''}</span>`);
    if (attrs.trafic) chips.push(`<span class="detail-chip"><i class="fa-solid fa-car"></i>${esc(attrs.trafic)}</span>`);

    // Fiche complète : /fiche/{ville}/{category_slug}/{slug}
    const city = project.ville || window.supabaseService?.getActiveCity?.() || '';
    const fullPageUrl = (city && project.category_slug && project.slug)
      ? `/fiche/${encodeURIComponent(city)}/${encodeURIComponent(project.category_slug)}/${encodeURIComponent(project.slug)}`
      : null;
    const hasRichContent = !!(project.markdown_url || project.official_url || hasDossiers);

    const heroHTML = cover
      ? `<div class="detail-hero"><img class="detail-hero__img" src="${esc(resolveAssetUrl(cover))}" alt="${esc(attrs.name || name || '')}" loading="eager"><div class="detail-hero__grad"></div><button class="detail-hero__expand" aria-label="Agrandir l'image" title="Agrandir"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button></div>`
      : '';
    const footerHTML = (hasRichContent && fullPageUrl)
      ? `<div class="detail-footer"><button type="button" class="detail-fullpage-btn" data-fiche-url="${fullPageUrl}" data-fiche-name="${safeName}"><i class="fa-solid fa-newspaper"></i>Voir la fiche complète</button></div>`
      : '';

    return `${window.DetailPanel.OVERLAY_BUTTONS}<div class="detail-scroll-body${cover ? '' : ' detail-scroll-body--no-hero'}">${heroHTML}<div class="detail-content-wrap"><div class="detail-title-row"><span class="detail-cat-icon"><i class="fa-solid ${CATEGORY_ICONS[category] || 'fa-map'}"></i></span><h3 class="detail-title">${safeName}</h3></div>${chips.length ? `<div class="detail-chips">${chips.join('')}</div>` : ''}${description ? `<p class="detail-description">${esc(description)}</p>` : ''}</div></div>${footerHTML}`;
  }

  /** Ligne complète du projet : celle déjà connue, sinon relue par nom. */
  async function fetchProject(projectName, category, enrichedProps) {
    // Les champs enrichis (id, cover_url, description, markdown_url, ville,
    // official_url, tags…) donnent le même rendu que la route par ID.
    if (enrichedProps) return { ville: '', ...enrichedProps };
    try {
      return await window.supabaseService?.fetchProjectByCategoryAndName?.(category, projectName) || null;
    } catch (error) {
      console.debug('[NavigationModule] Error fetching project:', error);
      return null;
    }
  }

  async function showProjectDetail(projectName, category, event, enrichedProps = null) {
    event?.stopPropagation?.();

    // Garde : un même projet déjà affiché n'est pas re-rendu (rafales de clics)
    const projectKey = `${projectName}::${category}`;
    if (_lastShownProject === projectKey) return;
    _lastShownProject = projectKey;

    // Consultation d'un projet : l'événement métier central de la carte publique.
    window.OPAnalytics?.capture('project_opened', {
      project_name: projectName,
      category: category || null,
    });

    const panel = window.DetailPanel.open(getCategoryStyle(category).color);
    if (!panel) return;
    panel.innerHTML = '<p style="padding:1em">Chargement…</p>';

    try {
      const project = await fetchProject(projectName, category, enrichedProps);
      if (!project) {
        _lastShownProject = null; // allow re-click after dismissal
        // Le projet a disparu du serveur : la carte affiche encore ses points,
        // on la remet à jour avant de l'annoncer au visiteur. Le cooldown de
        // resyncStaleProjects évite d'enchaîner deux resynchronisations quand
        // l'appel vient déjà de la route par identifiant.
        await resyncStaleProjects();
        renderProjectGone(panel, projectName);
        return;
      }
      projectName = project.project_name;
      category = project.category;

      panel.innerHTML = projectDetailHTML(project, await loadProjectExtras(project));

      const img = panel.querySelector('.detail-hero__img');
      panel.querySelector('.detail-hero__expand')?.addEventListener('click', () => {
        window.Lightbox?.open(img.getAttribute('src'), img.getAttribute('alt'));
      });
      window.DetailPanel.bindButtons(panel, {
        // Retour : sous-menu de la catégorie ; Fermer : état initial (toutes les couches)
        onBack: () => NavigationModule.resetToDefaultView(category, { preserveMapView: true, updateHistory: true }),
        onClose: () => NavigationModule.resetToDefaultView(null, { updateHistory: true }),
      });

      // Highlight visuel + centrage caméra (deux responsabilités séparées)
      highlightProjectOnMap(projectName, category);
      panToProject(projectName, category);
    } catch (e) {
      console.error('[NavigationModule] Error in showProjectDetail:', e);
      panel.innerHTML = `<h3>${window.SecurityUtils.escapeHtml(projectName)}</h3><p>Aucun détail disponible.</p>`;
    }

    // Stocker la catégorie pour le bouton retour
    if (category) panel.dataset.filterLayer = normalizeCategoryName(category);
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
    } catch (e) { console.debug('[nav] restoreAllLayerOpacity failed:', e); }
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

    // État de la navigation lu AVANT la fermeture, qui peut la rouvrir
    const navState = window.NavPanel?.getState?.();
    window.DetailPanel.close();

    restoreAllLayerOpacity();
    window.FeatureInteractions?.clearSelection?.(true);
    clearProjectHighlight();

    // ── CAS 1: Back to a specific category (same path as tab click) ──
    if (category) {
      await showCategoryLayers(category);

      // Rouvrir le NavPanel au niveau 3 de la catégorie concernée
      if (window.NavPanel) {
        // Si le panel était fermé ou dans un autre module, ouvrir le module carte
        if (!navState || navState.level === 0 || navState.module !== 'carte') {
          window.NavPanel.openModule('carte');
        }
        // Naviguer vers le level 3 de la catégorie si on n'y est pas déjà
        if (!navState || navState.module !== 'carte' || navState.level !== 3 || navState.category !== category) {
          const catEntry = (window.categoryIcons || []).find(c => c.category === category);
          const label = catEntry?.label || category;
          let color = null;
          if (catEntry?.category_styles) {
            try {
              const styles = typeof catEntry.category_styles === 'string'
                ? JSON.parse(catEntry.category_styles) : catEntry.category_styles;
              color = styles.color;
            } catch { /* styles non-parsables */ }
          }
          await window.NavPanel.openLevel3(category, { label, ...(color ? { color } : {}) });
        }
      }

      if (updateHistory) {
        try { history.pushState({ cat: category }, '', `${location.pathname}?cat=${encodeURIComponent(category)}`); } catch (e) { console.debug('[nav] pushState failed:', e); }
      }
      return;
    }

    // ── CAS 2: Full close (back to initial state) ──
    FilterModule.resetAll();

    // Remove all layers first - clean slate
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
      } catch (e) { console.debug('[nav] restore layer failed:', e); }
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
    showProjectDetailById,
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
