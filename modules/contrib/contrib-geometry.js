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
            
            // IMPORTANT: Initialiser la toolbar de dessin
            if (win.ContribDrawControls?.initToolbar) {
              console.log('[contrib-geometry] Initializing draw controls toolbar');
              // Le callback est appelé APRÈS updateButtonStates() donc ne pas rappeler updateButtonStates
              // sinon boucle infinie. Ce callback sert à faire des actions externes (ex: mettre à jour d'autres UI)
              win.ContribDrawControls.initToolbar(drawPanelEl, () => {
                // Callback pour notifier les changements d'état (ne PAS appeler updateButtonStates ici)
                console.log('[contrib-geometry] Draw state changed');
              });
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
    } catch (err) {
      console.warn('[contrib-geometry] preloadGeometryOnMap error:', err);
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
    console.log('[contrib-geometry] hasGeometry called:', { 
      mode, 
      fileInput: !!fileInput, 
      hasFiles: !!(fileInput && fileInput.files),
      filesLength: fileInput?.files?.length || 0
    });
    
    if (mode === 'file') {
      const hasFile = !!(fileInput && fileInput.files && fileInput.files.length > 0);
      console.log('[contrib-geometry] Mode file - hasFile:', hasFile);
      return hasFile;
    }
    
    // draw mode
    const hasDrawGeom = win.ContribMap?.hasDrawGeometry?.() || false;
    console.log('[contrib-geometry] Mode draw - hasDrawGeometry:', hasDrawGeom);
    return hasDrawGeom;
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
  // GEOJSON PARSING & PREVIEW
  // ============================================================================

  /**
   * Parse un fichier GeoJSON et retourne l'objet
   * @param {File} file - Fichier GeoJSON
   * @returns {Promise<Object|null>} GeoJSON parsé ou null si invalide
   */
  function parseGeoJSONFile(file) {
    return new Promise((resolve) => {
      if (!file) { resolve(null); return; }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const geojson = JSON.parse(text);
          
          // Valider le GeoJSON
          if (!isValidGeoJSON(geojson)) {
            console.warn('[contrib-geometry] GeoJSON invalide');
            resolve(null);
            return;
          }
          
          // Normaliser en FeatureCollection
          const normalized = normalizeToFeatureCollection(geojson);
          resolve(normalized);
        } catch (err) {
          console.error('[contrib-geometry] Erreur parsing GeoJSON:', err);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  }

  /**
   * Valide un objet GeoJSON
   * @param {Object} geojson - Objet GeoJSON
   * @returns {boolean} True si valide
   */
  function isValidGeoJSON(geojson) {
    if (!geojson || typeof geojson !== 'object') return false;
    if (!geojson.type) return false;
    
    const validTypes = ['Feature', 'FeatureCollection', 'Point', 'LineString', 'Polygon', 
                        'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
    
    return validTypes.includes(geojson.type);
  }

  /**
   * Normalise un GeoJSON en FeatureCollection
   * Gère: Feature, FeatureCollection, géométries brutes, MultiPoint
   * @param {Object} geojson - GeoJSON d'entrée
   * @returns {Object} FeatureCollection normalisée
   */
  function normalizeToFeatureCollection(geojson) {
    if (!geojson) return { type: 'FeatureCollection', features: [] };
    
    // Déjà une FeatureCollection
    if (geojson.type === 'FeatureCollection') {
      // S'assurer que chaque feature a des properties
      const features = (geojson.features || []).map(f => ({
        type: 'Feature',
        properties: f.properties || {},
        geometry: f.geometry
      }));
      return { type: 'FeatureCollection', features };
    }
    
    // Une Feature simple
    if (geojson.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: geojson.properties || {},
          geometry: geojson.geometry
        }]
      };
    }
    
    // Géométrie brute (Point, LineString, Polygon, Multi*, GeometryCollection)
    if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'].includes(geojson.type)) {
      // Cas spécial: MultiPoint -> convertir en plusieurs Features Point
      if (geojson.type === 'MultiPoint' && Array.isArray(geojson.coordinates)) {
        const features = geojson.coordinates.map(coords => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: coords }
        }));
        return { type: 'FeatureCollection', features };
      }
      
      // Autres géométries: wrapper en Feature
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: geojson
        }]
      };
    }
    
    return { type: 'FeatureCollection', features: [] };
  }

  /**
   * Compte les features par type de géométrie
   * @param {Object} geojson - FeatureCollection
   * @returns {Object} Comptage { points, lines, polygons, total }
   */
  function countFeaturesByType(geojson) {
    const counts = { points: 0, lines: 0, polygons: 0, total: 0 };
    
    if (!geojson || !geojson.features) return counts;
    
    geojson.features.forEach(f => {
      if (!f.geometry) return;
      const type = f.geometry.type;
      counts.total++;
      
      if (type === 'Point' || type === 'MultiPoint') counts.points++;
      else if (type === 'LineString' || type === 'MultiLineString') counts.lines++;
      else if (type === 'Polygon' || type === 'MultiPolygon') counts.polygons++;
    });
    
    return counts;
  }

  /**
   * Affiche un feedback de validation du GeoJSON dans la dropzone
   * @param {Object} geojson - GeoJSON validé
   * @param {Object} elements - Éléments DOM
   */
  function showGeoJSONPreview(geojson, elements) {
    if (!geojson) return;
    
    const { dropzoneEl } = elements || {};
    
    // Afficher les infos sur le contenu dans la dropzone (pas sur la carte)
    const counts = countFeaturesByType(geojson);
    const infoText = buildPreviewInfoText(counts);
    
    // Créer ou mettre à jour l'élément d'info dans la dropzone
    let infoEl = dropzoneEl?.querySelector('.geojson-preview-info');
    if (!infoEl && dropzoneEl) {
      infoEl = document.createElement('div');
      infoEl.className = 'geojson-preview-info';
      infoEl.style.cssText = 'margin-top:8px;font-size:12px;color:var(--success);display:flex;align-items:center;gap:6px;';
      dropzoneEl.appendChild(infoEl);
    }
    if (infoEl) {
      infoEl.innerHTML = `<i class="fa-solid fa-check-circle"></i> ${infoText}`;
    }
    
    console.log('[contrib-geometry] GeoJSON validé:', counts);
  }

  /**
   * Construit le texte d'info de prévisualisation
   * @param {Object} counts - Comptage des features
   * @returns {string} Texte descriptif
   */
  function buildPreviewInfoText(counts) {
    const parts = [];
    if (counts.points > 0) parts.push(`${counts.points} point${counts.points > 1 ? 's' : ''}`);
    if (counts.lines > 0) parts.push(`${counts.lines} ligne${counts.lines > 1 ? 's' : ''}`);
    if (counts.polygons > 0) parts.push(`${counts.polygons} polygone${counts.polygons > 1 ? 's' : ''}`);
    
    if (parts.length === 0) return 'GeoJSON valide';
    return `GeoJSON valide: ${parts.join(', ')}`;
  }

  // ============================================================================
  // DROPZONE SETUP
  // ============================================================================

  /**
   * Configure la dropzone pour l'upload de GeoJSON
   * @param {Object} elements - Éléments DOM nécessaires
   */
  function setupDropzone(elements) {
    const { dropzoneEl, dzFilenameEl, fileInput, drawPanelEl } = elements || {};
    
    console.log('[contrib-geometry] setupDropzone called:', {
      hasDropzoneEl: !!dropzoneEl,
      hasDzFilenameEl: !!dzFilenameEl,
      hasFileInput: !!fileInput,
      fileInputId: fileInput?.id,
      hasDrawPanelEl: !!drawPanelEl
    });
    
    if (!dropzoneEl || !fileInput) {
      console.error('[contrib-geometry] setupDropzone FAILED - missing elements');
      return;
    }

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

    // Handler pour le changement de fichier avec validation
    async function onFileChange() {
      console.log('[contrib-geometry] onFileChange triggered:', {
        fileInputId: fileInput?.id,
        filesLength: fileInput?.files?.length || 0,
        fileName: fileInput?.files?.[0]?.name || 'none'
      });
      
      updateName();
      
      const f = fileInput.files && fileInput.files[0];
      if (!f) {
        console.log('[contrib-geometry] No file selected');
        // Nettoyer l'info de preview
        const infoEl = dropzoneEl.querySelector('.geojson-preview-info');
        if (infoEl) infoEl.remove();
        return;
      }
      
      console.log('[contrib-geometry] File selected:', f.name, f.size, 'bytes');
      
      // Parser et valider le GeoJSON
      const geojson = await parseGeoJSONFile(f);
      
      if (!geojson || !geojson.features || geojson.features.length === 0) {
        // Afficher une erreur inline
        let infoEl = dropzoneEl.querySelector('.geojson-preview-info');
        if (!infoEl) {
          infoEl = document.createElement('div');
          infoEl.className = 'geojson-preview-info';
          dropzoneEl.appendChild(infoEl);
        }
        infoEl.style.cssText = 'margin-top:8px;font-size:12px;color:var(--danger);display:flex;align-items:center;gap:6px;';
        infoEl.innerHTML = '<i class="fa-solid fa-exclamation-circle"></i> GeoJSON invalide ou vide';
        
        if (win.ContribUtils?.showToast) {
          win.ContribUtils.showToast('Le fichier GeoJSON est invalide ou vide.', 'error');
        }
        return;
      }
      
      // Afficher le feedback de validation (inline dans la dropzone)
      showGeoJSONPreview(geojson, { dropzoneEl });
    }

    fileInput.addEventListener('change', onFileChange);

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
    parseGeoJSONFile,
    normalizeToFeatureCollection,
    isValidGeoJSON,
    countFeaturesByType,
    showGeoJSONPreview,
    
    // Edit mode
    setEditGeojsonUrl,
    getEditGeojsonUrl,
    clearEditGeojsonUrl
  };

})(window);
