// modules/TravauxEditorModule.js
// Module pour éditer/créer des chantiers travaux avec dessin sur carte
const TravauxEditorModule = (() => {
  // ===== CONSTANTES =====
  const RELOAD_DELAY_MS = 1500;
  const MESSAGES = {
    AUTH_REQUIRED: 'Vous devez être connecté et admin de la ville pour ajouter un chantier.',
    LEAFLET_DRAW_MISSING: 'Leaflet.Draw n\'est pas chargé. Impossible d\'ouvrir l\'éditeur.',
    CHANTIER_NOT_FOUND: 'Chantier introuvable',
    LOADING_ERROR: 'Erreur lors du chargement du chantier',
    NAME_REQUIRED: 'Le nom du chantier est obligatoire.',
    SAVE_SUCCESS: '✅ Chantier créé avec succès !',
    UPDATE_SUCCESS: '✅ Chantier modifié avec succès !',
    SAVE_ERROR: '❌ Erreur lors de la sauvegarde',
    UPDATE_ERROR: '❌ Erreur lors de la mise à jour',
    CANCEL_CONFIRM: 'Annuler la création du chantier ? Les géométries dessinées seront perdues.',
    CANCEL_EDIT_CONFIRM: 'Annuler les modifications ?'
  };
  
  // ===== ÉTAT DU MODULE =====
  let drawnItems = null;
  let currentFeatures = [];
  let isDrawingMode = false;
  
  /**
   * Initialise le système de dessin et configure les icônes
   */
  function initLeafletDraw() {
    if (!window.L || !window.L.Control || !window.L.Control.Draw) {
      console.error('[TravauxEditor] Draw system non chargé');
      return false;
    }
    
    // Configurer le chemin des icônes (compat layer)
    if (window.L.Icon && window.L.Icon.Default) {
      try { delete L.Icon.Default.prototype._getIconUrl; } catch(e) {}
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '',
        iconUrl: '',
        shadowUrl: ''
      });
    }
    
    // Créer une FeatureGroup pour stocker les éléments dessinés
    if (!drawnItems) {
      drawnItems = new L.FeatureGroup();
      window.MapModule?.map.addLayer(drawnItems);
    }
    
    return true;
  }
  
  /**
   * Démarre le mode dessin (ÉTAPE 1)
   */
  async function openEditor() {
    try {
      // Vérifier auth
      const authOk = await checkAuth();
      if (!authOk) {
        if (window.ContribUtils?.showToast) {
          window.ContribUtils.showToast(MESSAGES.AUTH_REQUIRED, 'error');
        }
        return;
      }
      
      // Vérifier Leaflet.Draw
      if (!initLeafletDraw()) {
        if (window.ContribUtils?.showToast) {
          window.ContribUtils.showToast(MESSAGES.LEAFLET_DRAW_MISSING, 'error');
        }
        return;
      }
      
      // Activer le mode dessin
      startDrawingMode();
    } catch (err) {
      console.error('[TravauxEditor] Erreur ouverture éditeur:', err);
      if (window.ContribUtils?.showToast) {
        window.ContribUtils.showToast('Erreur lors de l\'ouverture de l\'éditeur', 'error');
      }
    }
  }
  
  /**
   * Active le mode dessin sur la carte
   */
  function startDrawingMode() {
    if (isDrawingMode) return;
    
    isDrawingMode = true;
    currentFeatures = [];
    drawnItems.clearLayers();
    
    // Afficher le panel de dessin dans le submenu
    showDrawingInstructions();
    
    // Écouter les événements de dessin
    if (window.MapModule?.map) {
      window.MapModule.map.on(L.Draw.Event.CREATED, handleDrawCreated);
      window.MapModule.map.on(L.Draw.Event.EDITED, handleDrawEdited);
      window.MapModule.map.on(L.Draw.Event.DELETED, handleDrawDeleted);
    }
  }
  
  /**
   * Affiche le panel de dessin dans le submenu
   */
  function showDrawingInstructions() {
    const panel = document.getElementById('travaux-drawing-panel');
    if (!panel) {
      console.error('[TravauxEditor] Panel de dessin non trouvé');
      return;
    }
    
    // Cacher les filtres pendant le mode dessin
    const filtersUX = document.getElementById('travaux-filters-ux');
    if (filtersUX) {
      filtersUX.style.display = 'none';
    }
    
    // Afficher le panel
    panel.style.display = 'block';
    
    // Event listeners pour les outils de dessin
    const tools = panel.querySelectorAll('.travaux-draw-tool');
    tools.forEach(tool => {
      tool.addEventListener('click', () => {
        const toolType = tool.dataset.tool;
        activateDrawTool(toolType);
        
        // Marquer l'outil comme actif
        tools.forEach(t => t.classList.remove('active'));
        tool.classList.add('active');
      });
    });
    
    // Event listeners pour les boutons d'action
    const finishBtn = panel.querySelector('#travaux-finish-drawing');
    const cancelBtn = panel.querySelector('#travaux-cancel-drawing');
    
    if (finishBtn) finishBtn.addEventListener('click', finishDrawing);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelDrawing);
  }
  
  // Icône par défaut pour les travaux
  const DEFAULT_TRAVAUX_ICON = 'fa-solid fa-helmet-safety';
  
  // Preset d'icônes travaux pour le sélecteur rapide
  const TRAVAUX_ICON_PRESETS = [
    { icon: 'fa-solid fa-helmet-safety', label: 'Casque' },
    { icon: 'fa-solid fa-road-barrier', label: 'Barrière' },
    { icon: 'fa-solid fa-triangle-exclamation', label: 'Attention' },
    { icon: 'fa-solid fa-hammer', label: 'Marteau' },
    { icon: 'fa-solid fa-wrench', label: 'Clé' },
    { icon: 'fa-solid fa-truck-pickup', label: 'Camion' },
    { icon: 'fa-solid fa-trowel', label: 'Truelle' },
    { icon: 'fa-solid fa-gears', label: 'Engrenages' },
    { icon: 'fa-solid fa-plug', label: 'Électricité' },
    { icon: 'fa-solid fa-droplet', label: 'Eau' },
    { icon: 'fa-solid fa-fire-flame-simple', label: 'Gaz' },
    { icon: 'fa-solid fa-tree', label: 'Espaces verts' }
  ];
  
  function createTravauxMarkerIcon(iconClass = DEFAULT_TRAVAUX_ICON) {
    return window.createCustomMarkerIcon(null, iconClass, 'var(--color-warning)');
  }
  
  /**
   * Active un outil de dessin spécifique
   */
  function activateDrawTool(toolType) {
    if (!window.MapModule?.map || !drawnItems) return;
    
    const map = window.MapModule.map;
    
    // Utiliser le marker travaux avec le même design que les markers enregistrés
    const customMarkerIcon = createTravauxMarkerIcon();
    
    // Options de dessin par défaut
    const drawOptions = {
      polyline: {
        shapeOptions: {
          color: '#3388ff',
          weight: 4
        }
      },
      polygon: {
        shapeOptions: {
          color: '#3388ff'
        }
      },
      marker: {
        icon: customMarkerIcon
      }
    };
    
    // Activer l'outil correspondant
    switch(toolType) {
      case 'polyline':
        new L.Draw.Polyline(map, drawOptions.polyline).enable();
        break;
      case 'polygon':
        new L.Draw.Polygon(map, drawOptions.polygon).enable();
        break;
      case 'marker':
        new L.Draw.Marker(map, drawOptions.marker).enable();
        break;
    }
  }
  
  /**
   * Gère la création d'une feature
   */
  function handleDrawCreated(e) {
    const layer = e.layer;
    
    // Si c'est un marker, appliquer l'icône travaux unifiée
    if (layer instanceof L.Marker) {
      layer.setIcon(createTravauxMarkerIcon());
    }
    
    drawnItems.addLayer(layer);
    currentFeatures.push(layer.toGeoJSON());
    
    // Activer le bouton "Continuer" et mettre à jour le feedback
    updateDrawingUI();
  }
  
  /**
   * Gère l'édition de features
   */
  function handleDrawEdited(e) {
    currentFeatures = [];
    drawnItems.eachLayer(layer => {
      currentFeatures.push(layer.toGeoJSON());
    });
    updateDrawingUI();
  }
  
  /**
   * Gère la suppression de features
   */
  function handleDrawDeleted(e) {
    currentFeatures = [];
    drawnItems.eachLayer(layer => {
      currentFeatures.push(layer.toGeoJSON());
    });
    updateDrawingUI();
  }
  
  /**
   * Met à jour l'UI du panel de dessin selon l'état
   */
  function updateDrawingUI() {
    const finishBtn = document.getElementById('travaux-finish-drawing');
    const helpText = document.querySelector('.travaux-drawing-help span');
    
    if (!finishBtn) return;
    
    if (currentFeatures.length > 0) {
      finishBtn.disabled = false;
      if (helpText) {
        helpText.innerHTML = `<strong>${currentFeatures.length}</strong> forme(s) dessinée(s). Cliquez sur "Continuer" pour renseigner les informations.`;
      }
    } else {
      finishBtn.disabled = true;
      if (helpText) {
        helpText.textContent = 'Cliquez sur un outil puis dessinez sur la carte. Vous pouvez dessiner plusieurs formes.';
      }
    }
  }
  
  /**
   * Termine le dessin et ouvre le formulaire (ÉTAPE 2)
   */
  function finishDrawing() {
    if (currentFeatures.length === 0) {
      if (window.ContribUtils?.showToast) {
        window.ContribUtils.showToast('Veuillez dessiner au moins une géométrie sur la carte.', 'error');
      }
      return;
    }
    
    // Retirer le mode dessin
    stopDrawingMode();
    
    // Ouvrir la modale avec le formulaire
    showFormModal();
  }
  
  /**
   * Annule le dessin
   */
  function cancelDrawing() {
    if (confirm(MESSAGES.CANCEL_CONFIRM)) {
      stopDrawingMode();
      drawnItems.clearLayers();
      currentFeatures = [];
    }
  }
  
  /**
   * Désactive le mode dessin
   */
  function stopDrawingMode() {
    isDrawingMode = false;
    
    // Retirer les listeners de dessin
    if (window.MapModule?.map) {
      window.MapModule.map.off(L.Draw.Event.CREATED, handleDrawCreated);
      window.MapModule.map.off(L.Draw.Event.EDITED, handleDrawEdited);
      window.MapModule.map.off(L.Draw.Event.DELETED, handleDrawDeleted);
    }
    
    // Cacher le panel de dessin
    const panel = document.getElementById('travaux-drawing-panel');
    if (panel) {
      panel.style.display = 'none';
      
      // Retirer la classe active des outils
      const tools = panel.querySelectorAll('.travaux-draw-tool');
      tools.forEach(t => t.classList.remove('active'));
    }
    
    // Réafficher les filtres
    const filtersUX = document.getElementById('travaux-filters-ux');
    if (filtersUX) {
      filtersUX.style.display = '';
    }
  }
  
  /**
   * Vérifie l'authentification et les permissions
   */
  async function checkAuth() {
    try {
      const { data: { session } } = await window.supabaseService?.getClient()?.auth.getSession();
      if (!session?.user) return false;
      
      // Utiliser les variables globales définies par contrib.js (depuis table profiles)
      const role = window.__CONTRIB_ROLE || '';
      const userVilles = window.__CONTRIB_VILLES || [];
      const activeCity = (typeof window.getActiveCity === 'function') ? window.getActiveCity() : window.activeCity;
      
      // Vérifier si admin
      const isAdmin = role === 'admin';
      if (!isAdmin) return false;
      
      // Admin global: ville contient 'global'
      const isGlobalAdmin = Array.isArray(userVilles) && userVilles.includes('global');
      
      // Admin de la ville spécifique
      const isCityAdmin = Array.isArray(userVilles) && userVilles.includes(activeCity);
      
      return isGlobalAdmin || isCityAdmin;
    } catch (err) {
      console.error('[TravauxEditor] Erreur vérification auth:', err);
      return false;
    }
  }
  
  /**
   * Initialise le sélecteur d'icône avec presets et picker
   * @param {HTMLElement} overlay - L'overlay du modal
   */
  function initIconSelector(overlay) {
    const iconInput = overlay.querySelector('#travaux-icon');
    const previewIcon = overlay.querySelector('#travaux-icon-preview-icon');
    const presetsContainer = overlay.querySelector('#travaux-icon-presets-container');
    const openPickerBtn = overlay.querySelector('#travaux-open-icon-picker');
    
    if (!iconInput || !previewIcon || !presetsContainer) return;
    
    // Fonction pour mettre à jour la preview
    function updatePreview(iconClass) {
      iconInput.value = iconClass;
      previewIcon.className = iconClass;
      
      // Mettre à jour l'état actif des presets
      presetsContainer.querySelectorAll('.travaux-icon-preset').forEach(btn => {
        btn.classList.toggle('travaux-icon-preset--active', btn.dataset.icon === iconClass);
      });
    }
    
    // Générer les boutons presets
    presetsContainer.innerHTML = TRAVAUX_ICON_PRESETS.map(preset => `
      <button type="button" 
        class="travaux-icon-preset ${preset.icon === DEFAULT_TRAVAUX_ICON ? 'travaux-icon-preset--active' : ''}" 
        data-icon="${preset.icon}" 
        title="${preset.label}">
        <i class="${preset.icon}"></i>
      </button>
    `).join('');
    
    // Event listeners pour les presets
    presetsContainer.querySelectorAll('.travaux-icon-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        updatePreview(btn.dataset.icon);
      });
    });
    
    // Bouton pour ouvrir le picker complet
    if (openPickerBtn && window.GPIconPicker) {
      openPickerBtn.addEventListener('click', () => {
        window.GPIconPicker.open(iconInput, (selectedIcon) => {
          updatePreview(selectedIcon);
        });
      });
    }
    
    // Écouter les changements sur l'input (depuis le picker)
    iconInput.addEventListener('change', () => {
      updatePreview(iconInput.value);
    });
  }
  
  /**
   * Initialise le sélecteur d'icône pour le mode édition
   * @param {HTMLElement} overlay - L'overlay du modal
   * @param {string} currentIcon - L'icône actuelle du chantier
   */
  function initIconSelectorEdit(overlay, currentIcon) {
    const iconInput = overlay.querySelector('#travaux-icon-edit');
    const previewIcon = overlay.querySelector('#travaux-icon-preview-icon-edit');
    const presetsContainer = overlay.querySelector('#travaux-icon-presets-container-edit');
    const openPickerBtn = overlay.querySelector('#travaux-open-icon-picker-edit');
    
    if (!iconInput || !previewIcon || !presetsContainer) return;
    
    // Fonction pour mettre à jour la preview
    function updatePreview(iconClass) {
      iconInput.value = iconClass;
      previewIcon.className = iconClass;
      
      // Mettre à jour l'état actif des presets
      presetsContainer.querySelectorAll('.travaux-icon-preset').forEach(btn => {
        btn.classList.toggle('travaux-icon-preset--active', btn.dataset.icon === iconClass);
      });
    }
    
    // Générer les boutons presets
    presetsContainer.innerHTML = TRAVAUX_ICON_PRESETS.map(preset => `
      <button type="button" 
        class="travaux-icon-preset ${preset.icon === currentIcon ? 'travaux-icon-preset--active' : ''}" 
        data-icon="${preset.icon}" 
        title="${preset.label}">
        <i class="${preset.icon}"></i>
      </button>
    `).join('');
    
    // Pré-remplir avec l'icône actuelle
    updatePreview(currentIcon);
    
    // Event listeners pour les presets
    presetsContainer.querySelectorAll('.travaux-icon-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        updatePreview(btn.dataset.icon);
      });
    });
    
    // Bouton pour ouvrir le picker complet
    if (openPickerBtn && window.GPIconPicker) {
      openPickerBtn.addEventListener('click', () => {
        window.GPIconPicker.open(iconInput, (selectedIcon) => {
          updatePreview(selectedIcon);
        });
      });
    }
    
    // Écouter les changements sur l'input (depuis le picker)
    iconInput.addEventListener('change', () => {
      updatePreview(iconInput.value);
    });
  }
  
  /**
   * Affiche la modale de formulaire (ÉTAPE 2)
   */
  function showFormModal() {
    // Créer l'overlay si nécessaire
    let overlay = document.getElementById('travaux-form-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'travaux-form-overlay';
      overlay.className = 'gp-modal-overlay gp-modal--glass';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'travaux-form-title');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = `
        <div class="gp-modal gp-modal--large" role="document">
          <header class="gp-modal-header">
            <div class="modal-header-content">
              <div class="modal-icon">
                <i class="fa-solid fa-helmet-safety"></i>
              </div>
              <div>
                <h1 class="gp-modal-title" id="travaux-form-title">Informations du chantier</h1>
                <p class="gp-modal-subtitle">Renseignez les informations du chantier</p>
              </div>
            </div>
            <button class="btn-secondary gp-modal-close" aria-label="Fermer">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </header>
          <div class="gp-modal-body">
            <form id="travaux-editor-form" class="travaux-form">
              <!-- Informations principales -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-circle-info"></i>
                  Informations principales
                </h3>
                <div class="form-grid">
                  <div class="form-field form-field--full">
                    <label for="travaux-name" class="form-label">
                      <span class="label-text">Nom du chantier</span>
                      <span class="label-required">*</span>
                    </label>
                    <input 
                      type="text" 
                      id="travaux-name" 
                      name="name" 
                      class="form-input" 
                      required 
                      placeholder="Ex: Rénovation Rue de la République"
                      autocomplete="off"
                    >
                  </div>
                  
                  <div class="form-field">
                    <label for="travaux-nature" class="form-label">
                      <span class="label-text">Nature des travaux</span>
                    </label>
                    <input 
                      type="text" 
                      id="travaux-nature" 
                      name="nature" 
                      class="form-input" 
                      placeholder="Ex: Réfection de chaussée"
                      list="nature-suggestions"
                    >
                    <datalist id="nature-suggestions">
                      <option value="Réfection de chaussée">
                      <option value="Travaux de voirie">
                      <option value="Réseaux (eau, gaz, électricité)">
                      <option value="Aménagement urbain">
                      <option value="Construction">
                    </datalist>
                  </div>
                  
                  <div class="form-field">
                    <label for="travaux-etat" class="form-label">
                      <span class="label-text">État d'avancement</span>
                    </label>
                    <select id="travaux-etat" name="etat" class="form-select">
                      <option value="">Non spécifié</option>
                      <option value="Prochain">🟡 Prochain</option>
                      <option value="Ouvert">🔴 En cours</option>
                      <option value="Terminé">🟢 Terminé</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <!-- Icône du marqueur -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-icons"></i>
                  Icône du marqueur
                </h3>
                <div class="form-field">
                  <label class="form-label">
                    <span class="label-text">Choisissez une icône pour identifier ce chantier sur la carte</span>
                  </label>
                  
                  <!-- Input caché pour stocker l'icône -->
                  <input type="hidden" id="travaux-icon" name="icon" value="fa-solid fa-helmet-safety">
                  
                  <!-- Prévisualisation + Presets -->
                  <div class="travaux-icon-selector">
                    <!-- Preview du marker -->
                    <div class="travaux-icon-preview">
                      <div class="gp-custom-marker" style="--marker-color: var(--color-warning);">
                        <i id="travaux-icon-preview-icon" class="fa-solid fa-helmet-safety"></i>
                      </div>
                      <span class="travaux-icon-preview-label">Aperçu</span>
                    </div>
                    
                    <!-- Presets rapides -->
                    <div class="travaux-icon-presets" id="travaux-icon-presets-container"></div>
                    
                    <!-- Bouton pour ouvrir le picker complet -->
                    <button type="button" class="btn-secondary btn-small" id="travaux-open-icon-picker">
                      <i class="fa-solid fa-ellipsis"></i>
                      Plus d'icônes
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Période -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-calendar-days"></i>
                  Période des travaux
                </h3>
                <div class="form-grid form-grid--2">
                  <div class="form-field">
                    <label for="travaux-date-debut" class="form-label">
                      <span class="label-text">Date de début</span>
                    </label>
                    <input 
                      type="date" 
                      id="travaux-date-debut" 
                      name="date_debut" 
                      class="form-input"
                    >
                  </div>
                  
                  <div class="form-field">
                    <label for="travaux-date-fin" class="form-label">
                      <span class="label-text">Date de fin (prévue)</span>
                    </label>
                    <input 
                      type="date" 
                      id="travaux-date-fin" 
                      name="date_fin" 
                      class="form-input"
                    >
                  </div>
                </div>
              </div>
              
              <!-- Localisation et description -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-location-dot"></i>
                  Localisation et détails
                </h3>
                <div class="form-grid">
                  <div class="form-field form-field--full">
                    <label for="travaux-localisation" class="form-label">
                      <span class="label-text">Localisation</span>
                    </label>
                    <input 
                      type="text" 
                      id="travaux-localisation" 
                      name="localisation" 
                      class="form-input" 
                      placeholder="Ex: Lyon 6e, Rue Victor Hugo"
                    >
                  </div>
                  
                  <div class="form-field form-field--full">
                    <label for="travaux-description" class="form-label">
                      <span class="label-text">Description</span>
                      <span class="label-hint">Détails supplémentaires sur les travaux</span>
                    </label>
                    <textarea 
                      id="travaux-description" 
                      name="description" 
                      class="form-textarea" 
                      rows="4" 
                      placeholder="Décrivez les travaux, leur impact, les déviations éventuelles..."
                    ></textarea>
                  </div>
                </div>
              </div>
              
              <!-- Statut de sauvegarde -->
              <div id="travaux-editor-status" class="form-status" style="display:none;"></div>
              
              <!-- Actions -->
              <div class="form-actions">
                <button type="button" class="btn-secondary btn-large" id="travaux-form-cancel">
                  <i class="fa-solid fa-xmark"></i>
                  <span>Annuler</span>
                </button>
                <button type="submit" class="btn-primary btn-large" id="travaux-save">
                  <i class="fa-solid fa-floppy-disk"></i>
                  <span>Enregistrer le chantier</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      
      // Event listeners
      overlay.querySelector('#travaux-editor-form').addEventListener('submit', handleSave);
      
      // Bouton Annuler
      overlay.querySelector('#travaux-form-cancel').addEventListener('click', () => {
        if (confirm(MESSAGES.CANCEL_CONFIRM)) {
          closeFormModal();
          drawnItems.clearLayers();
          currentFeatures = [];
        }
      });
      
      // Croix de fermeture
      overlay.querySelector('.gp-modal-close').addEventListener('click', () => {
        if (confirm(MESSAGES.CANCEL_CONFIRM)) {
          closeFormModal();
          drawnItems.clearLayers();
          currentFeatures = [];
        }
      });
      
      // ===== SÉLECTEUR D'ICÔNE =====
      initIconSelector(overlay);
    }
    
    // Ouvrir avec ModalHelper
    if (window.ModalHelper) {
      window.ModalHelper.open('travaux-form-overlay', {
        dismissible: false, // Forcer à utiliser les boutons
        onClose: () => {
          // Nettoyer si fermé
          const form = document.getElementById('travaux-editor-form');
          if (form) form.reset();
        }
      });
    }
  }
  
  /**
   * Ferme la modale de formulaire
   */
  function closeFormModal() {
    if (window.ModalHelper) {
      window.ModalHelper.close('travaux-form-overlay');
    }
  }
  
  /**
   * Gère la sauvegarde
   */
  async function handleSave(e) {
    e.preventDefault();
    
    const statusEl = document.getElementById('travaux-editor-status');
    const saveBtn = document.getElementById('travaux-save');
    
    try {
      // Les géométries ont déjà été dessinées à l'étape 1
      if (currentFeatures.length === 0) {
        showStatus('Erreur: aucune géométrie trouvée.', 'error');
        return;
      }
      
      // Récupérer les données du formulaire
      const formData = new FormData(e.target);
      const data = {
        name: formData.get('name'),
        nature: formData.get('nature') || '',
        etat: formData.get('etat') || '',
        date_debut: formData.get('date_debut') || null,
        date_fin: formData.get('date_fin') || null,
        localisation: formData.get('localisation') || '',
        description: formData.get('description') || '',
        icon: formData.get('icon') || DEFAULT_TRAVAUX_ICON
      };
      
      // Validation
      if (!data.name || data.name.trim() === '') {
        showStatus('Le nom du chantier est obligatoire.', 'error');
        return;
      }
      
      // Désactiver le bouton
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';
      showStatus('Enregistrement en cours...', 'info');
      
      // Construire le FeatureCollection
      const geojson = {
        type: 'FeatureCollection',
        features: currentFeatures
      };
      
      // Récupérer la ville active
      const activeCity = (typeof window.getActiveCity === 'function') ? window.getActiveCity() : window.activeCity;
      if (!activeCity) {
        throw new Error('Ville active non définie');
      }
      
      // Upload du GeoJSON
      showStatus('Upload du GeoJSON...', 'info');
      const geojsonUrl = await window.supabaseService.uploadTravauxGeoJSON(activeCity, geojson);
      
      // Créer l'entrée city_travaux
      showStatus('Création de l\'entrée...', 'info');
      const chantierData = {
        ville: activeCity,
        name: data.name.trim(),
        geojson_url: geojsonUrl,
        nature: data.nature,
        etat: data.etat,
        date_debut: data.date_debut,
        date_fin: data.date_fin,
        localisation: data.localisation,
        description: data.description,
        icon: data.icon,
        approved: true // Admin peut publier directement
      };
      
      await window.supabaseService.createCityTravaux(chantierData);
      
      showStatus(MESSAGES.SAVE_SUCCESS, 'success');
      
      // Recharger immédiatement la couche travaux comme pour la suppression
      setTimeout(async () => {
        try {
          // Nettoyer les features dessinées
          drawnItems.clearLayers();
          currentFeatures = [];
          
          // Fermer la modale
          closeFormModal();
          
          // Recharger la couche travaux (méode simple comme suppression)
          if (window.DataModule?.reloadLayer) {
            await window.DataModule.reloadLayer('travaux');
          }
          
          // Afficher un message de succès
          if (window.ContribUtils?.showToast) {
            window.ContribUtils.showToast('Chantier créé avec succès', 'success');
          }
        } catch (err) {
          console.error('[TravauxEditor] Erreur rechargement:', err);
        }
      }, 500); // Délai réduit pour mise à jour plus rapide
      
    } catch (err) {
      console.error('[TravauxEditor] Erreur sauvegarde:', err);
      showStatus(MESSAGES.SAVE_ERROR, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer';
    }
  }
  
  /**
   * Affiche un message de statut
   */
  function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('travaux-editor-status');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.style.padding = '1em';
    statusEl.style.borderRadius = '8px';
    statusEl.style.background = type === 'error' ? 'var(--danger-alpha-10)' : 
                                 type === 'success' ? 'var(--success-alpha-10)' : 
                                 'var(--info-alpha-10)';
    statusEl.style.color = type === 'error' ? 'var(--danger)' : 
                           type === 'success' ? 'var(--success)' : 
                           'var(--info)';
  }
  
  /**
   * Ouvre l'éditeur en mode modification pour un chantier existant
   * @param {string} chantierId - ID du chantier à modifier
   */
  async function openEditorForEdit(chantierId) {
    try {
      // Récupérer les données du chantier
      const chantier = await window.supabaseService.getCityTravauxById(chantierId);
      
      if (!chantier) {
        if (window.ContribUtils?.showToast) {
          window.ContribUtils.showToast(MESSAGES.CHANTIER_NOT_FOUND, 'error');
        }
        return;
      }
      
      // Vérifier auth
      const authOk = await checkAuth();
      if (!authOk) {
        if (window.ContribUtils?.showToast) {
          window.ContribUtils.showToast(MESSAGES.AUTH_REQUIRED, 'error');
        }
        return;
      }
      
      // Ouvrir directement le formulaire en mode édition (sans dessin)
      openFormModalForEdit(chantier);
      
    } catch (err) {
      console.error('[TravauxEditor] Erreur chargement chantier:', err);
      if (window.ContribUtils?.showToast) {
        window.ContribUtils.showToast(MESSAGES.LOADING_ERROR, 'error');
      }
    }
  }
  
  /**
   * Ouvre le formulaire en mode édition avec les données existantes
   * @param {Object} chantier - Données du chantier à modifier
   */
  function openFormModalForEdit(chantier) {
    // Supprimer l'overlay existant pour éviter les problèmes d'event listeners
    // (le chantierId est capturé en closure lors de la création)
    let overlay = document.getElementById('travaux-form-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    // Recréer la modale à chaque ouverture pour avoir le bon chantierId
    overlay = document.createElement('div');
    overlay.id = 'travaux-form-overlay';
    overlay.className = 'gp-modal-overlay';
    overlay.innerHTML = `
        <div class="gp-modal gp-modal--large">
          <div class="gp-modal-header">
            <div class="gp-modal-title">
              <i class="fa-solid fa-pen-to-square"></i>
              Modifier le chantier
            </div>
            <button class="btn-secondary gp-modal-close" aria-label="Fermer">×</button>
          </div>
          <div class="gp-modal-body">
            <!-- Message d'information sur le tracé -->
            <div class="form-alert form-alert--warning" style="margin-bottom: 24px;">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <div>
                <strong>Modification du tracé impossible</strong>
                <p>Pour modifier le tracé géographique du chantier, vous devez le supprimer puis en créer un nouveau. Vous pouvez uniquement modifier les informations ci-dessous.</p>
              </div>
            </div>
            
            <form id="travaux-editor-form" class="form-modern">
              <!-- Informations générales -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-circle-info"></i>
                  Informations générales
                </h3>
                <div class="form-grid">
                  <div class="form-field form-field--full">
                    <label for="travaux-name" class="form-label">
                      <span class="label-text">Nom du chantier</span>
                      <span class="label-required">*</span>
                    </label>
                    <input 
                      type="text" 
                      id="travaux-name" 
                      name="name" 
                      class="form-input" 
                      placeholder="Ex: Réfection de la chaussée" 
                      required
                    >
                  </div>
                  
                  <div class="form-field">
                    <label for="travaux-nature" class="form-label">
                      <span class="label-text">Nature des travaux</span>
                    </label>
                    <input 
                      type="text" 
                      id="travaux-nature" 
                      name="nature" 
                      class="form-input" 
                      list="nature-suggestions"
                      placeholder="Ex: Voirie, Réseau..."
                    >
                    <datalist id="nature-suggestions">
                      <option value="Voirie">
                      <option value="Réseau">
                      <option value="Assainissement">
                      <option value="Éclairage public">
                      <option value="Espaces verts">
                      <option value="Bâtiment">
                    </datalist>
                  </div>
                  
                  <div class="form-field">
                    <label for="travaux-etat" class="form-label">
                      <span class="label-text">État d'avancement</span>
                    </label>
                    <select id="travaux-etat" name="etat" class="form-select">
                      <option value="">Non spécifié</option>
                      <option value="Prochain">🟡 Prochain</option>
                      <option value="Ouvert">🔴 En cours</option>
                      <option value="Terminé">🟢 Terminé</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <!-- Icône du marqueur -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-icons"></i>
                  Icône du marqueur
                </h3>
                <div class="form-field">
                  <label class="form-label">
                    <span class="label-text">Choisissez une icône pour identifier ce chantier sur la carte</span>
                  </label>
                  
                  <!-- Input caché pour stocker l'icône -->
                  <input type="hidden" id="travaux-icon-edit" name="icon" value="fa-solid fa-helmet-safety">
                  
                  <!-- Prévisualisation + Presets -->
                  <div class="travaux-icon-selector">
                    <!-- Preview du marker -->
                    <div class="travaux-icon-preview">
                      <div class="gp-custom-marker" style="--marker-color: var(--color-warning);">
                        <i id="travaux-icon-preview-icon-edit" class="fa-solid fa-helmet-safety"></i>
                      </div>
                      <span class="travaux-icon-preview-label">Aperçu</span>
                    </div>
                    
                    <!-- Presets rapides -->
                    <div class="travaux-icon-presets" id="travaux-icon-presets-container-edit"></div>
                    
                    <!-- Bouton pour ouvrir le picker complet -->
                    <button type="button" class="btn-secondary btn-small" id="travaux-open-icon-picker-edit">
                      <i class="fa-solid fa-ellipsis"></i>
                      Plus d'icônes
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Période -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-calendar-days"></i>
                  Période des travaux
                </h3>
                <div class="form-grid form-grid--2">
                  <div class="form-field">
                    <label for="travaux-date-debut" class="form-label">
                      <span class="label-text">Date de début</span>
                    </label>
                    <input 
                      type="date" 
                      id="travaux-date-debut" 
                      name="date_debut" 
                      class="form-input"
                    >
                  </div>
                  
                  <div class="form-field">
                    <label for="travaux-date-fin" class="form-label">
                      <span class="label-text">Date de fin (prévue)</span>
                    </label>
                    <input 
                      type="date" 
                      id="travaux-date-fin" 
                      name="date_fin" 
                      class="form-input"
                    >
                  </div>
                </div>
              </div>
              
              <!-- Localisation et description -->
              <div class="form-section">
                <h3 class="form-section-title">
                  <i class="fa-solid fa-location-dot"></i>
                  Localisation et détails
                </h3>
                <div class="form-grid">
                  <div class="form-field form-field--full">
                    <label for="travaux-localisation" class="form-label">
                      <span class="label-text">Localisation</span>
                    </label>
                    <input 
                      type="text" 
                      id="travaux-localisation" 
                      name="localisation" 
                      class="form-input" 
                      placeholder="Ex: Lyon 6e, Rue Victor Hugo"
                    >
                  </div>
                  
                  <div class="form-field form-field--full">
                    <label for="travaux-description" class="form-label">
                      <span class="label-text">Description</span>
                      <span class="label-hint">Détails supplémentaires sur les travaux</span>
                    </label>
                    <textarea 
                      id="travaux-description" 
                      name="description" 
                      class="form-textarea" 
                      rows="4" 
                      placeholder="Décrivez les travaux, leur impact, les déviations éventuelles..."
                    ></textarea>
                  </div>
                </div>
              </div>
              
              <!-- Statut de sauvegarde -->
              <div id="travaux-editor-status" class="form-status" style="display:none;"></div>
              
              <!-- Actions -->
              <div class="form-actions">
                <button type="button" class="btn-secondary btn-large" id="travaux-form-cancel">
                  <i class="fa-solid fa-xmark"></i>
                  <span>Annuler</span>
                </button>
                <button type="submit" class="btn-primary btn-large" id="travaux-save">
                  <i class="fa-solid fa-floppy-disk"></i>
                  <span>Enregistrer les modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    // Event listeners
    overlay.querySelector('#travaux-editor-form').addEventListener('submit', (e) => handleUpdate(e, chantier.id));
    
    // Bouton Annuler
    overlay.querySelector('#travaux-form-cancel').addEventListener('click', () => {
      if (confirm(MESSAGES.CANCEL_EDIT_CONFIRM)) {
        closeFormModal();
      }
    });
    
    // Croix de fermeture
    overlay.querySelector('.gp-modal-close').addEventListener('click', () => {
      if (confirm(MESSAGES.CANCEL_EDIT_CONFIRM)) {
        closeFormModal();
      }
    });
    
    // Pré-remplir le formulaire avec les données existantes
    const form = overlay.querySelector('#travaux-editor-form');
    if (form) {
      form.querySelector('#travaux-name').value = chantier.name || '';
      form.querySelector('#travaux-nature').value = chantier.nature || '';
      form.querySelector('#travaux-etat').value = chantier.etat || '';
      form.querySelector('#travaux-date-debut').value = chantier.date_debut || '';
      form.querySelector('#travaux-date-fin').value = chantier.date_fin || '';
      form.querySelector('#travaux-localisation').value = chantier.localisation || '';
      form.querySelector('#travaux-description').value = chantier.description || '';
    }
    
    // Initialiser le sélecteur d'icône pour le mode édition
    initIconSelectorEdit(overlay, chantier.icon || DEFAULT_TRAVAUX_ICON);
    
    // Ouvrir avec ModalHelper
    if (window.ModalHelper) {
      window.ModalHelper.open('travaux-form-overlay', {
        dismissible: false,
        onClose: () => {
          const form = document.getElementById('travaux-editor-form');
          if (form) form.reset();
        }
      });
    }
  }
  
  /**
   * Gère la mise à jour d'un chantier existant
   */
  async function handleUpdate(e, chantierId) {
    e.preventDefault();
    
    const statusEl = document.getElementById('travaux-editor-status');
    const saveBtn = document.getElementById('travaux-save');
    
    try {
      // Récupérer les données du formulaire
      const formData = new FormData(e.target);
      const data = {
        name: formData.get('name'),
        nature: formData.get('nature') || '',
        etat: formData.get('etat') || '',
        date_debut: formData.get('date_debut') || null,
        date_fin: formData.get('date_fin') || null,
        localisation: formData.get('localisation') || '',
        description: formData.get('description') || '',
        icon: formData.get('icon') || DEFAULT_TRAVAUX_ICON
      };
      
      // Validation
      if (!data.name || data.name.trim() === '') {
        showStatus('Le nom du chantier est obligatoire.', 'error');
        return;
      }
      
      // Désactiver le bouton
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';
      showStatus('Enregistrement en cours...', 'info');
      
      // Mettre à jour dans la base de données
      await window.supabaseService.updateCityTravaux(chantierId, data);
      
      showStatus(MESSAGES.UPDATE_SUCCESS, 'success');
      
      // Recharger la couche et fermer (même logique que suppression)
      try {
        closeFormModal();
        
        // Recharger la couche travaux
        if (window.DataModule?.reloadLayer) {
          await window.DataModule.reloadLayer('travaux');
        }
        
        // Afficher un message de succès
        if (window.ContribUtils?.showToast) {
          window.ContribUtils.showToast('Chantier modifié avec succès', 'success');
        }
      } catch (err) {
        console.error('[TravauxEditor] Erreur rechargement:', err);
      }
      
    } catch (err) {
      console.error('[TravauxEditor] Erreur mise à jour:', err);
      showStatus(MESSAGES.UPDATE_ERROR, 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Enregistrer les modifications</span>';
    }
  }
  
  // API publique
  return {
    openEditor,
    openEditorForEdit
  };
})();

// Exposer globalement
window.TravauxEditorModule = TravauxEditorModule;
