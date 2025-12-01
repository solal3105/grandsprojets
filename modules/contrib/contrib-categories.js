// modules/contrib/contrib-categories.js
// Gestion du panneau de catégories (création, édition, suppression, icon picker, style preview)

;(function(win) {
  'use strict';

  // ============================================================================
  // ICON PICKER (Utilise le nouveau système GPIconPicker unifié)
  // ============================================================================

  /**
   * Initialise le nouveau système d'icon picker unifié
   * @param {HTMLInputElement} categoryIconInput - Input de l'icône
   * @param {HTMLElement} categoryIconPreview - Preview de l'icône
   * @param {HTMLButtonElement} openButton - Bouton pour ouvrir le picker (optionnel)
   */
  function initIconPicker(categoryIconInput, categoryIconPreview, openButton) {
    try {
      if (!categoryIconInput) {
        console.error('[Icon Picker] ❌ Input element not found');
        return;
      }

      // Vérifier que GPIconPicker est chargé
      if (!win.GPIconPicker) {
        console.error('[Icon Picker] ❌ GPIconPicker not loaded');
        return;
      }

      // Callback pour mettre à jour la preview
      const updatePreview = () => {
        if (categoryIconPreview) {
          const iconClass = categoryIconInput.value.trim();
          const iconElement = categoryIconPreview.querySelector('i');
          if (iconElement) {
            iconElement.className = iconClass || 'fa-solid fa-question';
          }
        }
      };

      // Ouvrir le picker au clic sur le bouton "Choisir" uniquement
      if (openButton) {
        openButton.addEventListener('click', () => {
          win.GPIconPicker.open(categoryIconInput, updatePreview);
        });
      }

      // L'utilisateur peut saisir manuellement dans l'input sans ouvrir le picker
      // Le picker s'ouvre uniquement via le bouton "Choisir"

      // Update preview quand l'input change
      categoryIconInput.addEventListener('input', updatePreview);
      categoryIconInput.addEventListener('change', updatePreview);

      console.log('[Icon Picker] ✅ Initialized with GPIconPicker');
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
        await populateCategoryFormVilleSelector(categoryVilleSelect);
        
        // Initialiser l'icon picker avec le nouveau système
        const iconPickerBtn = document.getElementById('category-icon-picker-btn');
        initIconPicker(categoryIconInput, categoryIconPreview, iconPickerBtn);
        
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
    // Icon picker (nouveau système unifié)
    initIconPicker,
    
    // Ville selectors
    populateCategoryVilleSelector,
    populateCategoryFormVilleSelector,
    
    // Layers
    populateCategoryLayersCheckboxes,
    
    // Panel
    loadCategoriesPanel
  };

})(window);
