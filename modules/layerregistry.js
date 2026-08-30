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

  // Ensemble des couches PLU / Emplacements réservés
  const PluLayers = new Set([
    'emplacementReserve'
  ]);

  /* Plus d'ensembles métro/bus/tramway : les couches de réseau de transport
     sont des couches de données ordinaires dont chaque tracé porte sa couleur
     (`_color`) et son nom - aucun cas particulier par ville ni par mode. */

  const VeloLayers = new Set([
    'velo'
  ]);

  const PathTooltipDisabledLayers = new Set([
    'planVelo',
    'amenagementCyclable'
  ]);

  const NoInteractLayers = new Set([
    'planVelo',
    'amenagementCyclable'
  ]);

  function isTravauxLayer(name) {
    return !!name && TravauxLayers.has(name);
  }

  function isPluLayer(name) {
    return !!name && PluLayers.has(name);
  }

  function isVeloLayer(name) {
    return !!name && VeloLayers.has(name);
  }

  function supportsPathTooltip(name) {
    return !!name && !PathTooltipDisabledLayers.has(name);
  }

  function isNoInteractLayer(name) {
    return !!name && NoInteractLayers.has(name);
  }

  function addTravauxAlias(name) {
    if (name && typeof name === 'string') {
      TravauxLayers.add(name);
    }
  }

  function addPluAlias(name) {
    if (name && typeof name === 'string') {
      PluLayers.add(name);
    }
  }

  function addVeloAlias(name) {
    if (name && typeof name === 'string') {
      VeloLayers.add(name);
    }
  }

  function disablePathTooltipForLayer(name) {
    if (name && typeof name === 'string') {
      PathTooltipDisabledLayers.add(name);
    }
  }

  function addNoInteractAlias(name) {
    if (name && typeof name === 'string') {
      NoInteractLayers.add(name);
    }
  }

  function listTravaux() {
    return Array.from(TravauxLayers);
  }

  function listPlu() {
    return Array.from(PluLayers);
  }

  function listVelo() {
    return Array.from(VeloLayers);
  }

  // Expose API
  win.LayerRegistry = win.LayerRegistry || {};
  win.LayerRegistry.isTravauxLayer = isTravauxLayer;
  win.LayerRegistry.addTravauxAlias = addTravauxAlias;
  win.LayerRegistry.listTravaux = listTravaux;

  win.LayerRegistry.isPluLayer = isPluLayer;
  win.LayerRegistry.addPluAlias = addPluAlias;
  win.LayerRegistry.listPlu = listPlu;

  win.LayerRegistry.isVeloLayer = isVeloLayer;
  win.LayerRegistry.addVeloAlias = addVeloAlias;
  win.LayerRegistry.listVelo = listVelo;

  win.LayerRegistry.supportsPathTooltip = supportsPathTooltip;
  win.LayerRegistry.disablePathTooltipForLayer = disablePathTooltipForLayer;

  win.LayerRegistry.isNoInteractLayer = isNoInteractLayer;
  win.LayerRegistry.addNoInteractAlias = addNoInteractAlias;

})(window);
