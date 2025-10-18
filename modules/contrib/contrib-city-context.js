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
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialise automatiquement la ville au chargement du module
   * Tente de restaurer depuis sessionStorage ou présélectionne si ville unique
   */
  function autoInitializeCity() {
    try {
      // 1. Restaurer depuis sessionStorage (contrib uniquement)
      const stored = sessionStorage.getItem('contrib_selectedCity');
      if (stored && stored !== '__global__') {
        selectedCity = stored;
        console.log('[CityContext] 🔄 Restored contrib city from session:', stored);
        // NE PAS modifier window.activeCity (utilisé par la navigation)
        return;
      }
      
      // 2. Si admin a UNE seule ville, la présélectionner automatiquement
      const userVilles = win.__CONTRIB_VILLES || [];
      const validCities = userVilles.filter(v => v !== 'global');
      if (validCities.length === 1) {
        selectedCity = validCities[0];
        sessionStorage.setItem('contrib_selectedCity', selectedCity);
        console.log('[CityContext] ✨ Auto-selected single contrib city:', selectedCity);
        // NE PAS modifier window.activeCity
      }
    } catch(e) {
      console.warn('[CityContext] Auto-init failed:', e);
    }
  }

  // Ne PAS initialiser automatiquement ici car __CONTRIB_VILLES n'est pas encore défini
  // L'initialisation doit être appelée explicitement depuis contrib.js APRÈS fetchAndApplyRole

  // ============================================================================
  // GETTERS / SETTERS
  // ============================================================================

  /**
   * Définit la ville sélectionnée (pour les contributions uniquement)
   * @param {string} city - Code ville
   */
  function setSelectedCity(city) {
    // Note: city peut être null (= "Global")
    selectedCity = city;
    // NE PAS modifier window.activeCity (utilisé par la navigation)
    
    console.log('[CityContext] ✅ Contrib city set to:', city === null ? 'Global' : city);
    
    // Synchroniser avec sessionStorage (contrib uniquement)
    try {
      if (city === null) {
        sessionStorage.setItem('contrib_selectedCity', '__global__');
      } else {
        sessionStorage.setItem('contrib_selectedCity', city);
      }
    } catch(e) {
      console.warn('[CityContext] Could not persist to sessionStorage:', e);
    }
  }

  /**
   * Vérifie si une ville est sélectionnée
   * @returns {boolean}
   */
  function hasSelectedCity() {
    return !!selectedCity;
  }

  /**
   * Réinitialise la ville sélectionnée (contrib uniquement)
   */
  function clearSelectedCity() {
    selectedCity = null;
    try {
      sessionStorage.removeItem('contrib_selectedCity');
    } catch(e) {}
  }

  /**
   * S'assure qu'une ville est sélectionnée, sinon affiche un toast
   * @param {Function} showToast - Fonction pour afficher un message d'erreur
   * @returns {string|null} - Ville sélectionnée ou null si non définie
   */
  function ensureCity(showToast) {
    if (!selectedCity) {
      if (showToast && typeof showToast === 'function') {
        showToast('Veuillez sélectionner une structure dans le menu de gauche.', 'warning');
      }
      console.warn('[CityContext] ⚠️ No city selected');
      return null;
    }
    
    return selectedCity;
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
    // Init
    autoInitializeCity,
    
    // Getters / Setters
    setSelectedCity,
    hasSelectedCity,
    clearSelectedCity,
    ensureCity,
    
    // UI Helpers
    showCityBadge,
    toggleLandingActions,
    initLandingCitySelector,
    requireCity
  };

})(window);
