// modules/layerstyles.js
// Gestion des styles personnalisés et logique métier pour les couches

;(function(win) {
  'use strict';

  /**
   * Applique des styles personnalisés selon le type de couche et les propriétés de la feature
   * @param {Object} feature - Feature GeoJSON
   * @param {string} layerName - Nom de la couche
   * @param {Object} baseStyle - Style de base depuis la configuration
   * @returns {Object} Style Leaflet à appliquer
   */
  function applyCustomLayerStyle(feature, layerName, baseStyle) {
    const p = feature?.properties || null;
    
    // Si pas de propriétés, retourner le style de base
    if (!p) {
      return baseStyle;
    }

    // ========================================================================
    // PLU / Emplacement Réservé (polygones)
    // ========================================================================
    if (layerName === 'emplacementReserve' || /plu|emplacement|reserve/i.test(layerName)) {
      return {
        ...baseStyle,
        // S'assurer que le contour reste visible
        stroke: baseStyle.stroke !== false,
        weight: (baseStyle.weight ?? 2),
        opacity: (baseStyle.opacity ?? 0.9),
        // Remplissage lisible
        fill: (baseStyle.fill !== undefined ? baseStyle.fill : true),
        fillOpacity: (baseStyle.fillOpacity ?? 0.3),
        dashArray: baseStyle.dashArray || null
      };
    }

    // ========================================================================
    // Métro et Funiculaire - Couleurs par ligne
    // ========================================================================
    if (layerName === 'metroFuniculaire') {
      const metroColors = win.dataConfig?.metroColors || {};
      const rawLine = p.ligne || p.LIGNE || p.Line;
      let lineColor = null;
      
      if (rawLine != null) {
        const upper = String(rawLine).toUpperCase();
        // Clé compacte (retire préfixes et espaces): LIGNE/METRO/M/L. + espaces
        const compact = upper.replace(/^LIGNE\s+|^METRO\s+|^M\s*|^L\.?\s*/,'').replace(/\s+/g,'');
        
        if (metroColors[compact]) {
          lineColor = metroColors[compact];
        } else {
          // Token simple (F1/F2/A/B/C/D)
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

    // ========================================================================
    // Vélo / Voies Lyonnaises - DashArray selon statut de réalisation
    // ========================================================================
    if (layerName === 'velo') {
      const isDone = p.status === 'done';
      return {
        ...baseStyle,
        fill: false,
        dashArray: isDone ? null : (baseStyle.dashArray || '5,5')
      };
    }

    // ========================================================================
    // Travaux - Gradient de couleur selon l'avancement
    // ========================================================================
    if (layerName === 'travaux') {
      try {
        const safeDate = (v) => {
          const d = v ? new Date(v) : null;
          return d && !isNaN(d.getTime()) ? d : null;
        };
        
        const dateDebut = safeDate(p.date_debut);
        const dateFin = safeDate(p.date_fin);
        const now = new Date();
        
        // Palette 0% → 100% (10 paliers) — inversée (0% rouge, 100% vert)
        const progressScale = [
          '#E1002A', // 0% rouge
          '#E71922',
          '#ED3319',
          '#F34C11',
          '#F96608', // ~50% orange vif
          '#D08812',
          '#A19225',
          '#729B37',
          '#43A54A',
          '#14AE5C'  // 100% vert
        ];
        
        let color = baseStyle.color; // Utiliser la couleur de la DB par défaut
        
        // Calculer la couleur selon l'avancement
        if (dateDebut && dateFin && dateFin.getTime() > dateDebut.getTime()) {
          const total = dateFin.getTime() - dateDebut.getTime();
          const elapsed = now.getTime() - dateDebut.getTime();
          const pct = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
          const idx = Math.round((pct / 100) * (progressScale.length - 1)); // 0..9
          color = progressScale[idx];
        }
        
        return {
          ...baseStyle,
          color
        };
      } catch (_) {
        return baseStyle;
      }
    }

    // ========================================================================
    // Pas de style personnalisé - retourner le style de base
    // ========================================================================
    return baseStyle;
  }

  // Exposer les fonctions publiques
  win.LayerStyles = {
    applyCustomLayerStyle
  };

})(window);
