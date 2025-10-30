// modules/contrib/contrib-cities.js
// Gestion des villes et sélecteurs de collectivités

;(function(win) {
  'use strict';

  // ============================================================================
  // POPULATE CITIES
  // ============================================================================

  /**
   * Remplit le sélecteur de villes avec les villes autorisées
   * @param {HTMLSelectElement} cityEl - Élément select des villes
   */
  async function populateCities(cityEl) {
    try {
      if (!cityEl || !win.supabaseService) return;
      
      // Récupérer toutes les villes disponibles
      let cities = [];
      try {
        if (typeof win.supabaseService.getValidCities === 'function') {
          cities = await win.supabaseService.getValidCities();
        }
      } catch (e1) {
        console.warn('[contrib-cities] populateCities getValidCities error:', e1);
      }
      
      if ((!Array.isArray(cities) || !cities.length) && typeof win.supabaseService.listCities === 'function') {
        try { 
          cities = await win.supabaseService.listCities(); 
        } catch (e2) { 
          console.warn('[contrib-cities] populateCities listCities fallback error:', e2); 
        }
      }
      
      // Filtrer selon les permissions de l'utilisateur
      const userVilles = window.__CONTRIB_VILLES;
      let filteredCities = cities;
      const hasGlobalAccess = Array.isArray(userVilles) && userVilles.includes('global');
      
      if (hasGlobalAccess) {
        filteredCities = cities;
      } else if (Array.isArray(userVilles) && userVilles.length > 0) {
        filteredCities = cities.filter(c => userVilles.includes(c));
      } else {
        filteredCities = [];
      }
      
      // Vider le select et garder uniquement l'option par défaut
      cityEl.innerHTML = '<option value="">Aucun</option>';
      
      // Générer les options pour les villes filtrées
      const cityOptionsHTML = (Array.isArray(filteredCities) ? filteredCities : [])
        .map(c => `<option value="${c}">${c}</option>`)
        .join('');
      
      console.log('[DEBUG populateCities] Options HTML générées:', cityOptionsHTML ? 'OUI' : 'NON');
      
      if (cityOptionsHTML) {
        cityEl.insertAdjacentHTML('beforeend', cityOptionsHTML);
      } else {
        cityEl.innerHTML = '<option value="" selected>Aucune structure autorisée</option>';
      }
    } catch (err) {
      console.warn('[contrib-cities] populateCities error:', err);
      if (cityEl && !cityEl.options.length) {
        cityEl.innerHTML = '<option value="" selected>Aucun</option>';
      }
    }
  }

  // ============================================================================
  // LOAD CATEGORIES FOR CITY
  // ============================================================================

  /**
   * Charge les catégories dynamiquement selon la ville sélectionnée
   * @param {string} ville - Code de la ville
   * @param {HTMLSelectElement} categoryEl - Élément select des catégories
   * @param {HTMLElement} categoryHelpEl - Élément d'aide
   */
  async function loadCategoriesForCity(ville, categoryEl, categoryHelpEl) {
    try {
      if (!categoryEl) return;
      
      // Réinitialiser
      categoryEl.disabled = true;
      categoryEl.innerHTML = '<option value="">Chargement...</option>';
      if (categoryHelpEl) categoryHelpEl.style.display = 'none';
      
      if (!ville) {
        categoryEl.innerHTML = '<option value="">Sélectionnez d\'abord une structure</option>';
        return;
      }
      
      // Si "default", charger les catégories avec ville EMPTY ('')
      let categories;
      if (ville.toLowerCase() === 'default') {
        categories = await win.supabaseService.getCategoryIconsByCity('');
      } else {
        categories = await win.supabaseService.getCategoryIconsByCity(ville);
      }
      
      if (!categories || categories.length === 0) {
        categoryEl.innerHTML = '<option value="">Aucune catégorie disponible</option>';
        if (categoryHelpEl) categoryHelpEl.style.display = 'block';
        return;
      }
      
      // Peupler le select avec les catégories
      categoryEl.innerHTML = '<option value="">-- Choisir une catégorie --</option>' +
        categories.map(cat => `<option value="${cat.category}">${cat.category}</option>`).join('');
      categoryEl.disabled = false;
      
    } catch (err) {
      console.error('[contrib-cities] loadCategoriesForCity error:', err);
      categoryEl.innerHTML = '<option value="">Erreur de chargement</option>';
    }
  }

  // ============================================================================
  // CITY BRANDING
  // ============================================================================

  /**
   * Applique le branding de la ville sur la carte de dessin
   * @param {string} ville - Code de la ville
   */
  async function applyCityBrandingToDrawMap(ville) {
    try {
      if (!ville || !win.ContribMap) return;
      await win.ContribMap.applyCityBranding?.(ville);
    } catch (e) {
      console.warn('[contrib-cities] applyCityBrandingToDrawMap error:', e);
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribCities = {
    populateCities,
    loadCategoriesForCity,
    applyCityBrandingToDrawMap
  };

})(window);
