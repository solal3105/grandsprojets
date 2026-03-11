window.MapModule = (() => {
  // Initialize the map view using Leaflet compatibility layer (backed by MapLibre GL)
  const map = L.map('map').setView([45.75, 4.85], 12);
  let baseLayer;
  
  // DEPRECATED: Hitline pane - MapLibre GL gère les clics nativement
  // Conservé temporairement pour compatibilité avec code legacy
  const hitPaneName = 'hitlinePane';
  const hitPane = map.createPane(hitPaneName);
  hitPane.style.zIndex = 460;
  const hitRenderer = L.svg({ pane: hitPaneName });
  
  // Camera markers pane
  const cameraPaneName = 'cameraPane';
  const cameraPane = map.createPane(cameraPaneName);
  cameraPane.style.zIndex = 680;
  
  /**
   * Initialise le fond de carte après chargement de window.basemaps
   * OPTIMISÉ: Utilise L.tileLayer (via compat layer MapLibre GL)
   */
  function initBaseLayer() {
    const bmList = window.basemaps || [];
    const cityPreferred = window._cityPreferredBasemap;
    
    if (!bmList.length) {
      console.warn('[MapModule] Pas de basemaps disponibles');
      return;
    }
    
    // Sélection du basemap (ordre de priorité)
    let selectedBm = cityPreferred ? bmList.find(b => b.name === cityPreferred) : null;
    if (!selectedBm) {
      selectedBm = bmList.find(b => b.default) || bmList[0];
    }
    
    // Remplacer le basemap existant
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(selectedBm.url, { attribution: selectedBm.attribution });
    baseLayer.addTo(map);
    
    // Mettre à jour l'UI
    window.UIModule?.setActiveBasemap?.(selectedBm.label);
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