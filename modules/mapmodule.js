window.MapModule = (() => {
  // Initialize the map view (sans basemap)
  const map = L.map('map').setView([45.75, 4.85], 12);
  let baseLayer;
  
  // Global invisible hitline pane and SVG renderer (for wider clickable area on paths)
  const hitPaneName = 'hitlinePane';
  const hitPane = map.createPane(hitPaneName);
  // Place above clickable layers to avoid hover jitter; still below markers
  // Leaflet defaults: tilePane=200, overlayPane=400, markerPane=600, tooltipPane=650, popupPane=700
  // clickableLayers pane is set to 450 in DataModule (below markers at 600)
  hitPane.style.zIndex = 460;
  const hitRenderer = L.svg({ pane: hitPaneName });
  
  // Camera markers pane (au premier plan, au dessus de tout sauf popups)
  const cameraPaneName = 'cameraPane';
  const cameraPane = map.createPane(cameraPaneName);
  cameraPane.style.zIndex = 680; // Au dessus de hitline (460) et tooltipPane (650)
  
  /**
   * Initialise le fond de carte après chargement de window.basemaps
   * Utilise window._cityPreferredBasemap si défini (depuis city_branding.default_basemap)
   */
  function initBaseLayer() {
    const bmList = window.basemaps || [];
    const cityPreferred = window._cityPreferredBasemap;
    
    if (!bmList.length) {
      console.warn('MapModule.initBaseLayer : pas de basemaps dispo');
      return;
    }
    
    // Ordre de priorité pour la sélection du basemap:
    // 1. window._cityPreferredBasemap (depuis city_branding.default_basemap)
    // 2. Basemap avec default: true
    // 3. Premier basemap de la liste
    let selectedBm = null;
    
    if (cityPreferred) {
      selectedBm = bmList.find(b => b.name === cityPreferred);
      if (!selectedBm) {
        console.warn(`MapModule.initBaseLayer : basemap "${cityPreferred}" non trouvé, utilisation du défaut`);
      }
    }
    
    if (!selectedBm) {
      selectedBm = bmList.find(b => b.default === true) || bmList[0];
    }
    
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(selectedBm.url, { attribution: selectedBm.attribution });
    baseLayer.addTo(map);
    
    // Mettre à jour l'UI pour refléter le basemap actif
    if (window.UIModule?.setActiveBasemap) {
      window.UIModule.setActiveBasemap(selectedBm.label);
    }
  }


  const layers = {};

  // Update marker visibility based on minZoom
  const updateMarkerVisibility = () => {
    const currentZoom = map.getZoom();
    
    // Gestion du zoom pour les couches configurées
    Object.entries(window.zoomConfig || {}).forEach(([layerName, { minZoom }]) => {
      const layer = layers[layerName];
      if (layer && typeof layer.eachLayer === 'function') {
        layer.eachLayer(sublayer => {
          if (sublayer instanceof L.Marker) {
            sublayer.setOpacity(currentZoom < minZoom ? 0 : 1);
          }
        });
      }
    });
    
    // Gestion des camera markers (déléguée à CameraMarkers)
    if (window.CameraMarkers?.updateCameraMarkersVisibility) {
      window.CameraMarkers.updateCameraMarkersVisibility(map);
    }
  };

  // Add a GeoJSON layer and update filter and marker visibility
  const addLayer = (name, layer) => {
    layers[name] = layer;
    if (window.updateFilterUI) window.updateFilterUI();
    updateMarkerVisibility();  // ensure markers hidden if needed
  };

  // Remove a layer and update filter and marker visibility
  const removeLayer = (name) => {
    if (layers[name]) {
      map.removeLayer(layers[name]);
      delete layers[name];
      if (window.updateFilterUI) window.updateFilterUI();
      updateMarkerVisibility();
    }
  };

  // Swap out the base layer
  const setBaseLayer = (tileLayer) => {
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = tileLayer;
    map.addLayer(baseLayer);
  };

  // Recompute marker visibility on zoom end
  map.on('zoomend', updateMarkerVisibility);

  return { 
    map, 
    layers, 
    addLayer, 
    removeLayer, 
    setBaseLayer, 
    initBaseLayer,
    // Expose hitline resources for other modules
    hitRenderer,
    hitPaneName,
    // Expose camera pane for camera markers
    cameraPaneName
  };
})();