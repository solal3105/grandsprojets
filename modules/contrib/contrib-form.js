// modules/contrib/contrib-form.js
// Gestion du formulaire de contribution (soumission, édition, validation)

;(function(win) {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let currentEditId = null;

  // ============================================================================
  // FORM PREFILL
  // ============================================================================

  /**
   * Remplit le formulaire avec les données d'une contribution
   * @param {Object} row - Données de la contribution
   * @param {Object} elements - Éléments DOM du formulaire
   */
  function prefillForm(row, elements) {
    const {
      nameEl, catEl, citySel, metaEl, descEl, mdEl,
      officialInput
    } = elements || {};

    if (!row) {
      // Reset form
      try {
        if (nameEl) nameEl.value = '';
        if (catEl) catEl.value = '';
        if (citySel) citySel.value = '';
        if (metaEl) metaEl.value = '';
        if (descEl) descEl.value = '';
        if (mdEl) mdEl.value = '';
        if (officialInput) officialInput.value = '';
      } catch(_) {}
      return;
    }

    // Fill form fields
    try {
      if (nameEl && row.project_name) nameEl.value = row.project_name;
      if (catEl && row.category) catEl.value = row.category;
      if (citySel && row.ville) citySel.value = row.ville;
      if (metaEl && row.meta) metaEl.value = row.meta;
      if (descEl && row.description) descEl.value = row.description;
      if (officialInput && row.official_url) officialInput.value = row.official_url;
    } catch(_) {}

    // Try fetching markdown content
    if (mdEl) {
      mdEl.value = '';
      if (row.markdown_url) {
        fetch(row.markdown_url)
          .then(r => r.ok ? r.text() : '')
          .then(txt => { if (typeof txt === 'string') mdEl.value = txt; })
          .catch(() => {});
      }
    }

    // Geometry inputs: reset file and drawings (loading from server handled separately)
    const fileInput = document.getElementById('contrib-geojson');
    if (win.ContribGeometry?.resetGeometryInputs) {
      win.ContribGeometry.resetGeometryInputs(fileInput);
    }
  }

  // ============================================================================
  // EDIT MODE
  // ============================================================================

  /**
   * Entre en mode édition
   * @param {Object} row - Données de la contribution
   * @param {Object} elements - Éléments DOM
   * @param {Function} onSetEditUI - Callback pour mettre à jour l'UI
   * @param {Function} onSetStatus - Callback pour le statut
   * @param {Function} onSetStep - Callback pour changer d'étape
   */
  function enterEditMode(row, elements, onSetEditUI, onSetStatus, onSetStep) {
    currentEditId = row.id;
    
    if (win.ContribGeometry?.setEditGeojsonUrl) {
      win.ContribGeometry.setEditGeojsonUrl(row && row.geojson_url ? row.geojson_url : null);
    }
    
    prefillForm(row, elements);
    
    if (onSetStatus) {
      onSetStatus('Mode édition. Modifiez et cliquez sur Enregistrer.');
    }
    
    if (onSetEditUI) {
      onSetEditUI(true);
    }
    
    // Start at step 1
    if (onSetStep) {
      try { onSetStep(1, { force: true }); } catch(_) {}
    }
  }

  /**
   * Sort du mode édition
   * @param {HTMLFormElement} form - Formulaire
   * @param {Object} elements - Éléments DOM
   * @param {Function} onSetEditUI - Callback pour mettre à jour l'UI
   * @param {Function} onSetStatus - Callback pour le statut
   * @param {Function} onClearExistingDossiers - Callback pour nettoyer les dossiers
   */
  function exitEditMode(form, elements, onSetEditUI, onSetStatus, onClearExistingDossiers) {
    currentEditId = null;
    
    if (win.ContribGeometry?.clearEditGeojsonUrl) {
      win.ContribGeometry.clearEditGeojsonUrl();
    }
    
    try { form.reset(); } catch(_) {}
    
    if (onSetEditUI) {
      onSetEditUI(false);
    }
    
    if (onSetStatus) {
      onSetStatus('');
    }
    
    if (win.ContribGeometry?.clearAllDrawings) {
      try { win.ContribGeometry.clearAllDrawings(); } catch(_) {}
    }
    
    if (win.ContribGeometry?.setGeomMode) {
      const geomElements = {
        geomModeRadios: elements.geomModeRadios,
        fileRowEl: elements.fileRowEl,
        drawPanelEl: elements.drawPanelEl,
        geomCardFile: elements.geomCardFile,
        geomCardDraw: elements.geomCardDraw,
        fileInput: document.getElementById('contrib-geojson')
      };
      try { win.ContribGeometry.setGeomMode('file', geomElements); } catch(_) {}
    }
    
    if (onClearExistingDossiers) {
      try { onClearExistingDossiers(); } catch(_) {}
    }
  }

  /**
   * Récupère l'ID de la contribution en cours d'édition
   * @returns {number|null} ID de la contribution
   */
  function getCurrentEditId() {
    return currentEditId;
  }

  /**
   * Définit l'ID de la contribution en cours d'édition
   * @param {number|null} id - ID de la contribution
   */
  function setCurrentEditId(id) {
    currentEditId = id;
  }

  // ============================================================================
  // FORM SUBMISSION
  // ============================================================================

  /**
   * Gère la soumission du formulaire
   * @param {Event} e - Event de soumission
   * @param {Object} config - Configuration et callbacks
   */
  async function handleSubmit(e, config) {
    e.preventDefault();
    
    console.log('[contrib-form] handleSubmit called', config);
    
    const {
      form, elements, onSetStatus, onShowToast, onExitEditMode,
      onRefreshList, onCloseContrib, __userRole
    } = config || {};
    
    if (!form) {
      console.error('[contrib-form] No form element provided');
      return;
    }

    const submitBtn = document.getElementById('contrib-submit');
    const projectName = document.getElementById('contrib-project-name')?.value?.trim();
    const category = document.getElementById('contrib-category')?.value;
    const fileInput = document.getElementById('contrib-geojson');
    const coverInput = document.getElementById('contrib-cover');
    
    const cityInput = document.getElementById('contrib-city');
    const city = cityInput?.value?.trim();
    
    const officialUrl = document.getElementById('contrib-official-url')?.value?.trim();
    const meta = document.getElementById('contrib-meta')?.value?.trim();
    const description = document.getElementById('contrib-description')?.value?.trim();
    const mdTextRaw = document.getElementById('contrib-markdown')?.value || '';
    
    const geomMode = (function(){
      const { geomModeRadios } = elements || {};
      const r = geomModeRadios && geomModeRadios.length ? Array.from(geomModeRadios).find(x => x.checked) : null;
      return r ? r.value : 'file';
    })();

    const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : __userRole;
    
    console.log('[contrib-form] Form data:', { projectName, category, city, geomMode, role });
    
    if (!city) {
      console.error('❌ [contrib-form] CRITIQUE: city est vide/null/undefined!');
      console.error('❌ Tous les champs du formulaire:', {
        projectName,
        category,
        city,
        meta,
        description
      });
    }
    
    if (!projectName || !category) {
      console.warn('[contrib-form] Missing required fields');
      if (onSetStatus) onSetStatus('Veuillez renseigner le nom et la catégorie.', 'error');
      return;
    }

    // Build potential GeoJSON upload
    let fileForUpload = null;
    const drawLayer = win.ContribMap?.getDrawnGeometry?.();
    const drawLayerDirty = win.ContribMap?.getManualDrawState?.()?.isDirty;
    
    if (!currentEditId || (currentEditId && (geomMode === 'file' ? (fileInput && fileInput.files && fileInput.files.length) : (!!drawLayer && drawLayerDirty)))) {
      if (geomMode === 'file') {
        if (!fileInput || !fileInput.files?.length) {
          if (!currentEditId) { 
            if (onSetStatus) onSetStatus('Veuillez sélectionner un fichier GeoJSON.', 'error'); 
            return; 
          }
        } else {
          const file = fileInput.files[0];
          const nameLower = (file.name || '').toLowerCase();
          if (!nameLower.endsWith('.geojson') && !(file.type || '').includes('json')) {
            if (onSetStatus) onSetStatus('Le fichier doit être un GeoJSON (.geojson ou JSON valide).', 'error');
            return;
          }
          fileForUpload = file;
        }
      } else if (geomMode === 'draw') {
        if (!drawLayer) {
          if (!currentEditId) { 
            if (onSetStatus) onSetStatus('Veuillez dessiner une géométrie (ligne ou polygone) avant de soumettre.', 'error'); 
            return; 
          }
        } else {
          try {
            const feature = drawLayer;
            const feat = feature.type === 'Feature' ? feature : { type: 'Feature', properties: {}, geometry: feature };
            const fc = { type: 'FeatureCollection', features: Array.isArray(feature.features) ? feature.features : [feat] };
            const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
            
            if (win.ContribUtils?.slugify) {
              try { 
                fileForUpload = new File([blob], `${win.ContribUtils.slugify(projectName)}.geojson`, { type: 'application/geo+json' }); 
              } catch (_) { 
                fileForUpload = blob; 
              }
            } else {
              fileForUpload = blob;
            }
          } catch (gerr) {
            if (onSetStatus) onSetStatus('Impossible de convertir le dessin en GeoJSON.', 'error');
            return;
          }
        }
      } else {
        if (onSetStatus) onSetStatus('Mode de saisie inconnu.', 'error');
        return;
      }
    }

    // Get cover file
    const coverFile = win.ContribUpload?.getCoverFile?.() || 
      (coverInput && coverInput.files && coverInput.files[0] ? coverInput.files[0] : null);

    if (onSetStatus) onSetStatus('Envoi en cours…');
    if (submitBtn) submitBtn.disabled = true;
    try { if (form) form.setAttribute('aria-busy', 'true'); } catch(_) {}

    // Désactiver la redirection automatique pendant l'upload
    const previousRedirectState = win.__DISABLE_CITY_REDIRECT;
    win.__DISABLE_CITY_REDIRECT = true;

    try {
      // Ensure authenticated session
      console.log('[contrib-form] Checking authentication...');
      const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
      if (!session || !session.user) {
        console.error('[contrib-form] No authenticated session');
        return;
      }
      console.log('[contrib-form] User authenticated:', session.user.id);

      let rowId = currentEditId;
      if (!currentEditId) {
        // Create row
        console.log('[contrib-form] Creating new contribution row...');
        try {
          if (win.supabaseService && typeof win.supabaseService.createContributionRow === 'function') {
            // IMPORTANT : Tous les utilisateurs (invited et admin) doivent passer la ville
            const cityToCreate = city || null;
            
            if (!cityToCreate) {
              console.error('❌ [contrib-form] ERREUR: cityToCreate est null/undefined!');
              console.error('❌ [contrib-form] city était:', city);
              if (onSetStatus) onSetStatus("Erreur: Aucune ville sélectionnée", 'error');
              if (onShowToast) onShowToast("Erreur: Ville manquante", 'error');
              if (submitBtn) submitBtn.disabled = false;
              return;
            }
            
            rowId = await win.supabaseService.createContributionRow(
              projectName,
              category,
              cityToCreate,
              meta,
              description,
              officialUrl
            );
            console.log('[contrib-form] Row created with ID:', rowId);
          } else {
            console.error('[contrib-form] supabaseService.createContributionRow not available');
          }
        } catch (e) {
          console.error('[contrib-form] createContributionRow error:', e);
          console.error('[contrib-form] Error details:', e.message, e.code, e.details);
        }
        
        if (!rowId) {
          console.error('[contrib-form] Failed to create row, rowId is:', rowId);
          if (onSetStatus) onSetStatus("Impossible de créer l'entrée de contribution. Réessayez plus tard.", 'error');
          if (onShowToast) onShowToast("Création impossible pour le moment.", 'error');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
      }

      // Upload GeoJSON
      if (fileForUpload) {
        console.log('[contrib-form] Uploading GeoJSON...');
        await (win.supabaseService && win.supabaseService.uploadGeoJSONToStorage(fileForUpload, category, projectName, rowId));
        console.log('[contrib-form] GeoJSON uploaded');
      } else {
        console.log('[contrib-form] No GeoJSON file to upload');
      }

      // Upload cover (non-blocking)
      if (coverFile) {
        try {
          await (win.supabaseService && win.supabaseService.uploadCoverToStorage(coverFile, category, projectName, rowId));
        } catch (coverErr) {
          console.warn('[contrib-form] cover upload error (non bloquant):', coverErr);
        }
      }

      // Upload Markdown (non-blocking)
      const mdText = (mdTextRaw || '').trim();
      if (mdText) {
        try {
          const mdBlob = new Blob([mdText], { type: 'text/markdown' });
          await (win.supabaseService && win.supabaseService.uploadMarkdownToStorage(mdBlob, category, projectName, rowId));
        } catch (mdErr) {
          console.warn('[contrib-form] markdown upload error (non bloquant):', mdErr);
        }
      }

      // Upload consultation dossiers
      const docEntries = win.ContribUpload?.collectDocs?.(document.getElementById('contrib-docs-fieldset')) || [];
      if (docEntries.length) {
        const uploaded = [];
        for (const d of docEntries) {
          try {
            const url = await (win.supabaseService && win.supabaseService.uploadConsultationPdfToStorage(d.file, category, projectName, rowId));
            if (url) uploaded.push({ title: d.title, pdf_url: url });
          } catch (pdfErr) {
            console.warn('[contrib-form] upload PDF error:', pdfErr);
          }
        }
        if (uploaded.length) {
          await win.supabaseService.insertConsultationDossiers(projectName, category, uploaded);
        }
      }

      // Update core fields
      // Note: ville n'est normalement PAS mise à jour car elle est déjà correctement définie lors de createContributionRow
      // MAIS si ville est null (anciennes contributions), on la met à jour avec la ville du contexte
      try {
        const updateData = {
          project_name: projectName,
          category: category,
          official_url: officialUrl || null,
          meta: meta || null,
          description: description || null
        };
        
        // Si on édite une contribution qui a ville = null, la corriger
        if (currentEditId && city) {
          // Vérifier si la contribution a ville = null
          const currentRow = await win.supabaseService.getContributionById(currentEditId);
          if (currentRow && currentRow.ville === null) {
            console.log('[contrib-form] ⚠️ Correction: contribution avec ville=null, mise à jour avec:', city);
            updateData.ville = city;
          }
        }
        
        await (win.supabaseService && win.supabaseService.updateContribution(rowId, updateData));
      } catch (patchErr) {
        console.warn('[contrib-form] updateContribution warning:', patchErr);
      }

      if (currentEditId) {
        if (onSetStatus) onSetStatus('Modifications enregistrées.', 'success');
        if (onShowToast) onShowToast('Modifications enregistrées.', 'success');
        
        // Emit event for refresh
        try { 
          window.dispatchEvent(new CustomEvent('contribution:updated', { 
            detail: { id: rowId, project_name: projectName, category } 
          })); 
        } catch(_) {}
        
        // Exit edit mode - réinitialiser currentEditId
        currentEditId = null;
        if (onExitEditMode) onExitEditMode();
        
        // Refresh list
        if (onRefreshList) onRefreshList();
      } else {
        if (onSetStatus) onSetStatus('Contribution enregistrée. Merci !', 'success');
        if (onShowToast) onShowToast('Contribution enregistrée. Merci !', 'success');
        
        // Emit event for refresh (pour les listeners externes)
        try { 
          window.dispatchEvent(new CustomEvent('contribution:created', { 
            detail: { id: rowId, project_name: projectName, category } 
          })); 
        } catch(_) {}
        
        try { form.reset(); } catch(_) {}
        
        // Clean drawing state
        if (win.ContribGeometry?.clearAllDrawings) {
          try { win.ContribGeometry.clearAllDrawings(); } catch(_) {}
        }
        if (win.ContribGeometry?.setGeomMode) {
          const geomElements = {
            geomModeRadios: elements.geomModeRadios,
            fileRowEl: elements.fileRowEl,
            drawPanelEl: elements.drawPanelEl,
            geomCardFile: elements.geomCardFile,
            geomCardDraw: elements.geomCardDraw,
            fileInput: document.getElementById('contrib-geojson')
          };
          try { win.ContribGeometry.setGeomMode('file', geomElements); } catch(_) {}
        }
        
        // Vérifier si on est dans le panel liste (contrib-panel-list existe et est visible)
        const listPanel = document.getElementById('contrib-panel-list');
        const isInListPanel = listPanel && !listPanel.hidden;
        
        if (isInListPanel) {
          // Si on est dans le panel liste, fermer uniquement la sous-modale de création
          const createModal = document.getElementById('create-modal-overlay');
          if (createModal) {
            const modalInner = createModal.querySelector('.gp-modal');
            if (modalInner) modalInner.classList.remove('is-open');
            
            setTimeout(async () => {
              createModal.setAttribute('aria-hidden', 'true');
              
              // Rafraîchir la liste APRÈS la fermeture de la modale
              if (onRefreshList) {
                try {
                  await onRefreshList();
                } catch(err) {
                  console.error('[contrib-form] Erreur lors du rafraîchissement:', err);
                }
              }
            }, 300);
          }
        } else {
          // Si on n'est pas dans le panel liste, fermer la modale principale
          if (onCloseContrib) {
            setTimeout(() => { try { onCloseContrib(); } catch(_) {} }, 900);
          }
        }
      }
    } catch (err) {
      console.error('[contrib-form] submit error:', err);
      if (onSetStatus) onSetStatus("Échec de l'envoi. Réessayez plus tard.", 'error');
      if (onShowToast) onShowToast("Échec de l'envoi de la contribution.", 'error');
    } finally {
      // Restaurer l'état de la redirection
      win.__DISABLE_CITY_REDIRECT = previousRedirectState;
      
      if (submitBtn) submitBtn.disabled = false;
      try { if (form) form.removeAttribute('aria-busy'); } catch(_) {}
    }
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribForm = {
    // Form prefill
    prefillForm,
    
    // Edit mode
    enterEditMode,
    exitEditMode,
    getCurrentEditId,
    setCurrentEditId,
    
    // Submission
    handleSubmit
  };

})(window);
