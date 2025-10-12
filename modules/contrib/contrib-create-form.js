// modules/contrib/contrib-create-form.js
// Gestion du formulaire de création de contribution
;(function(win) {
  'use strict';

  /**
   * Initialise le formulaire de création avec stepper, validations, etc.
   * @param {Object} options - Configuration
   * @param {HTMLFormElement} options.form - Le formulaire
   * @param {HTMLElement} options.overlay - L'overlay de la modale
   * @param {String} options.mode - 'create' ou 'edit'
   * @param {Object} options.data - Données à pré-remplir (en mode édition)
   * @param {Function} options.onClose - Callback de fermeture
   * @param {Function} options.onSuccess - Callback après succès
   */
  function initCreateForm(options) {
    const {
      form,
      overlay,
      mode = 'create',
      data = {},
      onClose,
      onSuccess
    } = options;

    if (!form || !overlay) {
      console.error('[contrib-create-form] Missing required elements');
      return;
    }

    // ============================================================================
    // RÉCUPÉRATION DES ÉLÉMENTS
    // ============================================================================

    // Stepper
    const stepperEl = overlay.querySelector('.contrib-stepper');
    const stepTab1 = overlay.querySelector('#contrib-step-1-tab');
    const stepTab2 = overlay.querySelector('#contrib-step-2-tab');
    const stepTab3 = overlay.querySelector('#contrib-step-3-tab');
    const stepTab4 = overlay.querySelector('#contrib-step-4-tab');
    const prevBtn = overlay.querySelector('#contrib-prev');
    const nextBtn = overlay.querySelector('#contrib-next');
    const submitBtn = overlay.querySelector('#contrib-submit');

    // Champs formulaire
    const cityEl = overlay.querySelector('#contrib-city');
    const projectNameEl = overlay.querySelector('#contrib-project-name');
    const categoryEl = overlay.querySelector('#contrib-category');
    const categoryHelpEl = overlay.querySelector('#contrib-category-help');
    const createCategoryLink = overlay.querySelector('#contrib-create-category-link');

    // Géométrie
    const geomModeFieldset = overlay.querySelector('#contrib-geom-mode');
    const geomModeRadios = geomModeFieldset ? geomModeFieldset.querySelectorAll('input[name="contrib-geom-mode"]') : [];
    const fileRowEl = overlay.querySelector('#contrib-file-row');
    const drawPanelEl = overlay.querySelector('#contrib-draw-panel');
    const dropzoneEl = overlay.querySelector('#contrib-dropzone');
    const dzFilenameEl = overlay.querySelector('#contrib-dz-filename');
    const geomCardFile = overlay.querySelector('#geom-card-file');
    const geomCardDraw = overlay.querySelector('#geom-card-draw');
    const geojsonInput = overlay.querySelector('#contrib-geojson');
    const drawMapContainerId = 'contrib-draw-map';

    // Cover & metadata
    const coverInput = overlay.querySelector('#contrib-cover');
    const coverPreview = overlay.querySelector('#contrib-cover-preview');
    const metaEl = overlay.querySelector('#contrib-meta');
    const descEl = overlay.querySelector('#contrib-description');
    const mdEl = overlay.querySelector('#contrib-markdown');

    // Liens
    const officialInput = overlay.querySelector('#contrib-official-url');
    const docsFieldset = overlay.querySelector('#contrib-docs');
    const existingDocsEl = overlay.querySelector('#contrib-existing-docs');
    const addDocBtn = overlay.querySelector('#contrib-doc-add');

    // Modules
    const ContribGeometry = win.ContribGeometry || {};
    const ContribUpload = win.ContribUpload || {};
    const ContribMap = win.ContribMap || {};
    const ContribDrawControls = win.ContribDrawControls || {};
    const ContribForm = win.ContribForm || {};
    const ContribUtils = win.ContribUtils || {};
    const { showToast: utilsShowToast } = ContribUtils || {};
    
    // Fallback si showToast n'est pas disponible
    const showToast = utilsShowToast || ((msg, kind) => {
      console.warn('[contrib-create-form] showToast not available from ContribUtils');
      console.log('[Toast]', kind, ':', msg);
    });

    // ============================================================================
    // STEPPER LOGIC
    // ============================================================================

    let currentStep = 1; // 1..4

    function queryStepEls(n) {
      const elements = Array.from(overlay.querySelectorAll(`.contrib-step-${n}`));
      console.log(`[queryStepEls] Step ${n}: found ${elements.length} elements`, elements.map(el => el.id || el.className));
      return elements;
    }

    function setStepHeaderActive(n) {
      const tabs = [stepTab1, stepTab2, stepTab3, stepTab4];
      tabs.forEach((t, idx) => {
        if (!t) return;
        const stepIndex = idx + 1;
        const isActive = stepIndex === n;
        const isComplete = stepIndex < n;
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        t.tabIndex = isActive ? 0 : -1;
        try {
          t.classList.toggle('is-current', isActive);
          t.classList.toggle('is-active', isActive);
          t.classList.toggle('is-complete', isComplete);
        } catch(_) {}
      });
    }

    function updateStepButtons(n) {
      if (prevBtn) prevBtn.style.display = (n > 1) ? '' : 'none';
      if (nextBtn) nextBtn.style.display = (n < 4) ? '' : 'none';
      if (submitBtn) submitBtn.style.display = (n === 4) ? '' : 'none';
    }

    function showOnlyStep(n) {
      [1,2,3,4].forEach(i => {
        queryStepEls(i).forEach(el => { el.style.display = (i === n) ? '' : 'none'; });
      });
    }

    function validateStep1() {
      const hasName = !!(projectNameEl && projectNameEl.value && projectNameEl.value.trim());
      const hasCat  = !!(categoryEl && categoryEl.value);
      const ok = hasName && hasCat;
      if (!ok) {
        showToast?.('Veuillez renseigner le nom et la catégorie.', 'error');
      }
      return ok;
    }

    function validateStep2() {
      return ContribGeometry.validateStep2?.({ geomModeRadios, fileInput: geojsonInput }) || false;
    }

    function validateStep3() {
      const meta = metaEl?.value?.trim();
      const desc = descEl?.value?.trim();
      const ok = !!meta && !!desc;
      if (!ok) showToast?.('Renseignez Meta et Description avant de continuer.', 'error');
      return ok;
    }

    function canGoToStep(target) {
      if (target <= 1) return true;
      if (target === 2) return validateStep1();
      if (target === 3) return validateStep1() && validateStep2();
      if (target === 4) return validateStep1() && validateStep2() && validateStep3();
      return false;
    }

    function setStep(n, opts = {}) {
      const { force = false } = opts || {};
      if (!force && !canGoToStep(n)) return;
      currentStep = Math.min(4, Math.max(1, n));
      showOnlyStep(currentStep);
      setStepHeaderActive(currentStep);
      updateStepButtons(currentStep);

      // Assurer l'initialisation de la géométrie en étape 2
      if (currentStep === 2) {
        const mode = Array.from(geomModeRadios || []).find(r => r.checked)?.value || 'file';
        console.log('[setStep] Step 2 - Initializing geometry mode:', mode);
        
        // Initialiser le mode géométrie (met à jour les cartes et l'état interne)
        ContribGeometry.setGeomMode?.(mode, geomElements);
        
        // Initialiser la carte si mode dessin
        if (mode === 'draw') {
          initDrawMap();
          ensureManualToolbar();
        }
      }

      // Charger les dossiers liés en étape 4
      if (currentStep === 4) {
        try {
          const pname = projectNameEl?.value?.trim() || '';
          clearExistingDossiers();
          if (pname) renderExistingDossiers(pname);
        } catch (_) {}
      }

      // Focus first input
      try {
        const stepEls = queryStepEls(currentStep);
        const firstInput = stepEls.map(el => el.querySelector('input, select, textarea, button')).find(Boolean);
        if (firstInput && firstInput.focus) firstInput.focus();
      } catch(_){}
    }

    function onClickStepTab(targetStep) {
      setStep(targetStep);
    }

    // Bind stepper
    if (stepTab1) stepTab1.addEventListener('click', () => onClickStepTab(1));
    if (stepTab2) stepTab2.addEventListener('click', () => onClickStepTab(2));
    if (stepTab3) stepTab3.addEventListener('click', () => onClickStepTab(3));
    if (stepTab4) stepTab4.addEventListener('click', () => onClickStepTab(4));

    if (prevBtn) prevBtn.addEventListener('click', () => setStep(currentStep - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => setStep(currentStep + 1));

    // ============================================================================
    // CARTE & GÉOMÉTRIE
    // ============================================================================

    async function initDrawMap() {
      const existingMap = ContribMap.getDrawMap?.();
      if (existingMap) {
        console.log('[contrib-create-form] Draw map already initialized');
        return existingMap;
      }
      console.log('[contrib-create-form] Initializing draw map...');
      const map = await ContribMap.initDrawMap?.(drawMapContainerId, drawPanelEl, cityEl);
      console.log('[contrib-create-form] Draw map initialized:', map);
      return map;
    }

    function ensureManualToolbar() {
      if (!drawPanelEl) return;
      console.log('[contrib-create-form] Initializing draw controls toolbar');
      ContribDrawControls.initToolbar?.(drawPanelEl, () => {
        console.log('[contrib-create-form] Draw state changed');
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
      geomModeRadios: Array.from(geomModeRadios),
      fileRowEl,
      drawPanelEl,
      geomCardFile,
      geomCardDraw,
      fileInput: geojsonInput,
      dropzoneEl,
      dzFilenameEl,
      cityEl
    };

    // Mode change listeners
    if (geomModeRadios && geomModeRadios.length) {
      geomModeRadios.forEach(r => {
        r.addEventListener('change', () => {
          const checked = Array.from(geomModeRadios).find(x => x.checked)?.value || 'file';
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

    // Card click listeners
    if (geomCardFile) {
      geomCardFile.addEventListener('click', () => {
        ContribGeometry.setGeomMode?.('file', geomElements);
      });
    }
    if (geomCardDraw) {
      geomCardDraw.addEventListener('click', () => {
        ContribGeometry.setGeomMode?.('draw', geomElements);
        setTimeout(() => {
          initDrawMap();
          ensureManualToolbar();
        }, 100);
      });
    }

    // Dropzone setup (fait seulement le binding, ne change pas le display)
    console.log('[contrib-create-form] Setting up dropzone with elements:', {
      dropzoneEl: !!dropzoneEl,
      dzFilenameEl: !!dzFilenameEl,
      geojsonInput: !!geojsonInput
    });
    ContribGeometry.setupDropzone?.(geomElements);
    
    // Note: Le mode géométrie sera initialisé automatiquement quand on passera à la step 2

    // ============================================================================
    // DOCUMENTS LIÉS
    // ============================================================================

    const createDocRow = ContribUpload?.createDocRow || (() => null);
    const collectDocs = () => ContribUpload?.collectDocs?.(docsFieldset) || [];

    function clearExistingDossiers() {
      if (existingDocsEl) existingDocsEl.innerHTML = '';
    }

    async function renderExistingDossiers(projectName) {
      // Note: Cette fonction est complexe (300 lignes) et gère l'affichage/édition des dossiers existants
      // Pour l'instant, on la laisse vide car elle n'est utilisée qu'en mode édition
      try {
        if (!existingDocsEl || !projectName) return;
        existingDocsEl.innerHTML = '<p style="opacity:0.6;padding:12px;">Chargement des dossiers liés...</p>';
        // TODO: Implémenter si besoin en mode édition
      } catch(_) {}
    }

    if (addDocBtn && docsFieldset) {
      addDocBtn.addEventListener('click', () => {
        const row = createDocRow();
        docsFieldset.insertBefore(row, addDocBtn);
      });
    }

    // ============================================================================
    // SUBMIT
    // ============================================================================

    async function handleSubmit(e) {
      e.preventDefault();
      
      try {
        // Utiliser ContribForm.handleSubmit si disponible
        if (ContribForm && typeof ContribForm.handleSubmit === 'function') {
          const elements = {
            geomModeRadios: Array.from(geomModeRadios),
            fileRowEl,
            drawPanelEl,
            geomCardFile,
            geomCardDraw
          };
          const config = {
            form,
            elements,
            onSetStatus: (msg, type) => console.log(`[Status] ${msg}`),
            onShowToast: showToast,
            onExitEditMode: () => {},
            onRefreshList: () => {},
            onCloseContrib: onClose,
            __userRole: (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : ''
          };
          await ContribForm.handleSubmit(e, config);
          
          // Succès
          if (onSuccess) await onSuccess();
        } else {
          showToast?.('Module de soumission non disponible', 'error');
        }
      } catch (error) {
        console.error('[contrib-create-form] Submit error:', error);
        showToast?.('Erreur lors de la création', 'error');
      }
    }

    form.addEventListener('submit', handleSubmit);

    // ============================================================================
    // UPLOAD COVER
    // ============================================================================

    if (ContribUpload && typeof ContribUpload.initCoverUpload === 'function') {
      const uploadElements = { coverInput, coverPreview };
      ContribUpload.initCoverUpload(uploadElements);
    }

    // ============================================================================
    // PRÉ-REMPLISSAGE EN MODE ÉDITION
    // ============================================================================

    if (mode === 'edit' && data) {
      console.log('[contrib-create-form] Prefilling form with data:', data);
      
      // Pré-remplir les champs
      if (projectNameEl && data.project_name) projectNameEl.value = data.project_name;
      if (categoryEl && data.category_layer) categoryEl.value = data.category_layer;
      if (metaEl && data.meta) metaEl.value = data.meta;
      if (descEl && data.description) descEl.value = data.description;
      if (mdEl && data.markdown) mdEl.value = data.markdown;
      if (officialInput && data.official_url) officialInput.value = data.official_url;
      
      // Cover preview
      if (data.cover_url && coverPreview) {
        coverPreview.innerHTML = `<img src="${data.cover_url}" alt="Cover" style="max-width:200px;border-radius:8px;">`;
      }
      
      // Stocker l'ID pour la soumission
      if (data.id) {
        form.dataset.editId = data.id;
      }
      
      // Géométrie - sera chargée à l'étape 2 via ContribGeometry
      if (data.geojson_url) {
        form.dataset.geojsonUrl = data.geojson_url;
      }
    }

    // ============================================================================
    // INITIALISATION FINALE
    // ============================================================================

    // Initialiser à l'étape 1 (force pour éviter les validations)
    setStep(1, { force: true });
    console.log('[contrib-create-form] Initialized at step 1, mode:', mode);

    // ============================================================================
    // RETOURNER LES MÉTHODES PUBLIQUES
    // ============================================================================

    return {
      setStep,
      getCurrentStep: () => currentStep,
      validateStep1,
      validateStep2,
      validateStep3,
      reset: () => {
        form.reset();
        setStep(1, { force: true });
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
