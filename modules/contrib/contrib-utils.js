// modules/contrib/contrib-utils.js
// Fonctions utilitaires pour le système de contribution

;(function(win) {
  'use strict';

  // ============================================================================
  // STRING UTILITIES
  // ============================================================================

  /**
   * Convertit une chaîne en slug (URL-friendly)
   * @param {string} str - Chaîne à convertir
   * @returns {string} Slug généré
   */
  function slugify(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'geom';
  }

  /**
   * Échappe les caractères HTML
   * @param {string} str - Chaîne à échapper
   * @returns {string} Chaîne échappée
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================================
  // URL & PATH UTILITIES
  // ============================================================================

  /**
   * Extrait le chemin relatif de stockage depuis une URL publique Supabase
   * @param {string} url - URL publique Supabase
   * @returns {string|null} Chemin relatif ou null
   */
  function toStorageRelPathFromPublicUrl(url) {
    try {
      if (!url) return null;
      const marker = '/object/public/';
      const i = url.indexOf(marker);
      if (i === -1) {
        // fallback to basename
        try { 
          return new URL(url, win.location.href).pathname.split('/').slice(-1)[0] || url; 
        } catch (_) { 
          return String(url); 
        }
      }
      const after = url.slice(i + marker.length); // e.g., 'uploads/geojson/...'
      const prefix = 'uploads/';
      return after.startsWith(prefix) ? after.slice(prefix.length) : after;
    } catch (_) {
      return null;
    }
  }

  // ============================================================================
  // FILE UTILITIES
  // ============================================================================

  /**
   * Formate une taille de fichier en octets en format lisible
   * @param {number} bytes - Taille en octets
   * @returns {string} Taille formatée (ex: "1.5 MB")
   */
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // ============================================================================
  // TOAST NOTIFICATIONS
  // ============================================================================

  /**
   * Affiche une notification toast accessible
   * Délègue au système unifié Toast (modules/toast.js)
   * @param {string} message - Message à afficher
   * @param {string} kind - Type de toast ('info', 'success', 'error')
   */
  function showToast(message, kind = 'info') {
    if (win.Toast) {
      win.Toast.show(message, kind);
    } else {
      console.warn('[showToast] Toast module not loaded');
    }
  }


  // ============================================================================
  // VALIDATION UTILITIES
  // ============================================================================

  /**
   * Valide une URL
   * @param {string} str - URL à valider
   * @returns {boolean} True si l'URL est valide
   */
  function isValidUrl(str) {
    try {
      new URL(str);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Valide un fichier GeoJSON
   * @param {Object} geojson - Objet GeoJSON à valider
   * @returns {boolean} True si le GeoJSON est valide
   */
  function isValidGeoJSON(geojson) {
    if (!geojson || typeof geojson !== 'object') return false;
    if (!geojson.type) return false;
    
    const validTypes = ['Feature', 'FeatureCollection', 'Point', 'LineString', 'Polygon', 
                        'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
    
    return validTypes.includes(geojson.type);
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribUtils = {
    // String utilities
    slugify,
    escapeHtml,
    
    // URL & Path utilities
    toStorageRelPathFromPublicUrl,
    
    // File utilities
    formatFileSize,
    
    // Toast notifications
    showToast,
    
    // Validation
    isValidUrl,
    isValidGeoJSON
  };

})(window);
