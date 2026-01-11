// modules/contrib/contrib-map.js
// Gestion de la carte de dessin pour les contributions

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  // State
  let drawMap = null;
  let drawBaseLayer = null; // Couche de fond de carte
  let drawLayer = null; // Couche de géométrie finalisée
  let drawLayerDirty = false; // Indique si la géométrie a été modifiée
  let isInitializing = false; // Flag pour éviter les initialisations multiples
  let basemapsCache = null;

  // Manual draw state
  let manualDraw = { 
    active: false,
    type: null, // 'line' | 'polygon' | 'point'
    points: [], 
    tempLayer: null,
    guideLayer: null,
    markers: [] // Markers temporaires pour les points
  };

  // Constants for marker styles (avoid duplication)
  const MARKER_STYLES = {
    temp: {
      className: 'temp-point-marker',
      html: null, // Will be set dynamically
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    },
    final: {
      className: 'final-point-marker',
      html: null, // Will be set dynamically
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    },
    contrib: {
      className: 'contrib-point-marker',
      html: null, // Will be set dynamically
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -28]
    },
    default: {
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    }
  };

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Récupère la couleur et l'icône d'une catégorie
   * @param {string} category - Nom de la catégorie
   * @returns {Object} { color, iconClass }
   */
  function getCategoryStyle(category) {
    const categoryIcon = win.categoryIcons?.find(c => c.category === category);
    const iconClass = categoryIcon?.icon_class || 'fa-solid fa-map-marker';
    
    // Extraire la couleur de la catégorie depuis category_styles
    let categoryColor = 'var(--primary)'; // Couleur par défaut
    if (categoryIcon?.category_styles) {
      try {
        const styles = typeof categoryIcon.category_styles === 'string' 
          ? JSON.parse(categoryIcon.category_styles) 
          : categoryIcon.category_styles;
        categoryColor = styles.color || categoryColor;
      } catch (e) {
        console.warn('[contrib-map] Parse error category_styles:', e);
      }
    }
    
    return { color: categoryColor, iconClass };
  }

  /**
   * Crée un marker de contribution avec l'icône de la catégorie sélectionnée
   * @param {string} category - Nom de la catégorie (optionnel)
   * @returns {L.DivIcon} Icône personnalisée avec l'icône de la catégorie
   */
  function createContributionMarkerIcon(category) {
    // Récupérer les styles de la catégorie
    const { color, iconClass } = category ? getCategoryStyle(category) : { color: 'var(--primary)', iconClass: 'fa-solid fa-map-marker' };
    
    // Créer le marker avec design sobre : pin blanc avec bordure colorée et icône
    return L.divIcon({
      html: `
        <div class="gp-custom-marker" style="--marker-color: ${color};">
          <i class="${iconClass}"></i>
        </div>
      `,
      className: 'gp-marker-container',
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -40]
    });
  }

  /**
   * Génère le HTML pour un marker selon le style et la couleur
   * @param {string} color - Couleur du marker
   * @param {boolean} isFinal - Si le marker est finalisé (avec animation)
   * @returns {string} HTML du marker
   */
  function generateMarkerHTML(color, isFinal = false) {
    const animation = isFinal ? 'animation: point-pulse 2s ease-in-out infinite;' : '';
    return `<div style="background: ${color}; width: ${isFinal ? '20px' : '16px'}; height: ${isFinal ? '20px' : '16px'}; border-radius: 50%; border: ${isFinal ? '4px' : '3px'} solid white; box-shadow: ${isFinal ? '0 3px 8px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.3)'}; ${animation}"></div>`;
  }

  /**
   * Crée une icône de marker selon le type demandé
   * @param {string} type - 'temp' | 'final' | 'contrib' | 'default'
   * @returns {L.DivIcon|L.Icon} Icône personnalisée
   */
  function createMarkerIcon(type = 'temp') {
    const style = MARKER_STYLES[type];
    if (!style) {
      console.warn('[contrib-map] Marker style not found:', type);
      return null;
    }

    // Pour le type 'default', utiliser L.icon (style Leaflet classique)
    if (type === 'default') {
      return L.icon(style);
    }

    // Pour les autres types, utiliser L.divIcon avec HTML personnalisé
    const color = type === 'temp' 
      ? getComputedStyle(document.documentElement).getPropertyValue('--info').trim()
      : getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();

    const icon = L.divIcon({
      className: style.className,
      html: generateMarkerHTML(color, type === 'final'),
      iconSize: style.iconSize,
      iconAnchor: style.iconAnchor,
      popupAnchor: style.popupAnchor
    });

    return icon;
  }

  /**
   * Ajoute l'animation CSS pour les markers finaux si elle n'existe pas
   */
  function ensurePointAnimation() {
    if (!document.getElementById('point-marker-animation')) {
      const style = document.createElement('style');
      style.id = 'point-marker-animation';
      style.textContent = `
        @keyframes point-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.9; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ============================================================================
  // MAP INITIALIZATION
  // ============================================================================

  /**
   * Initialise la carte de dessin
   * @param {string} containerId - ID du conteneur de la carte
   * @param {HTMLElement} drawPanelEl - Élément du panneau de dessin
   * @param {HTMLElement} cityEl - Élément select de la ville
   * @returns {Promise<L.Map>} Instance de la carte
   */
  async function initDrawMap(containerId, drawPanelEl, cityEl) {
    if (!window.L) {
      console.warn('[contrib-map] Leaflet not loaded');
      return null;
    }

    // Fix Leaflet icon paths (comme pour city-map)
    try {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
      });
    } catch (e) {
      console.warn('[contrib-map] Icon config error:', e);
    }

    // Flag d'initialisation pour éviter les problèmes de concurrence
    if (isInitializing) {
      console.warn('[contrib-map] Initialization already in progress');
      return null;
    }
    isInitializing = true;

    
    try {
      // Sauvegarder le GeoJSON existant avant de nettoyer la carte
      let savedGeometry = null;
      if (drawMap && drawnFeatures && drawnFeatures.getLayers().length > 0) {
        console.log('[contrib-map] Saving existing geometry before cleanup');
        savedGeometry = drawnFeatures.toGeoJSON();
      }
      
      // Clear any existing map instance first
      if (drawMap) {
        console.log('[contrib-map] Cleaning up existing map instance');
        try { 
          drawMap.off(); // Remove all event listeners
          drawMap.remove(); 
        } catch(_) {}
        drawMap = null;
      }
      
      let container = document.getElementById(containerId);
      if (!container) {
        console.error('[contrib-map] Container not found:', containerId);
        return null;
      }
      
      // Nettoyage complet : recréer le container pour éviter les problèmes Leaflet
      const parent = container.parentNode;
      const newContainer = document.createElement('div');
      newContainer.id = containerId;
      newContainer.className = container.className;
      newContainer.style.cssText = container.style.cssText;
      
      // Remplacer l'ancien container
      parent.replaceChild(newContainer, container);
      container = newContainer;
      
      console.log('[contrib-map] Container recreated, _leaflet_id:', container._leaflet_id);
      
      // Load basemaps and pick only the one named "OpenStreetMap"
      const bmList = await ensureBasemaps();
      const osmBm = Array.isArray(bmList)
        ? bmList.find(b => String(b?.name || b?.label || '').trim().toLowerCase() === 'openstreetmap')
        : null;
      
      // Initialise Leaflet map with a safe temporary view
      console.log('[contrib-map] Creating new Leaflet map on container:', containerId);
      drawMap = L.map(containerId, { center: [45.75, 4.85], zoom: 12 });
      
      try { 
        drawMap.whenReady(() => setTimeout(() => { 
          try { drawMap.invalidateSize(); } catch(_) {} 
        }, 60)); 
      } catch(_) {}
      
      setDrawBaseLayer(osmBm);
      
      // Ensure no basemap menu is displayed in contribution modal
      try { drawPanelEl.querySelector('#contrib-basemap-menu')?.remove(); } catch(_) {}
      
      // Attach map event handlers
      drawMap.on('click', onMapClick);
      drawMap.on('mousemove', onMapMouseMove);
      drawMap.on('mouseout', () => clearGuide());
      
      // Center by selected/active city when available
      const selectedCity = (cityEl && cityEl.value) ? cityEl.value.trim() : (win.activeCity || '').trim();
      if (selectedCity) { 
        await applyCityBranding(selectedCity); 
      }
      
      // Restaurer la géométrie sauvegardée
      if (savedGeometry) {
        console.log('[contrib-map] Restoring saved geometry');
        setTimeout(() => {
          try {
            setDrawnGeometry(savedGeometry);
          } catch(err) {
            console.warn('[contrib-map] Error restoring geometry:', err);
          }
        }, 100);
      }
      
      isInitializing = false;
      return drawMap;
    } catch (e) {
      console.warn('[contrib-map] initDrawMap error:', e);
      isInitializing = false;
      return null;
    }
  }

  // ============================================================================
  // BASEMAP MANAGEMENT
  // ============================================================================

  /**
   * Sélectionne le basemap par défaut
   * @param {Array} list - Liste des basemaps
   * @returns {Object|null} Basemap par défaut
   */
  function pickDefaultBasemap(list) {
    if (!Array.isArray(list) || !list.length) return null;
    return list.find(b => b && (b.default === true || b.is_default === true)) || list[0];
  }

  /**
   * Charge et met en cache les basemaps
   * @returns {Promise<Array>} Liste des basemaps
   */
  async function ensureBasemaps() {
    if (Array.isArray(basemapsCache) && basemapsCache.length) return basemapsCache;
    
    let res = [];
    try {
      if (win.supabaseService && typeof win.supabaseService.fetchBasemaps === 'function') {
        res = await win.supabaseService.fetchBasemaps();
      }
    } catch (e) {
      console.warn('[contrib-map] ensureBasemaps fetchBasemaps error:', e);
    }
    
    if (!Array.isArray(res) || !res.length) {
      res = Array.isArray(win.basemaps) ? win.basemaps : [];
    }
    
    basemapsCache = res;
    return res;
  }

  /**
   * Définit le fond de carte
   * @param {Object} bm - Basemap à utiliser
   */
  function setDrawBaseLayer(bm) {
    if (!drawMap) return;
    
    try { 
      if (drawBaseLayer) drawMap.removeLayer(drawBaseLayer); 
    } catch(_) {}
    
    drawBaseLayer = null;
    const url = bm && bm.url ? bm.url : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const attribution = (bm && bm.attribution) || '&copy; OpenStreetMap contributors';
    
    try { 
      drawBaseLayer = L.tileLayer(url, { attribution }).addTo(drawMap); 
    } catch (e) { 
      console.warn('[contrib-map] setDrawBaseLayer error:', e); 
    }
  }

  /**
   * Construit le menu de sélection des basemaps
   * @param {Array} basemaps - Liste des basemaps
   * @param {Object} activeBm - Basemap actif
   * @param {HTMLElement} drawPanelEl - Panneau de dessin
   */
  function buildContribBasemapMenu(basemaps, activeBm, drawPanelEl) {
    try {
      if (!drawPanelEl || !Array.isArray(basemaps) || !basemaps.length) return;
      
      let menu = drawPanelEl.querySelector('#contrib-basemap-menu');
      if (menu) { try { menu.remove(); } catch(_) {} }
      
      menu = document.createElement('div');
      menu.id = 'contrib-basemap-menu';
      menu.setAttribute('role', 'group');
      menu.setAttribute('aria-label', 'Fond de carte');
      menu.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;';
      
      basemaps.forEach((bm) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary basemap-tile';
        btn.textContent = bm.label || bm.name || 'Fond';
        btn.style.cssText = 'padding:4px 8px;border-radius:8px;border:1px solid var(--black-alpha-20);background:var(--white);cursor:pointer;font-size:12px;';
        
        const isActive = activeBm && ((activeBm.label && bm.label === activeBm.label) || (activeBm.url && bm.url === activeBm.url));
        if (isActive) { 
          btn.style.background = 'var(--info-lighter)'; 
          btn.setAttribute('aria-pressed', 'true'); 
        }
        
        btn.addEventListener('click', () => {
          setDrawBaseLayer(bm);
          try { 
            menu.querySelectorAll('button').forEach(b => { 
              b.style.background = 'var(--white)'; 
              b.removeAttribute('aria-pressed'); 
            }); 
          } catch(_) {}
          btn.style.background = 'var(--info-lighter)';
          btn.setAttribute('aria-pressed', 'true');
        });
        
        menu.appendChild(btn);
      });
      
      const helper = drawPanelEl.querySelector('.helper');
      if (helper) helper.after(menu); else drawPanelEl.prepend(menu);
    } catch (e) {
      console.warn('[contrib-map] buildContribBasemapMenu error:', e);
    }
  }

  /**
   * Applique le branding de la ville (centrage, zoom)
   * @param {string} ville - Code de la ville
   */
  async function applyCityBranding(ville) {
    try {
      if (!drawMap || !ville || !win.supabaseService || typeof win.supabaseService.getCityBranding !== 'function') return;
      
      const branding = await win.supabaseService.getCityBranding(ville);
      if (!branding) return;
      
      // Accept multiple shapes: {center_lat, center_lng, zoom} OR {center:[lat,lng], zoom}
      let lat = null, lng = null, zoom = 12;
      if (typeof branding.zoom === 'number') zoom = branding.zoom;
      
      if (Array.isArray(branding.center) && branding.center.length >= 2) {
        lat = Number(branding.center[0]);
        lng = Number(branding.center[1]);
      } else if ('center_lat' in branding || 'lat' in branding) {
        lat = Number(branding.center_lat ?? branding.lat);
        lng = Number(branding.center_lng ?? branding.lng);
      }
      
      if (isFinite(lat) && isFinite(lng)) {
        try { drawMap.setView([lat, lng], zoom || drawMap.getZoom()); } catch(_) {}
      }
    } catch (e) {
      console.warn('[contrib-map] applyCityBranding error:', e);
    }
  }

  // ============================================================================
  // MANUAL DRAWING
  // ============================================================================

  /**
   * Gère le clic sur la carte pour le dessin manuel
   */
  function onMapClick(e) {
    if (!manualDraw.active || !drawMap) return;
    try {
      manualDraw.points.push(e.latlng);
      updateTempShape();
      // Callback externe pour mettre à jour les boutons
      if (win.ContribMap?.onDrawStateChange) {
        win.ContribMap.onDrawStateChange();
      }
    } catch(_) {}
  }

  /**
   * Efface le guide de dessin
   */
  function clearGuide() {
    try {
      if (manualDraw && manualDraw.guideLayer && drawMap) {
        drawMap.removeLayer(manualDraw.guideLayer);
      }
    } catch(_) {}
    if (manualDraw) manualDraw.guideLayer = null;
  }

  /**
   * Gère le mouvement de la souris pour afficher un guide
   */
  function onMapMouseMove(e) {
    // Point mode : pas de guide nécessaire
    if (manualDraw.type === 'point') {
      clearGuide();
      return;
    }
    
    // Show a dashed guide only in line/polygon mode with at least one point
    if (!drawMap || !manualDraw.active || manualDraw.points.length === 0) {
      clearGuide();
      return;
    }
    
    const last = manualDraw.points[manualDraw.points.length - 1];
    if (!last) { clearGuide(); return; }
    
    const coords = [last, e.latlng];
    clearGuide();
    
    try {
      manualDraw.guideLayer = L.polyline(coords, {
        color: getComputedStyle(document.documentElement).getPropertyValue('--info').trim(),
        weight: 2,
        opacity: 0.7,
        dashArray: '6,6'
      }).addTo(drawMap);
    } catch(_) {}
  }

  /**
   * Démarre le dessin manuel
   * @param {string} type - Type de géométrie ('line', 'polygon' ou 'point')
   */
  function startManualDraw(type) {
    if (!drawMap) return;
    
    // Validation du type
    if (!['line', 'polygon', 'point'].includes(type)) {
      console.warn('[contrib-map] Type de géométrie invalide:', type);
      return;
    }
    
    // Reset current temp
    clearManualTemp();
    manualDraw.active = true;
    manualDraw.type = type;
    manualDraw.points = [];
    manualDraw.markers = [];
    
    // Désactiver le double-clic zoom sauf pour le mode point
    if (type !== 'point') {
      try { drawMap.doubleClickZoom.disable(); } catch(_) {}
    }
    
    // Change le curseur en mode point
    if (type === 'point' && drawMap._container) {
      drawMap._container.style.cursor = 'crosshair';
    }
    
    if (win.ContribMap?.onDrawStateChange) {
      win.ContribMap.onDrawStateChange();
    }
  }

  /**
   * Met à jour la forme temporaire pendant le dessin
   */
  function updateTempShape() {
    if (!drawMap) return;
    
    // Remove previous temp layer
    if (manualDraw.tempLayer) { 
      try { drawMap.removeLayer(manualDraw.tempLayer); } catch(_) {}
      manualDraw.tempLayer = null; 
    }
    
    if (!manualDraw.points.length) return;
    
    // Mode point : afficher un marker de contribution avec icône de catégorie
    if (manualDraw.type === 'point') {
      // Récupérer la catégorie sélectionnée dans le formulaire
      const categorySelect = document.getElementById('contrib-category');
      const selectedCategory = categorySelect?.value || null;
      
      // Créer le marker avec l'icône de la catégorie
      const icon = createContributionMarkerIcon(selectedCategory);
      manualDraw.tempLayer = L.marker(manualDraw.points[0], { icon }).addTo(drawMap);
      return;
    }
    
    // Ligne ou polygone
    const infoColor = getComputedStyle(document.documentElement).getPropertyValue('--info').trim();
    const style = { color: infoColor, weight: 3, fillOpacity: 0.2 };
    if (manualDraw.type === 'polygon') {
      manualDraw.tempLayer = L.polygon(manualDraw.points, style).addTo(drawMap);
    } else {
      manualDraw.tempLayer = L.polyline(manualDraw.points, style).addTo(drawMap);
    }
  }

  /**
   * Annule le dernier point ajouté
   */
  function undoManualPoint() {
    if (!manualDraw.active || manualDraw.points.length === 0) return;
    manualDraw.points.pop();
    updateTempShape();
    
    if (win.ContribMap?.onDrawStateChange) {
      win.ContribMap.onDrawStateChange();
    }
  }

  /**
   * Termine le dessin manuel
   */
  function finishManualDraw() {
    if (!manualDraw.active) return;
    
    // Validation selon le type de géométrie
    let minPts = 1;
    let errorMsg = '';
    
    switch (manualDraw.type) {
      case 'point':
        minPts = 1;
        errorMsg = 'Placez au moins 1 point sur la carte.';
        break;
      case 'line':
        minPts = 2;
        errorMsg = 'Placez au moins 2 points pour créer une ligne.';
        break;
      case 'polygon':
        minPts = 3;
        errorMsg = 'Placez au moins 3 points pour créer un polygone.';
        break;
    }
    
    if (manualDraw.points.length < minPts) {
      if (win.ContribUtils?.showToast) {
        win.ContribUtils.showToast(errorMsg, 'error');
      }
      return;
    }
    
    // Remove existing finalized layer
    if (drawLayer) { 
      try { drawMap.removeLayer(drawLayer); } catch(_) {} 
      drawLayer = null; 
    }
    
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    
    // Créer la géométrie finale selon le type
    if (manualDraw.type === 'point') {
      // Récupérer la catégorie sélectionnée dans le formulaire
      const categorySelect = document.getElementById('contrib-category');
      const selectedCategory = categorySelect?.value || null;
      
      // Créer le marker final avec l'icône de la catégorie
      const icon = createContributionMarkerIcon(selectedCategory);
      drawLayer = L.marker(manualDraw.points[0], { icon }).addTo(drawMap);
      
      // Centrer la vue sur le point
      try { drawMap.setView(manualDraw.points[0], drawMap.getZoom()); } catch(_) {}
      
    } else if (manualDraw.type === 'polygon') {
      const style = { 
        color: primaryColor, 
        weight: 3, 
        fillOpacity: 0.25, 
        fillColor: primaryColor 
      };
      drawLayer = L.polygon(manualDraw.points, style).addTo(drawMap);
      try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_) {}
      
    } else { // line
      const style = { 
        color: primaryColor, 
        weight: 3, 
        opacity: 0.9 
      };
      drawLayer = L.polyline(manualDraw.points, style).addTo(drawMap);
      try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_) {}
    }
    
    drawLayerDirty = true;
    cancelManualDraw(true);
    
    if (win.ContribMap?.onDrawStateChange) {
      win.ContribMap.onDrawStateChange();
    }
  }

  /**
   * Annule le dessin en cours
   * @param {boolean} keepStatus - Conserver le statut
   */
  function cancelManualDraw(keepStatus = false) {
    manualDraw.active = false;
    manualDraw.type = null;
    manualDraw.points = [];
    manualDraw.markers = [];
    clearManualTemp();
    clearGuide();
    
    // Restaurer le curseur normal
    if (drawMap && drawMap._container) {
      drawMap._container.style.cursor = '';
    }
    
    try { drawMap.doubleClickZoom.enable(); } catch(_) {}
    
    if (win.ContribMap?.onDrawStateChange) {
      win.ContribMap.onDrawStateChange();
    }
  }

  /**
   * Efface la forme temporaire
   */
  function clearManualTemp() {
    if (manualDraw.tempLayer) { 
      try { drawMap.removeLayer(manualDraw.tempLayer); } catch(_) {} 
      manualDraw.tempLayer = null; 
    }
  }

  /**
   * Efface toute la géométrie (temp + finalisée)
   */
  function clearManualGeometry() {
    clearManualTemp();
    if (drawLayer) { 
      try { drawMap.removeLayer(drawLayer); } catch(_) {} 
      drawLayer = null; 
    }
    drawLayerDirty = false;
    cancelManualDraw(true);
    
    if (win.ContribMap?.onDrawStateChange) {
      win.ContribMap.onDrawStateChange();
    }
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  /**
   * Récupère l'état du dessin manuel
   * @returns {Object} État du dessin
   */
  function getManualDrawState() {
    return {
      active: manualDraw.active,
      type: manualDraw.type,
      pointsCount: manualDraw.points.length,
      hasLayer: !!drawLayer,
      isDirty: drawLayerDirty
    };
  }

  /**
   * Vérifie si une géométrie a été dessinée
   * @returns {boolean} True si une géométrie existe
   */
  function hasDrawGeometry() {
    return !!(drawLayer) || !!drawLayerDirty;
  }

  /**
   * Récupère la géométrie dessinée au format GeoJSON
   * @returns {Object|null} GeoJSON ou null
   */
  function getDrawnGeometry() {
    if (!drawLayer) return null;
    try {
      return drawLayer.toGeoJSON();
    } catch(e) {
      console.warn('[contrib-map] getDrawnGeometry error:', e);
      return null;
    }
  }

  /**
   * Récupère l'instance de la carte
   * @returns {L.Map|null} Instance de la carte
   */
  function getDrawMap() {
    return drawMap;
  }

  /**
   * Définit la géométrie sur la carte
   * @param {Object} geojson - GeoJSON à afficher
   */
  function setDrawnGeometry(geojson) {
    if (!drawMap || !geojson) return;
    
    try {
      // Clear existing
      if (drawLayer) {
        drawMap.removeLayer(drawLayer);
        drawLayer = null;
      }
      
      // Résoudre la couleur primaire depuis les CSS variables
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#2563eb';
      
      // Compter les features pour le log
      let featureCount = 0;
      let pointCount = 0;
      
      // Add new geometry avec gestion des points multiples
      drawLayer = L.geoJSON(geojson, {
        style: { 
          color: primaryColor, 
          weight: 3, 
          fillOpacity: 0.25,
          fillColor: primaryColor
        },
        pointToLayer: (feature, latlng) => {
          pointCount++;
          
          // Récupérer la catégorie sélectionnée dans le formulaire
          const categorySelect = document.getElementById('contrib-category');
          const selectedCategory = categorySelect?.value || null;
          
          // Utiliser le marker de contribution avec icône de catégorie
          const icon = createContributionMarkerIcon(selectedCategory);
          const marker = L.marker(latlng, { icon });
          
          // Ajouter une animation d'apparition pour chaque point
          marker.on('add', () => {
            const el = marker.getElement?.();
            if (el) {
              el.style.opacity = '0';
              el.style.transform = 'translateY(-10px) scale(0.8)';
              el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
              requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0) scale(1)';
              });
            }
          });
          
          return marker;
        },
        onEachFeature: () => { featureCount++; }
      }).addTo(drawMap);
      
      drawLayerDirty = true;
      
      // Fit bounds avec gestion des erreurs et padding adapté
      try { 
        const bounds = drawLayer.getBounds();
        if (bounds.isValid()) {
          // Padding plus grand si plusieurs points
          const padding = pointCount > 1 ? [30, 30] : [10, 10];
          drawMap.fitBounds(bounds, { padding, maxZoom: 16 }); 
        }
      } catch(_) {}
      
      console.log(`[contrib-map] setDrawnGeometry: ${featureCount} features, ${pointCount} points`);
    } catch(e) {
      console.warn('[contrib-map] setDrawnGeometry error:', e);
    }
  }

  // Public API
  win.ContribMap = {
    // Initialization
    initDrawMap,
    
    // Basemap management
    pickDefaultBasemap,
    ensureBasemaps,
    setDrawBaseLayer,
    buildContribBasemapMenu,
    applyCityBranding,
    
    // Manual drawing
    startManualDraw,
    undoManualPoint,
    finishManualDraw,
    cancelManualDraw,
    clearManualGeometry,
    
    // Getters
    getManualDrawState,
    hasDrawGeometry,
    getDrawnGeometry,
    getDrawMap,
    setDrawnGeometry,
    
    // Callback hook (set externally)
    onDrawStateChange: null
  };

})(window);
