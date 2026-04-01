// modules/contrib/contrib-map.js
// Gestion de la carte de dessin pour les contributions

;(function(win) {
  'use strict';

  // STATE

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

  // Shared marker/style helpers (defined in datamodule.js, exposed on window)
  const createContributionMarkerIcon = win.createContributionMarkerIcon;

  // MAP INITIALIZATION

  /**
   * Initialise la carte de dessin
   * @param {string} containerId - ID du conteneur de la carte
   * @param {HTMLElement} drawPanelEl - Élément du panneau de dessin
   * @param {HTMLElement} cityEl - Élément select de la ville
   * @returns {Promise<Object>} Instance de la carte
   */
  async function initDrawMap(containerId, drawPanelEl, cityEl) {
    if (!window.L) {
      console.warn('[contrib-map] Map library not loaded');
      return null;
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
        } catch (e) { console.debug('[contrib-map] layer cleanup:', e); }
        drawMap = null;
      }
      
      let container = document.getElementById(containerId);
      if (!container) {
        console.error('[contrib-map] Container not found:', containerId);
        return null;
      }
      
      // Nettoyage complet : recréer le container pour éviter les problèmes de réinitialisation
      const parent = container.parentNode;
      const newContainer = document.createElement('div');
      newContainer.id = containerId;
      newContainer.className = container.className;
      newContainer.style.cssText = container.style.cssText;
      
      // Remplacer l'ancien container
      parent.replaceChild(newContainer, container);
      container = newContainer;
      
      console.log('[contrib-map] Container recreated');
      
      // Load basemaps and pick only the one named "OpenStreetMap"
      const bmList = await ensureBasemaps();
      const osmBm = Array.isArray(bmList)
        ? bmList.find(b => String(b?.name || b?.label || '').trim().toLowerCase() === 'openstreetmap')
        : null;
      
      // Initialise map with a safe temporary view
      console.log('[contrib-map] Creating new map on container:', containerId);
      drawMap = L.map(containerId, { center: [45.75, 4.85], zoom: 12 });
      
      try { 
        drawMap.whenReady(() => setTimeout(() => { 
          try { drawMap.invalidateSize(); } catch (e) { console.debug('[contrib-map] map resize:', e); } 
        }, 60)); 
      } catch (e) { console.debug('[contrib-map] map resize:', e); }
      
      setDrawBaseLayer(osmBm);
      
      // Ensure no basemap menu is displayed in contribution modal
      try { drawPanelEl.querySelector('#contrib-basemap-menu')?.remove(); } catch (e) { console.warn('[contrib-map] map resize:', e); }
      
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

  // BASEMAP MANAGEMENT

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
    } catch (e) { console.debug('[contrib-map] layer cleanup:', e); }
    
    drawBaseLayer = null;
    
    try {
      if (bm) {
        drawBaseLayer = L.createBasemapLayer(bm).addTo(drawMap);
      } else {
        // Dernier recours si aucun basemap configuré
        drawBaseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(drawMap);
      }
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
      if (menu) { try { menu.remove(); } catch (e) { console.warn('[contrib-map] DOM cleanup:', e); } }
      
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
          } catch (e) { console.debug('[contrib-map] UI update:', e); }
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
        try { drawMap.setView([lat, lng], zoom || drawMap.getZoom()); } catch (e) { console.warn('[contrib-map] map view update:', e); }
      }
    } catch (e) {
      console.warn('[contrib-map] applyCityBranding error:', e);
    }
  }

  // MANUAL DRAWING

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
    } catch (e) { console.debug('[contrib-map] click handler:', e); }
  }

  /**
   * Efface le guide de dessin
   */
  function clearGuide() {
    try {
      if (manualDraw && manualDraw.guideLayer && drawMap) {
        drawMap.removeLayer(manualDraw.guideLayer);
      }
    } catch (e) { console.debug('[contrib-map] layer cleanup:', e); }
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
    } catch (e) { console.debug('[contrib-map] guide line:', e); }
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
      try { drawMap.doubleClickZoom.disable(); } catch (e) { console.debug('[contrib-map] zoom control toggle:', e); }
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
      try { drawMap.removeLayer(manualDraw.tempLayer); } catch (e) { console.warn('[contrib-map] layer cleanup:', e); }
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
      try { drawMap.removeLayer(drawLayer); } catch (e) { console.debug('[contrib-map] layer cleanup:', e); } 
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
      try { drawMap.setView(manualDraw.points[0], drawMap.getZoom()); } catch (e) { console.warn('[contrib-map] map view update:', e); }
      
    } else if (manualDraw.type === 'polygon') {
      const style = { 
        color: primaryColor, 
        weight: 3, 
        fillOpacity: 0.25, 
        fillColor: primaryColor 
      };
      drawLayer = L.polygon(manualDraw.points, style).addTo(drawMap);
      try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch (e) { console.debug('[contrib-map] map view update:', e); }
      
    } else { // line
      const style = { 
        color: primaryColor, 
        weight: 3, 
        opacity: 0.9 
      };
      drawLayer = L.polyline(manualDraw.points, style).addTo(drawMap);
      try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch (e) { console.debug('[contrib-map] map view update:', e); }
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
  function cancelManualDraw(_keepStatus = false) {
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
    
    try { drawMap.doubleClickZoom.enable(); } catch (e) { console.debug('[contrib-map] zoom control toggle:', e); }
    
    if (win.ContribMap?.onDrawStateChange) {
      win.ContribMap.onDrawStateChange();
    }
  }

  /**
   * Efface la forme temporaire
   */
  function clearManualTemp() {
    if (manualDraw.tempLayer) { 
      try { drawMap.removeLayer(manualDraw.tempLayer); } catch (e) { console.debug('[contrib-map] layer cleanup:', e); } 
      manualDraw.tempLayer = null; 
    }
  }

  /**
   * Efface toute la géométrie (temp + finalisée)
   */
  function clearManualGeometry() {
    clearManualTemp();
    if (drawLayer) { 
      try { drawMap.removeLayer(drawLayer); } catch (e) { console.debug('[contrib-map] layer cleanup:', e); } 
      drawLayer = null; 
    }
    drawLayerDirty = false;
    cancelManualDraw(true);
    
    if (win.ContribMap?.onDrawStateChange) {
      win.ContribMap.onDrawStateChange();
    }
  }

  // GETTERS

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
   * @returns {Object|null} Instance de la carte
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
          drawMap.fitBounds(bounds, { padding }); 
        }
      } catch (e) { console.debug('[contrib-map] map view update:', e); }
      
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
