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

  // Ensemble des couches Métro / Funiculaire
  const MetroLayers = new Set([
    'metroFuniculaire'
  ]);

  const VeloLayers = new Set([
    'velo'
  ]);

  const BusLayers = new Set([
    'bus'
  ]);

  const TramLayers = new Set([
    'tramway'
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

  function isMetroLayer(name) {
    return !!name && MetroLayers.has(name);
  }

  function isVeloLayer(name) {
    return !!name && VeloLayers.has(name);
  }

  function isBusLayer(name) {
    return !!name && BusLayers.has(name);
  }

  function isTramLayer(name) {
    return !!name && TramLayers.has(name);
  }

  function supportsPathTooltip(name) {
    return !!name && !PathTooltipDisabledLayers.has(name);
  }

  function isNoInteractLayer(name) {
    return !!name && NoInteractLayers.has(name);
  }

  function formatTooltipTitle(layerName, props, title) {
    if (isVeloLayer(layerName) && props && props.project_name && !String(title || '').startsWith('Voie Lyonnaise')) {
      return `Voie Lyonnaise ${props.project_name}`;
    }
    return title;
  }

  function getPathTooltipHtml(layerName, props, esc, fallbackTitle, fallbackLayerName) {
    const safeEsc = typeof esc === 'function' ? esc : ((s) => String(s || ''));
    const p = props || {};

    if (isBusLayer(layerName)) {
      const val = p.bus || p.BUS || p.Bus || '';
      return `<div class="gp-tt-body">${safeEsc(`bus ${val}`)}</div>`;
    }

    if (isMetroLayer(layerName)) {
      const ligne = p.ligne || p.LIGNE || p.Line || '';
      const upper = String(ligne).toUpperCase();
      const isFuni = upper === 'F1' || upper === 'F2';
      const label = isFuni ? `Funiculaire ${ligne}` : `Métro ${ligne}`;
      return `<div class="gp-tt-body">${safeEsc(label)}</div>`;
    }

    if (isTramLayer(layerName)) {
      const val = p.tramway || p.ligne || p.LIGNE || '';
      return `<div class="gp-tt-body">${safeEsc(`Tramway ${val}`)}</div>`;
    }

    if (isPluLayer(layerName)) {
      const raw = (p.type ?? p.TYPE ?? p.Type ?? p.libelle ?? p.LIBELLE ?? p.code ?? p.CODE ?? p.typologie ?? '').toString().trim();
      const normalizeKey = (s) => s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z]/g, '');
      const key = normalizeKey(raw);
      const map = {
        'ELARVOIE': 'Élargissement de voirie',
        'CREAVOIE': 'Création de voirie',
        'CARREF': 'Aménagement de carrefour',
        'EQUIPUBL': 'Équipements publics',
        'MAILPLANTE': 'Mail planté / espace vert',
        'ELARGVOIE': 'Élargissement de voirie'
      };
      const label = map[key] || raw || '';
      return `<div class="gp-tt-body">${safeEsc(`Objectif : ${label}`)}</div>`;
    }

    const title = fallbackTitle || '';
    return title
      ? `<div class="gp-tt-title">${safeEsc(title)}</div>`
      : `<div class="gp-tt-body">${safeEsc(fallbackLayerName || layerName || '')}</div>`;
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

  function addMetroAlias(name) {
    if (name && typeof name === 'string') {
      MetroLayers.add(name);
    }
  }

  function addVeloAlias(name) {
    if (name && typeof name === 'string') {
      VeloLayers.add(name);
    }
  }

  function addBusAlias(name) {
    if (name && typeof name === 'string') {
      BusLayers.add(name);
    }
  }

  function addTramAlias(name) {
    if (name && typeof name === 'string') {
      TramLayers.add(name);
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

  function listMetro() {
    return Array.from(MetroLayers);
  }

  function listVelo() {
    return Array.from(VeloLayers);
  }

  function listBus() {
    return Array.from(BusLayers);
  }

  function listTram() {
    return Array.from(TramLayers);
  }

  // Expose API
  win.LayerRegistry = win.LayerRegistry || {};
  win.LayerRegistry.isTravauxLayer = isTravauxLayer;
  win.LayerRegistry.addTravauxAlias = addTravauxAlias;
  win.LayerRegistry.listTravaux = listTravaux;

  win.LayerRegistry.isPluLayer = isPluLayer;
  win.LayerRegistry.addPluAlias = addPluAlias;
  win.LayerRegistry.listPlu = listPlu;

  win.LayerRegistry.isMetroLayer = isMetroLayer;
  win.LayerRegistry.addMetroAlias = addMetroAlias;
  win.LayerRegistry.listMetro = listMetro;

  win.LayerRegistry.isVeloLayer = isVeloLayer;
  win.LayerRegistry.addVeloAlias = addVeloAlias;
  win.LayerRegistry.listVelo = listVelo;

  win.LayerRegistry.isBusLayer = isBusLayer;
  win.LayerRegistry.addBusAlias = addBusAlias;
  win.LayerRegistry.listBus = listBus;

  win.LayerRegistry.isTramLayer = isTramLayer;
  win.LayerRegistry.addTramAlias = addTramAlias;
  win.LayerRegistry.listTram = listTram;

  win.LayerRegistry.supportsPathTooltip = supportsPathTooltip;
  win.LayerRegistry.disablePathTooltipForLayer = disablePathTooltipForLayer;

  win.LayerRegistry.isNoInteractLayer = isNoInteractLayer;
  win.LayerRegistry.addNoInteractAlias = addNoInteractAlias;

  win.LayerRegistry.formatTooltipTitle = formatTooltipTitle;
  win.LayerRegistry.getPathTooltipHtml = getPathTooltipHtml;

})(window);
