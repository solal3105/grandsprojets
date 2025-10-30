// modules/contrib/contrib-travaux-config.js
// Gestion de la configuration de la catégorie Travaux

;(function(win) {
  'use strict';

  /**
   * Initialise la section Travaux dans la modale de gestion
   * @param {string} ville - Code de la ville
   */
  async function initTravauxConfig(ville) {
    const section = document.getElementById('travaux-config-section');
    if (!section) {
      console.warn('[TravauxConfig] Section non trouvée');
      return;
    }

    // Afficher la section
    section.style.display = 'block';

    // Initialiser le collapse header
    initCollapseHeader();

    // Initialiser le toggle knob
    initToggleKnob();

    // Initialiser l'icon picker
    initIconPicker();

    // Charger les layers disponibles pour cette ville (checkboxes)
    await loadLayersCheckboxes(ville);

    // Charger la config existante
    await loadTravauxConfig(ville);

    // Bind des event listeners
    bindTravauxConfigEvents(ville);
  }

  /**
   * Initialise le collapse/expand du header
   */
  function initCollapseHeader() {
    const header = document.getElementById('travaux-config-header');
    const content = document.getElementById('travaux-config-content');
    
    if (!header || !content) {
      console.warn('[TravauxConfig] Header ou content non trouvé');
      return;
    }

    // Par défaut, collapsed
    header.classList.add('collapsed');
    
    header.addEventListener('click', () => {
      const isCollapsed = header.classList.contains('collapsed');
      
      if (isCollapsed) {
        // Expand
        header.classList.remove('collapsed');
        content.style.display = 'block';
      } else {
        // Collapse
        header.classList.add('collapsed');
        content.style.display = 'none';
      }
    });
  }

  /**
   * Initialise le toggle knob et gère l'affichage du contenu étendu
   */
  function initToggleKnob() {
    const toggle = document.getElementById('travaux-enabled-toggle');
    const statusText = document.getElementById('travaux-status-text');
    const extendedContent = document.getElementById('travaux-extended-content');
    
    if (!toggle || !statusText || !extendedContent) {
      console.warn('[TravauxConfig] Éléments toggle non trouvés');
      return;
    }

    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        // Activé
        statusText.textContent = 'Catégorie activée';
        statusText.style.color = 'var(--success)';
        extendedContent.style.display = 'block';
      } else {
        // Désactivé
        statusText.textContent = 'Catégorie désactivée';
        statusText.style.color = 'var(--text-tertiary)';
        extendedContent.style.display = 'none';
      }
    });
  }

  /**
   * Initialise l'icon picker avec le nouveau système unifié
   */
  function initIconPicker() {
    const iconInput = document.getElementById('travaux-icon');
    const iconPreview = document.getElementById('travaux-icon-preview');
    const iconPickerBtn = document.getElementById('travaux-icon-picker-btn');

    if (!iconInput || !iconPreview || !iconPickerBtn) {
      console.warn('[TravauxConfig] Éléments icon picker non trouvés');
      return;
    }

    // Vérifier que GPIconPicker est chargé
    if (!win.GPIconPicker) {
      console.error('[TravauxConfig] GPIconPicker non chargé');
      return;
    }

    // Ouvrir le modal au clic sur le bouton
    iconPickerBtn.addEventListener('click', () => {
      win.GPIconPicker.open(iconInput, updateIconPreview);
    });

    // Permettre de cliquer sur l'input pour ouvrir le picker
    iconInput.addEventListener('click', () => {
      win.GPIconPicker.open(iconInput, updateIconPreview);
    });

    // Update preview quand l'input change
    iconInput.addEventListener('input', updateIconPreview);
    iconInput.addEventListener('change', updateIconPreview);
  }

  /**
   * Met à jour la prévisualisation de l'icône
   */
  function updateIconPreview() {
    const iconInput = document.getElementById('travaux-icon');
    const iconPreview = document.getElementById('travaux-icon-preview');
    
    if (!iconInput || !iconPreview) return;

    const iconClass = iconInput.value.trim();
    const iconElement = iconPreview.querySelector('i');
    
    if (iconElement) {
      iconElement.className = iconClass || 'fa-solid fa-question';
    }
  }

  /**
   * Charge les layers disponibles pour la ville (checkboxes)
   * @param {string} ville - Code de la ville
   */
  async function loadLayersCheckboxes(ville) {
    try {
      const container = document.getElementById('travaux-layers-checkboxes');
      if (!container) {
        console.warn('[TravauxConfig] Container checkboxes non trouvé');
        return;
      }

      // Utiliser la fonction existante de ContribCategories
      if (win.ContribCategories && win.ContribCategories.populateCategoryLayersCheckboxes) {
        // Passer le nom correct pour les checkboxes
        await win.ContribCategories.populateCategoryLayersCheckboxes(ville, container);
        
        // Renommer les checkboxes pour éviter les conflits avec la modale de catégorie
        const checkboxes = container.querySelectorAll('input[name="category-layer-checkbox"]');
        checkboxes.forEach(cb => {
          cb.name = 'travaux-layer-checkbox';
        });
      } else {
        container.innerHTML = '<small style="color:var(--danger);">Erreur: Module ContribCategories non disponible</small>';
      }
    } catch (err) {
      console.error('[TravauxConfig] Erreur chargement layers:', err);
    }
  }

  /**
   * Charge la configuration existante
   * @param {string} ville - Code de la ville
   */
  async function loadTravauxConfig(ville) {
    try {
      const config = await win.supabaseService.getTravauxConfig(ville);
      
      if (config) {
        // Remplir le formulaire avec le toggle
        const toggle = document.getElementById('travaux-enabled-toggle');
        if (toggle) {
          toggle.checked = config.enabled === true;
          // Trigger l'event pour afficher/masquer le contenu étendu
          toggle.dispatchEvent(new Event('change'));
        }
        
        const sourceUrl = document.getElementById('travaux-source-url');
        const sourceDb = document.getElementById('travaux-source-db');
        if (config.source_type === 'url') {
          sourceUrl.checked = true;
          sourceDb.checked = false;
        } else {
          sourceUrl.checked = false;
          sourceDb.checked = true;
        }
        
        document.getElementById('travaux-url').value = config.url || '';
        document.getElementById('travaux-icon').value = config.icon_class || 'fa-solid fa-helmet-safety';
        document.getElementById('travaux-order').value = config.display_order || 5;
        
        // Layers to display - cocher les checkboxes correspondantes
        const layersArray = config.layers_to_display || ['travaux'];
        setTimeout(() => {
          const checkboxes = document.querySelectorAll('input[name="travaux-layer-checkbox"]');
          checkboxes.forEach(cb => {
            cb.checked = layersArray.includes(cb.value);
            // Trigger l'event pour le style
            cb.dispatchEvent(new Event('change'));
          });
        }, 50);
        
        // Update preview icon
        updateIconPreview();
        
        // Show/hide URL field
        toggleUrlField();
      } else {
        // Valeurs par défaut si pas de config
        resetTravauxForm();
      }
    } catch (err) {
      console.error('[TravauxConfig] Erreur chargement config:', err);
      showStatus('Erreur lors du chargement de la configuration', 'error');
    }
  }

  /**
   * Bind les event listeners
   * @param {string} ville - Code de la ville
   */
  function bindTravauxConfigEvents(ville) {
    // Toggle URL field
    const sourceRadios = document.querySelectorAll('input[name="travaux-source"]');
    sourceRadios.forEach(radio => {
      radio.addEventListener('change', toggleUrlField);
    });

    // Save button
    const saveBtn = document.getElementById('travaux-config-save');
    if (saveBtn) {
      // Remove previous listeners
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      
      newSaveBtn.addEventListener('click', () => saveTravauxConfig(ville));
    }
  }

  /**
   * Affiche/masque le champ URL selon la source
   */
  function toggleUrlField() {
    const sourceUrl = document.getElementById('travaux-source-url');
    const urlField = document.getElementById('travaux-url-field');
    
    if (sourceUrl && urlField) {
      urlField.style.display = sourceUrl.checked ? 'block' : 'none';
    }
  }

  /**
   * Sauvegarde la configuration
   * @param {string} ville - Code de la ville
   */
  async function saveTravauxConfig(ville) {
    try {
      const saveBtn = document.getElementById('travaux-config-save');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';
      }

      showStatus('Enregistrement en cours...', 'info');

      // Récupérer les valeurs du formulaire
      const enabled = document.getElementById('travaux-enabled-toggle').checked;
      const sourceType = document.getElementById('travaux-source-url').checked ? 'url' : 'city_travaux';
      const url = document.getElementById('travaux-url').value.trim();
      const iconClass = document.getElementById('travaux-icon').value.trim();
      const displayOrder = parseInt(document.getElementById('travaux-order').value, 10);

      // Validation
      if (sourceType === 'url' && !url) {
        showStatus('⚠️ Veuillez saisir une URL pour la source externe', 'error');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Enregistrer';
        }
        return;
      }

      // Récupérer les layers sélectionnés depuis les checkboxes
      const checkboxes = document.querySelectorAll('input[name="travaux-layer-checkbox"]:checked');
      const layersArray = Array.from(checkboxes).map(cb => cb.value);

      // Note: On autorise maintenant l'enregistrement sans layer sélectionné
      // Les travaux peuvent fonctionner avec des données depuis city_travaux ou une URL externe

      // Construire l'objet config
      const config = {
        enabled,
        source_type: sourceType,
        url: sourceType === 'url' ? url : null,
        icon_class: iconClass || 'fa-solid fa-helmet-safety',
        display_order: isNaN(displayOrder) ? 5 : displayOrder,
        layers_to_display: layersArray
      };

      // Enregistrer
      const { data, error } = await win.supabaseService.updateTravauxConfig(ville, config);

      if (error) {
        throw error;
      }

      showStatus('✅ Configuration enregistrée avec succès !', 'success');

      // Message pour recharger l'app
      setTimeout(() => {
        showStatus('🔄 Rechargez la page pour voir les changements', 'info');
      }, 2000);

    } catch (err) {
      console.error('[TravauxConfig] Erreur sauvegarde:', err);
      showStatus('❌ Erreur lors de l\'enregistrement : ' + (err.message || 'Erreur inconnue'), 'error');
    } finally {
      const saveBtn = document.getElementById('travaux-config-save');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Enregistrer';
      }
    }
  }

  /**
   * Réinitialise le formulaire aux valeurs par défaut
   */
  function resetTravauxForm() {
    const toggle = document.getElementById('travaux-enabled-toggle');
    if (toggle) {
      toggle.checked = false;
      toggle.dispatchEvent(new Event('change'));
    }
    document.getElementById('travaux-source-db').checked = true;
    document.getElementById('travaux-url').value = '';
    document.getElementById('travaux-icon').value = 'fa-solid fa-helmet-safety';
    document.getElementById('travaux-order').value = '5';
    
    // Décocher toutes les checkboxes
    const checkboxes = document.querySelectorAll('input[name="travaux-layer-checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = false;
      cb.dispatchEvent(new Event('change'));
    });
    
    // L'icon picker gère déjà la preview via initIconPicker()
    toggleUrlField();
  }

  /**
   * Affiche un message de statut
   * @param {string} message - Message à afficher
   * @param {string} type - Type de message (info, success, error)
   */
  function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('travaux-config-status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.style.display = 'block';
    
    // Styles selon le type
    if (type === 'success') {
      statusEl.style.background = 'var(--success-alpha-10, #d4edda)';
      statusEl.style.color = 'var(--success, #28a745)';
      statusEl.style.borderLeft = '4px solid var(--success, #28a745)';
    } else if (type === 'error') {
      statusEl.style.background = 'var(--danger-alpha-10, #f8d7da)';
      statusEl.style.color = 'var(--danger, #dc3545)';
      statusEl.style.borderLeft = '4px solid var(--danger, #dc3545)';
    } else {
      statusEl.style.background = 'var(--info-alpha-10, #d1ecf1)';
      statusEl.style.color = 'var(--info, #0c5460)';
      statusEl.style.borderLeft = '4px solid var(--info, #0c5460)';
    }

    // Auto-hide après 5s pour success/info
    if (type !== 'error') {
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Masque la section Travaux
   */
  function hideTravauxConfig() {
    const section = document.getElementById('travaux-config-section');
    if (section) {
      section.style.display = 'none';
    }
  }

  // Exposer les fonctions publiques
  win.TravauxConfigModule = {
    init: initTravauxConfig,
    hide: hideTravauxConfig,
    load: loadTravauxConfig
  };

})(window);
