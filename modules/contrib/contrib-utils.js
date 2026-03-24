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

  const escapeHtml = window.SecurityUtils.escapeHtml;

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

  /**
   * Normalise un GeoJSON en FeatureCollection
   * Gère: Feature, FeatureCollection, géométries brutes, MultiPoint
   * @param {Object} geojson - GeoJSON d'entrée
   * @returns {Object} FeatureCollection normalisée
   */
  function normalizeToFeatureCollection(geojson) {
    if (!geojson) return { type: 'FeatureCollection', features: [] };
    
    // Déjà une FeatureCollection
    if (geojson.type === 'FeatureCollection') {
      const features = (geojson.features || []).map(f => ({
        type: 'Feature',
        properties: f.properties || {},
        geometry: f.geometry
      }));
      return { type: 'FeatureCollection', features };
    }
    
    // Une Feature simple
    if (geojson.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: geojson.properties || {},
          geometry: geojson.geometry
        }]
      };
    }
    
    // Géométrie brute (Point, LineString, Polygon, Multi*, GeometryCollection)
    const geomTypes = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
    if (geomTypes.includes(geojson.type)) {
      // Cas spécial: MultiPoint -> convertir en plusieurs Features Point
      if (geojson.type === 'MultiPoint' && Array.isArray(geojson.coordinates)) {
        const features = geojson.coordinates.map(coords => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: coords }
        }));
        return { type: 'FeatureCollection', features };
      }
      
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: geojson
        }]
      };
    }
    
    return { type: 'FeatureCollection', features: [] };
  }

  // ============================================================================
  // PERMISSIONS UTILITIES
  // ============================================================================

  /**
   * Filtre les villes selon les permissions de l'utilisateur
   * @param {Array<string>} cities - Liste des villes disponibles
   * @returns {Array<string>} Villes filtrées selon les permissions
   */
  function filterCitiesByPermissions(cities) {
    const userVilles = win.__CONTRIB_VILLES;
    const hasGlobalAccess = Array.isArray(userVilles) && userVilles.includes('global');
    
    if (hasGlobalAccess) {
      return cities;
    }
    
    if (Array.isArray(userVilles) && userVilles.length > 0) {
      return cities.filter(c => userVilles.includes(c));
    }
    
    return [];
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
    isValidGeoJSON,
    
    // GeoJSON processing
    normalizeToFeatureCollection,
    
    // Permissions
    filterCitiesByPermissions
  };

})(window);
