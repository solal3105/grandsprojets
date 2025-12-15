// modules/contrib/contrib-create-form-v2.js
// Version refactorisée avec gestion propre du cycle de vie

;(function(win) {
  'use strict';

  // ============================================================================
  // SINGLETON - Une seule instance à la fois
  // ============================================================================

  let currentInstance = null;

  /**
   * Initialise le formulaire de création (singleton)
   */
  function initCreateForm(options) {
    // Si une instance existe déjà, la détruire proprement avant d'en créer une nouvelle
    if (currentInstance) {
      currentInstance.destroy();
    }

    // Créer la nouvelle instance
    currentInstance = createFormInstance(options);
    return currentInstance;
  }

  /**
   * Crée une instance du formulaire avec gestion propre
   */
  function createFormInstance(options) {
    const {
      form,
      overlay,
      mode = 'create',
      data = {},
      onClose,
      onSuccess,
      onRefreshList
    } = options;

    if (!form || !overlay) {
      console.error('[contrib-create-form-v2] Missing required elements');
      return null;
    }

    // ============================================================================
    // STATE LOCAL À L'INSTANCE
    // ============================================================================

    let currentStep = 1;
    const cleanupCallbacks = []; // Liste des fonctions de nettoyage
    const ContribUtils = win.ContribUtils || {};
    const showToast = ContribUtils.showToast || ((msg) => console.error(msg));

    // ============================================================================
    // ÉLÉMENTS DOM
    // ============================================================================

    const elements = {
      // Stepper
      stepperEl: overlay.querySelector('.contrib-stepper'),
      stepTab1: overlay.querySelector('#contrib-step-1-tab'),
      stepTab2: overlay.querySelector('#contrib-step-2-tab'),
      stepTab3: overlay.querySelector('#contrib-step-3-tab'),
      stepTab4: overlay.querySelector('#contrib-step-4-tab'),
      prevBtn: overlay.querySelector('#contrib-prev'),
      nextBtn: overlay.querySelector('#contrib-next'),
      submitBtn: overlay.querySelector('#contrib-submit'),

      // Formulaire
      cityEl: overlay.querySelector('#contrib-city'),
      projectNameEl: overlay.querySelector('#contrib-project-name'),
      categoryEl: overlay.querySelector('#contrib-category'),
      metaEl: overlay.querySelector('#contrib-meta'),
      descEl: overlay.querySelector('#contrib-description'),
      mdEl: overlay.querySelector('#contrib-markdown'),
      officialInput: overlay.querySelector('#contrib-official-url'),
      
      // Géométrie
      geomModeRadios: overlay.querySelectorAll('input[name="contrib-geom-mode"]'),
      fileRowEl: overlay.querySelector('#contrib-file-row'),
      drawPanelEl: overlay.querySelector('#contrib-draw-panel'),
      geojsonInput: overlay.querySelector('#contrib-geojson'),
      dropzoneEl: overlay.querySelector('#contrib-dropzone'),
      dzFilenameEl: overlay.querySelector('#contrib-dz-filename'),
      geomCardFile: overlay.querySelector('#geom-card-file'),
      geomCardDraw: overlay.querySelector('#geom-card-draw'),
      
      // Cover
      coverInput: overlay.querySelector('#contrib-cover'),
      
      // Documents
      docsFieldset: overlay.querySelector('#contrib-docs-fieldset'),
      existingDocsEl: overlay.querySelector('#contrib-existing-docs'),
      addDocBtn: overlay.querySelector('#contrib-doc-add')
    };

    // Modules externes
    const ContribGeometry = win.ContribGeometry || {};
    const ContribMap = win.ContribMap || {};
    const ContribDrawControls = win.ContribDrawControls || {};
    const ContribForm = win.ContribForm || {};

    // ============================================================================
    // HELPERS
    // ============================================================================

    function attachListener(element, event, handler, options = {}) {
      if (!element) return;
      
      element.addEventListener(event, handler, options);
      
      // Enregistrer pour cleanup
      cleanupCallbacks.push(() => {
        element.removeEventListener(event, handler, options);
      });
    }

    function renderCoverPreview(coverDropzone, imageUrl, label = 'Cover existante') {
      if (!coverDropzone) return;
      
      try {
        coverDropzone.classList.add('has-file');
        const dzText = coverDropzone.querySelector('.dz-text');
        if (dzText) dzText.style.display = 'none';
        
        let previewContainer = coverDropzone.querySelector('.dz-preview-container');
        if (!previewContainer) {
          previewContainer = document.createElement('div');
          previewContainer.className = 'dz-preview-container';
          previewContainer.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;';
          coverDropzone.appendChild(previewContainer);
        }
        
        let thumb = previewContainer.querySelector('img.dz-thumb');
        if (!thumb) {
          thumb = document.createElement('img');
          thumb.className = 'dz-thumb';
          thumb.alt = 'Aperçu de la cover';
          thumb.style.cssText = 'max-height:160px;max-width:100%;border-radius:10px;box-shadow:0 6px 16px var(--black-alpha-18);object-fit:contain;';
          previewContainer.appendChild(thumb);
        }
        thumb.src = imageUrl;
        
        let fileLabel = previewContainer.querySelector('.dz-file-label');
        if (!fileLabel) {
          fileLabel = document.createElement('div');
          fileLabel.className = 'dz-file-label';
          fileLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.9rem;opacity:0.75;';
          fileLabel.innerHTML = `<i class="fa-regular fa-image" style="opacity:0.6;"></i><span class="dz-file-name">${label}</span>`;
          previewContainer.appendChild(fileLabel);
        }
      } catch (err) {
        console.warn('[contrib-create-form-v2] renderCoverPreview error:', err);
      }
    }

    // ============================================================================
    // DÉLÉGATION D'ÉVÉNEMENTS - Documents
    // ============================================================================

    // Un seul listener sur le parent pour tous les boutons dynamiques
    if (elements.docsFieldset) {
      const handleDocsClick = (e) => {
        // Bouton supprimer
        if (e.target.closest('.doc-remove')) {
          e.target.closest('.doc-card')?.remove();
        }
      };
      attachListener(elements.docsFieldset, 'click', handleDocsClick);
    }

    // Bouton "Ajouter un document" - attaché une seule fois
    if (elements.addDocBtn) {
      const handleAddDoc = () => {
        const ContribUpload = win.ContribUpload || {};
        const row = ContribUpload.createDocRow?.();
        if (row && elements.docsFieldset) {
          elements.docsFieldset.appendChild(row);
        }
      };
      attachListener(elements.addDocBtn, 'click', handleAddDoc);
    }

    // ============================================================================
    // COVER - Initialisé une seule fois
    // ============================================================================

    if (elements.coverInput) {
      const ContribUpload = win.ContribUpload || {};
      if (typeof ContribUpload.initCoverUpload === 'function') {
        ContribUpload.initCoverUpload({ coverInput: elements.coverInput });
      }
    }

    // ============================================================================
    // STEPPER
    // ============================================================================

    /**
     * Validation des champs required de l'étape actuelle
     */
    function canGoToStep(target) {
      // Retour en arrière toujours autorisé
      if (target <= currentStep) {
        return true;
      }
      
      // Récupérer tous les champs required visibles de l'étape actuelle
      const currentStepElements = overlay.querySelectorAll(`.contrib-step-${currentStep}`);
      const requiredFields = [];
      
      currentStepElements.forEach(el => {
        el.querySelectorAll('[required]').forEach(field => requiredFields.push(field));
      });
      
      // Valider chaque champ
      for (const field of requiredFields) {
        // Ignorer les champs cachés ou désactivés
        if (field.offsetParent === null || field.disabled) {
          continue;
        }
        
        if (!field.checkValidity()) {
          console.error(`[contrib-create-form-v2] ❌ VALIDATION FAILED:`, field.id, field.validationMessage);
          
          field.reportValidity();
          
          const fieldLabel = field.labels?.[0]?.textContent || field.name || field.id || 'Ce champ';
          showToast(`${fieldLabel} est obligatoire.`, 'error');
          
          try { field.focus(); } catch(_) {}
          
          return false;
        }
      }
      
      // Validation custom étape 2 : catégorie
      if (target >= 2) {
        const categorySelect = document.querySelector('#create-modal-overlay #contrib-category');
        const selectedCategory = categorySelect?.value;
        
        if (!selectedCategory || selectedCategory.trim() === '') {
          console.error('[contrib-create-form-v2] ❌ Category validation FAILED');
          showToast('La catégorie est obligatoire.', 'error');
          
          try { categorySelect?.focus(); } catch(_) {}
          
          return false;
        }
      }
      
      // Validation custom étape 3 : géométrie
      if (target >= 3) {
        const mode = Array.from(elements.geomModeRadios || []).find(r => r.checked)?.value || 'file';
        const fileInput = elements.geojsonInput;
        const hasGeom = win.ContribGeometry?.hasGeometry?.(mode, fileInput) || false;
        
        if (!hasGeom) {
          console.error('[contrib-create-form-v2] ❌ Geometry validation FAILED');
          const message = mode === 'file' 
            ? 'Veuillez sélectionner un fichier GeoJSON.'
            : 'Veuillez dessiner une géométrie puis terminer.';
          showToast(message, 'error');
          return false;
        }
      }
      
      return true;
    }

    function setStep(n, opts = {}) {
      const { force = false } = opts || {};
      
      // Vérifier la validation avant de changer d'étape
      if (!force && !canGoToStep(n)) {
        return;
      }
      
      currentStep = Math.min(4, Math.max(1, n));
      
      // Afficher/masquer les éléments de chaque étape
      [1,2,3,4].forEach(i => {
        overlay.querySelectorAll(`.contrib-step-${i}`).forEach(el => {
          el.style.display = (i === currentStep) ? '' : 'none';
        });
      });
      
      // Mettre à jour les boutons
      if (elements.prevBtn) elements.prevBtn.style.display = (currentStep > 1) ? '' : 'none';
      if (elements.nextBtn) elements.nextBtn.style.display = (currentStep < 4) ? '' : 'none';
      if (elements.submitBtn) elements.submitBtn.style.display = (currentStep === 4) ? '' : 'none';
      
      // Mettre à jour l'état des tabs du stepper
      const tabs = [elements.stepTab1, elements.stepTab2, elements.stepTab3, elements.stepTab4];
      tabs.forEach((t, idx) => {
        if (!t) return;
        const stepIndex = idx + 1;
        const isActive = stepIndex === currentStep;
        const isComplete = stepIndex < currentStep;
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        t.tabIndex = isActive ? 0 : -1;
        t.classList.toggle('is-current', isActive);
        t.classList.toggle('is-active', isActive);
        t.classList.toggle('is-complete', isComplete);
      });
      
      // Étape 2 : Initialiser la géométrie
      if (currentStep === 2) {
        const mode = Array.from(elements.geomModeRadios || []).find(r => r.checked)?.value || 'file';
        
        // Initialiser le mode géométrie
        ContribGeometry.setGeomMode?.(mode, geomElements);
        
        // Charger le GeoJSON existant en mode édition
        const editGeojsonUrl = form.dataset.geojsonUrl;
        if (editGeojsonUrl) {
          setTimeout(() => {
            ContribGeometry.preloadGeometryOnMap?.(editGeojsonUrl, geomElements);
          }, 300);
        }
        
        // Initialiser la carte et les contrôles si mode dessin
        // OU si on est en mode édition (pour permettre le changement de mode)
        if (mode === 'draw') {
          initDrawMap();
          ensureManualToolbar();
        }
      }
      
      // Étape 4 : Charger les documents
      if (currentStep === 4) {
        loadExistingDocs();
      }
    }

    // Navigation stepper - listeners attachés une seule fois
    if (elements.stepTab1) attachListener(elements.stepTab1, 'click', () => setStep(1));
    if (elements.stepTab2) attachListener(elements.stepTab2, 'click', () => setStep(2));
    if (elements.stepTab3) attachListener(elements.stepTab3, 'click', () => setStep(3));
    if (elements.stepTab4) attachListener(elements.stepTab4, 'click', () => setStep(4));
    if (elements.prevBtn) attachListener(elements.prevBtn, 'click', () => setStep(currentStep - 1));
    if (elements.nextBtn) attachListener(elements.nextBtn, 'click', () => setStep(currentStep + 1));

    // ============================================================================
    // GÉOMÉTRIE & CARTE
    // ============================================================================

    const drawMapContainerId = 'contrib-draw-map';

    async function initDrawMap() {
      const existingMap = ContribMap.getDrawMap?.();
      if (existingMap) {
        return existingMap;
      }
      const map = await ContribMap.initDrawMap?.(drawMapContainerId, elements.drawPanelEl, elements.cityEl);
      return map;
    }

    function ensureManualToolbar() {
      if (!elements.drawPanelEl) return;
      ContribDrawControls.initToolbar?.(elements.drawPanelEl, () => {
        // Callback quand l'état change
      });
    }

    // Setup callback for state changes
    if (ContribMap) {
      ContribMap.onDrawStateChange = () => {
        ContribDrawControls.updateButtonStates?.();
      };
    }

    // Geometry mode elements
    const geomElements = {
      geomModeRadios: Array.from(elements.geomModeRadios),
      fileRowEl: elements.fileRowEl,
      drawPanelEl: elements.drawPanelEl,
      geomCardFile: elements.geomCardFile,
      geomCardDraw: elements.geomCardDraw,
      fileInput: elements.geojsonInput,
      dropzoneEl: elements.dropzoneEl,
      dzFilenameEl: elements.dzFilenameEl,
      cityEl: elements.cityEl
    };

    // Mode change listeners
    if (elements.geomModeRadios && elements.geomModeRadios.length) {
      elements.geomModeRadios.forEach(r => {
        attachListener(r, 'change', () => {
          const checked = Array.from(elements.geomModeRadios).find(x => x.checked)?.value || 'file';
          ContribGeometry.setGeomMode?.(checked, geomElements);
          if (checked === 'draw') {
            setTimeout(() => {
              initDrawMap();
              ensureManualToolbar();
            }, 100);
          }
        });
      });
    }

    // Card click listeners (cartes de sélection de mode)
    if (elements.geomCardFile) {
      attachListener(elements.geomCardFile, 'click', () => {
        ContribGeometry.setGeomMode?.('file', geomElements);
      });
    }
    if (elements.geomCardDraw) {
      attachListener(elements.geomCardDraw, 'click', () => {
        ContribGeometry.setGeomMode?.('draw', geomElements);
        // Toujours initialiser la carte et les contrôles quand on passe en mode dessin
        setTimeout(() => {
          initDrawMap();
          ensureManualToolbar();
        }, 100);
      });
    }

    // Setup dropzone pour GeoJSON
    ContribGeometry.setupDropzone?.(geomElements);

    // ============================================================================
    // DOCUMENTS EXISTANTS
    // ============================================================================

    async function loadExistingDocs() {
      if (!elements.existingDocsEl) return;
      
      const projectName = elements.projectNameEl?.value?.trim();
      if (!projectName) {
        elements.existingDocsEl.innerHTML = '<p style="opacity:0.5;padding:12px;font-size:0.9rem;font-style:italic;">Aucun document existant.</p>';
        return;
      }

      try {
        elements.existingDocsEl.innerHTML = '<p style="opacity:0.6;padding:12px;font-size:0.9rem;">Chargement...</p>';
        
        const docs = await win.supabaseService?.fetchConsultationDossiers?.(projectName, null) || [];
        
        if (docs.length === 0) {
          elements.existingDocsEl.innerHTML = '<p style="opacity:0.5;padding:12px;font-size:0.9rem;font-style:italic;">Aucun document existant.</p>';
          return;
        }

        // Afficher avec délégation d'événements pour les actions
        elements.existingDocsEl.innerHTML = docs.map(doc => `
          <div class="existing-doc-card" data-doc-id="${doc.id}" style="border:1px solid var(--gray-300);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--gray-50);display:flex;align-items:center;gap:12px;">
            <div style="flex-shrink:0;font-size:24px;color:var(--danger);">
              <i class="fa-regular fa-file-pdf"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <input type="text" class="existing-doc-title" value="${doc.title || 'Sans titre'}" data-original="${doc.title || ''}" style="width:100%;padding:6px 8px;border:1px solid var(--gray-300);border-radius:4px;font-size:0.95rem;margin-bottom:4px;">
              ${doc.pdf_url ? `<a href="${doc.pdf_url}" target="_blank" rel="noopener" style="font-size:0.85rem;color:var(--primary);text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><i class="fa-solid fa-external-link" style="font-size:0.75rem;"></i><span>Voir le PDF</span></a>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button type="button" class="doc-save-btn btn-primary btn-small" style="display:none;" title="Enregistrer"><i class="fa-solid fa-check"></i></button>
              <button type="button" class="doc-delete-btn btn-danger btn-small" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        `).join('');

        // Délégation pour les modifications de titre
        attachListener(elements.existingDocsEl, 'input', (e) => {
          if (e.target.classList.contains('existing-doc-title')) {
            const card = e.target.closest('.existing-doc-card');
            const saveBtn = card?.querySelector('.doc-save-btn');
            const hasChanged = e.target.value.trim() !== e.target.dataset.original;
            if (saveBtn) saveBtn.style.display = hasChanged ? '' : 'none';
          }
        });

        // Délégation pour sauvegarder
        attachListener(elements.existingDocsEl, 'click', async (e) => {
          if (e.target.closest('.doc-save-btn')) {
            const card = e.target.closest('.existing-doc-card');
            const titleInput = card?.querySelector('.existing-doc-title');
            const docId = card?.dataset.docId;
            
            if (!titleInput || !docId) return;
            
            const newTitle = titleInput.value.trim();
            if (!newTitle) {
              showToast('Le titre ne peut pas être vide', 'error');
              return;
            }

            try {
              const btn = e.target.closest('.doc-save-btn');
              btn.disabled = true;
              
              await win.supabaseService?.updateConsultationDossier?.(docId, { title: newTitle });
              titleInput.dataset.original = newTitle;
              btn.style.display = 'none';
              showToast('Titre mis à jour', 'success');
            } catch (err) {
              console.error('Error updating doc:', err);
              showToast('Erreur lors de la mise à jour', 'error');
            }
          }
          
          // Délégation pour supprimer
          if (e.target.closest('.doc-delete-btn')) {
            if (!confirm('Voulez-vous vraiment supprimer ce document ?')) return;
            
            const card = e.target.closest('.existing-doc-card');
            const docId = card?.dataset.docId;
            
            if (!docId) return;
            
            try {
              const btn = e.target.closest('.doc-delete-btn');
              btn.disabled = true;
              
              await win.supabaseService?.deleteConsultationDossier?.(docId);
              card.remove();
              showToast('Document supprimé', 'success');
              
              // Vérifier s'il reste des documents
              if (!elements.existingDocsEl.querySelector('.existing-doc-card')) {
                elements.existingDocsEl.innerHTML = '<p style="opacity:0.5;padding:12px;font-size:0.9rem;font-style:italic;">Aucun document existant.</p>';
              }
            } catch (err) {
              console.error('Error deleting doc:', err);
              showToast('Erreur lors de la suppression', 'error');
              btn.disabled = false;
            }
          }
        });

      } catch (err) {
        console.error('Error loading docs:', err);
        elements.existingDocsEl.innerHTML = '<p style="color:var(--danger);padding:12px;font-size:0.9rem;">Erreur lors du chargement.</p>';
      }
    }

    // ============================================================================
    // SOUMISSION
    // ============================================================================

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      const ContribForm = win.ContribForm || {};
      if (typeof ContribForm.handleSubmit !== 'function') {
        showToast('Module de soumission non disponible', 'error');
        return;
      }

      await ContribForm.handleSubmit(e, {
        form,
        elements: {
          geomModeRadios: Array.from(elements.geomModeRadios),
          fileRowEl: elements.fileRowEl,
          drawPanelEl: elements.drawPanelEl
        },
        onSetStatus: (msg) => console.log('[Status]', msg),
        onShowToast: showToast,
        onExitEditMode: () => {},
        onRefreshList: onRefreshList || (() => {}),
        onCloseContrib: onClose,
        __userRole: win.__CONTRIB_ROLE || ''
      });

      if (onSuccess) await onSuccess();
    };

    attachListener(form, 'submit', handleSubmit);

    // ============================================================================
    // PRÉ-REMPLISSAGE EN MODE ÉDITION
    // ============================================================================

    if (mode === 'edit' && data) {
      
      setTimeout(() => {
        if (elements.projectNameEl && data.project_name) elements.projectNameEl.value = data.project_name;
        
        // Catégorie avec retry
        const categoryValue = data.category_layer || data.category;
        if (elements.categoryEl && categoryValue) {
          elements.categoryEl.value = categoryValue;
          if (elements.categoryEl.value !== categoryValue) {
            setTimeout(() => {
              elements.categoryEl.value = categoryValue;
            }, 200);
          }
        }
        
        if (elements.metaEl && data.meta) elements.metaEl.value = data.meta;
        if (elements.descEl && data.description) elements.descEl.value = data.description;
        if (elements.officialInput && data.official_url) elements.officialInput.value = data.official_url;
        
        // Pré-remplir les tags après avoir défini la catégorie
        if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
          // Attendre que la catégorie soit définie et que renderTagsSelector soit appelé
          setTimeout(() => {
            // Déclencher manuellement le rendu des tags pour la catégorie
            const category = data.category_layer || data.category;
            if (category && win.ContribTags?.renderTagsSelector) {
              win.ContribTags.renderTagsSelector(category);
              // Puis pré-sélectionner les tags après un court délai
              setTimeout(() => {
                if (win.ContribTags?.setSelectedTags) {
                  win.ContribTags.setSelectedTags(data.tags);
                }
              }, 100);
            }
          }, 250);
        }
      }, 100);

      // Charger le markdown depuis l'URL
      if (data.markdown_url && elements.mdEl) {
        fetch(data.markdown_url)
          .then(response => response.text())
          .then(mdContent => {
            elements.mdEl.value = mdContent;
          })
          .catch(err => {
            console.warn('[contrib-create-form-v2] Failed to load markdown:', err);
          });
      }

      // Cover preview (affichée dans la dropzone)
      if (data.cover_url) {
        const coverDropzone = overlay.querySelector('#contrib-cover-dropzone');
        if (coverDropzone) {
          setTimeout(() => {
            renderCoverPreview(coverDropzone, data.cover_url, 'Cover existante');
          }, 150);
        }
      }

      // Stocker l'ID pour la soumission
      if (data.id) {
        form.dataset.editId = data.id;
        if (win.ContribForm?.setCurrentEditId) {
          win.ContribForm.setCurrentEditId(data.id);
        }
      }

      // Géométrie - URL stockée pour être chargée à l'étape 2
      if (data.geojson_url) {
        form.dataset.geojsonUrl = data.geojson_url;
        if (ContribGeometry.setEditGeojsonUrl) {
          ContribGeometry.setEditGeojsonUrl(data.geojson_url);
        }
      }
    }

    // ============================================================================
    // INITIALISATION
    // ============================================================================

    setStep(1);
    
    // Initialiser le système de tags
    if (win.ContribTags?.init) {
      try {
        win.ContribTags.init();
        console.log('[contrib-create-form-v2] Système de tags initialisé');
      } catch (err) {
        console.warn('[contrib-create-form-v2] Erreur initialisation tags:', err);
      }
    }

    // ============================================================================
    // API PUBLIQUE
    // ============================================================================

    return {
      setStep,
      getCurrentStep: () => currentStep,
      
      destroy: () => {
        
        // Nettoyer tous les listeners
        cleanupCallbacks.forEach(cb => {
          try { cb(); } catch (err) { console.warn('Cleanup error:', err); }
        });
        cleanupCallbacks.length = 0;
        
        // Reset complet du formulaire
        form.reset();
        
        // Nettoyer les datasets
        delete form.dataset.editId;
        delete form.dataset.geojsonUrl;
        
        // Réinitialiser l'ID d'édition dans ContribForm
        if (win.ContribForm?.setCurrentEditId) {
          win.ContribForm.setCurrentEditId(null);
        }
        
        // Nettoyer la géométrie
        if (ContribGeometry.clearEditGeojsonUrl) {
          ContribGeometry.clearEditGeojsonUrl();
        }
        if (ContribGeometry.clearAllDrawings) {
          try { ContribGeometry.clearAllDrawings(); } catch(_) {}
        }
        
        // Réinitialiser la cover
        const ContribUpload = win.ContribUpload || {};
        if (ContribUpload.resetCoverFile) {
          ContribUpload.resetCoverFile();
        }
        
        const coverDropzone = overlay.querySelector('#contrib-cover-dropzone');
        if (coverDropzone) {
          coverDropzone.classList.remove('has-file');
          const dzText = coverDropzone.querySelector('.dz-text');
          if (dzText) dzText.style.display = '';
          const previewContainer = coverDropzone.querySelector('.dz-preview-container');
          if (previewContainer) previewContainer.remove();
        }
        
        // Vider les documents
        if (elements.existingDocsEl) elements.existingDocsEl.innerHTML = '';
        if (elements.docsFieldset) elements.docsFieldset.innerHTML = '';
        
        currentInstance = null;
      }
    };
  }

  // ============================================================================
  // EXPORTS
  // ============================================================================

  win.ContribCreateForm = {
    initCreateForm
  };

})(window);
