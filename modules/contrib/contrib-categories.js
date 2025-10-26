// modules/contrib/contrib-categories.js
// Gestion du panneau de catégories (création, édition, suppression, icon picker, style preview)

;(function(win) {
  'use strict';

  // ============================================================================
  // ICON PRESETS
  // ============================================================================

  const ICON_PRESETS = [
    // Mobilité & Transport (15)
    { icon: 'fa-solid fa-bus', label: 'Bus' },
    { icon: 'fa-solid fa-train', label: 'Train' },
    { icon: 'fa-solid fa-subway', label: 'Métro' },
    { icon: 'fa-solid fa-train-tram', label: 'Tram' },
    { icon: 'fa-solid fa-car', label: 'Voiture' },
    { icon: 'fa-solid fa-taxi', label: 'Taxi' },
    { icon: 'fa-solid fa-shuttle-van', label: 'Navette' },
    { icon: 'fa-solid fa-truck', label: 'Camion' },
    { icon: 'fa-solid fa-plane', label: 'Avion' },
    { icon: 'fa-solid fa-ship', label: 'Bateau' },
    { icon: 'fa-solid fa-ferry', label: 'Ferry' },
    { icon: 'fa-solid fa-helicopter', label: 'Hélicoptère' },
    { icon: 'fa-solid fa-road', label: 'Route' },
    { icon: 'fa-solid fa-traffic-light', label: 'Feu' },
    { icon: 'fa-solid fa-signs-post', label: 'Signalisation' },
    
    // Vélo & Mobilité douce (10)
    { icon: 'fa-solid fa-bicycle', label: 'Vélo' },
    { icon: 'fa-solid fa-person-biking', label: 'Cycliste' },
    { icon: 'fa-solid fa-person-walking', label: 'Piéton' },
    { icon: 'fa-solid fa-wheelchair', label: 'Accessibilité' },
    { icon: 'fa-solid fa-motorcycle', label: 'Moto' },
    { icon: 'fa-solid fa-charging-station', label: 'Borne' },
    { icon: 'fa-solid fa-square-parking', label: 'Parking' },
    { icon: 'fa-solid fa-p', label: 'P' },
    { icon: 'fa-solid fa-bolt', label: 'Électrique' },
    { icon: 'fa-solid fa-leaf', label: 'Écologie' },
    
    // Urbanisme & Construction (15)
    { icon: 'fa-solid fa-building', label: 'Bâtiment' },
    { icon: 'fa-solid fa-city', label: 'Ville' },
    { icon: 'fa-solid fa-house', label: 'Maison' },
    { icon: 'fa-solid fa-hotel', label: 'Hôtel' },
    { icon: 'fa-solid fa-shop', label: 'Commerce' },
    { icon: 'fa-solid fa-industry', label: 'Industrie' },
    { icon: 'fa-solid fa-warehouse', label: 'Entrepôt' },
    { icon: 'fa-solid fa-landmark', label: 'Monument' },
    { icon: 'fa-solid fa-hospital', label: 'Hôpital' },
    { icon: 'fa-solid fa-school', label: 'École' },
    { icon: 'fa-solid fa-graduation-cap', label: 'Université' },
    { icon: 'fa-solid fa-church', label: 'Église' },
    { icon: 'fa-solid fa-mosque', label: 'Mosquée' },
    { icon: 'fa-solid fa-synagogue', label: 'Synagogue' },
    { icon: 'fa-solid fa-gopuram', label: 'Temple' },
    
    // Infrastructure & Services (10)
    { icon: 'fa-solid fa-bridge', label: 'Pont' },
    { icon: 'fa-solid fa-tower-observation', label: 'Tour' },
    { icon: 'fa-solid fa-water', label: 'Eau' },
    { icon: 'fa-solid fa-fire', label: 'Pompiers' },
    { icon: 'fa-solid fa-shield-halved', label: 'Police' },
    { icon: 'fa-solid fa-recycle', label: 'Recyclage' },
    { icon: 'fa-solid fa-dumpster', label: 'Déchets' },
    { icon: 'fa-solid fa-lightbulb', label: 'Éclairage' },
    { icon: 'fa-solid fa-plug', label: 'Énergie' },
    { icon: 'fa-solid fa-wifi', label: 'Wifi' }
  ];

  // ============================================================================
  // ICON PICKER
  // ============================================================================

  /**
   * Remplit le grid d'icônes
   * @param {HTMLElement} categoryIconGrid - Grid d'icônes
   * @param {HTMLInputElement} categoryIconInput - Input de l'icône
   * @param {HTMLElement} categoryIconPicker - Picker d'icônes
   */
  function populateIconPicker(categoryIconGrid, categoryIconInput, categoryIconPicker) {
    try {
      if (!categoryIconGrid) {
        console.error('[Icon Picker] ❌ Grid element not found');
        return;
      }
      
      const html = ICON_PRESETS.map(preset => `
        <button type="button" class="icon-preset-btn" data-icon="${preset.icon}" title="${preset.label}" 
                style="width:50px; height:50px; display:flex; align-items:center; justify-content:center; border:1px solid var(--gray-300); border-radius:6px; background:var(--white); cursor:pointer; transition:all 0.2s; font-size:20px;">
          <i class="${preset.icon}" aria-hidden="true"></i>
        </button>
      `).join('');
      
      categoryIconGrid.innerHTML = html;
      
      // Bind click events
      const buttons = categoryIconGrid.querySelectorAll('.icon-preset-btn');
      buttons.forEach(btn => {
        btn.onclick = function() {
          const iconClass = btn.dataset.icon;
          if (categoryIconInput) {
            categoryIconInput.value = iconClass;
            categoryIconInput.dispatchEvent(new Event('input'));
          }
          // Hide picker after selection
          if (categoryIconPicker) {
            categoryIconPicker.style.display = 'none';
          }
        };
        
        // Hover effects
        btn.onmouseenter = function() {
          btn.style.borderColor = 'var(--info)';
          btn.style.background = 'var(--info-lighter)';
          btn.style.transform = 'scale(1.1)';
        };
        btn.onmouseleave = function() {
          btn.style.borderColor = 'var(--gray-300)';
          btn.style.background = 'var(--white)';
          btn.style.transform = 'scale(1)';
        };
      });
      
      console.log('[Icon Picker] ✅ Populated with', buttons.length, 'icons');
    } catch(e) {
      console.error('[Icon Picker] ❌ Error:', e);
    }
  }

  // ============================================================================
  // VILLE SELECTORS
  // ============================================================================

  /**
   * Remplit le sélecteur de ville du panneau catégories
   * @param {HTMLSelectElement} categoryVilleSelector - Select de ville
   * @param {Function} onRefreshCategories - Callback pour rafraîchir les catégories
   */
  async function populateCategoryVilleSelector(categoryVilleSelector, onRefreshCategories) {
    try {
      if (!categoryVilleSelector || !win.supabaseService) return;
      
      let cities = [];
      try {
        if (typeof win.supabaseService.getValidCities === 'function') {
          cities = await win.supabaseService.getValidCities();
        }
      } catch (e) {
        console.warn('[contrib-categories] populateCategoryVilleSelector error:', e);
      }
      
      // Filtrer selon les permissions
      const userVilles = window.__CONTRIB_VILLES;
      let filteredCities = [];
      const hasGlobalAccess = Array.isArray(userVilles) && userVilles.includes('global');
      
      if (hasGlobalAccess) {
        filteredCities = cities;
      } else if (Array.isArray(userVilles) && userVilles.length > 0) {
        filteredCities = cities.filter(c => userVilles.includes(c));
      }
      
      // Clear and repopulate
      categoryVilleSelector.innerHTML = '<option value="">-- Choisir une structure --</option>';
      const cityOptions = (Array.isArray(filteredCities) ? filteredCities : []).map(c => `<option value="${c}">${c}</option>`).join('');
      if (cityOptions) categoryVilleSelector.insertAdjacentHTML('beforeend', cityOptions);
      
      // Default to active city if available
      const activeCity = win.activeCity || '';
      if (activeCity && filteredCities.includes(activeCity)) {
        categoryVilleSelector.value = activeCity;
        if (onRefreshCategories) {
          onRefreshCategories().catch(e => console.warn('[contrib-categories] Auto-load categories error:', e));
        }
      }
    } catch(err) {
      console.warn('[contrib-categories] populateCategoryVilleSelector error:', err);
    }
  }

  /**
   * Remplit le sélecteur de ville du formulaire de catégorie
   * @param {HTMLSelectElement} categoryVilleSelect - Select de ville du formulaire
   */
  async function populateCategoryFormVilleSelector(categoryVilleSelect) {
    try {
      if (!categoryVilleSelect || !win.supabaseService) return;
      
      let cities = [];
      try {
        if (typeof win.supabaseService.getValidCities === 'function') {
          cities = await win.supabaseService.getValidCities();
        }
      } catch (e) {
        console.warn('[contrib-categories] populateCategoryFormVilleSelector error:', e);
      }
      
      // Filtrer selon les permissions
      const userVilles = window.__CONTRIB_VILLES;
      let filteredCities = [];
      const hasGlobalAccess = Array.isArray(userVilles) && userVilles.includes('global');
      
      if (hasGlobalAccess) {
        filteredCities = cities;
      } else if (Array.isArray(userVilles) && userVilles.length > 0) {
        filteredCities = cities.filter(c => userVilles.includes(c));
      }
      
      // Clear and repopulate
      categoryVilleSelect.innerHTML = '<option value="">Sélectionner une structure</option>';
      const cityOptions = (Array.isArray(filteredCities) ? filteredCities : []).map(c => `<option value="${c}">${c}</option>`).join('');
      if (cityOptions) categoryVilleSelect.insertAdjacentHTML('beforeend', cityOptions);
    } catch(err) {
      console.warn('[contrib-categories] populateCategoryFormVilleSelector error:', err);
    }
  }

  // ============================================================================
  // LAYERS CHECKBOXES
  // ============================================================================

  /**
   * Remplit les checkboxes de layers pour une ville
   * @param {string} ville - Code de la ville
   * @param {HTMLElement} categoryLayersCheckboxes - Conteneur des checkboxes
   */
  async function populateCategoryLayersCheckboxes(ville, categoryLayersCheckboxes) {
    try {
      if (!categoryLayersCheckboxes || !win.supabaseService) return;
      
      categoryLayersCheckboxes.innerHTML = '';
      
      // Convertir "default" en null
      // Ignorer 'default', utiliser metropole-lyon par défaut
      if (!ville || ville === 'default') {
        ville = 'metropole-lyon';
      }
      
      // Récupérer les layers de la ville uniquement (jamais ville NULL)
      let query = win.supabaseService.getClient()
        .from('layers')
        .select('name')
        .eq('ville', ville)
        .order('name');
      
      const { data, error } = await query;
      
      if (error) {
        console.warn('[contrib-categories] Erreur lors du chargement des layers:', error);
        categoryLayersCheckboxes.innerHTML = '<small style="color:var(--gray-400);">Aucun layer disponible</small>';
        return;
      }
      
      const layers = data || [];
      
      if (layers.length === 0) {
        categoryLayersCheckboxes.innerHTML = '<small style="color:var(--gray-400);">Aucun layer disponible pour cette ville</small>';
        return;
      }
      
      // Créer les checkboxes compactes (style chips)
      layers.forEach(layer => {
        const chip = document.createElement('label');
        chip.style.cssText = 'display:inline-flex; align-items:center; gap:6px; cursor:pointer; padding:6px 12px; border-radius:16px; border:1px solid var(--border, var(--gray-200)); background:var(--surface, var(--white)); transition:all 0.15s; font-size:13px; font-weight:500; user-select:none;';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'category-layer-checkbox';
        checkbox.value = layer.name;
        checkbox.style.cssText = 'width:16px; height:16px; cursor:pointer; accent-color:var(--primary); margin:0;';
        
        const label = document.createElement('span');
        label.textContent = layer.name;
        label.style.cssText = 'color:var(--text-strong, var(--gray-700));';
        
        chip.appendChild(checkbox);
        chip.appendChild(label);
        
        // Interactions
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            chip.style.background = 'var(--primary)';
            chip.style.borderColor = 'var(--primary)';
            label.style.color = 'var(--white)';
          } else {
            chip.style.background = 'var(--surface, var(--white))';
            chip.style.borderColor = 'var(--border, var(--gray-200))';
            label.style.color = 'var(--text-strong, var(--gray-700))';
          }
        });
        
        chip.addEventListener('mouseenter', () => {
          if (!checkbox.checked) {
            chip.style.borderColor = 'var(--primary)';
          }
        });
        
        chip.addEventListener('mouseleave', () => {
          if (!checkbox.checked) {
            chip.style.borderColor = 'var(--border, var(--gray-200))';
          }
        });
        
        categoryLayersCheckboxes.appendChild(chip);
      });
      
    } catch (err) {
      console.error('[contrib-categories] populateCategoryLayersCheckboxes error:', err);
      categoryLayersCheckboxes.innerHTML = '<small style="color:var(--danger);">Erreur de chargement</small>';
    }
  }

  // ============================================================================
  // LOAD CATEGORIES PANEL
  // ============================================================================

  /**
   * Charge le panneau des catégories
   * @param {Object} elements - Éléments DOM nécessaires
   * @param {Function} onRefreshCategories - Callback pour rafraîchir
   */
  async function loadCategoriesPanel(elements, onRefreshCategories) {
    const {
      categoryFormContainer,
      categoryIconPicker,
      categoryVilleSelectorContainer,
      categoryVilleSelector,
      categoriesContent,
      categoryIconGrid,
      categoryIconInput,
      categoryVilleSelect,
      categoryLayersCheckboxes,
      selectedCity  // Ville pré-sélectionnée depuis le landing
    } = elements || {};
    
    try {
      // Réinitialiser l'état du panneau
      if (categoryFormContainer) categoryFormContainer.style.display = 'none';
      if (categoryIconPicker) categoryIconPicker.style.display = 'none';
      
      // Cacher l'ancien sélecteur de ville (legacy)
      if (categoryVilleSelectorContainer) {
        categoryVilleSelectorContainer.style.display = 'none';
      }
      
      // Afficher le contenu directement si ville sélectionnée
      if (selectedCity && categoriesContent) {
        categoriesContent.style.display = '';
        
        // Charger les données nécessaires
        await Promise.all([
          populateCategoryFormVilleSelector(categoryVilleSelect),
          Promise.resolve(populateIconPicker(categoryIconGrid, categoryIconInput, categoryIconPicker))
        ]);
        
        // Pré-sélectionner la ville dans le formulaire
        if (categoryVilleSelect) {
          categoryVilleSelect.value = selectedCity;
        }
        
        // Charger les catégories pour cette ville
        if (onRefreshCategories) {
          await onRefreshCategories();
        }
      } else {
        // Pas de ville sélectionnée - ne rien afficher
        if (categoriesContent) categoriesContent.style.display = 'none';
        console.warn('[contrib-categories] No city selected');
      }
    } catch(e) {
      console.error('[contrib-categories] loadCategoriesPanel error:', e);
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribCategories = {
    // Icon picker
    populateIconPicker,
    getIconPresets: () => ICON_PRESETS,
    
    // Ville selectors
    populateCategoryVilleSelector,
    populateCategoryFormVilleSelector,
    
    // Layers
    populateCategoryLayersCheckboxes,
    
    // Panel
    loadCategoriesPanel
  };

})(window);
