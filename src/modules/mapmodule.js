// modules/MapModule.js
import L from 'leaflet';
import { UIModule } from './uimodule.js';

export const MapModule = (() => {
  // Lazy-initialized Leaflet map and resources
  let map = null;
  let baseLayer = null;
  let containerId = 'map';

  // Lazy pane/renderer for hitlines
  const hitPaneName = 'hitlinePane';
  let hitPane = null;
  let hitRenderer = null;

  function invalidateSizeSafely(retries = 2) {
    try { map?.invalidateSize(true); } catch (_) {}
    if (retries > 0) {
      setTimeout(() => invalidateSizeSafely(retries - 1), 250);
    }
  }

  function setupHitResources() {
    if (!map || hitPane) return;
    try {
      hitPane = map.createPane(hitPaneName);
      hitPane.style.zIndex = 660; // above clickable layers, below popups
      hitRenderer = L.svg({ pane: hitPaneName });
    } catch (_) {}
  }

  // Ensure map exists when container is present
  function ensureMap() {
    if (map) return map;
    const el = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    if (!el) return null; // container not on this page
    try {
      map = L.map(containerId).setView([45.75, 4.85], 12);
      // After load/layout, fix size
      if (typeof window !== 'undefined') {
        try {
          window.addEventListener('load', () => {
            try { requestAnimationFrame(() => invalidateSizeSafely(2)); } catch (_) { invalidateSizeSafely(2); }
          });
        } catch (_) {}
      }
      // Set up panes/renderers and listeners
      setupHitResources();
      map.on('zoomend', updateMarkerVisibility);
    } catch (_) {
      map = null;
    }
    return map;
  }

  // Public initializer to set custom container id if needed
  function init(id = 'map') {
    containerId = id || 'map';
    return ensureMap();
  }

  // Layers registry
  const layers = {};

  // Update marker visibility based on minZoom
  const updateMarkerVisibility = () => {
    if (!map) return;
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

  /**
   * Initialise le fond de carte après chargement de window.basemaps
   */
  function initBaseLayer() {
    const m = ensureMap();
    if (!m) {
      console.warn('MapModule.initBaseLayer : conteneur #'+containerId+' introuvable');
      return;
    }
    const bmList = window.basemaps || [];
    if (!bmList.length) {
      console.warn('MapModule.initBaseLayer : pas de basemaps dispo');
      return;
    }
    // Find the default basemap (with default: true) or fall back to the first one
    const defaultBm = bmList.find(b => b.default === true) || bmList[0];

    if (baseLayer) m.removeLayer(baseLayer);
    baseLayer = L.tileLayer(defaultBm.url, { attribution: defaultBm.attribution });
    baseLayer.addTo(m);

    // Update the UI to reflect the active basemap
    if (UIModule?.setActiveBasemap) {
      UIModule.setActiveBasemap(defaultBm.label);
    }
  }

  // Add a GeoJSON layer and update filter and marker visibility
  const addLayer = (name, layer) => {
    const m = ensureMap();
    if (!m) return; // silently no-op on fiche page
    layers[name] = layer;
    if (window.updateFilterUI) window.updateFilterUI();
    updateMarkerVisibility();  // ensure markers hidden if needed
  };

  // Remove a layer and update filter and marker visibility
  const removeLayer = (name) => {
    const m = ensureMap();
    if (!m) {
      delete layers[name];
      return;
    }
    if (layers[name]) {
      m.removeLayer(layers[name]);
      delete layers[name];
      if (window.updateFilterUI) window.updateFilterUI();
      updateMarkerVisibility();
    }
  };

  // Swap out the base layer
  const setBaseLayer = (tileLayer) => {
    const m = ensureMap();
    if (!m) return;
    if (baseLayer) m.removeLayer(baseLayer);
    baseLayer = tileLayer;
    m.addLayer(baseLayer);
  };

  // Public helper to force recalculation of map size
  const refreshSize = () => { try { ensureMap()?.invalidateSize(true); } catch (_) {} };

  init();

  return {
    map,
    layers,
    addLayer,
    removeLayer,
    setBaseLayer,
    initBaseLayer,
    // Expose hitline resources for other modules
    get hitRenderer() { return hitRenderer; },
    get hitPaneName() { return hitPaneName; },
    // New APIs
    init,
    refreshSize
  };
})();