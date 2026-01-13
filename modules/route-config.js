// modules/route-config.js
// Configuration des redirections de routes vers les villes

;(function(win) {
  'use strict';

  /**
   * Configuration des redirections
   * 
   * Format:
   * - path: Le chemin URL (sans le / initial)
   * - city: Le code de la ville cible
   * - type: 'auto' (détection automatique) ou 'custom' (redirection personnalisée)
   */
  const ROUTE_CONFIG = {
    // Redirections custom (prioritaires)
    custom: [
      { path: 'bilan', city: 'rassemblees' },
      { path: 'projet', city: 'engages-projet' },
      { path: 'default', city: 'metropole-lyon' }
      // Ajoutez ici d'autres redirections custom
      // { path: 'mon-chemin', city: 'ma-ville' }
    ],

    // Routes à exclure de la redirection automatique
    excluded: [
      'fiche',
      'login',
      'logout',
      'landing-page',
      'assistant-ia',
      'modules',
      'styles',
      'img',
      'vendor',
      'netlify',
      'supabase'
    ]
  };

  /**
   * Récupère la configuration de redirection pour un chemin donné
   * @param {string} pathname - Le pathname de l'URL
   * @returns {Object|null} { city: string, type: 'auto'|'custom' } ou null
   */
  function getRedirectConfig(pathname) {
    try {
      // Nettoyer le pathname
      const cleanPath = String(pathname || '/')
        .toLowerCase()
        .split('?')[0]
        .split('#')[0]
        .replace(/^\/+|\/+$/g, ''); // Retirer les / au début et à la fin

      // Si c'est la racine, pas de redirection
      if (!cleanPath) {
        return null;
      }

      // Extraire le premier segment
      const firstSegment = cleanPath.split('/')[0];

      // 1. Vérifier les redirections custom (prioritaires)
      const customRedirect = ROUTE_CONFIG.custom.find(r => r.path === firstSegment);
      if (customRedirect) {
        return {
          city: customRedirect.city,
          type: 'custom'
        };
      }

      // 2. Vérifier si c'est une route exclue
      if (ROUTE_CONFIG.excluded.includes(firstSegment)) {
        return null;
      }

      // 3. Sinon, considérer comme une ville (redirection auto)
      return {
        city: firstSegment,
        type: 'auto'
      };

    } catch (error) {
      console.error('[route-config] Error in getRedirectConfig:', error);
      return null;
    }
  }

  /**
   * Vérifie si une ville existe dans la configuration
   * @param {string} cityCode - Code de la ville
   * @returns {boolean}
   */
  function cityExists(cityCode) {
    try {
      // Vérifier dans window.cityBranding si disponible
      if (win.cityBranding && Array.isArray(win.cityBranding)) {
        return win.cityBranding.some(c => c.code === cityCode);
      }
      return false;
    } catch (error) {
      console.error('[route-config] Error checking city existence:', error);
      return false;
    }
  }

  /**
   * Applique la redirection si nécessaire
   * Doit être appelé après le chargement de cityBranding
   */
  function applyRedirect() {
    try {
      const redirectConfig = getRedirectConfig(location.pathname);

      // Pas de redirection nécessaire
      if (!redirectConfig) {
        return;
      }

      const { city, type } = redirectConfig;

      // Pour les redirections auto, vérifier que la ville existe
      if (type === 'auto' && !cityExists(city)) {
        console.warn(`[route-config] City "${city}" not found, redirecting to root`);
        // Rediriger vers la racine si la ville n'existe pas
        if (location.pathname !== '/') {
          location.href = '/';
        }
        return;
      }

      // Pour les redirections custom, toujours appliquer
      // (on suppose que la ville existe)
      if (type === 'custom' && !cityExists(city)) {
        console.warn(`[route-config] Custom redirect to "${city}" but city not found`);
      }

      // Construire l'URL de redirection
      const params = new URLSearchParams(location.search);
      params.set('city', city);
      const targetUrl = '/?' + params.toString();

      // Appliquer la redirection
      console.log(`[route-config] Redirecting ${location.pathname} -> ${targetUrl} (${type})`);
      location.href = targetUrl;

    } catch (error) {
      console.error('[route-config] Error applying redirect:', error);
    }
  }

  /**
   * Ajoute une redirection custom dynamiquement
   * @param {string} path - Le chemin (sans /)
   * @param {string} city - Le code de la ville
   */
  function addCustomRedirect(path, city) {
    try {
      // Vérifier si la redirection existe déjà
      const exists = ROUTE_CONFIG.custom.some(r => r.path === path);
      if (exists) {
        console.warn(`[route-config] Custom redirect for "${path}" already exists`);
        return false;
      }

      ROUTE_CONFIG.custom.push({ path, city });
      console.log(`[route-config] Added custom redirect: ${path} -> ${city}`);
      return true;
    } catch (error) {
      console.error('[route-config] Error adding custom redirect:', error);
      return false;
    }
  }

  /**
   * Ajoute une route à exclure dynamiquement
   * @param {string} path - Le chemin à exclure
   */
  function addExcludedRoute(path) {
    try {
      if (ROUTE_CONFIG.excluded.includes(path)) {
        console.warn(`[route-config] Route "${path}" already excluded`);
        return false;
      }

      ROUTE_CONFIG.excluded.push(path);
      console.log(`[route-config] Added excluded route: ${path}`);
      return true;
    } catch (error) {
      console.error('[route-config] Error adding excluded route:', error);
      return false;
    }
  }

  // Export
  win.RouteConfig = {
    getRedirectConfig,
    cityExists,
    applyRedirect,
    addCustomRedirect,
    addExcludedRoute,
    // Exposer la config pour debug
    _config: ROUTE_CONFIG
  };

})(window);
