// modules/layerstyles.js
// Gestion des styles personnalisés et interactions pour les couches

;(function(win) {
  'use strict';

  // ============================================================================
  // SECTION 1 : STYLES PERSONNALISÉS PAR COUCHE
  // ============================================================================

  /**
   * Applique des styles personnalisés selon le type de couche et les propriétés de la feature
   * @param {Object} feature - Feature GeoJSON
   * @param {string} layerName - Nom de la couche
   * @param {Object} baseStyle - Style de base depuis la configuration
   * @returns {Object} Style Leaflet à appliquer
   */
  function applyCustomLayerStyle(feature, layerName, baseStyle) {
    const p = feature?.properties || null;
    if (!p) return baseStyle;

    // PLU / Emplacement Réservé
    if (layerName === 'emplacementReserve' || /plu|emplacement|reserve/i.test(layerName)) {
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

    // Métro et Funiculaire - Couleurs par ligne
    if (layerName === 'metroFuniculaire') {
      return applyMetroLineColor(p, baseStyle);
    }

    // Vélo / Voies Lyonnaises - DashArray selon statut
    if (layerName === 'velo') {
      return {
        ...baseStyle,
        fill: false,
        dashArray: p.status === 'done' ? null : (baseStyle.dashArray || '5,5')
      };
    }

    // Travaux - Gradient de couleur selon avancement
    if (layerName === 'travaux') {
      return applyTravauxProgressColor(p, baseStyle);
    }

    return baseStyle;
  }

  /**
   * Applique la couleur spécifique à chaque ligne de métro/funiculaire
   */
  function applyMetroLineColor(properties, baseStyle) {
    const metroColors = win.dataConfig?.metroColors || {};
    const rawLine = properties.ligne || properties.LIGNE || properties.Line;
    let lineColor = null;
    
    if (rawLine != null) {
      const upper = String(rawLine).toUpperCase();
      const compact = upper.replace(/^LIGNE\s+|^METRO\s+|^M\s*|^L\.?\s*/,'').replace(/\s+/g,'');
      
      if (metroColors[compact]) {
        lineColor = metroColors[compact];
      } else {
        const token = upper.match(/F\d|[A-Z]/);
        if (token && metroColors[token[0]]) {
          lineColor = metroColors[token[0]];
        }
      }
    }
    
    return {
      ...baseStyle,
      color: lineColor || baseStyle.color,
      weight: baseStyle.weight || 3
    };
  }

  /**
   * Applique un gradient de couleur selon l'avancement des travaux
   */
  function applyTravauxProgressColor(properties, baseStyle) {
    try {
      const safeDate = (v) => {
        const d = v ? new Date(v) : null;
        return d && !isNaN(d.getTime()) ? d : null;
      };
      
      const dateDebut = safeDate(properties.date_debut);
      const dateFin = safeDate(properties.date_fin);
      const now = new Date();
      
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      const progressScale = [
        'var(--danger)', 'var(--danger-hover)', '#ED3319', '#F34C11', 'var(--warning)',
        '#D08812', '#A19225', '#729B37', '#43A54A', primaryColor
      ];
      
      let color = baseStyle.color;
      
      if (dateDebut && dateFin && dateFin.getTime() > dateDebut.getTime()) {
        const total = dateFin.getTime() - dateDebut.getTime();
        const elapsed = now.getTime() - dateDebut.getTime();
        const pct = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
        const idx = Math.round((pct / 100) * (progressScale.length - 1));
        color = progressScale[idx];
      }
      
      return { ...baseStyle, color };
    } catch (_) {
      return baseStyle;
    }
  }

  // ============================================================================
  // SECTION 2 : CAMERA MARKERS (déplacé vers cameramarkers.js)
  // ============================================================================
  // La gestion des camera markers est maintenant dans modules/cameramarkers.js

  // ============================================================================
  // EXPORTS
  // ============================================================================

  // Exposer les fonctions publiques
  win.LayerStyles = {
    applyCustomLayerStyle
  };

})(window);
