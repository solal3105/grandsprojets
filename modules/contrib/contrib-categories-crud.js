// modules/contrib/contrib-categories-crud.js
// CRUD operations pour la gestion des catégories (create, read, update, delete)

;(function(win) {
  'use strict';

  // ============================================================================
  // REFRESH CATEGORIES LIST
  // ============================================================================

  /**
   * Rafraîchit la liste des catégories pour une ville
   * @param {Object} elements - Éléments DOM nécessaires
   * @param {Function} showCategoryForm - Callback pour afficher le formulaire
   * @param {Function} deleteCategory - Callback pour supprimer une catégorie
   */
  async function refreshCategoriesList(elements, showCategoryForm, deleteCategory) {
    const { categoriesList, categoriesContent, categoryVilleSelector, selectedCity } = elements;
    
    try {
      if (!categoriesList || !win.supabaseService) return;
      
      // Utiliser selectedCity en priorité, sinon fallback sur le sélecteur (legacy)
      let ville = selectedCity || categoryVilleSelector?.value || '';
      
      // Vérifier si une ville est sélectionnée (accepter "default" comme valide)
      const hasValidCity = ville && (ville.toLowerCase() === 'default' || ville.trim() !== '');
      if (!hasValidCity) {
        if (categoriesContent) categoriesContent.style.display = 'none';
        console.warn('[contrib-categories-crud] No city selected for categories');
        return;
      }
      
      // Afficher un loader pendant le chargement
      if (categoriesContent) {
        categoriesContent.style.display = '';
        categoriesList.innerHTML = '<p style="opacity:0.6; padding:12px; text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Chargement...</p>';
      }

      // Si "default", charger les catégories avec ville EMPTY ('')
      let categories;
      if (ville.toLowerCase() === 'default') {
        // Requête spéciale pour ville EMPTY
        categories = await win.supabaseService.getCategoryIconsByCity('');
      } else {
        categories = await win.supabaseService.getCategoryIconsByCity(ville);
      }
      
      if (!categories || categories.length === 0) {
        categoriesList.innerHTML = '<p style="opacity:0.6; padding:12px; text-align:center;">Aucune catégorie pour cette ville.<br><small>Cliquez sur "Nouvelle catégorie" pour en créer une.</small></p>';
        return;
      }

      const html = categories.map(cat => {
        // Escape HTML to prevent XSS
        const escapedCategory = String(cat.category || '').replace(/[<>"'&]/g, (c) => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]));
        const originalIconClass = String(cat.icon_class || '');
        let displayIconClass = originalIconClass;
        
        // Auto-fix icon class for DISPLAY only if missing style prefix
        if (displayIconClass.startsWith('fa-') && !displayIconClass.startsWith('fa-solid') && !displayIconClass.startsWith('fa-regular') && !displayIconClass.startsWith('fa-brands') && !displayIconClass.startsWith('fa-light') && !displayIconClass.startsWith('fa-thin') && !displayIconClass.startsWith('fa-duotone')) {
          displayIconClass = 'fa-solid ' + displayIconClass;
        }
        
        const escapedDisplayIconClass = displayIconClass.replace(/[<>"'&]/g, (c) => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]));
        const escapedOriginalIconClass = originalIconClass.replace(/[<>"'&]/g, (c) => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]));
        const escapedVille = String(cat.ville || '').replace(/[<>"'&]/g, (c) => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c]));
        
        return `
        <div class="category-item" style="display:flex; align-items:center; gap:12px; padding:12px; border:1px solid var(--gray-300); border-radius:8px; margin-bottom:8px; background:var(--white);">
          <div style="flex:0 0 40px; text-align:center; font-size:24px; color:var(--gray-700);">
            <i class="${escapedDisplayIconClass}" aria-hidden="true"></i>
          </div>
          <div style="flex:1;">
            <div style="font-weight:600;">${escapedCategory}</div>
            <div style="font-size:0.85em; opacity:0.7;"><code style="background:var(--gray-100); padding:2px 4px; border-radius:3px;">${escapedOriginalIconClass}</code> • Ordre: ${cat.display_order}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="gp-btn gp-btn--secondary" data-action="edit" data-ville="${escapedVille}" data-category="${escapedCategory}" data-icon="${escapedOriginalIconClass}" data-order="${cat.display_order}" data-layers="${JSON.stringify(cat.layers_to_display || []).replace(/"/g, '&quot;')}" data-styles="${JSON.stringify(cat.category_styles || {}).replace(/"/g, '&quot;')}">
              <i class="fa-solid fa-pen"></i> Modifier
            </button>
            <button type="button" class="gp-btn gp-btn--danger" data-action="delete" data-ville="${escapedVille}" data-category="${escapedCategory}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
      }).join('');

      categoriesList.innerHTML = html;

      // Bind edit/delete buttons
      categoriesList.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const ville = btn.dataset.ville;
          const category = btn.dataset.category;
          const icon = btn.dataset.icon;
          const order = btn.dataset.order;
          let layers_to_display = [];
          let category_styles = {};
          try {
            layers_to_display = JSON.parse(btn.dataset.layers || '[]');
          } catch (e) {
            console.warn('[contrib-categories-crud] Erreur parsing layers_to_display:', e);
          }
          try {
            category_styles = JSON.parse(btn.dataset.styles || '{}');
          } catch (e) {
            console.warn('[contrib-categories-crud] Erreur parsing category_styles:', e);
          }
          showCategoryForm('edit', { ville, category, icon_class: icon, display_order: order, layers_to_display, category_styles });
        });
      });

      categoriesList.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ville = btn.dataset.ville;
          const category = btn.dataset.category;
          
          // Message de confirmation avec avertissement
          const confirmMessage = 
            `⚠️ Supprimer la catégorie "${category}" ?\n\n` +
            `Note : La suppression n'est possible que si aucune contribution n'est liée à cette catégorie.\n\n` +
            `Voulez-vous continuer ?`;
          
          if (!confirm(confirmMessage)) return;
          
          await deleteCategory(ville, category);
        });
      });
    } catch(err) {
      console.error('[contrib-categories-crud] refreshCategoriesList error:', err);
      if (categoriesList) categoriesList.innerHTML = '<p style="color:red; padding:12px;">Erreur de chargement.</p>';
    }
  }

  // ============================================================================
  // SHOW/HIDE CATEGORY FORM
  // ============================================================================

  /**
   * Affiche le formulaire de catégorie (création ou édition)
   * @param {string} mode - 'create' ou 'edit'
   * @param {Object} data - Données de la catégorie (en mode edit)
   * @param {Object} elements - Éléments DOM
   * @param {Function} updateStylePreview - Callback pour mettre à jour la preview
   */
  function showCategoryForm(mode, data, elements, updateStylePreview) {
    const {
      categoryFormContainer,
      categoryForm,
      categoryEditModeInput,
      categoryFormTitle,
      categoryOriginalNameInput,
      categoryNameInput,
      categoryIconInput,
      categoryOrderInput,
      categoryVilleSelect,
      categoryLayersCheckboxes,
      categoryStyleColor,
      categoryStyleWeight,
      categoryStyleDashArray,
      categoryStyleOpacity,
      categoryStyleFill,
      categoryStyleFillOptions,
      categoryStyleFillColor,
      categoryStyleFillOpacity,
      categoryFormBack,
      categoryVilleSelectorContainer,
      categoriesContent,
      categoryIconPreview,
      categoryVilleSelector,
      selectedCity  // Ville pré-sélectionnée
    } = elements;
    
    try {
      if (!categoryFormContainer || !categoryForm) return;
      
      categoryEditModeInput.value = mode;
      
      if (mode === 'edit') {
        categoryFormTitle.textContent = 'Modifier la catégorie';
        categoryOriginalNameInput.value = data.category || '';
        categoryNameInput.value = data.category || '';
        
        // Ajouter fa-solid si manquant lors du chargement
        let iconClass = data.icon_class || '';
        if (iconClass && iconClass.startsWith('fa-') && !iconClass.startsWith('fa-solid') && !iconClass.startsWith('fa-regular') && !iconClass.startsWith('fa-brands') && !iconClass.startsWith('fa-light') && !iconClass.startsWith('fa-thin') && !iconClass.startsWith('fa-duotone')) {
          iconClass = 'fa-solid ' + iconClass;
        }
        categoryIconInput.value = iconClass;
        // Déclencher la mise à jour de la prévisualisation
        categoryIconInput.dispatchEvent(new Event('input'));
        
        categoryOrderInput.value = data.display_order || 100;
        // Convertir EMPTY ('') en "default" pour l'affichage
        const displayVille = data.ville === '' ? 'default' : (data.ville || 'default');
        categoryVilleSelect.value = displayVille;
        categoryVilleSelect.dataset.originalVille = displayVille;
        categoryVilleSelect.disabled = true; // Cannot change ville in edit mode
        
        // Charger les layers et pré-sélectionner ceux de la catégorie
        const ContribCategories = win.ContribCategories || {};
        ContribCategories.populateCategoryLayersCheckboxes?.(displayVille, categoryLayersCheckboxes).then(() => {
          const layersToDisplay = data.layers_to_display || [];
          
          // Attendre un tick pour que les checkboxes soient dans le DOM
          setTimeout(() => {
            const checkboxes = document.querySelectorAll('input[name="category-layer-checkbox"]');
            checkboxes.forEach(cb => {
              cb.checked = layersToDisplay.includes(cb.value);
            });
          }, 50);
        });
        
        // Pré-remplir les champs de styles
        const styles = data.category_styles || {};
        if (categoryStyleColor) {
          const trimmedColor = (styles.color && typeof styles.color === 'string') ? styles.color.trim() : '';
          categoryStyleColor.value = (trimmedColor && /^#[0-9A-Fa-f]{6}$/.test(trimmedColor)) ? trimmedColor : '#000000'; // Default black color
        }
        if (categoryStyleWeight) categoryStyleWeight.value = styles.weight || '';
        if (categoryStyleDashArray) categoryStyleDashArray.value = styles.dashArray || '';
        if (categoryStyleOpacity) categoryStyleOpacity.value = styles.opacity || '';
        if (categoryStyleFill) {
          categoryStyleFill.checked = styles.fill === true;
          if (categoryStyleFillOptions) {
            categoryStyleFillOptions.style.display = styles.fill ? 'block' : 'none';
          }
        }
        if (categoryStyleFillColor) {
          const trimmedFillColor = (styles.fillColor && typeof styles.fillColor === 'string') ? styles.fillColor.trim() : '';
          categoryStyleFillColor.value = (trimmedFillColor && /^#[0-9A-Fa-f]{6}$/.test(trimmedFillColor)) ? trimmedFillColor : 'var(--gray-400)999';
        }
        if (categoryStyleFillOpacity) categoryStyleFillOpacity.value = styles.fillOpacity || '';
        
        // Mettre à jour la prévisualisation avec les styles chargés
        setTimeout(() => {
          if (typeof updateStylePreview === 'function') {
            updateStylePreview();
          }
        }, 150);
        
        // Show back button in edit mode
        if (categoryFormBack) categoryFormBack.style.display = '';
        
        // Hide ville selector and categories list when editing
        if (categoryVilleSelectorContainer) categoryVilleSelectorContainer.style.display = 'none';
        if (categoriesContent) categoriesContent.style.display = 'none';
        
        // Update icon preview
        if (categoryIconPreview) {
          const iconEl = categoryIconPreview.querySelector('i');
          if (iconEl && data.icon_class) {
            iconEl.className = data.icon_class;
          }
        }
      } else {
        categoryFormTitle.textContent = 'Nouvelle catégorie';
        categoryOriginalNameInput.value = '';
        categoryVilleSelect.disabled = false;
        
        // Réinitialiser le formulaire SAUF les champs color (pour éviter l'erreur de validation)
        if (categoryNameInput) categoryNameInput.value = '';
        if (categoryIconInput) categoryIconInput.value = '';
        if (categoryOrderInput) categoryOrderInput.value = '100';
        
        // Default to selected city from landing or main selector
        const cityToUse = selectedCity || categoryVilleSelector?.value || win.activeCity || '';
        if (cityToUse) {
          categoryVilleSelect.value = cityToUse;
          // Charger les layers pour la ville sélectionnée
          const ContribCategories = win.ContribCategories || {};
          ContribCategories.populateCategoryLayersCheckboxes?.(cityToUse, categoryLayersCheckboxes);
        }
        
        // Réinitialiser les champs de styles avec des valeurs par défaut valides
        if (categoryStyleColor) categoryStyleColor.value = '#000000'; // Default black
        if (categoryStyleWeight) categoryStyleWeight.value = '';
        if (categoryStyleDashArray) categoryStyleDashArray.value = '';
        if (categoryStyleOpacity) categoryStyleOpacity.value = '';
        if (categoryStyleFill) {
          categoryStyleFill.checked = false;
          if (categoryStyleFillOptions) categoryStyleFillOptions.style.display = 'none';
        }
        if (categoryStyleFillColor) categoryStyleFillColor.value = 'var(--gray-400)999';
        if (categoryStyleFillOpacity) categoryStyleFillOpacity.value = '';
        
        // Hide back button in create mode
        if (categoryFormBack) categoryFormBack.style.display = 'none';
        
        // Show ville selector in create mode
        if (categoryVilleSelectorContainer) {
          categoryVilleSelectorContainer.style.display = '';
          categoryVilleSelectorContainer.style.opacity = '1';
        }
        
        // Keep categories list visible when creating
        if (categoriesContent && categoryVilleSelector?.value) {
          categoriesContent.style.display = '';
        }
        
        // Reset icon preview
        if (categoryIconPreview) {
          const iconEl = categoryIconPreview.querySelector('i');
          if (iconEl) iconEl.className = 'fa-solid fa-question';
        }
      }
      
      categoryFormContainer.style.display = '';
    } catch(e) {
      console.error('[contrib-categories-crud] showCategoryForm error:', e);
    }
  }

  /**
   * Masque le formulaire de catégorie
   * @param {Object} elements - Éléments DOM
   * @param {Function} refreshCallback - Callback pour rafraîchir la liste
   */
  async function hideCategoryForm(elements, refreshCallback) {
    const {
      categoryFormContainer,
      categoryIconPicker,
      categoryNameInput,
      categoryIconInput,
      categoryOrderInput,
      categoryStyleColor,
      categoryStyleWeight,
      categoryStyleDashArray,
      categoryStyleOpacity,
      categoryStyleFill,
      categoryStyleFillColor,
      categoryStyleFillOpacity,
      categoryStyleFillOptions,
      categoryVilleSelectorContainer,
      categoryVilleSelector,
      categoriesContent
    } = elements;
    
    try {
      // Masquer le formulaire et le picker d'icônes
      if (categoryFormContainer) categoryFormContainer.style.display = 'none';
      if (categoryIconPicker) categoryIconPicker.style.display = 'none';
      
      // Réinitialiser manuellement les champs (éviter reset() qui cause des erreurs de validation sur les champs color)
      if (categoryNameInput) categoryNameInput.value = '';
      if (categoryIconInput) categoryIconInput.value = '';
      if (categoryOrderInput) categoryOrderInput.value = '100';
      if (categoryStyleColor) categoryStyleColor.value = '#000000';
      if (categoryStyleWeight) categoryStyleWeight.value = '';
      if (categoryStyleDashArray) categoryStyleDashArray.value = '';
      if (categoryStyleOpacity) categoryStyleOpacity.value = '';
      if (categoryStyleFill) categoryStyleFill.checked = false;
      if (categoryStyleFillColor) categoryStyleFillColor.value = 'var(--gray-400)999';
      if (categoryStyleFillOpacity) categoryStyleFillOpacity.value = '';
      if (categoryStyleFillOptions) categoryStyleFillOptions.style.display = 'none';
      
      // Réafficher le sélecteur de ville
      if (categoryVilleSelectorContainer) {
        categoryVilleSelectorContainer.style.display = '';
        categoryVilleSelectorContainer.style.opacity = '1';
      }
      
      // Recharger la liste des catégories si une ville est sélectionnée
      const ville = categoryVilleSelector?.value || '';
      if (ville) {
        await refreshCallback();
        if (categoriesContent) categoriesContent.style.display = '';
      } else {
        if (categoriesContent) categoriesContent.style.display = 'none';
      }
    } catch(err) {
      console.error('[contrib-categories-crud] hideCategoryForm error:', err);
    }
  }

  // ============================================================================
  // DELETE CATEGORY
  // ============================================================================

  /**
   * Supprime une catégorie
   * @param {string} ville - Code de la ville
   * @param {string} category - Nom de la catégorie
   * @param {Function} showToast - Callback pour afficher un toast
   * @param {Function} refreshCallback - Callback pour rafraîchir la liste
   */
  async function deleteCategory(ville, category, showToast, refreshCallback) {
    try {
      if (!win.supabaseService) return;
      
      // Vérifier s'il existe des contributions liées à cette catégorie
      console.log('[deleteCategory] Vérification des contributions pour:', { ville, category });
      
      const contributions = await win.supabaseService.fetchProjectsByCategory(category);
      
      if (!contributions) {
        console.error('[deleteCategory] Erreur lors de la vérification des contributions');
        showToast('Erreur lors de la vérification des contributions.', 'error');
        return;
      }
      
      // Si des contributions existent, bloquer la suppression
      if (contributions.length > 0) {
        const count = contributions.length;
        const projectNames = contributions.slice(0, 3).map(c => c.project_name).join(', ');
        const moreText = count > 3 ? ` et ${count - 3} autre(s)` : '';
        
        // Afficher un message détaillé avec les contributions liées
        alert(
          `❌ Suppression impossible\n\n` +
          `La catégorie "${category}" ne peut pas être supprimée car elle contient ${count} contribution(s) :\n\n` +
          `• ${projectNames}${moreText}\n\n` +
          `📋 Action requise :\n` +
          `Rendez-vous dans "Mes contributions" et supprimez d'abord toutes les contributions de cette catégorie, puis réessayez.`
        );
        
        console.warn('[deleteCategory] Suppression bloquée:', { category, count, contributions });
        return;
      }
      
      // Aucune contribution, procéder à la suppression
      console.log('[deleteCategory] Aucune contribution trouvée, suppression autorisée');
      
      const result = await win.supabaseService.deleteCategoryIcon(ville, category);
      
      if (result.success) {
        showToast('✅ Catégorie supprimée avec succès.', 'success');
        await refreshCallback();
      } else {
        showToast('Erreur: ' + (result.error || 'Échec de suppression'), 'error');
      }
    } catch(err) {
      console.error('[contrib-categories-crud] deleteCategory error:', err);
      showToast('Erreur de suppression.', 'error');
    }
  }

  // ============================================================================
  // HANDLE CATEGORY FORM SUBMIT
  // ============================================================================

  /**
   * Gère la soumission du formulaire de catégorie
   * @param {Event} e - Event de soumission
   * @param {Object} elements - Éléments DOM
   * @param {Function} showToast - Callback pour afficher un toast
   * @param {Function} hideFormCallback - Callback pour masquer le formulaire
   * @param {Function} refreshCallback - Callback pour rafraîchir la liste
   */
  async function handleCategoryFormSubmit(e, elements, showToast, hideFormCallback, refreshCallback) {
    e.preventDefault();
    
    const {
      categoryEditModeInput,
      categoryNameInput,
      categoryIconInput,
      categoryOrderInput,
      categoryVilleSelect,
      categoryOriginalNameInput,
      categoryStyleColor,
      categoryStyleWeight,
      categoryStyleDashArray,
      categoryStyleOpacity,
      categoryStyleFill,
      categoryStyleFillColor,
      categoryStyleFillOpacity,
      categoryVilleSelectorContainer,
      categoriesContent
    } = elements;
    
    try {
      const mode = categoryEditModeInput.value;
      const category = categoryNameInput.value.trim().toLowerCase();
      const icon_class = categoryIconInput.value.trim();
      const display_order = parseInt(categoryOrderInput.value) || 100;
      let ville = categoryVilleSelect.value.trim().toLowerCase();
      
      // Les layers ne sont plus sélectionnés ici car la ville est fixée depuis le landing
      // On envoie un tableau vide pour layers_to_display
      const selectedLayers = [];
      
      // Récupérer les styles personnalisés
      const category_styles = {};
      if (categoryStyleColor && categoryStyleColor.value) {
        category_styles.color = categoryStyleColor.value;
      }
      if (categoryStyleWeight && categoryStyleWeight.value) {
        category_styles.weight = parseInt(categoryStyleWeight.value);
      }
      if (categoryStyleDashArray && categoryStyleDashArray.value) {
        category_styles.dashArray = categoryStyleDashArray.value;
      }
      if (categoryStyleOpacity && categoryStyleOpacity.value) {
        category_styles.opacity = parseFloat(categoryStyleOpacity.value);
      }
      if (categoryStyleFill && categoryStyleFill.checked) {
        category_styles.fill = true;
        if (categoryStyleFillColor && categoryStyleFillColor.value) {
          category_styles.fillColor = categoryStyleFillColor.value;
        }
        if (categoryStyleFillOpacity && categoryStyleFillOpacity.value) {
          category_styles.fillOpacity = parseFloat(categoryStyleFillOpacity.value);
        }
      }
      
      // Convertir "default" en EMPTY ('') pour la base de données
      if (ville === 'default') {
        ville = '';
      }
      
      if (!category || !icon_class) {
        showToast('Le nom et l\'icône sont requis.', 'error');
        return;
      }

      let result;
      if (mode === 'edit') {
        let originalCategory = categoryOriginalNameInput.value.trim().toLowerCase();
        let originalVille = categoryVilleSelect.dataset.originalVille;
        // Convertir "default" en EMPTY ('')
        if (originalVille === 'default') originalVille = '';
        
        result = await win.supabaseService.updateCategoryIcon(originalVille, originalCategory, {
          category,
          icon_class,
          display_order,
          layers_to_display: selectedLayers,
          category_styles
        });
      } else {
        result = await win.supabaseService.createCategoryIcon({
          category,
          icon_class,
          display_order,
          ville,
          layers_to_display: selectedLayers,
          category_styles
        });
      }

      if (result.success) {
        const message = mode === 'edit' 
          ? (result.updatedContributions > 0 
              ? `Catégorie modifiée. ${result.updatedContributions} projet(s) mis à jour.`
              : 'Catégorie modifiée.')
          : 'Catégorie créée.';
        showToast(message, 'success');
        hideFormCallback();
        
        // Refresh list and ensure ville selector + list are visible
        if (categoryVilleSelectorContainer) categoryVilleSelectorContainer.style.display = '';
        await refreshCallback();
        // Toujours afficher le contenu des catégories après le refresh
        if (categoriesContent) {
          categoriesContent.style.display = '';
        }
        
        // Emit event to refresh dynamic categories in nav
        try { 
          window.dispatchEvent(new CustomEvent('categories:updated', { detail: { ville } })); 
        } catch(_) {}
      } else {
        showToast('Erreur: ' + (result.error || 'Échec'), 'error');
      }
    } catch(err) {
      console.error('[contrib-categories-crud] category form submit error:', err);
      showToast('Erreur lors de l\'enregistrement.', 'error');
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribCategoriesCrud = {
    refreshCategoriesList,
    showCategoryForm,
    hideCategoryForm,
    deleteCategory,
    handleCategoryFormSubmit
  };

})(window);
