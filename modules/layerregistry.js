// modules/layerregistry.js
// Registre centralisé des groupes de couches et alias

;(function(win) {
  'use strict';

  // Ensemble des couches liées aux Travaux (style + interactions communes)
  const TravauxLayers = new Set([
    'travaux',
    'city-travaux-chantiers',
    'open data travaux'
  ]);

  function isTravauxLayer(name) {
    return !!name && TravauxLayers.has(name);
  }

  function addTravauxAlias(name) {
    if (name && typeof name === 'string') {
      TravauxLayers.add(name);
    }
  }

  function listTravaux() {
    return Array.from(TravauxLayers);
  }

  // Expose API
  win.LayerRegistry = win.LayerRegistry || {};
  win.LayerRegistry.isTravauxLayer = isTravauxLayer;
  win.LayerRegistry.addTravauxAlias = addTravauxAlias;
  win.LayerRegistry.listTravaux = listTravaux;

})(window);
