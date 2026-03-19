// modules/NavigationModule.js
const NavigationModule = (() => {
  const projectDetailPanel = document.getElementById('project-detail');
  
  function normalizeString(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/['"\`´]/g, "'")
      .replace(/\u00A0/g, ' ')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  
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
        await window.DataModule.loadLayer(layerName);
      } catch (e) {
        console.warn(`[NavigationModule] Erreur chargement layer ${layerName}:`, e);
        throw e;
      }
    }
  }

  /**
   * S'assure que tous les layers d'une catégorie sont chargés
   * @param {string} category - Nom de la catégorie
   */
  async function ensureCategoryLayersLoaded(category) {
    const layers = getCategoryLayers(category);
    console.log(`[NavigationModule] Chargement layers pour catégorie "${category}":`, layers);
    
    for (const layerName of layers) {
      try {
        await ensureLayerLoaded(layerName);
      } catch (e) {
        console.warn(`[NavigationModule] Impossible de charger ${layerName}`);
      }
    }
  }

  // ============================================================================
  // SYSTÈME DE HIGHLIGHT - Animation des projets sur la carte
  // ============================================================================
  
  // État du highlight actuel
  let currentHighlight = {
    highlightedLayers: [],  // Marker features with DOM-based highlight (pulse ring, class)
    pulseElements: []       // Pulse ring DOM elements to clean up
  };

  /**
   * Restaure le style DOM d'un marker (classes CSS)
   * @param {L.Layer} featureLayer 
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
   * Nettoie tous les highlights précédents
   */
  function clearProjectHighlight() {
    // Clear FeatureInteractions selection (line/polygon feature-state + layer dim)
    if (window.FeatureInteractions) {
      window.FeatureInteractions.clearSelection();
    }
    
    // Restore DOM-based marker highlights
    currentHighlight.highlightedLayers.forEach(layer => {
      try {
        layer.__gpHighlighted = false;
        restoreStyle(layer);
      } catch (_) {}
    });
    currentHighlight.highlightedLayers = [];
    
    // Remove pulse ring DOM elements
    currentHighlight.pulseElements.forEach(el => {
      try { el.remove(); } catch (_) {}
    });
    currentHighlight.pulseElements = [];
  }

  /**
   * Highlight un projet sur la carte
   * @param {string} projectName - Nom du projet
   * @param {string} category - Catégorie du projet
   * @param {Object} options - Options de highlight
   * @param {boolean} options.panTo - Si true, centre la carte sur le projet (défaut: true)
   * @param {boolean} options.fadeOthers - Si true, applique un fade out aux autres features (défaut: false)
   */
  function highlightProjectOnMap(projectName, category, options = {}) {
    const { panTo = true, fadeOthers = false } = options;
    
    // Nettoyer les highlights précédents
    clearProjectHighlight();
    
    // Delegate line/polygon highlight + dim to FeatureInteractions (feature-state based, no pool destruction)
    if (window.FeatureInteractions) {
      window.FeatureInteractions.spotlightByName(projectName, {
        panTo,
        dimOthers: fadeOthers
      });
    }
    
    // DOM-based marker highlighting (pulse rings) — markers don't use the pool
    const targetLayerName = normalizeCategoryName(category);
    const targetLayer = window.MapModule?.layers?.[targetLayerName];
    if (!targetLayer || typeof targetLayer.eachLayer !== 'function') return;
    
    const { color: categoryColor } = getCategoryStyle(category);
    
    targetLayer.eachLayer((featureLayer) => {
      const props = featureLayer.feature?.properties || {};
      if (props.project_name !== projectName) return;
      
      const geomType = featureLayer.feature?.geometry?.type || '';
      const isPoint = geomType === 'Point' || geomType === 'MultiPoint';
      
      if (isPoint && featureLayer instanceof L.Marker) {
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
   * Variable pour stocker la mini-carte de prévisualisation
   */
  let previewMap = null;

  /**
   * Récupère les features d'un projet depuis le layer (FACTORISATION DRY)
   * @param {string} projectName - Nom du projet
   * @param {string} category - Catégorie du projet
   * @returns {Array} Features du projet ou null
   */
  function getProjectFeatures(projectName, category) {
    const layerName = normalizeCategoryName(category);
    const mapLayer = window.MapModule?.layers?.[layerName];

    if (!mapLayer || typeof mapLayer.eachLayer !== 'function') {
      return null;
    }

    const features = [];
    mapLayer.eachLayer((featureLayer) => {
      const props = featureLayer.feature?.properties || {};
      if (props.project_name === projectName && featureLayer.feature) {
        features.push(featureLayer.feature);
      }
    });

    return features.length > 0 ? features : null;
  }

  /**
   * Récupère le style d'une catégorie (FACTORISATION DRY)
   * @param {string} category - Catégorie
   * @returns {Object} { color, styles }
   */
  function getCategoryStyle(category) {
    const categoryIcon = window.categoryIcons?.find(c => c.category === category);
    let categoryColor = 'var(--primary)';
    let categoryStyles = {};
    
    if (categoryIcon?.category_styles) {
      try {
        categoryStyles = typeof categoryIcon.category_styles === 'string'
          ? JSON.parse(categoryIcon.category_styles)
          : categoryIcon.category_styles;
        categoryColor = categoryStyles.color || categoryColor;
      } catch (_) {}
    }

    return { color: categoryColor, styles: categoryStyles };
  }

  /**
   * Initialise la mini-carte de prévisualisation dans le panneau de détail (mobile)
   * Clone les features du projet depuis le layer principal et les affiche
   * @param {string} projectName - Nom du projet
   * @param {string} category - Catégorie du projet
   */
  function initPreviewMap(projectName, category) {
    const { color: categoryColor } = getCategoryStyle(category);

    // EARLY RETURNS - éviter tout traitement inutile
    const container = document.getElementById('project-preview-map');
    if (!container || !window.L || window.innerWidth > 720) {
      return; // Pas de container, pas de Leaflet, ou desktop → skip
    }

    // Nettoyer la carte précédente UNE SEULE FOIS
    if (previewMap) {
      if (previewMap._gpAnimationIntervals) {
        previewMap._gpAnimationIntervals.forEach(interval => clearInterval(interval));
      }
      try { previewMap.remove(); } catch (_) {}
      previewMap = null;
    }

    // Récupérer les features du projet - FACTORISATION
    const projectFeatures = getProjectFeatures(projectName, category);
    if (!projectFeatures || projectFeatures.length === 0) {
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--gray-500);font-size:0.875rem;">Tracé non disponible</div>';
      return;
    }

    // Créer le GeoJSON
    const geojson = { type: 'FeatureCollection', features: projectFeatures };

    // Déterminer le fond de carte selon le thème
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const basemap = theme === 'light'
      ? { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OSM' }
      : { url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', attribution: '© CartoDB' };

    // Créer la carte (zoom activé pour interaction)
    previewMap = L.map(container, {
      zoomControl: true,
      attributionControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false
    });

    L.tileLayer(basemap.url, { maxZoom: 19 }).addTo(previewMap);

    // Stocker les intervalles d'animation pour cleanup
    const animationIntervals = [];

    // Ajouter le GeoJSON avec style animé (pointillés)
    const geoLayer = L.geoJSON(geojson, {
      style: (feature) => {
        // Récupérer le style de base
        let baseStyle = {};
        if (window.getFeatureStyle) {
          baseStyle = window.getFeatureStyle(feature, category);
        } else {
          baseStyle = {
            color: categoryColor,
            weight: 4,
            opacity: 0.9,
            fillOpacity: 0.3
          };
        }
        // Ajouter les pointillés animés
        return {
          ...baseStyle,
          weight: 5,
          dashArray: '12, 8',
          opacity: 1
        };
      },
      pointToLayer: (feature, latlng) => {
        const props = feature?.properties || {};
        if (props.imgUrl && window.CameraMarkers) {
          return window.CameraMarkers.createCameraMarker(latlng, 'markerPane', props.color || '#666');
        }
        // Utiliser le marker personnalisé
        if (window.createContributionMarkerIcon) {
          const icon = window.createContributionMarkerIcon(category);
          return L.marker(latlng, { icon });
        }
        return L.marker(latlng, {
          icon: L.divIcon({
            className: 'gp-preview-dot',
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${categoryColor};border:2px solid #fff;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })
        });
      },
      onEachFeature: (feature, layer) => {
        // Animer les pointillés pour les lignes/polygones
        const geomType = feature?.geometry?.type || '';
        const isLineOrPolygon = geomType.includes('Line') || geomType.includes('Polygon');
        
        if (isLineOrPolygon && typeof layer.setStyle === 'function') {
          let dashOffset = 0;
          const interval = setInterval(() => {
            dashOffset = (dashOffset + 2) % 20;
            try {
              layer.setStyle({ dashOffset: -dashOffset });
            } catch (_) {
              clearInterval(interval);
            }
          }, 50);
          animationIntervals.push(interval);
        }
      }
    }).addTo(previewMap);

    // Stocker les intervalles pour cleanup lors de la destruction
    previewMap._gpAnimationIntervals = animationIntervals;

    // Ajuster le zoom sur le tracé
    setTimeout(() => {
      previewMap.invalidateSize();
      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        previewMap.fitBounds(bounds, { padding: [20, 20] });
      }
    }, 100);

    console.log(`[NavigationModule] ✅ Mini-carte initialisée avec ${projectFeatures.length} features (zoom + animation)`);
  }

  /**
   * Affiche tous les layers d'une catégorie sur la carte
   * @param {string} category - Nom de la catégorie
   */
  async function showCategoryLayers(category) {
    console.log(`[NavigationModule] ========== showCategoryLayers START ==========`);
    console.log(`[NavigationModule] Catégorie: "${category}"`);
    
    const layers = getCategoryLayers(category);
    console.log(`[NavigationModule] Layers à afficher:`, layers);
    
    // Reset les filtres
    if (window.FilterModule?.resetAll) {
      console.log(`[NavigationModule] Reset des filtres`);
      FilterModule.resetAll();
    }
    
    // Pour chaque layer, vérifier s'il existe déjà avec des données
    for (const layerName of layers) {
      const existingLayer = window.MapModule?.layers?.[layerName];
      
      // Compter les features existantes sur la carte
      let existingFeaturesCount = 0;
      if (existingLayer) {
        existingFeaturesCount = existingLayer.getFeatureCount?.() ?? (typeof existingLayer.getLayers === 'function' ? existingLayer.getLayers().length : 0);
      }
      
      console.log(`[NavigationModule] Layer "${layerName}": ${existingFeaturesCount} features sur la carte`);
      
      // Si le layer existe déjà avec des données, le garder
      if (existingFeaturesCount > 0) {
        console.log(`[NavigationModule] ✅ Layer "${layerName}" conservé (${existingFeaturesCount} features)`);
        // S'assurer qu'il est visible
        if (window.MapModule?.map && !MapModule.map.hasLayer(existingLayer)) {
          MapModule.map.addLayer(existingLayer);
        }
        continue;
      }
      
      // Sinon, essayer de charger les données
      console.log(`[NavigationModule] Chargement du layer "${layerName}"...`);
      try {
        await ensureLayerLoaded(layerName);
      } catch (e) {
        console.warn(`[NavigationModule] ⚠️ Impossible de charger "${layerName}":`, e);
      }
    }
    
    // Log état final
    const finalLayers = Object.keys(window.MapModule?.layers || {});
    console.log(`[NavigationModule] Layers sur la carte après:`, finalLayers);
    
    // Compter les features visibles
    finalLayers.forEach(ln => {
      const layer = window.MapModule?.layers?.[ln];
      if (layer) {
        const count = layer.getFeatureCount?.() ?? (typeof layer.getLayers === 'function' ? layer.getLayers().length : 0);
        console.log(`[NavigationModule] Layer "${ln}": ${count} features sur la carte`);
      }
    });
    
    console.log(`[NavigationModule] ========== showCategoryLayers END ==========`);
  }

  function loadOrCreateLayer(layerName) {
    if (DataModule.layerData && DataModule.layerData[layerName]) {
      DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
    } else {
      DataModule.loadLayer(layerName);
    }
  }

  /**
   * Affiche une contribution spécifique (panneau de détail + zoom)
   * Utilisé pour les clics directs sur la carte
   * @param {string} projectName - Nom du projet
   * @param {string} category - Catégorie de la contribution
   * @param {Object} contributionData - Données de la contribution (optionnel)
   */
  async function showSpecificContribution(projectName, category, contributionData = null) {
    console.log(`[NavigationModule] ========== showSpecificContribution START ==========`);
    console.log(`[NavigationModule] Projet: "${projectName}"`);
    console.log(`[NavigationModule] Catégorie: "${category}"`);
    console.log(`[NavigationModule] Données contribution:`, contributionData);
    
    const layerName = normalizeCategoryName(category);
    console.log(`[NavigationModule] Layer normalisé: "${layerName}"`);
    
    // Log état AVANT
    console.log(`[NavigationModule] Layers sur la carte AVANT:`, Object.keys(window.MapModule?.layers || {}));
    
    // S'assurer que le layer est chargé
    try {
      await ensureLayerLoaded(layerName);
      console.log(`[NavigationModule] ✅ Layer "${layerName}" chargé`);
    } catch (e) {
      console.warn('[NavigationModule] ⚠️ Layer non disponible:', e);
    }
    
    // Note: Le centrage est géré par highlightProjectOnMap() appelé dans showProjectDetail()
    
    // Log état APRÈS
    console.log(`[NavigationModule] Layers sur la carte APRÈS:`, Object.keys(window.MapModule?.layers || {}));
    
    // Afficher le panneau de détail
    console.log(`[NavigationModule] Affichage panneau de détail...`);
    showProjectDetail(projectName, category, null, contributionData);
    
    console.log(`[NavigationModule] ========== showSpecificContribution END ==========`);
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
      MapModule.map.fitBounds(combinedBounds, { padding: [100, 100] });
    } else {
      MapModule.map.setView([45.75, 4.85], 12);
    }
  }

  // Guard pour éviter les appels redondants (CRITIQUE pour performances)
  let _lastShownProject = null;
  let _showProjectDebounceTimer = null;

  async function showProjectDetail(projectName, category, event, enrichedProps = null) {
  console.log('[NavigationModule] 🎯 showProjectDetail called:', { projectName, category, hasEvent: !!event });
  
  if (event?.stopPropagation) {
    event.stopPropagation();
  }
  
  // GUARD: Éviter les appels redondants qui causent out of memory
  const projectKey = `${projectName}::${category}`;
  
  console.log('[NavigationModule] 🔒 Guard check:', {
    projectKey,
    lastShownProject: _lastShownProject,
    willSkip: _lastShownProject === projectKey
  });
  
  if (_lastShownProject === projectKey) {
    console.log('[NavigationModule] ⏭️ SKIP - already showing this project');
    return; // Déjà affiché, skip
  }
  
  // Debounce pour éviter les appels en rafale
  if (_showProjectDebounceTimer) {
    console.log('[NavigationModule] ⏱️ Clearing previous debounce timer');
    clearTimeout(_showProjectDebounceTimer);
  }
  
  _showProjectDebounceTimer = setTimeout(() => {
    _showProjectDebounceTimer = null;
  }, 100);
  
  _lastShownProject = projectKey;
  console.log('[NavigationModule] ✅ Guard passed - proceeding with showProjectDetail');
  
  // Hide submenus and bottom nav bar when showing project detail
  document.querySelectorAll('.submenu').forEach(el => {
    el.style.display = 'none';
  });
  
  const leftNav = document.getElementById('left-nav');
  if (leftNav) {
    leftNav.style.opacity = '0';
    leftNav.style.pointerEvents = 'none';
    leftNav.style.transform = 'translateX(-50%) translateY(20px)';
  }

  // Add map padding so the project stays visible (not hidden behind the detail panel)
  // Desktop: right padding (panel is on the right)
  // Mobile: bottom padding (panel is a bottom sheet at 60vh)
  try {
    const mlMap = window.MapModule?.map?._mlMap;
    if (mlMap && typeof mlMap.easeTo === 'function') {
      const isMobile = window.innerWidth <= 720;
      const padding = isMobile
        ? { top: 0, right: 0, bottom: Math.round(window.innerHeight * 0.55), left: 0 }
        : { top: 0, right: 450, bottom: 0, left: 0 };
      mlMap.easeTo({ padding, duration: 400 });
    }
  } catch (_) {}

  const resolveAssetUrl = (u) => {
    try {
      if (!u) return u;
      if (/^https?:\/\//i.test(u)) return u;
      if (location.protocol === 'file:' && u.startsWith('/')) {
        return '.' + u;
      }
      if (u.startsWith('/')) {
        const baseDir = location.pathname.replace(/[^\/]*$/, '');
        return (baseDir.endsWith('/') ? baseDir.slice(0, -1) : baseDir) + u;
      }
      return u;
    } catch(_) { return u; }
  };

  const panel = document.getElementById('project-detail');
  panel.innerHTML = '<p style="padding:1em">Chargement…</p>';
  panel.style.display = 'block';
  panel.style.removeProperty('max-height');
  panel.style.removeProperty('overflow');

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
      panel.innerHTML = `
      <div style="padding: 2em; text-align: center; color: #666;">
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
    let usedContribution = false;

    if (markdown_url) {
      try {
        const response = await fetch(markdown_url);
        if (response.ok) {
          markdown = await response.text();
          usedContribution = true;
        }
      } catch (error) {
        console.warn('[NavigationModule] Error fetching markdown:', error);
      }
    }
    
    async function ensureMarkdownUtils() {
      
      if (!window.MarkdownUtils) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '/modules/MarkdownUtils.js';
          script.onload = () => {
            resolve();
          };
          script.onerror = () => {
            const error = new Error('Échec du chargement de MarkdownUtils');
            reject(error);
          };
          document.head.appendChild(script);
        });
      }
      
      if (window.MarkdownUtils?.loadDeps) {
        await window.MarkdownUtils.loadDeps();
      }
    }

    let attrs = {};
    let html = '';
    if (markdown) {
      await ensureMarkdownUtils();
      ({ attrs, html } = window.MarkdownUtils.renderMarkdown(markdown));
    }
    

    const extractFirstImageSrc = (markup) => {
      try {
        if (!markup) return null;
        const doc = new DOMParser().parseFromString(markup, 'text/html');
        const img = doc.querySelector('img');
        const src = img?.getAttribute('src') || img?.getAttribute('data-src');
        return src || null;
      } catch(_) { return null; }
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

    // Hero cover with back button inside (flush, no gap)
    const heroHTML = coverCandidate ? `
      <div class="detail-hero">
        <img class="detail-hero__img" src="${resolveAssetUrl(coverCandidate)}" alt="${attrs.name || projectName || ''}" loading="eager">
        <div class="detail-hero__grad"></div>
        <button id="detail-back-btn" class="detail-back-floating" aria-label="Retour">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <button class="detail-hero__expand" aria-label="Agrandir l'image" title="Agrandir">
          <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
        </button>
      </div>` : '';

    panel.innerHTML = `
      ${heroHTML}
      <div class="detail-content-wrap">
        ${!coverCandidate ? `<button id="detail-back-btn" class="detail-back-inline" aria-label="Retour"><i class="fa-solid fa-arrow-left"></i> Retour</button>` : ''}
        <div class="detail-title-row">
          <span class="detail-cat-icon"><i class="fa-solid ${icons[category] || 'fa-map'}"></i></span>
          <h3 class="detail-title">${safeName}</h3>
        </div>
        ${chips.length ? `<div class="detail-chips">${chips.join('')}</div>` : ''}
        ${description ? `<p class="detail-description">${description}</p>` : ''}
        ${fullPageUrl ? `<a href="${fullPageUrl}" class="detail-fullpage-btn">
          <i class="fa-solid fa-up-right-from-square"></i>Voir la fiche complète
        </a>` : ''}
      </div>`;
    

    // Wire up Extend button in this panel
    (function(){
      const heroEl = panel.querySelector('.detail-hero');
      if (!heroEl) return;
      const btn = heroEl.querySelector('.detail-hero__expand');
      const img = heroEl.querySelector('.detail-hero__img');
      if (!btn || !img) return;
      const openLightbox = () => {
        const overlay = document.createElement('div');
        overlay.className = 'cover-lightbox';
        // Sécurisé avec SecurityUtils
        const safeSrc = window.SecurityUtils ? window.SecurityUtils.sanitizeUrl(img.getAttribute('src')) : img.getAttribute('src');
        const safeAlt = window.SecurityUtils ? window.SecurityUtils.escapeAttribute(img.getAttribute('alt') || '') : (img.getAttribute('alt') || '');
        overlay.innerHTML = `
          <div class="lightbox-content">
            <img src="${safeSrc}" alt="${safeAlt}">
            <button class="btn-secondary lightbox-close" aria-label="Fermer">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        `;
        document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('.lightbox-close').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        // Set initial focus for accessibility
        const closeBtn = overlay.querySelector('.lightbox-close');
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
      };
      btn?.addEventListener('click', openLightbox);
    })();

    // Bouton "Retour" : affiche toutes les contributions de la catégorie
    const backButton = document.getElementById('detail-back-btn');
    if (backButton) {
      backButton.onclick = () => NavigationModule.resetToDefaultView(category, { preserveMapView: true, updateHistory: true });
    }
    
    
    // ANIMATION: Mettre en avant le projet sur la carte
    highlightProjectOnMap(projectName, category);
    
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
    } catch (_) { /* noop */ }
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
    
    console.log(`[NavigationModule] ========== resetToDefaultView START ==========`);
    console.log(`[NavigationModule] Catégorie: "${category || 'AUCUNE (fermeture totale)'}"`);
    console.log(`[NavigationModule] Options:`, options);
    console.log(`[NavigationModule] Layers sur la carte AVANT:`, Object.keys(window.MapModule?.layers || {}));
    
    // 1. Masquer le panneau de détail
    const projectDetail = document.getElementById('project-detail');
    if (projectDetail) {
      console.log(`[NavigationModule] Masquage panneau de détail`);
      projectDetail.style.display = 'none';
    }
    
    // 1b. Restore bottom nav bar visibility
    const navBar = document.getElementById('left-nav');
    if (navBar) {
      navBar.style.removeProperty('opacity');
      navBar.style.removeProperty('pointer-events');
      navBar.style.removeProperty('transform');
    }
    
    // 1c. Remove map right padding that was added for the detail panel
    try {
      const mlMap = window.MapModule?.map?._mlMap;
      if (mlMap && typeof mlMap.easeTo === 'function') {
        mlMap.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 300 });
      }
    } catch (_) {}
    
    // 2. Restaurer l'opacité de tous les layers + clear feature selection
    console.log(`[NavigationModule] Restauration opacité layers`);
    restoreAllLayerOpacity();
    window.FeatureInteractions?.clearSelection?.(true);
    
    // 3. Nettoyer les animations de highlight
    console.log(`[NavigationModule] Nettoyage animations highlight`);
    clearProjectHighlight();
    
    // ========================================
    // CAS 1 : Retour vers une catégorie spécifique (bouton "Retour")
    // ========================================
    if (category) {
      console.log(`[NavigationModule] 🔙 CAS 1: Retour vers catégorie "${category}"`);
      console.log(`[NavigationModule] categoryLayersMap:`, window.categoryLayersMap);
      
      // Réactiver le submenu de la catégorie via SubmenuManager
      window.SubmenuManager.cleanupAll();
      window.SubmenuManager.activateTab(category);
      window.SubmenuManager.showSubmenu(category);
      
      // Afficher TOUS les layers de cette catégorie (sans filtre)
      console.log(`[NavigationModule] Appel showCategoryLayers("${category}")...`);
      await showCategoryLayers(category);
      
      // Rafraîchir le submenu
      try {
        console.log(`[NavigationModule] Rafraîchissement submenu "${category}"...`);
        if (window.SubmenuManager?.renderSubmenu) {
          await window.SubmenuManager.renderSubmenu(category);
        }
      } catch (e) {
        console.error('[resetToDefaultView] Erreur render submenu:', e);
      }
      
      // Mettre à jour l'historique
      if (updateHistory) {
        try {
          const params = new URLSearchParams();
          params.set('cat', category);
          history.pushState({ cat: category }, '', `${location.pathname}?${params}`);
        } catch (_) {}
      }
      
      // Log état final CAS 1
      console.log(`[NavigationModule] Layers sur la carte APRÈS (CAS 1):`, Object.keys(window.MapModule?.layers || {}));
      console.log(`[NavigationModule] ========== resetToDefaultView END (CAS 1) ==========`);
      return;
    }
    
    // ========================================
    // CAS 2 : Fermeture totale (retour à l'état initial) - bouton "Fermer"
    // ========================================
    console.log(`[NavigationModule] ❌ CAS 2: Fermeture totale`);
    console.log(`[NavigationModule] defaultLayers:`, window.defaultLayers);
    console.log(`[NavigationModule] Toutes les catégories:`, getContributionLayers());
    
    // Cleanup UI commun (submenus, tabs, filtres)
    window.SubmenuManager.cleanupAll();
    window.FilterModule?.resetAll();
    
    // Charger et afficher les layers par défaut
    if (window.defaultLayers && window.defaultLayers.length > 0) {
      console.log(`[NavigationModule] Chargement ${window.defaultLayers.length} layers par défaut...`);
      for (const layerName of window.defaultLayers) {
        try {
          console.log(`[NavigationModule] Chargement layer par défaut: "${layerName}"`);
          await ensureLayerLoaded(layerName);
          const layer = window.MapModule?.layers?.[layerName];
          if (layer && window.MapModule?.map && !window.MapModule.map.hasLayer(layer)) {
            console.log(`[NavigationModule] Ajout layer "${layerName}" à la carte`);
            window.MapModule.map.addLayer(layer);
          }
        } catch (e) {
          console.warn(`[resetToDefaultView] Erreur chargement layer ${layerName}:`, e);
        }
      }
    }
    
    // Charger et afficher toutes les contributions (toutes catégories)
    const contributionCategories = getContributionLayers();
    console.log(`[NavigationModule] Chargement ${contributionCategories.length} catégories de contributions...`);
    for (const cat of contributionCategories) {
      try {
        console.log(`[NavigationModule] Chargement catégorie: "${cat}"`);
        await showCategoryLayers(cat);
      } catch (e) {
        console.warn(`[resetToDefaultView] Erreur affichage catégorie ${cat}:`, e);
      }
    }
    
    if (!preserveMapView) {
      if (window.NavigationModule && window.NavigationModule.zoomOutOnLoadedLayers) {
        window.NavigationModule.zoomOutOnLoadedLayers();
      }
    }
    
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    
    if (window.UIModule && window.UIModule.updateLayerControls) {
      window.UIModule.updateLayerControls();
    }
    

    try {
      if (updateHistory && typeof history?.pushState === 'function') {
        const params = new URLSearchParams();
        if (category) params.set('cat', category);
        const newQuery = params.toString();
        const newUrl = `${location.pathname}${newQuery ? `?${newQuery}` : ''}`;
        history.pushState(category ? { cat: category } : null, '', newUrl);
      }
    } catch (_) { /* noop */ }
    
    // Log état final CAS 2
    console.log(`[NavigationModule] Layers sur la carte APRÈS (CAS 2):`, Object.keys(window.MapModule?.layers || {}));
    // Compter les features
    Object.keys(window.MapModule?.layers || {}).forEach(ln => {
      const layer = window.MapModule?.layers?.[ln];
      if (layer) {
        const count = layer.getFeatureCount?.() ?? (typeof layer.getLayers === 'function' ? layer.getLayers().length : 0);
        console.log(`[NavigationModule] Layer "${ln}": ${count} features`);
      }
    });
    console.log(`[NavigationModule] ========== resetToDefaultView END (CAS 2) ==========`);
  }

  const publicAPI = { 
    showProjectDetail, 
    showSpecificContribution,
    zoomOutOnLoadedLayers, 
    resetToDefaultView,
    _resetProjectGuard: () => { _lastShownProject = null; },
    highlightProjectOnMap,
    clearProjectHighlight
  };
  
  window.NavigationModule = publicAPI;
  
  return publicAPI;
})();
