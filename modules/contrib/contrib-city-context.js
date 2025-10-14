// modules/contrib/contrib-city-context.js
// Gestion centralisée du contexte de ville pour les contributions

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let selectedCity = null;
  let landingCityListenerAdded = false;

  // ============================================================================
  // GETTERS / SETTERS
  // ============================================================================

  /**
   * Définit la ville sélectionnée
   * @param {string} city - Code ville
   */
  function setSelectedCity(city) {
    if (!city) {
      console.warn('[CityContext] Attempting to set empty city');
      return;
    }
    
    selectedCity = city;
    console.log('[CityContext] ✅ City set to:', city);
    
    // Synchroniser avec sessionStorage et contexte global
    try {
      sessionStorage.setItem('activeCity', city);
      if (win.setActiveCity && typeof win.setActiveCity === 'function') {
        win.setActiveCity(city);
      }
    } catch(e) {
      console.warn('[CityContext] Could not persist active city:', e);
    }
  }

  /**
   * Récupère la ville sélectionnée
   * @returns {string|null}
   */
  function getSelectedCity() {
    return selectedCity;
  }

  /**
   * Vérifie si une ville est sélectionnée
   * @returns {boolean}
   */
  function hasSelectedCity() {
    return !!selectedCity;
  }

  /**
   * Réinitialise la ville sélectionnée
   */
  function clearSelectedCity() {
    selectedCity = null;
    try {
      sessionStorage.removeItem('activeCity');
    } catch(e) {}
  }

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  /**
   * Affiche le badge de ville dans un panel
   * @param {string} badgeId - ID de l'élément badge
   * @param {string} cityDisplayName - Nom à afficher
   */
  function showCityBadge(badgeId, cityDisplayName) {
    const badge = document.getElementById(badgeId);
    if (badge) {
      badge.textContent = cityDisplayName || selectedCity;
    }
  }

  /**
   * Affiche ou cache les actions du landing selon la ville
   */
  function toggleLandingActions(show) {
    const title = document.getElementById('landing-actions-title');
    const cards = document.getElementById('landing-cards');
    
    if (title) title.hidden = !show;
    if (cards) cards.hidden = !show;
  }

  /**
   * Initialise le sélecteur de ville du landing
   * @param {Function} onCityChange - Callback optionnel quand la ville change
   */
  async function initLandingCitySelector(onCityChange) {
    const landingCitySelect = document.getElementById('landing-city-select');
    if (!landingCitySelect) return;
    
    try {
      // Peupler les villes
      const ContribCities = win.ContribCities || {};
      await ContribCities.populateCities?.(landingCitySelect);
      
      // Afficher le bouton "Ajouter une ville" si admin global
      const addCityBtn = document.getElementById('landing-add-city-btn');
      if (addCityBtn) {
        const userVilles = win.__CONTRIB_VILLES || [];
        const isGlobalAdmin = Array.isArray(userVilles) && userVilles.includes('global');
        
        if (isGlobalAdmin) {
          addCityBtn.style.display = 'flex';
          
          // Lier le bouton à la modale de création
          if (!addCityBtn._bound) {
            addCityBtn.addEventListener('click', () => {
              if (win.ContribCitiesManagement?.showAddCityModal) {
                // Préparer les éléments nécessaires
                const citiesListEl = null; // Pas de liste à recharger depuis la landing
                const citiesStatusEl = null;
                win.ContribCitiesManagement.showAddCityModal({ citiesListEl, citiesStatusEl });
              } else {
                console.error('[CityContext] ContribCitiesManagement.showAddCityModal not available');
              }
            });
            addCityBtn._bound = true;
          }
        }
      }
      
      // Pré-sélectionner si déjà choisie
      if (selectedCity) {
        landingCitySelect.value = selectedCity;
        toggleLandingActions(true);
      }
      
      // Listener unique
      if (!landingCityListenerAdded) {
        landingCitySelect.addEventListener('change', () => {
          const city = landingCitySelect.value?.trim();
          
          if (city) {
            setSelectedCity(city);
            toggleLandingActions(true);
            
            // Callback optionnel
            if (onCityChange && typeof onCityChange === 'function') {
              onCityChange(city);
            }
          } else {
            clearSelectedCity();
            toggleLandingActions(false);
          }
        });
        
        landingCityListenerAdded = true;
      }
    } catch(e) {
      console.error('[CityContext] Error initializing landing city selector:', e);
    }
  }

  /**
   * Valide qu'une ville est sélectionnée avant de continuer
   * @param {Function} showToast - Fonction pour afficher un toast
   * @returns {boolean} - True si ville sélectionnée
   */
  function requireCity(showToast) {
    if (!hasSelectedCity()) {
      if (showToast) {
        showToast('Veuillez d\'abord sélectionner une structure', 'error');
      }
      
      const landingCitySelect = document.getElementById('landing-city-select');
      if (landingCitySelect) landingCitySelect.focus();
      
      return false;
    }
    
    return true;
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribCityContext = {
    // Getters / Setters
    setSelectedCity,
    getSelectedCity,
    hasSelectedCity,
    clearSelectedCity,
    
    // UI Helpers
    showCityBadge,
    toggleLandingActions,
    initLandingCitySelector,
    requireCity
  };

})(window);
