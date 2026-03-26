// modules/contrib/contrib-cities.js
// Gestion des villes et sélecteurs de collectivités

;(function(win) {
  'use strict';

  // ============================================================================
  // POPULATE CITIES
  // ============================================================================

  /**
   * Remplit le sélecteur de villes avec les villes autorisées.
   * Délègue à ContribUtils.populateCitySelect.
   * @param {HTMLSelectElement} cityEl - Élément select des villes
   */
  async function populateCities(cityEl) {
    return win.ContribUtils?.populateCitySelect(cityEl, { placeholder: 'Aucun' });
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
