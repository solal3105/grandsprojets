// modules/contrib/contrib-geometry.js
// Gestion de la géométrie (upload GeoJSON, validation, mode de saisie)

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let currentGeomMode = 'file'; // 'file' ou 'draw'
  let editGeojsonUrl = null; // URL du GeoJSON en mode édition

  // ============================================================================
  // GEOMETRY MODE MANAGEMENT
  // ============================================================================

  /**
   * Définit le mode de saisie de géométrie
   * @param {string} mode - 'file' ou 'draw'
   * @param {Object} elements - Éléments DOM nécessaires
   */
  function setGeomMode(mode, elements) {
    const { 
      geomModeRadios, 
      fileRowEl, 
      drawPanelEl, 
      geomCardFile, 
      geomCardDraw,
      fileInput 
    } = elements || {};

    currentGeomMode = mode;
    console.log('[contrib-geometry] setGeomMode:', mode);

    // Sync radios
    try {
      if (geomModeRadios && geomModeRadios.length) {
        geomModeRadios.forEach(r => {
          r.checked = (r.value === mode);
        });
      }
    } catch(_) {}

    // Sync cards visual state
    try {
      if (geomCardFile) {
        geomCardFile.classList.toggle('is-active', mode === 'file');
        geomCardFile.setAttribute('aria-pressed', mode === 'file' ? 'true' : 'false');
      }
      if (geomCardDraw) {
        geomCardDraw.classList.toggle('is-active', mode === 'draw');
        geomCardDraw.setAttribute('aria-pressed', mode === 'draw' ? 'true' : 'false');
      }
    } catch(e) {
      console.warn('[contrib-geometry] Error updating cards:', e);
    }

    if (mode === 'draw') {
      // Mode dessin
      if (fileInput) { 
        fileInput.required = false; 
        fileInput.disabled = true; 
      }
      if (fileRowEl) fileRowEl.style.display = 'none';
      if (drawPanelEl) {
        drawPanelEl.style.display = '';
        setTimeout(async () => {
          try { 
            drawPanelEl.classList.add('reveal'); 
            // Ensure map is initialized
            if (win.ContribMap?.initDrawMap) {
              const drawMapContainerId = 'contrib-draw-map';
              const cityEl = document.getElementById('contrib-city');
              await win.ContribMap.initDrawMap(drawMapContainerId, drawPanelEl, cityEl);
            }
            
            // Si on a un GeoJSON d'édition, le recharger APRÈS l'init de la carte
            if (editGeojsonUrl) {
              console.log('[contrib-geometry] Reloading edit GeoJSON on mode switch:', editGeojsonUrl);
              // Attendre que la carte soit vraiment prête
              setTimeout(async () => {
                try {
                  const response = await fetch(editGeojsonUrl);
                  if (!response.ok) throw new Error('Failed to fetch GeoJSON');
                  const gj = await response.json();
                  
                  if (win.ContribMap?.setDrawnGeometry) {
                    win.ContribMap.setDrawnGeometry(gj);
                    console.log('[contrib-geometry] GeoJSON reloaded successfully');
                  }
                } catch(err) {
                  console.warn('[contrib-geometry] Error reloading GeoJSON:', err);
                }
              }, 500); // Augmenté le délai pour laisser la carte se stabiliser
            }
          } catch(_) {}
        }, 50);
      }
    } else {
      // Mode fichier
      if (fileInput) { 
        fileInput.required = true; 
        fileInput.disabled = false; 
      }
      if (fileRowEl) {
        fileRowEl.style.display = '';
      }
      
      // Réafficher la dropzone (enlever la classe has-file si pas de fichier)
      const dropzoneEl = elements.dropzoneEl || document.getElementById('contrib-dropzone');
      if (dropzoneEl) {
        const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;
        dropzoneEl.classList.toggle('has-file', hasFile);
        console.log('[contrib-geometry] Dropzone state:', hasFile ? 'has-file' : 'empty');
      }
      
      if (drawPanelEl) { 
        drawPanelEl.style.display = 'none'; 
        drawPanelEl.classList.remove('reveal'); 
      }
      // NE PAS effacer les dessins en mode édition (on doit pouvoir switch entre les modes)
      // On nettoie seulement si on est en création et qu'on n'a pas de GeoJSON d'édition
      if (!editGeojsonUrl) {
        try { 
          clearAllDrawings(); 
        } catch(_) {}
      }
      try {
        if (win.ContribMap?.cancelManualDraw) {
          win.ContribMap.cancelManualDraw(true);
        }
        const manualTb = drawPanelEl && drawPanelEl.querySelector('#contrib-manual-draw-controls');
        if (manualTb) manualTb.style.display = 'none';
      } catch(_) {}
    }
  }

  /**
   * Récupère le mode de géométrie actuel
   * @returns {string} 'file' ou 'draw'
   */
  function getCurrentGeomMode() {
    return currentGeomMode;
  }

  // ============================================================================
  // DRAWING MANAGEMENT
  // ============================================================================

  /**
   * Efface tous les dessins sur la carte
   */
  function clearAllDrawings() {
    if (win.ContribMap?.clearManualGeometry) {
      win.ContribMap.clearManualGeometry();
    }
  }

  /**
   * Précharge une géométrie existante sur la carte (mode édition)
   * @param {string} url - URL du GeoJSON à charger
   * @param {Object} elements - Éléments DOM nécessaires
   */
  async function preloadGeometryOnMap(url, elements) {
    try {
      if (win.ContribUtils?.setStatus) {
        win.ContribUtils.setStatus('Chargement de la géométrie…');
      }

      // Stocker l'URL pour préserver les données lors des changements de mode
      setEditGeojsonUrl(url);

      // Switch UI to draw mode and ensure map exists
      setGeomMode('draw', elements);

      // Important: wait for the map to be initialized before adding layers
      const drawMapContainerId = 'contrib-draw-map';
      const { drawPanelEl, cityEl } = elements || {};
      
      if (win.ContribMap?.initDrawMap) {
        await win.ContribMap.initDrawMap(drawMapContainerId, drawPanelEl, cityEl);
      }

      // Nettoyer et afficher uniquement la géométrie existante
      try { clearAllDrawings(); } catch(_) {}

      const resp = await fetch(url);
      if (!resp.ok) throw new Error('GeoJSON non accessible');
      
      const gj = await resp.json();

      if (win.ContribMap?.setDrawnGeometry) {
        win.ContribMap.setDrawnGeometry(gj);
      }

      if (win.ContribUtils?.setStatus) {
        win.ContribUtils.setStatus('Géométrie chargée depuis la contribution.', 'success');
      }
    } catch (err) {
      console.warn('[contrib-geometry] preloadGeometryOnMap error:', err);
      if (win.ContribUtils?.setStatus) {
        win.ContribUtils.setStatus('Impossible de charger la géométrie existante.', 'error');
      }
      if (win.ContribUtils?.showToast) {
        win.ContribUtils.showToast('Impossible de charger la géométrie existante.', 'error');
      }
    }
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Vérifie si une géométrie a été fournie
   * @param {string} mode - Mode de géométrie ('file' ou 'draw')
   * @param {HTMLInputElement} fileInput - Input file pour le GeoJSON
   * @returns {boolean} True si une géométrie est présente
   */
  function hasGeometry(mode, fileInput) {
    if (mode === 'file') {
      return !!(fileInput && fileInput.files && fileInput.files.length > 0);
    }
    // draw mode
    return win.ContribMap?.hasDrawGeometry?.() || false;
  }

  /**
   * Valide l'étape 2 (géométrie)
   * @param {Object} elements - Éléments DOM nécessaires
   * @returns {boolean} True si la validation passe
   */
  function validateStep2(elements) {
    const { geomModeRadios, fileInput } = elements || {};
    const mode = Array.from(geomModeRadios || []).find(r => r.checked)?.value || 'file';
    
    const ok = hasGeometry(mode, fileInput);
    
    if (!ok) {
      const message = mode === 'file' 
        ? 'Veuillez sélectionner un fichier GeoJSON.'
        : 'Veuillez dessiner une géométrie puis terminer.';
      
      if (win.ContribUtils?.showToast) {
        win.ContribUtils.showToast(message, 'error');
      }
    }
    
    return ok;
  }

  // ============================================================================
  // DROPZONE SETUP
  // ============================================================================

  /**
   * Configure la dropzone pour l'upload de GeoJSON
   * @param {Object} elements - Éléments DOM nécessaires
   */
  function setupDropzone(elements) {
    const { dropzoneEl, dzFilenameEl, fileInput } = elements || {};
    
    if (!dropzoneEl || !fileInput) return;

    const openPicker = () => { 
      if (!fileInput.disabled) fileInput.click(); 
    };

    dropzoneEl.addEventListener('click', openPicker);
    dropzoneEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { 
        e.preventDefault(); 
        openPicker(); 
      }
    });

    const updateName = () => {
      const f = fileInput.files && fileInput.files[0];
      if (dzFilenameEl) dzFilenameEl.textContent = f ? f.name : '';
      if (dropzoneEl) dropzoneEl.classList.toggle('has-file', !!f);
    };

    fileInput.addEventListener('change', () => { 
      updateName(); 
      try { 
        validateStep2(elements); 
      } catch(_) {} 
    });

    // Drag & drop
    ['dragenter','dragover'].forEach(ev => dropzoneEl.addEventListener(ev, (e) => {
      e.preventDefault(); 
      e.stopPropagation(); 
      dropzoneEl.classList.add('is-dragover');
    }));

    ['dragleave','dragend','drop'].forEach(ev => dropzoneEl.addEventListener(ev, (e) => {
      e.preventDefault(); 
      e.stopPropagation(); 
      dropzoneEl.classList.remove('is-dragover');
    }));

    dropzoneEl.addEventListener('drop', (e) => {
      const dt = e.dataTransfer; 
      if (!dt) return;
      const files = dt.files; 
      if (!files || !files.length) return;
      if (!fileInput.disabled) { 
        fileInput.files = files; 
        fileInput.dispatchEvent(new Event('change', { bubbles:true })); 
      }
    });
  }

  // ============================================================================
  // GEOJSON PROCESSING
  // ============================================================================

  /**
   * Récupère la géométrie à soumettre (fichier ou dessin)
   * @param {string} mode - Mode de géométrie
   * @param {HTMLInputElement} fileInput - Input file
   * @returns {File|Object|null} Fichier GeoJSON ou objet GeoJSON
   */
  function getGeometryForSubmit(mode, fileInput) {
    if (mode === 'file') {
      return fileInput?.files?.[0] || null;
    }
    // draw mode - return GeoJSON object
    if (win.ContribMap?.getDrawnGeometry) {
      return win.ContribMap.getDrawnGeometry();
    }
    return null;
  }

  /**
   * Réinitialise les inputs de géométrie
   * @param {HTMLInputElement} fileInput - Input file
   */
  function resetGeometryInputs(fileInput) {
    if (fileInput) { 
      try { fileInput.value = ''; } catch(_) {} 
    }
    try { clearAllDrawings(); } catch(_) {}
  }

  // ============================================================================
  // EDIT MODE
  // ============================================================================

  /**
   * Définit l'URL du GeoJSON en mode édition
   * @param {string} url - URL du GeoJSON
   */
  function setEditGeojsonUrl(url) {
    editGeojsonUrl = url;
  }

  /**
   * Récupère l'URL du GeoJSON en mode édition
   * @returns {string|null} URL du GeoJSON
   */
  function getEditGeojsonUrl() {
    return editGeojsonUrl;
  }

  /**
   * Efface l'URL du GeoJSON en mode édition
   */
  function clearEditGeojsonUrl() {
    editGeojsonUrl = null;
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribGeometry = {
    // Mode management
    setGeomMode,
    getCurrentGeomMode,
    
    // Drawing
    clearAllDrawings,
    preloadGeometryOnMap,
    
    // Validation
    hasGeometry,
    validateStep2,
    
    // Dropzone
    setupDropzone,
    
    // GeoJSON processing
    getGeometryForSubmit,
    resetGeometryInputs,
    
    // Edit mode
    setEditGeojsonUrl,
    getEditGeojsonUrl,
    clearEditGeojsonUrl
  };

})(window);
