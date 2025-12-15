// modules/contrib/contrib-travaux-config.js
// Gestion de la configuration Travaux avec sauvegarde automatique

;(function(win) {
  'use strict';

  let currentVille = null;
  let saveDebounceTimer = null;

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

    currentVille = ville;

    // Afficher la section
    section.style.display = 'block';

    // Initialiser les interactions
    initExpandCollapse();
    initToggle();
    initSourceOptions();
    initIconPicker();

    // Charger les layers disponibles
    await loadLayersCheckboxes(ville);

    // Charger la config existante
    await loadTravauxConfig(ville);

    // Bind auto-save sur tous les champs
    bindAutoSave();
  }

  /**
   * Initialise le expand/collapse du contenu
   */
  function initExpandCollapse() {
    const expandBtn = document.getElementById('travaux-expand-btn');
    const content = document.getElementById('travaux-config-content');
    
    if (!expandBtn || !content) return;

    // Supprimer les anciens listeners
    const newBtn = expandBtn.cloneNode(true);
    expandBtn.parentNode.replaceChild(newBtn, expandBtn);

    newBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Classe is-expanded sur le bouton lui-même
      const isExpanded = content.style.display === 'block';
      
      if (isExpanded) {
        newBtn.classList.remove('is-expanded');
        content.style.display = 'none';
      } else {
        newBtn.classList.add('is-expanded');
        content.style.display = 'block';
      }
    });
  }

  /**
   * Initialise le toggle d'activation avec auto-save
   */
  function initToggle() {
    const toggle = document.getElementById('travaux-enabled-toggle');
    const statusBadge = document.getElementById('travaux-status-text');
    
    if (!toggle) return;

    // Supprimer les anciens listeners
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);

    newToggle.addEventListener('change', () => {
      updateStatusBadge(newToggle.checked);
      // Auto-save immédiat pour le toggle principal
      autoSave();
    });
  }

  /**
   * Met à jour le badge de statut
   */
  function updateStatusBadge(isEnabled) {
    const statusBadge = document.getElementById('travaux-status-text');
    if (!statusBadge) return;

    if (isEnabled) {
      statusBadge.textContent = 'Activé';
      statusBadge.classList.add('is-active');
    } else {
      statusBadge.textContent = 'Désactivé';
      statusBadge.classList.remove('is-active');
    }
  }

  /**
   * Initialise les options de source avec auto-save
   */
  function initSourceOptions() {
    const sourceRadios = document.querySelectorAll('input[name="travaux-source"]');
    const urlField = document.getElementById('travaux-url-field');
    
    sourceRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        // Afficher/masquer le champ URL
        if (urlField) {
          urlField.classList.toggle('is-visible', radio.value === 'url' && radio.checked);
        }
        autoSave();
      });
    });
  }

  /**
   * Initialise l'icon picker
   */
  function initIconPicker() {
    const iconInput = document.getElementById('travaux-icon');
    const iconPreview = document.getElementById('travaux-icon-preview');
    const iconPickerBtn = document.getElementById('travaux-icon-picker-btn');

    if (!iconInput || !iconPreview || !iconPickerBtn) return;

    // Supprimer les anciens listeners
    const newBtn = iconPickerBtn.cloneNode(true);
    iconPickerBtn.parentNode.replaceChild(newBtn, iconPickerBtn);

    const newInput = iconInput.cloneNode(true);
    iconInput.parentNode.replaceChild(newInput, iconInput);

    const openPicker = () => {
      if (win.GPIconPicker) {
        win.GPIconPicker.open(newInput, () => {
          updateIconPreview();
          autoSave();
        });
      }
    };

    newBtn.addEventListener('click', openPicker);
    newInput.addEventListener('click', openPicker);
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
   * Charge les layers disponibles
   */
  async function loadLayersCheckboxes(ville) {
    const container = document.getElementById('travaux-layers-checkboxes');
    if (!container) return;

    try {
      if (win.ContribCategories?.populateCategoryLayersCheckboxes) {
        await win.ContribCategories.populateCategoryLayersCheckboxes(ville, container);
        
        // Renommer les checkboxes
        container.querySelectorAll('input[name="category-layer-checkbox"]').forEach(cb => {
          cb.name = 'travaux-layer-checkbox';
          cb.addEventListener('change', () => autoSave());
        });
      } else {
        container.innerHTML = '<small style="color:var(--text-tertiary);">Aucun layer disponible</small>';
      }
    } catch (err) {
      console.error('[TravauxConfig] Erreur chargement layers:', err);
      container.innerHTML = '<small style="color:var(--danger);">Erreur de chargement</small>';
    }
  }

  /**
   * Charge la configuration existante
   */
  async function loadTravauxConfig(ville) {
    try {
      const config = await win.supabaseService?.getTravauxConfig?.(ville);
      
      const toggle = document.getElementById('travaux-enabled-toggle');
      const sourceUrl = document.getElementById('travaux-source-url');
      const sourceDb = document.getElementById('travaux-source-db');
      const urlInput = document.getElementById('travaux-url');
      const urlField = document.getElementById('travaux-url-field');
      const iconInput = document.getElementById('travaux-icon');
      const orderInput = document.getElementById('travaux-order');

      if (config) {
        // Toggle
        if (toggle) {
          toggle.checked = config.enabled === true;
          updateStatusBadge(toggle.checked);
        }

        // Source
        if (config.source_type === 'url') {
          if (sourceUrl) sourceUrl.checked = true;
          if (sourceDb) sourceDb.checked = false;
          if (urlField) urlField.classList.add('is-visible');
        } else {
          if (sourceUrl) sourceUrl.checked = false;
          if (sourceDb) sourceDb.checked = true;
          if (urlField) urlField.classList.remove('is-visible');
        }

        // URL
        if (urlInput) urlInput.value = config.url || '';

        // Icône
        if (iconInput) iconInput.value = config.icon_class || 'fa-solid fa-helmet-safety';
        updateIconPreview();

        // Ordre
        if (orderInput) orderInput.value = config.display_order || 5;

        // Layers
        const layersArray = config.layers_to_display || [];
        setTimeout(() => {
          document.querySelectorAll('input[name="travaux-layer-checkbox"]').forEach(cb => {
            cb.checked = layersArray.includes(cb.value);
          });
        }, 50);
      } else {
        // Valeurs par défaut
        if (toggle) toggle.checked = false;
        updateStatusBadge(false);
        if (sourceDb) sourceDb.checked = true;
        if (urlField) urlField.classList.remove('is-visible');
        if (iconInput) iconInput.value = 'fa-solid fa-helmet-safety';
        if (orderInput) orderInput.value = '5';
        updateIconPreview();
      }
    } catch (err) {
      console.error('[TravauxConfig] Erreur chargement config:', err);
    }
  }

  /**
   * Bind auto-save sur les champs modifiables
   */
  function bindAutoSave() {
    const urlInput = document.getElementById('travaux-url');
    const orderInput = document.getElementById('travaux-order');

    if (urlInput) {
      urlInput.addEventListener('input', () => autoSaveDebounced());
    }

    if (orderInput) {
      orderInput.addEventListener('input', () => autoSaveDebounced());
    }
  }

  /**
   * Auto-save avec debounce (pour les inputs texte)
   */
  function autoSaveDebounced() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => autoSave(), 800);
  }

  /**
   * Sauvegarde automatique de la configuration
   */
  async function autoSave() {
    if (!currentVille) return;

    const statusEl = document.getElementById('travaux-config-status');
    
    try {
      // Afficher état "saving"
      showSaveStatus('saving', 'Enregistrement...');

      // Récupérer les valeurs
      const enabled = document.getElementById('travaux-enabled-toggle')?.checked || false;
      const sourceType = document.getElementById('travaux-source-url')?.checked ? 'url' : 'city_travaux';
      const url = document.getElementById('travaux-url')?.value?.trim() || '';
      const iconClass = document.getElementById('travaux-icon')?.value?.trim() || 'fa-solid fa-helmet-safety';
      const displayOrder = parseInt(document.getElementById('travaux-order')?.value, 10) || 5;

      // Layers sélectionnés
      const checkboxes = document.querySelectorAll('input[name="travaux-layer-checkbox"]:checked');
      const layersArray = Array.from(checkboxes).map(cb => cb.value);

      const config = {
        enabled,
        source_type: sourceType,
        url: sourceType === 'url' ? url : null,
        icon_class: iconClass,
        display_order: displayOrder,
        layers_to_display: layersArray
      };

      // Sauvegarder
      const result = await win.supabaseService?.updateTravauxConfig?.(currentVille, config);

      if (result?.error) {
        throw result.error;
      }

      // Succès
      showSaveStatus('success', 'Enregistré');

    } catch (err) {
      console.error('[TravauxConfig] Erreur auto-save:', err);
      showSaveStatus('error', 'Erreur de sauvegarde');
    }
  }

  /**
   * Affiche le statut de sauvegarde
   */
  function showSaveStatus(type, message) {
    const statusEl = document.getElementById('travaux-config-status');
    if (!statusEl) return;

    const iconEl = statusEl.querySelector('i');
    const textEl = statusEl.querySelector('span');

    // Reset classes
    statusEl.classList.remove('is-visible', 'is-saving', 'is-error');

    // Appliquer le type
    if (type === 'saving') {
      statusEl.classList.add('is-visible', 'is-saving');
      if (iconEl) iconEl.className = 'fa-solid fa-spinner fa-spin';
    } else if (type === 'error') {
      statusEl.classList.add('is-visible', 'is-error');
      if (iconEl) iconEl.className = 'fa-solid fa-circle-exclamation';
    } else {
      statusEl.classList.add('is-visible');
      if (iconEl) iconEl.className = 'fa-solid fa-circle-check';
    }

    if (textEl) textEl.textContent = message;

    // Auto-hide après 3s pour success
    if (type === 'success') {
      setTimeout(() => {
        statusEl.classList.remove('is-visible');
      }, 3000);
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
    currentVille = null;
  }

  // Exposer les fonctions publiques
  win.TravauxConfigModule = {
    init: initTravauxConfig,
    hide: hideTravauxConfig,
    load: loadTravauxConfig
  };

})(window);
