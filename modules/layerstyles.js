// modules/layerstyles.js
// Gestion des styles personnalisés et interactions pour les couches

;(function(win) {
  'use strict';

  /**
   * Applique des styles personnalisés selon le type de couche et les propriétés de la feature
   * @param {Object} feature - Feature GeoJSON
   * @param {string} layerName - Nom de la couche
   * @param {Object} baseStyle - Style de base depuis la configuration
   * @returns {Object} Style à appliquer
   */
  function applyCustomLayerStyle(feature, layerName, baseStyle) {
    const p = feature?.properties || null;
    if (!p) return baseStyle;

    // PLU / Emplacement Réservé
    if (win.LayerRegistry?.isPluLayer && win.LayerRegistry.isPluLayer(layerName)) {
      return {
        ...baseStyle,
        stroke: baseStyle.stroke !== false,
        weight: baseStyle.weight ?? 2,
        opacity: baseStyle.opacity ?? 0.9,
        fill: baseStyle.fill !== undefined ? baseStyle.fill : true,
        fillOpacity: baseStyle.fillOpacity ?? 0.3,
        dashArray: baseStyle.dashArray || null
      };
    }

    // Travaux-like layers (centralized via LayerRegistry) - Gradient de couleur selon avancement
    if (win.LayerRegistry?.isTravauxLayer && win.LayerRegistry.isTravauxLayer(layerName)) {
      const styledFeature = applyTravauxProgressColor(p, baseStyle);
      
      // Détecter le type de géométrie pour appliquer fill uniquement aux polygones
      const geomType = feature?.geometry?.type || '';
      const isPolygon = /Polygon$/i.test(geomType);
      
      return {
        ...styledFeature,
        fill: isPolygon,
        fillOpacity: isPolygon ? 0.3 : 0
      };
    }

    return baseStyle;
  }

  /* Plus aucune table de correspondance de couleurs par ligne : un tracé qui
     doit porter sa couleur l'embarque dans sa propriété `_color`, lue
     nativement par le rendu (expression pilotée par la donnée). C'est le
     contrat des couches de réseau de transport générées depuis OpenStreetMap. */

  /**
   * Applique une couleur de carte selon l'avancement des travaux.
   * Délègue le calcul à TravauxModule (safeDate + calcProgress) pour éviter la duplication.
   * progressScale : palette de couleurs discrètes pour les features cartographiques
   * (distinct de calcGradient qui produit des gradients CSS pour les barres UI).
   */
  const TRAVAUX_PROGRESS_SCALE = [
    'var(--danger)', 'var(--danger)', 'var(--danger-hover)', 'var(--danger-hover)', 'var(--warning)',
    'var(--warning)', 'var(--warning)', 'var(--success)', 'var(--success)', 'var(--success)'
  ];

  function applyTravauxProgressColor(properties, baseStyle) {
    try {
      const TM = window.TravauxModule;
      if (!TM) return baseStyle;

      const debut = TM.safeDate(properties.date_debut);
      const fin   = TM.safeDate(properties.date_fin);
      if (!debut || !fin || fin <= debut) return { ...baseStyle };

      const pct = TM.calcProgress(properties.date_debut, properties.date_fin);
      const idx = Math.round((pct / 100) * (TRAVAUX_PROGRESS_SCALE.length - 1));
      return { ...baseStyle, color: TRAVAUX_PROGRESS_SCALE[idx] };
    } catch (e) {
      console.debug('[layerstyles] travaux progress color fallback:', e);
      return baseStyle;
    }
  }

  win.LayerStyles = {
    applyCustomLayerStyle
  };

})(window);
