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
  let drawMode = null; // 'line' | 'polygon' | null
  let currentPolyline = null;
  let currentPolygon = null;
  let tempMarkers = [];
  let guideLayer = null;
  let isInitializing = false; // Flag pour éviter les initialisations multiples
  let basemapsCache = null;

  // Manual draw state
  let manualDraw = { 
    active: false,
    type: null, 
    points: [], 
    tempLayer: null,
    guideLayer: null 
  };

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
    if (!drawPanelEl) return null;
    
    // Éviter les initialisations multiples simultanées
    if (isInitializing) {
      console.log('[contrib-map] Already initializing, waiting...');
      // Attendre un peu et retourner la carte si elle existe
      await new Promise(resolve => setTimeout(resolve, 100));
      return drawMap;
    }
    
    isInitializing = true;
    
    try {
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
        btn.className = 'gp-btn basemap-tile';
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
    // Show a dashed guide only in line mode with at least one point
    if (!drawMap || !manualDraw.active || manualDraw.type !== 'line' || manualDraw.points.length === 0) {
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
   * @param {string} type - Type de géométrie ('line' ou 'polygon')
   */
  function startManualDraw(type) {
    if (!drawMap) return;
    
    // Reset current temp
    clearManualTemp();
    manualDraw.active = true;
    manualDraw.type = type === 'polygon' ? 'polygon' : 'line';
    manualDraw.points = [];
    
    try { drawMap.doubleClickZoom.disable(); } catch(_) {}
    
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
    
    const minPts = manualDraw.type === 'line' ? 2 : 3;
    if (manualDraw.points.length < minPts) {
      if (win.ContribUtils?.showToast) {
        win.ContribUtils.showToast(`Ajoutez au moins ${minPts} points avant de terminer.`, 'error');
      }
      return;
    }
    
    // Remove existing finalized layer
    if (drawLayer) { 
      try { drawMap.removeLayer(drawLayer); } catch(_) {} 
      drawLayer = null; 
    }
    
    // Finalized style
    const style = manualDraw.type === 'polygon'
      ? { color: 'var(--primary)', weight: 3, fillOpacity: 0.25, fillColor: 'var(--primary)' }
      : { color: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(), weight: 3, opacity: 0.9 };
    
    if (manualDraw.type === 'polygon') {
      drawLayer = L.polygon(manualDraw.points, style).addTo(drawMap);
    } else {
      drawLayer = L.polyline(manualDraw.points, style).addTo(drawMap);
    }
    
    try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_) {}
    
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
    clearManualTemp();
    clearGuide();
    
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
      
      // Add new geometry
      drawLayer = L.geoJSON(geojson, {
        style: { color: 'var(--primary)', weight: 3, fillOpacity: 0.25 }
      }).addTo(drawMap);
      
      drawLayerDirty = true;
      
      try { drawMap.fitBounds(drawLayer.getBounds(), { padding: [10, 10] }); } catch(_) {}
    } catch(e) {
      console.warn('[contrib-map] setDrawnGeometry error:', e);
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

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
