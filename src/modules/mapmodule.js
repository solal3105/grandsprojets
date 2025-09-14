// modules/MapModule.js
window.MapModule = (() => {
  // Initialize the map view (sans basemap)
  const map = L.map('map').setView([45.75, 4.85], 12);
  let baseLayer;
  
  // Ensure map size is correct after load/layout changes
  function invalidateSizeSafely(retries = 2) {
    try { map.invalidateSize(true); } catch (_) {}
    if (retries > 0) {
      setTimeout(() => invalidateSizeSafely(retries - 1), 250);
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      // run on next frame to ensure CSS/layout is settled
      try { requestAnimationFrame(() => invalidateSizeSafely(2)); } catch (_) { invalidateSizeSafely(2); }
    });
  }
  
  // Global invisible hitline pane and SVG renderer (for wider clickable area on paths)
  const hitPaneName = 'hitlinePane';
  const hitPane = map.createPane(hitPaneName);
  // Place above clickable layers to avoid hover jitter; still below popups
  // Leaflet defaults: tilePane=200, overlayPane=400, markerPane=600, tooltipPane=650, popupPane=700
  // clickableLayers pane is set to 650 in DataModule
  hitPane.style.zIndex = 660;
  const hitRenderer = L.svg({ pane: hitPaneName });
  
  /**
   * Initialise le fond de carte après chargement de window.basemaps
   */
  function initBaseLayer() {
    const bmList = window.basemaps || [];
    if (!bmList.length) {
      console.warn('MapModule.initBaseLayer : pas de basemaps dispo');
      return;
    }
    // Find the default basemap (with default: true) or fall back to the first one
    const defaultBm = bmList.find(b => b.default === true) || bmList[0];
    
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(defaultBm.url, { attribution: defaultBm.attribution });
    baseLayer.addTo(map);
    
    // Update the UI to reflect the active basemap
    if (window.UIModule?.setActiveBasemap) {
      window.UIModule.setActiveBasemap(defaultBm.label);
    }
  }


  const layers = {};

  // Update marker visibility based on minZoom
  const updateMarkerVisibility = () => {
    const currentZoom = map.getZoom();
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
    // Public helper to force recalculation of map size
    refreshSize: () => { try { map.invalidateSize(true); } catch (_) {} }
  };
})();