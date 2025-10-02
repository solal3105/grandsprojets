// modules/contrib.js
;(function (win) {
  let modalLoaded = false;
  
  // Lazy load modal template
  async function loadModalTemplate() {
    if (modalLoaded) return true;
    
    try {
      const response = await fetch('modules/contrib/contrib-modal.html');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      const container = document.getElementById('contrib-modal-container');
      
      if (!container) {
        console.error('[contrib] Modal container not found in DOM');
        return false;
      }
      
      container.innerHTML = html;
      modalLoaded = true;
      console.log('[contrib] Modal template loaded successfully');
      return true;
      
    } catch (error) {
      console.error('[contrib] Error loading modal template:', error);
      // Show user-friendly error
      const container = document.getElementById('contrib-modal-container');
      if (container) {
        container.innerHTML = `
          <div style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); 
                      padding:24px; background:#fff; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.15);
                      max-width:400px; text-align:center; z-index:10000;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:48px; color:#f59e0b; margin-bottom:16px;"></i>
            <h3 style="margin:0 0 8px 0; color:#111;">Erreur de chargement</h3>
            <p style="margin:0 0 16px 0; color:#666;">Impossible de charger le formulaire de contribution.</p>
            <button onclick="location.reload()" class="gp-btn gp-btn--primary">
              <i class="fa-solid fa-rotate-right"></i> Recharger la page
            </button>
          </div>
        `;
      }
      return false;
    }
  }

  function setupContrib() {
    const contribToggle   = document.getElementById('nav-contribute');
    let contribOverlay  = document.getElementById('contrib-overlay');
    let contribCloseBtn = document.getElementById('contrib-close');
    let contribModal    = contribOverlay ? contribOverlay.querySelector('.gp-modal') : null;

    let contribLastFocus  = null;
    let contribCloseTimer = null;

    // Drawing state moved to contrib-map.js
    const ContribMap = win.ContribMap || {};

    const closeContrib = () => {
      if (!contribOverlay) return;
      if (contribCloseTimer) { clearTimeout(contribCloseTimer); contribCloseTimer = null; }
      if (contribModal) contribModal.classList.remove('is-open');
      contribOverlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', contribEscHandler);
      document.body.style.overflow = '';
      contribCloseTimer = setTimeout(() => {
        contribOverlay.style.display = 'none';
        if (contribLastFocus && typeof contribLastFocus.focus === 'function') {
          try { contribLastFocus.focus(); } catch (_) {}
        }
      }, 180);
    };

    // Helper function to show landing page
    const showLanding = () => {
      try {
        const landingEl = document.getElementById('contrib-landing');
        const tabsContainer = document.querySelector('#contrib-overlay .contrib-tabs');
        const panelCreate = document.getElementById('contrib-panel-create');
        const panelList = document.getElementById('contrib-panel-list');
        const panelCategories = document.getElementById('contrib-panel-categories');
        const backBtn = document.getElementById('contrib-back');
        
        if (landingEl) landingEl.hidden = false;
        if (tabsContainer) tabsContainer.style.display = 'none';
        if (panelCreate) panelCreate.hidden = true;
        if (panelList) panelList.hidden = true;
        if (panelCategories) panelCategories.hidden = true;
        if (backBtn) backBtn.style.display = 'none';
        
        // Afficher la card d'info utilisateur
        renderUserInfoCard();
      } catch(e) {
        console.warn('[contrib] showLanding error:', e);
      }
    };

    const openContrib = () => {
      if (!contribOverlay) return;
      if (contribCloseTimer) { clearTimeout(contribCloseTimer); contribCloseTimer = null; }
      contribLastFocus = document.activeElement;
      contribOverlay.style.display = 'flex';
      contribOverlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => { if (contribModal) contribModal.classList.add('is-open'); });
      // Focus sur le bouton fermer pour l'accessibilité
      if (contribCloseBtn && typeof contribCloseBtn.focus === 'function') {
        try { contribCloseBtn.focus(); } catch (_) {}
      }
      document.addEventListener('keydown', contribEscHandler);
      // Assurer le bon rendu de la carte de dessin si visible
      setTimeout(() => {
        try { if (drawMap) drawMap.invalidateSize(); } catch (_) {}
      }, 200);
      // Toujours afficher l'écran d'accueil (choix Créer / Modifier)
      showLanding();
    };

    const contribEscHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeContrib();
      }
    };

    if (contribToggle) {
      // Masquer/afficher le bouton "Contribuer" selon l'état d'authentification
      const applyContribVisibility = (session) => {
        try {
          const isAuthed = !!(session && session.user);
          if (contribToggle) contribToggle.style.display = isAuthed ? '' : 'none';
          // Si l'utilisateur se déconnecte pendant que la modale est ouverte, la fermer
          if (!isAuthed && contribOverlay && contribOverlay.getAttribute('aria-hidden') === 'false') {
            closeContrib();
          }
        } catch (_) { /* noop */ }
      };

      // Détection du rôle et des villes autorisées via table public.profiles (source de vérité)
      let __currentSession = null;
      let __isAdmin = false;
      let __userRole = '';
      let __userVilles = null; // null = toutes les villes, array = villes spécifiques
      const getUserProfileFromProfiles = async (session) => {
        try {
          const userId = session && session.user ? session.user.id : null;
          if (!userId) return { role: '', ville: null };
          const client = (win.AuthModule && typeof win.AuthModule.getClient === 'function') ? win.AuthModule.getClient() : null;
          if (!client) return { role: '', ville: null };
          const { data, error } = await client.from('profiles').select('role, ville').eq('id', userId).single();
          if (error) return { role: '', ville: null };
          return {
            role: (data && data.role ? String(data.role) : '').toLowerCase(),
            ville: data && data.ville ? data.ville : null
          };
        } catch (_) { return { role: '', ville: null }; }
      };
      const updateRoleState = async (session) => {
        __currentSession = session || null;
        const profile = await getUserProfileFromProfiles(__currentSession);
        __userRole = profile.role;
        __userVilles = profile.ville;
        __isAdmin = (__userRole === 'admin');
        console.log('[DEBUG updateRoleState] Profile récupéré:', profile);
        console.log('[DEBUG updateRoleState] __userRole:', __userRole);
        console.log('[DEBUG updateRoleState] __userVilles:', __userVilles);
        try { win.__CONTRIB_IS_ADMIN = __isAdmin; } catch(_) {}
        try { win.__CONTRIB_ROLE = __userRole; } catch(_) {}
        try { win.__CONTRIB_VILLES = __userVilles; } catch(_) {}
        // applyRoleConstraints will be called after form initialization
        try {
          if (typeof applyRoleConstraints === 'function') {
            applyRoleConstraints();
          }
        } catch(_) {}
      };

      // État initial
      try {
        if (win.AuthModule && typeof win.AuthModule.getSession === 'function') {
          win.AuthModule.getSession().then(({ data }) => { applyContribVisibility(data?.session); return updateRoleState(data?.session); }).catch(() => { applyContribVisibility(null); return updateRoleState(null); });
        }
      } catch (_) { /* noop */ }

      // Mises à jour dynamiques
      try {
        if (win.AuthModule && typeof win.AuthModule.onAuthStateChange === 'function') {
          win.AuthModule.onAuthStateChange((_event, session) => { applyContribVisibility(session); updateRoleState(session); });
        }
      } catch (_) { /* noop */ }

      contribToggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        try {
          const session = await (win.AuthModule && win.AuthModule.requireAuthOrRedirect('/login/'));
          if (!session || !session.user) return;
          
          // Load modal template if not already loaded
          const loaded = await loadModalTemplate();
          if (!loaded) {
            console.error('[contrib] Failed to load modal template');
            return;
          }
          
          // Re-query DOM elements after template load
          contribOverlay = document.getElementById('contrib-overlay');
          contribCloseBtn = document.getElementById('contrib-close');
          contribModal = contribOverlay ? contribOverlay.querySelector('.gp-modal') : null;
          
          // Bind modal events (only once)
          bindModalEvents();
          
          // Initialize form elements and bindings
          initializeContribForm();
          
          // Open the modal
          openContrib();
          
        } catch (error) {
          console.error('[contrib] Error opening modal:', error);
          // En cas d'erreur de session, on redirige vers la connexion
          win.location.href = '/login/';
        }
      });
    }
    
    // Bind modal close events (called once after template load)
    function bindModalEvents() {
      if (!contribCloseBtn || !contribOverlay) return;
      
      // Close button
      contribCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContrib();
      });
      
      // Click outside to close
      let overlayMouseDownOnSelf = false;
      contribOverlay.addEventListener('mousedown', (e) => {
        overlayMouseDownOnSelf = (e.target === contribOverlay);
      });
      contribOverlay.addEventListener('mouseup', (e) => {
        if (overlayMouseDownOnSelf && e.target === contribOverlay) {
          closeContrib();
        }
        overlayMouseDownOnSelf = false;
      });
    }

    // Close button and overlay bindings are now done dynamically after template load

    // Helper function to render user info card (needs to be accessible from openContrib)
    function renderUserInfoCard() {
      try {
        const landingEl = document.getElementById('contrib-landing');
        if (!landingEl) return;
        
        // Récupérer la session depuis AuthModule
        let email = 'Non connecté';
        try {
          if (win.AuthModule && typeof win.AuthModule.getSession === 'function') {
            win.AuthModule.getSession().then(({ data }) => {
              if (data?.session?.user?.email) {
                const emailEl = document.querySelector('#user-info-card .user-email');
                if (emailEl) emailEl.textContent = data.session.user.email;
              }
            }).catch(() => {});
          }
        } catch(_) {}
        
        const role = window.__CONTRIB_ROLE || 'aucun';
        const villes = window.__CONTRIB_VILLES;
        
        let villesText = '';
        const hasGlobalAccess = Array.isArray(villes) && villes.includes('global');
        
        if (hasGlobalAccess) {
          villesText = '<span style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; border-radius:20px; font-weight:600; font-size:0.9em; box-shadow:0 2px 8px rgba(16,185,129,0.25);"><i class="fa-solid fa-globe" style="font-size:0.95em;"></i> Toutes les collectivités</span>';
        } else if (Array.isArray(villes) && villes.length > 0) {
          villesText = villes.map(v => `<span style="display:inline-flex; align-items:center; padding:5px 12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; border-radius:16px; font-size:0.85em; font-weight:500; box-shadow:0 2px 6px rgba(16,185,129,0.2); margin:2px 4px 2px 0;">${v}</span>`).join('');
        } else {
          villesText = '<span style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:#fef2f2; color:#dc2626; border-radius:16px; font-weight:500; font-size:0.9em; border:1px solid #fecaca;"><i class="fa-solid fa-triangle-exclamation" style="font-size:0.9em;"></i> Aucune collectivité autorisée</span>';
        }
        
        const roleIcons = {
          admin: 'fa-user-shield',
          invited: 'fa-user-check',
          default: 'fa-user'
        };
        const roleIcon = roleIcons[role] || roleIcons.default;
        
        const cardHTML = `
          <div id="user-info-card" style="margin-bottom:24px; padding:20px; background:#ffffff; border-radius:16px; border:1px solid #d1fae5; box-shadow:0 4px 16px rgba(16,185,129,0.12), 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid #d1fae5;">
              <div style="display:flex; align-items:center; justify-content:center; width:52px; height:52px; background:linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius:14px; border:2px solid #6ee7b7; box-shadow:0 2px 8px rgba(16,185,129,0.15);">
                <i class="fa-solid ${roleIcon}" style="font-size:24px; color:#047857;"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:0.75em; color:#6b7280; text-transform:uppercase; letter-spacing:0.8px; font-weight:600; margin-bottom:4px;">Connecté en tant que</div>
                <div class="user-email" style="font-weight:600; font-size:1.05em; color:#111827; overflow:hidden; text-overflow:ellipsis;">${email}</div>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="min-width:90px; font-size:0.9em; color:#6b7280; font-weight:500;">Rôle</div>
                <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px; background:linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color:#047857; border-radius:20px; font-weight:600; font-size:0.9em; text-transform:capitalize; border:1px solid #6ee7b7;">
                  <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${role}
                </div>
              </div>
              <div style="display:flex; align-items:flex-start; gap:12px;">
                <div style="min-width:90px; font-size:0.9em; color:#6b7280; font-weight:500; padding-top:4px;">Collectivités</div>
                <div style="flex:1; display:flex; flex-wrap:wrap; align-items:center;">${villesText}</div>
              </div>
            </div>
          </div>
        `;
        
        // Injecter la card au début du landing
        let existingCard = landingEl.querySelector('#user-info-card');
        if (existingCard) existingCard.remove();
        landingEl.insertAdjacentHTML('afterbegin', cardHTML);
      } catch(e) {
        console.warn('[contrib] renderUserInfoCard error:', e);
      }
    }

    // Function to initialize all form elements and bindings after template load
    function initializeContribForm() {
      // Re-query all DOM elements
      const form = document.getElementById('contrib-form');
    const statusEl = document.getElementById('contrib-status');
    const cityEl = document.getElementById('contrib-city');
    const categoryEl = document.getElementById('contrib-category');
    const categoryHelpEl = document.getElementById('contrib-category-help');
    const createCategoryLink = document.getElementById('contrib-create-category-link');
    const addDocBtn = document.getElementById('contrib-doc-add');
    const docsFieldset = document.getElementById('contrib-docs');
    const existingDocsEl = document.getElementById('contrib-existing-docs');
    
    // Flag to ensure we load the city code list only at Step 1 and only once
    let citiesPopulatedOnce = false;

    // Geometry input UI elements
    const geomModeFieldset = document.getElementById('contrib-geom-mode');
    const geomModeRadios = geomModeFieldset ? geomModeFieldset.querySelectorAll('input[name="contrib-geom-mode"]') : [];
    const fileRowEl = document.getElementById('contrib-file-row');
    const drawPanelEl = document.getElementById('contrib-draw-panel');
    const dropzoneEl = document.getElementById('contrib-dropzone');
    const dzFilenameEl = document.getElementById('contrib-dz-filename');
    const geomCardFile = document.getElementById('geom-card-file');
    const geomCardDraw = document.getElementById('geom-card-draw');
    const drawMapContainerId = 'contrib-draw-map';
    // Manual drawing functions moved to contrib-map.js

    // Drawing toolbar and functions moved to contrib-draw-controls.js
    const ContribDrawControls = win.ContribDrawControls || {};
    
    // Setup callback for state changes
    if (ContribMap) {
      ContribMap.onDrawStateChange = () => {
        ContribDrawControls.updateButtonStates?.();
      };
    }

    function ensureManualToolbar() {
      if (!drawPanelEl) return;
      console.log('[contrib] Initializing draw controls toolbar');
      ContribDrawControls.initToolbar?.(drawPanelEl, () => {
        // Callback appelé lors des changements d'état
        console.log('[contrib] Draw state changed');
      });
    }

    function updateManualButtons() {
      ContribDrawControls.updateButtonStates?.();
    }

    // Stepper UI elements
    const stepperEl = document.getElementById('contrib-stepper');
    const stepTab1 = document.getElementById('contrib-step-1-tab');
    const stepTab2 = document.getElementById('contrib-step-2-tab');
    const stepTab3 = document.getElementById('contrib-step-3-tab');
    const stepTab4 = document.getElementById('contrib-step-4-tab');
    const prevBtn  = document.getElementById('contrib-prev');
    const nextBtn  = document.getElementById('contrib-next');
    const submitBtn = document.getElementById('contrib-submit');

    let currentStep = 1; // 1..4

    function queryStepEls(n) {
      return Array.from(document.querySelectorAll(`.contrib-step-${n}`));
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
      const nameEl = document.getElementById('contrib-project-name');
      const catEl  = document.getElementById('contrib-category');
      const hasName = !!(nameEl && nameEl.value && nameEl.value.trim());
      const hasCat  = !!(catEl && catEl.value);
      const ok = hasName && hasCat;
      if (!ok) {
        showToast('Veuillez renseigner le nom et la catégorie.', 'error');
      }
      return ok;
    }

    // hasDrawGeometry and validateStep2 moved to contrib-geometry.js
    function validateStep2() {
      const fileInput = document.getElementById('contrib-geojson');
      return ContribGeometry.validateStep2?.({ geomModeRadios, fileInput }) || false;
    }

    function validateStep3() {
      const meta = document.getElementById('contrib-meta')?.value?.trim();
      const desc = document.getElementById('contrib-description')?.value?.trim();
      const ok = !!meta && !!desc;
      if (!ok) showToast('Renseignez Meta et Description avant de continuer.', 'error');
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
      // Re-apply role constraints because showOnlyStep() resets display on step elements
      try { applyRoleConstraints(); } catch(_) {}
      setStepHeaderActive(currentStep);
      updateStepButtons(currentStep);

      // Met à jour uniquement l'état visuel du stepper (classes)
      // La barre de progression dédiée a été retirée pour privilégier le stepper existant

      // Charger le code collectivité UNIQUEMENT à l'étape 1, et une seule fois
      if (currentStep === 1 && !citiesPopulatedOnce) {
        try { populateCities(); citiesPopulatedOnce = true; } catch(_) {}
      }

      // Assurer l'initialisation de la carte et des contrôles de dessin dès l'entrée en étape 2
      if (currentStep === 2) {
        try {
          const mode = Array.from(geomModeRadios || []).find(r => r.checked)?.value || 'file';
          if (mode === 'draw') {
            if (drawPanelEl) drawPanelEl.style.display = '';
            if (fileRowEl) fileRowEl.style.display = 'none';
            initDrawMap();
            setTimeout(() => { try { if (drawMap) drawMap.invalidateSize(); } catch(_){} }, 50);
            // Manual drawing only
            ensureManualToolbar();
            // cancelManualDraw removed - handled by ContribMap
            // Removed informational status when entering draw mode
          } else {
            // Mode fichier: masquer le panneau de dessin et afficher le champ fichier
            if (drawPanelEl) drawPanelEl.style.display = 'none';
            if (fileRowEl) fileRowEl.style.display = '';
          }
        } catch(_) {}
        // En mode édition, précharger la géométrie à l'entrée en étape 2
        (async () => {
          try {
            const currentEditId = ContribForm.getCurrentEditId?.();
            if (!currentEditId) return;
            const editUrl = ContribGeometry.getEditGeojsonUrl?.();
            if (editUrl) {
              const elements = { drawPanelEl, cityEl, geomModeRadios, fileInput: document.getElementById('contrib-geojson') };
              return ContribGeometry.preloadGeometryOnMap?.(editUrl, elements);
            }
            // Fallback: recharger la ligne pour obtenir la dernière geojson_url
            if (win.supabaseService && typeof win.supabaseService.getContributionById === 'function') {
              const row = await win.supabaseService.getContributionById(currentEditId);
              const url = row && row.geojson_url ? row.geojson_url : null;
              if (url) { 
                ContribGeometry.setEditGeojsonUrl?.(url);
                const elements = { drawPanelEl, cityEl, geomModeRadios, fileInput: document.getElementById('contrib-geojson') };
                await ContribGeometry.preloadGeometryOnMap?.(url, elements);
              }
            }
          } catch (_) {}
        })();
      }

      // Charger/rafraîchir les dossiers liés à l'entrée en étape 4 (nom courant du projet)
      if (currentStep === 4) {
        try {
          const nameEl = document.getElementById('contrib-project-name');
          const pname = nameEl && nameEl.value ? nameEl.value.trim() : '';
          clearExistingDossiers();
          if (pname) { renderExistingDossiers(pname); }
        } catch (_) {}
      }

      // Focus first focusable in the step
      try {
        const stepEls = queryStepEls(currentStep);
        const firstInput = stepEls.map(el => el.querySelector('input, select, textarea, button')).find(Boolean);
        if (firstInput && firstInput.focus) firstInput.focus();
      } catch(_){}
    }

    function onClickStepTab(targetStep) {
      setStep(targetStep);
    }

    if (stepTab1) stepTab1.addEventListener('click', () => onClickStepTab(1));
    if (stepTab2) stepTab2.addEventListener('click', () => onClickStepTab(2));
    if (stepTab3) stepTab3.addEventListener('click', () => onClickStepTab(3));
    if (stepTab4) stepTab4.addEventListener('click', () => onClickStepTab(4));

    if (prevBtn)  prevBtn.addEventListener('click', () => setStep(currentStep - 1));
    if (nextBtn)  nextBtn.addEventListener('click', () => setStep(currentStep + 1));

    // Panels & list state (tabs supprimés)
    const panelCreate  = document.getElementById('contrib-panel-create');
    const panelList    = document.getElementById('contrib-panel-list');
    const panelCategories = document.getElementById('contrib-panel-categories');
    const backBtn      = document.getElementById('contrib-back');
    // Landing elements
    const landingEl = document.getElementById('contrib-landing');
    const landingCreateBtn = document.getElementById('landing-create');
    const landingEditBtn = document.getElementById('landing-edit');
    const landingCategoriesBtn = document.getElementById('landing-categories');
    const listEl       = document.getElementById('contrib-list');
    const listStatusEl = document.getElementById('contrib-list-status');
    const listSearchEl = document.getElementById('contrib-search');
    const listCatEl    = document.getElementById('contrib-filter-category');
    const listSortEl   = document.getElementById('contrib-sort');
    const listSentinel = document.getElementById('contrib-list-sentinel');
    const listMineOnlyEl = document.getElementById('contrib-mine-only');

    // currentEditId moved to contrib-form.js
    // editGeojsonUrl moved to contrib-geometry.js
    const ContribGeometry = win.ContribGeometry || {};
    const ContribUpload = win.ContribUpload || {};
    const ContribList = win.ContribList || {};
    const ContribForm = win.ContribForm || {};
    const ContribCities = win.ContribCities || {};
    const ContribCategories = win.ContribCategories || {};
    const ContribCategoriesCrud = win.ContribCategoriesCrud || {};
    // listState moved to contrib-list.js

    // —— Official project link (single field, all categories) ——
    const officialInput = document.getElementById('contrib-official-url');

    // Utilities moved to contrib-utils.js
    const { slugify, setStatus, showToast } = window.ContribUtils || {};

    // initDrawMap moved to contrib-map.js
    async function initDrawMap() {
      const existingMap = ContribMap.getDrawMap?.();
      if (existingMap) {
        console.log('[contrib] Draw map already initialized, skipping');
        return existingMap;
      }
      console.log('[contrib] Initializing draw map...');
      const map = await ContribMap.initDrawMap?.(drawMapContainerId, drawPanelEl, cityEl);
      console.log('[contrib] Draw map initialized:', map);
      return map;
    }

    // —— Tabs logic (ARIA, keyboard) ——
    function activateTab(which) {
      const isCreate = which === 'create';
      const isList = which === 'list';
      const isCategories = which === 'categories';
      if (panelCreate) panelCreate.hidden = !isCreate;
      if (panelList) panelList.hidden = !isList;
      if (panelCategories) panelCategories.hidden = !isCategories;
      // bouton retour visible quand on est hors landing
      if (backBtn) backBtn.style.display = '';

      if (isList) {
        // ensure list is initialized
        try {
          // Force mineOnly for any non-admin before first load
          const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : '';
          const isAdmin = role === 'admin';
          if (!isAdmin) {
            try { if (listMineOnlyEl) { listMineOnlyEl.checked = true; } } catch(_) {}
            ContribList.updateListState?.({ mineOnly: true });
          } else {
            ContribList.updateListState?.({ mineOnly: !!(listMineOnlyEl && listMineOnlyEl.checked) });
          }
          const state = ContribList.getListState?.() || {};
          if (listEl && !state.items?.length) listResetAndLoad();
        } catch(_) {}
        // focus first tabbable in list filters
        try { listSearchEl && listSearchEl.focus(); } catch(_) {}
      } else if (isCreate) {
        // focus close button for accessibility or project name
        const nameEl = document.getElementById('contrib-project-name');
        try { (nameEl && nameEl.focus && nameEl.focus()); } catch(_) {}
      } else if (isCategories) {
        // Load categories panel
        try { loadCategoriesPanel(); } catch(e) { console.error('[contrib] loadCategoriesPanel error:', e); }
      }
    }

    // —— Landing helpers ——
    const tabsContainer = document.querySelector('#contrib-overlay .contrib-tabs');
    
    // Créer et afficher la card d'information utilisateur
    function renderUserInfoCard() {
      try {
        // Récupérer la session depuis AuthModule plutôt que __currentSession (hors scope)
        let email = 'Non connecté';
        try {
          if (win.AuthModule && typeof win.AuthModule.getSession === 'function') {
            win.AuthModule.getSession().then(({ data }) => {
              if (data?.session?.user?.email) {
                const emailEl = document.querySelector('#user-info-card .user-email');
                if (emailEl) emailEl.textContent = data.session.user.email;
              }
            }).catch(() => {});
          }
        } catch(_) {}
        
        const role = window.__CONTRIB_ROLE || 'aucun';
        const villes = window.__CONTRIB_VILLES;
        
        let villesText = '';
        const hasGlobalAccess = Array.isArray(villes) && villes.includes('global');
        
        if (hasGlobalAccess) {
          villesText = '<span style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; border-radius:20px; font-weight:600; font-size:0.9em; box-shadow:0 2px 8px rgba(16,185,129,0.25);"><i class="fa-solid fa-globe" style="font-size:0.95em;"></i> Toutes les collectivités</span>';
        } else if (Array.isArray(villes) && villes.length > 0) {
          villesText = villes.map(v => `<span style="display:inline-flex; align-items:center; padding:5px 12px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff; border-radius:16px; font-size:0.85em; font-weight:500; box-shadow:0 2px 6px rgba(16,185,129,0.2); margin:2px 4px 2px 0;">${v}</span>`).join('');
        } else {
          // villes === null ou villes.length === 0
          villesText = '<span style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; background:#fef2f2; color:#dc2626; border-radius:16px; font-weight:500; font-size:0.9em; border:1px solid #fecaca;"><i class="fa-solid fa-triangle-exclamation" style="font-size:0.9em;"></i> Aucune collectivité autorisée</span>';
        }
        
        // Icône selon le rôle mais couleurs vertes uniformes
        const roleIcons = {
          admin: 'fa-user-shield',
          invited: 'fa-user-check',
          default: 'fa-user'
        };
        const roleIcon = roleIcons[role] || roleIcons.default;
        
        const cardHTML = `
          <div id="user-info-card" style="margin-bottom:24px; padding:20px; background:#ffffff; border-radius:16px; border:1px solid #d1fae5; box-shadow:0 4px 16px rgba(16,185,129,0.12), 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid #d1fae5;">
              <div style="display:flex; align-items:center; justify-content:center; width:52px; height:52px; background:linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius:14px; border:2px solid #6ee7b7; box-shadow:0 2px 8px rgba(16,185,129,0.15);">
                <i class="fa-solid ${roleIcon}" style="font-size:24px; color:#047857;"></i>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-size:0.75em; color:#6b7280; text-transform:uppercase; letter-spacing:0.8px; font-weight:600; margin-bottom:4px;">Connecté en tant que</div>
                <div class="user-email" style="font-weight:600; font-size:1.05em; color:#111827; overflow:hidden; text-overflow:ellipsis;">${email}</div>
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="min-width:90px; font-size:0.9em; color:#6b7280; font-weight:500;">Rôle</div>
                <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px; background:linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color:#047857; border-radius:20px; font-weight:600; font-size:0.9em; text-transform:capitalize; border:1px solid #6ee7b7;">
                  <i class="fa-solid fa-circle" style="font-size:6px;"></i> ${role}
                </div>
              </div>
              <div style="display:flex; align-items:flex-start; gap:12px;">
                <div style="min-width:90px; font-size:0.9em; color:#6b7280; font-weight:500; padding-top:4px;">Collectivités</div>
                <div style="flex:1; display:flex; flex-wrap:wrap; align-items:center;">${villesText}</div>
              </div>
            </div>
          </div>
        `;
        
        // Injecter la card au début du landing
        if (landingEl) {
          let existingCard = landingEl.querySelector('#user-info-card');
          if (existingCard) existingCard.remove();
          landingEl.insertAdjacentHTML('afterbegin', cardHTML);
        }
      } catch(e) {
        console.warn('[contrib] renderUserInfoCard error:', e);
      }
    }
    
    function showLanding() {
      try {
        if (landingEl) landingEl.hidden = false;
        if (tabsContainer) tabsContainer.style.display = 'none';
        if (panelCreate) panelCreate.hidden = true;
        if (panelList) panelList.hidden = true;
        if (panelCategories) panelCategories.hidden = true;
        if (backBtn) backBtn.style.display = 'none';
        // Afficher la card d'info utilisateur
        renderUserInfoCard();
      } catch(_) {}
    }
    function hideLanding() {
      try {
        if (landingEl) landingEl.hidden = true;
        if (tabsContainer) tabsContainer.style.display = '';
        if (backBtn) backBtn.style.display = '';
      } catch(_) {}
    }
    function chooseLanding(target) {
      try { sessionStorage.setItem('contribLandingSeen', '1'); } catch(_) {}
      hideLanding();
      if (target === 'list') {
        activateTab('list');
      } else if (target === 'categories') {
        activateTab('categories');
      } else {
        activateTab('create');
        try { setStep(1, { force: true }); } catch(_) {}
      }
    }

    // Bind landing buttons
    if (landingCreateBtn) landingCreateBtn.addEventListener('click', () => chooseLanding('create'));
    if (landingEditBtn) landingEditBtn.addEventListener('click', () => chooseLanding('list'));
    if (landingCategoriesBtn) landingCategoriesBtn.addEventListener('click', () => chooseLanding('categories'));
    if (backBtn) backBtn.addEventListener('click', () => showLanding());

    // —— List helpers ——
    function applyRoleConstraints() {
      try {
        const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : __userRole;
        const isInvited = role === 'invited';
        const isAdmin = role === 'admin';

        // City field visibility: toujours visible pour admin et invited (filtré par permissions)
        try {
          const cityInput = document.getElementById('contrib-city');
          const cityRow = cityInput ? cityInput.closest('.form-row') : null;
          const cityLabel = cityRow ? cityRow.querySelector('label[for="contrib-city"]') : null;
          if (cityRow && cityInput) {
            if (isAdmin || isInvited) {
              // Afficher le champ ville pour admin et invited (sera filtré par populateCities)
              cityRow.style.display = '';
              try { cityInput.required = false; } catch(_) {}
              if (cityLabel) cityLabel.textContent = 'Code collectivité';
            } else {
              // Masquer pour les autres rôles
              cityRow.style.display = 'none';
              try { cityInput.required = false; } catch(_) {}
            }
          }
        } catch(_) {}

        if (!isAdmin) {
          // Forcer mineOnly côté état et UI pour tous les non-admin
          if (listMineOnlyEl) {
            listMineOnlyEl.checked = true;
            try {
              listMineOnlyEl.checked = true;
              listMineOnlyEl.disabled = true;
              listMineOnlyEl.title = 'Limité à mes contributions (imposé par votre rôle)';
            } catch(_) {}
          }
          try { ContribList.updateListState?.({ mineOnly: true }); } catch(_) {}
          // If list panel is visible and already loaded, refresh with mineOnly
          try { if (panelList && !panelList.hidden) { listResetAndLoad(); } } catch(_) {}
        } else {
          // Rétablir l'UI si l'utilisateur est admin
          if (listMineOnlyEl) {
            try { listMineOnlyEl.disabled = false; } catch(_) {}
          }
          try { ContribList.updateListState?.({ mineOnly: !!(listMineOnlyEl && listMineOnlyEl.checked) }); } catch(_) {}
        }
      } catch(_) {}
    }
    // List helpers moved to contrib-list.js
    const setListStatus = (msg) => ContribList.setListStatus?.(msg, listStatusEl);
    const clearEmptyState = () => ContribList.clearEmptyState?.(listEl);
    const renderEmptyState = () => {
      const onCreateClick = () => { try { activateTab('create'); setStep(1, { force: true }); } catch(_) {} };
      ContribList.renderEmptyState?.(listEl, listSentinel, onCreateClick);
    };

    // Delete functions moved to contrib-list.js
    async function doDeleteContribution(id, projectName) {
      const onExitEditMode = (deletedId) => {
        const currentEditId = ContribForm.getCurrentEditId?.();
        if (currentEditId === deletedId) {
          try { exitEditMode(); } catch(_) {}
          setStatus('Contribution supprimée.', 'success');
        }
      };
      const onRefreshList = () => {
        if (panelList && !panelList.hidden) listResetAndLoad();
      };
      const elements = { listEl, listStatusEl, onExitEditMode, onRefreshList };
      await ContribList.doDeleteContribution?.(id, projectName, elements);
    }

    // renderItem moved to contrib-list.js
    function renderItem(item) {
      const onEdit = async (it) => {
        try {
          setListStatus('Chargement…');
          const row = await (win.supabaseService && win.supabaseService.getContributionById(it.id));
          setListStatus('');
          if (row) {
            enterEditMode(row);
            activateTab('create');
          }
        } catch (e) {
          setListStatus('Erreur de chargement.');
          showToast('Erreur lors du chargement de la contribution.', 'error');
        }
      };
      const onDelete = (id, name) => doDeleteContribution(id, name);
      return ContribList.renderItem?.(item, onEdit, onDelete) || document.createElement('div');
    }

    // listResetAndLoad moved to contrib-list.js
    async function listResetAndLoad() {
      const onEdit = async (item) => {
        try {
          setListStatus('Chargement…');
          const row = await (win.supabaseService && win.supabaseService.getContributionById(item.id));
          setListStatus('');
          if (row) {
            enterEditMode(row);
            activateTab('create');
          }
        } catch (e) {
          setListStatus('Erreur de chargement.');
          showToast('Erreur lors du chargement de la contribution.', 'error');
        }
      };
      const onDelete = (id, name) => doDeleteContribution(id, name);
      const onCreateClick = () => { try { activateTab('create'); setStep(1, { force: true }); } catch(_) {} };
      const elements = { listEl, listSentinel, listStatusEl, onEdit, onDelete, onCreateClick };
      await ContribList.listResetAndLoad?.(elements);
    }

    // listLoadMore and initInfiniteScroll moved to contrib-list.js
    async function listLoadMore() {
      const onEdit = async (item) => {
        try {
          setListStatus('Chargement…');
          const row = await (win.supabaseService && win.supabaseService.getContributionById(item.id));
          setListStatus('');
          if (row) {
            enterEditMode(row);
            activateTab('create');
          }
        } catch (e) {
          setListStatus('Erreur de chargement.');
          showToast('Erreur lors du chargement de la contribution.', 'error');
        }
      };
      const onDelete = (id, name) => doDeleteContribution(id, name);
      const onCreateClick = () => { try { activateTab('create'); setStep(1, { force: true }); } catch(_) {} };
      const elements = { listEl, listSentinel, listStatusEl, onEdit, onDelete, onCreateClick };
      await ContribList.listLoadMore?.(elements);
    }

    function initInfiniteScroll() {
      const onEdit = async (item) => {
        try {
          setListStatus('Chargement…');
          const row = await (win.supabaseService && win.supabaseService.getContributionById(item.id));
          setListStatus('');
          if (row) {
            enterEditMode(row);
            activateTab('create');
          }
        } catch (e) {
          setListStatus('Erreur de chargement.');
          showToast('Erreur lors du chargement de la contribution.', 'error');
        }
      };
      const onDelete = (id, name) => doDeleteContribution(id, name);
      const onCreateClick = () => { try { activateTab('create'); setStep(1, { force: true }); } catch(_) {} };
      const elements = { listEl, listSentinel, listStatusEl, onEdit, onDelete, onCreateClick };
      ContribList.initInfiniteScroll?.(listEl, listSentinel, elements);
    }

    // Filters listeners with debounce
    let debounceTimer = null;
    function debouncedReset() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { listResetAndLoad(); }, 250);
    }
    if (listSearchEl) listSearchEl.addEventListener('input', () => { 
      ContribList.updateListState?.({ search: listSearchEl.value || '' }); 
      debouncedReset(); 
    });
    // Trigger immediate search on Enter
    if (listSearchEl) listSearchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ContribList.updateListState?.({ search: listSearchEl.value || '' });
        listResetAndLoad();
      }
    });
    if (listCatEl) listCatEl.addEventListener('change', () => { 
      ContribList.updateListState?.({ category: listCatEl.value || '' }); 
      debouncedReset(); 
    });
    if (listSortEl) listSortEl.addEventListener('change', () => {
      const v = listSortEl.value || 'created_at:desc';
      const [by, dir] = v.split(':');
      const mapped = (by === 'updated_at') ? 'created_at' : (by || 'created_at');
      ContribList.updateListState?.({ 
        sortBy: mapped, 
        sortDir: (dir === 'asc') ? 'asc' : 'desc' 
      });
      debouncedReset();
    });
    if (listMineOnlyEl) listMineOnlyEl.addEventListener('change', () => {
      const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : __userRole;
      if (role === 'invited') {
        // Empêcher toute modification et forcer coché
        listMineOnlyEl.checked = true;
        ContribList.updateListState?.({ mineOnly: true });
        return; // pas de reset inutile
      }
      ContribList.updateListState?.({ mineOnly: !!listMineOnlyEl.checked });
      debouncedReset();
    });

    // Initialize infinite scroll once
    initInfiniteScroll();

    // —— Edit mode helpers ——
    const cancelEditBtn = document.getElementById('contrib-cancel-edit');
    // Hide cancel-edit button permanently; back button handles exit
    if (cancelEditBtn) cancelEditBtn.style.display = 'none';
    const deleteEditBtn = document.getElementById('contrib-delete');
    const coverPreview  = document.getElementById('contrib-cover-preview');

    // —— Cover preview + dropzone + compression moved to contrib-upload.js ——
    const coverInput = document.getElementById('contrib-cover');
    if (ContribUpload?.setupCoverDropzone) {
      ContribUpload.setupCoverDropzone(coverPreview, coverInput);
    }

    // —— Meta/Description char limits ——
    (function setupCharLimits(){
      const META_MAX = 160;
      const DESC_MAX = 500;

      initLimit('contrib-meta', META_MAX);
      initLimit('contrib-description', DESC_MAX);

      function initLimit(fieldId, max) {
        const el = document.getElementById(fieldId);
        if (!el) return;
        // Overlay at bottom-right of the field (avoid overlapping helper <small>)
        const row = el.closest('.form-row') || el.parentElement;
        if (row && !row.style.position) row.style.position = 'relative';
        const help = (row ? row.querySelector('small') : null);

        // container for tiny progress (top) + counter (below), aligned right
        const wrap = document.createElement('div');
        wrap.className = 'char-hud';
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'flex-end';
        wrap.style.gap = '4px';
        wrap.style.position = 'absolute';
        wrap.style.right = '8px';
        wrap.style.bottom = help ? '28px' : '6px';
        wrap.style.pointerEvents = 'none';

        const progOuter = document.createElement('div');
        progOuter.className = 'char-prog';
        progOuter.style.height = '2px';
        progOuter.style.width = '80px';
        progOuter.style.borderRadius = '999px';
        progOuter.style.background = 'rgba(0,0,0,0.08)';
        progOuter.style.position = 'relative';

        const progInner = document.createElement('div');
        progInner.className = 'char-prog-fill';
        progInner.style.height = '100%';
        progInner.style.width = '0%';
        progInner.style.borderRadius = '999px';
        progInner.style.background = 'rgba(33,150,243,0.6)';
        progInner.style.transition = 'width 0.1s linear';
        progOuter.appendChild(progInner);

        const counter = document.createElement('div');
        counter.className = 'char-counter';
        counter.style.fontSize = '11px';
        counter.style.opacity = '0.65';
        counter.id = `${fieldId}-counter`;

        wrap.appendChild(progOuter);
        wrap.appendChild(counter);
        if (row) { row.appendChild(wrap); } else { el.insertAdjacentElement('afterend', wrap); }
        try { el.setAttribute('aria-describedby', counter.id); } catch(_){}

        const clamp = () => {
          let v = el.value || '';
          if (v.length > max) {
            v = v.slice(0, max);
            el.value = v;
          }
          const used = v.length;
          const pct = Math.max(0, Math.min(100, (used / max) * 100));
          const remaining = Math.max(0, max - used);
          counter.textContent = `${remaining}`;
          progInner.style.width = `${pct}%`;
        };

        // init + bind
        clamp();
        el.addEventListener('input', clamp);
        el.addEventListener('blur', clamp);
      }
    })();

    function setEditUI(on) {
      const submitBtn = document.getElementById('contrib-submit');
      const nameEl = document.getElementById('contrib-project-name');
      if (submitBtn) submitBtn.querySelector('span')?.replaceChildren(document.createTextNode(on ? 'Enregistrer' : 'Envoyer'));
      // cancelEditBtn hidden globally (handled by Back button)
      if (deleteEditBtn) deleteEditBtn.style.display = on ? '' : 'none';
      if (nameEl) nameEl.focus();
    }

    // prefillForm, enterEditMode, exitEditMode moved to contrib-form.js
    function prefillForm(row) {
      const elements = {
        nameEl: document.getElementById('contrib-project-name'),
        catEl: document.getElementById('contrib-category'),
        citySel: document.getElementById('contrib-city'),
        metaEl: document.getElementById('contrib-meta'),
        descEl: document.getElementById('contrib-description'),
        mdEl: document.getElementById('contrib-markdown'),
        officialInput,
        coverPreview
      };
      ContribForm.prefillForm?.(row, elements);
    }

    function enterEditMode(row) {
      const elements = {
        nameEl: document.getElementById('contrib-project-name'),
        catEl: document.getElementById('contrib-category'),
        citySel: document.getElementById('contrib-city'),
        metaEl: document.getElementById('contrib-meta'),
        descEl: document.getElementById('contrib-description'),
        mdEl: document.getElementById('contrib-markdown'),
        officialInput,
        coverPreview,
        geomModeRadios,
        fileRowEl,
        drawPanelEl,
        geomCardFile,
        geomCardDraw
      };
      ContribForm.enterEditMode?.(row, elements, setEditUI, setStatus, setStep);
    }

    function exitEditMode() {
      const elements = {
        coverPreview,
        geomModeRadios,
        fileRowEl,
        drawPanelEl,
        geomCardFile,
        geomCardDraw
      };
      ContribForm.exitEditMode?.(form, elements, setEditUI, setStatus, clearExistingDossiers);
    }

    // cancelEditBtn removed; Back button already exits edit mode

    if (deleteEditBtn) {
      deleteEditBtn.addEventListener('click', async () => {
        const currentEditId = ContribForm.getCurrentEditId?.();
        console.log('[contrib] click delete in edit mode', { currentEditId });
        if (!currentEditId) { console.log('[contrib] deleteEditBtn: no currentEditId, abort'); return; }
        const projectName = document.getElementById('contrib-project-name')?.value?.trim();
        console.log('[contrib] edit mode delete: resolved projectName', { projectName });
        await doDeleteContribution(currentEditId, projectName);
      });
    }

    // setGeomMode, clearAllDrawings, preloadGeometryOnMap moved to contrib-geometry.js
    
    // Mode change listeners
    const elements = { 
      geomModeRadios, 
      fileRowEl, 
      drawPanelEl, 
      geomCardFile, 
      geomCardDraw,
      fileInput: document.getElementById('contrib-geojson'),
      dropzoneEl,
      dzFilenameEl,
      cityEl
    };
    
    if (geomModeRadios && geomModeRadios.length) {
      geomModeRadios.forEach(r => {
        r.addEventListener('change', () => {
          const checked = Array.from(geomModeRadios).find(x => x.checked)?.value || 'file';
          ContribGeometry.setGeomMode?.(checked, elements);
          // Initialize draw map when switching to draw mode
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
    if (geomCardFile) geomCardFile.addEventListener('click', () => {
      ContribGeometry.setGeomMode?.('file', elements);
    });
    if (geomCardDraw) geomCardDraw.addEventListener('click', () => {
      ContribGeometry.setGeomMode?.('draw', elements);
      // Initialize draw map when switching to draw mode
      setTimeout(() => {
        initDrawMap();
        ensureManualToolbar();
      }, 100);
    });
    
    // Initialize UI state - IMPORTANT: Call this to show/hide correct panels
    setTimeout(() => {
      const initialMode = (Array.from(geomModeRadios || []).find(x => x.checked)?.value) || 'file';
      ContribGeometry.setGeomMode?.(initialMode, elements);
      
      // Initialize draw map if needed
      if (initialMode === 'draw') {
        initDrawMap();
        ensureManualToolbar();
      }
    }, 100);

    // Dropzone setup moved to contrib-geometry.js
    ContribGeometry.setupDropzone?.(elements);

    // createDocRow and collectDocs moved to contrib-upload.js
    const createDocRow = ContribUpload?.createDocRow || (() => null);
    const collectDocs = () => ContribUpload?.collectDocs?.(docsFieldset) || [];

    // —— Existing consultation dossiers (display-only in edit mode) ——
    function clearExistingDossiers() {
      if (existingDocsEl) existingDocsEl.innerHTML = '';
    }

    async function renderExistingDossiers(projectName) {
      try {
        if (!existingDocsEl || !projectName) return;
        existingDocsEl.innerHTML = '';
        // Grille conteneur pour cards
        const grid = document.createElement('div');
        grid.className = 'cards-grid existing-docs-grid';
        existingDocsEl.appendChild(grid);
        // État chargement
        const load = document.createElement('div');
        load.className = 'cards-loading';
        load.textContent = 'Recherche des dossiers liés…';
        grid.appendChild(load);
        if (!win.supabaseService || typeof win.supabaseService.getConsultationDossiersByProject !== 'function') return;
        const dossiers = await win.supabaseService.getConsultationDossiersByProject(projectName);
        try { load.remove(); } catch(_) {}
        if (!Array.isArray(dossiers) || dossiers.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'card-empty-state';
          empty.textContent = 'Aucun dossier lié trouvé pour ce projet.';
          grid.appendChild(empty);
          return;
        }
        const uniq = new Map();
        dossiers.forEach(d => {
          if (d && d.pdf_url && !uniq.has(d.pdf_url)) uniq.set(d.pdf_url, d);
        });
        const docs = Array.from(uniq.values());
        if (!docs.length) {
          const empty = document.createElement('div');
          empty.className = 'card-empty-state';
          empty.textContent = 'Aucun dossier lié trouvé pour ce projet.';
          grid.appendChild(empty);
          return;
        }
        // Build cards with actions
        docs.forEach(d => {
          const card = document.createElement('article');
          card.className = 'existing-doc-card';
          card.dataset.id = d.id != null ? String(d.id) : '';
          card.dataset.url = d.pdf_url || '';
          const header = document.createElement('div');
          header.className = 'existing-doc-card__header';
          const icon = document.createElement('span');
          icon.className = 'doc-icon';
          icon.innerHTML = '<i class="fa-regular fa-file-pdf" aria-hidden="true"></i>';
          const title = document.createElement('h3');
          title.className = 'existing-doc-card__title';
          const link = document.createElement('a');
          link.href = d.pdf_url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = d.title || d.pdf_url;
          // Avoid toggling actions when clicking the link
          link.addEventListener('click', (e) => { e.stopPropagation(); });
          title.appendChild(link);
          header.appendChild(icon);
          header.appendChild(title);
          card.appendChild(header);

          const actions = document.createElement('div');
          actions.className = 'existing-doc-card__actions';
          // Icon-only buttons always visible
          const btnPreview = document.createElement('button');
          btnPreview.type = 'button';
          btnPreview.className = 'icon-btn icon-btn--view';
          btnPreview.setAttribute('aria-label', 'Prévisualiser');
          btnPreview.innerHTML = '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
          const btnEdit = document.createElement('button');
          btnEdit.type = 'button';
          btnEdit.className = 'icon-btn icon-btn--edit';
          btnEdit.setAttribute('aria-label', 'Modifier');
          btnEdit.innerHTML = '<i class="fa-regular fa-pen-to-square" aria-hidden="true"></i>';
          const btnDelete = document.createElement('button');
          btnDelete.type = 'button';
          btnDelete.className = 'icon-btn icon-btn--delete';
          btnDelete.setAttribute('aria-label', 'Supprimer');
          btnDelete.innerHTML = '<i class="fa-regular fa-trash-can" aria-hidden="true"></i>';
          actions.appendChild(btnPreview);
          actions.appendChild(btnEdit);
          actions.appendChild(btnDelete);
          card.appendChild(actions);

          btnPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = d.pdf_url;
            if (url) window.open(url, '_blank', 'noopener');
          });

          btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            // Inline simple editor: edit URL or upload a new PDF
            let editor = card.querySelector('.inline-edit-url');
            if (editor) { editor.remove(); }
            editor = document.createElement('div');
            editor.className = 'inline-edit-url';
            const currentUrl = d.pdf_url || '';
            editor.innerHTML = `
              <div class="inline-edit-url__row">
                <input type="url" class="edit-url-input" placeholder="https://…" value="${currentUrl.replace(/"/g, '&quot;')}">
              </div>
              <button type="button" class="gp-btn gp-btn--secondary pick-pdf inline-edit-url__full">Choisir PDF…</button>
              <div class="inline-edit-url__actions">
                <button type="button" class="gp-btn gp-btn-ghost cancel-edit">Annuler</button>
                <button type="button" class="gp-btn gp-btn--primary save-url">Enregistrer</button>
              </div>
              <input type="file" class="hidden-pdf" accept="application/pdf" style="display:none" />
              <div class="inline-edit-url__status" aria-live="polite"></div>
            `;
            card.appendChild(editor);

            const input = editor.querySelector('.edit-url-input');
            const statusEl = editor.querySelector('.inline-edit-url__status');
            const hiddenPicker = editor.querySelector('.hidden-pdf');
            const projectName = document.getElementById('contrib-project-name')?.value?.trim() || 'projet';

            const setLoading = (on) => { editor.classList.toggle('is-loading', !!on); };
            const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg || ''; };

            editor.querySelector('.cancel-edit')?.addEventListener('click', (ev) => {
              ev.stopPropagation(); editor.remove();
            });

            editor.querySelector('.save-url')?.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              try {
                if (!win.supabaseService || typeof win.supabaseService.updateConsultationDossierUrl !== 'function') return;
                const newUrl = input.value.trim();
                if (!newUrl) { setStatus('URL invalide.'); return; }
                setLoading(true); setStatus('Mise à jour…');
                const ok = await win.supabaseService.updateConsultationDossierUrl(d.id, newUrl);
                setLoading(false);
                if (ok) {
                  d.pdf_url = newUrl;
                  link.href = newUrl;
                  // On garde le texte (titre), seul le lien change
                  setStatus('URL mise à jour.');
                  setTimeout(() => editor.remove(), 800);
                } else {
                  setStatus('Échec de la mise à jour.');
                }
              } catch (_) {
                setLoading(false); setStatus('Erreur lors de la mise à jour.');
              }
            });

            editor.querySelector('.pick-pdf')?.addEventListener('click', (ev) => {
              ev.stopPropagation(); hiddenPicker?.click();
            });

            hiddenPicker?.addEventListener('change', async () => {
              const f = hiddenPicker.files && hiddenPicker.files[0];
              if (!f) return;
              try {
                if (!win.supabaseService || typeof win.supabaseService.uploadConsultationPdf !== 'function' || typeof win.supabaseService.updateConsultationDossierUrl !== 'function') return;
                setLoading(true); setStatus('Téléversement du PDF…');
                const publicUrl = await win.supabaseService.uploadConsultationPdf(f, projectName);
                setStatus('Mise à jour du lien…');
                const ok = await win.supabaseService.updateConsultationDossierUrl(d.id, publicUrl);
                setLoading(false);
                if (ok) {
                  d.pdf_url = publicUrl;
                  link.href = publicUrl;
                  setStatus('PDF mis à jour.');
                  setTimeout(() => editor.remove(), 800);
                } else {
                  setStatus('Échec de la mise à jour.');
                }
              } catch (_) {
                setLoading(false); setStatus('Erreur pendant le téléversement.');
              }
            });
          });

          btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            // Inline confirmation UI
            let confirmBar = card.querySelector('.inline-confirm');
            if (confirmBar) { confirmBar.remove(); }
            confirmBar = document.createElement('div');
            confirmBar.className = 'inline-confirm';
            confirmBar.innerHTML = `
              <span class="inline-confirm__text">Supprimer ce document ?</span>
              <div class="inline-confirm__actions">
                <button type="button" class="gp-btn gp-btn--danger confirm-delete">Supprimer</button>
                <button type="button" class="gp-btn gp-btn--secondary cancel-delete">Annuler</button>
              </div>
            `;
            card.appendChild(confirmBar);

            const onCancel = (ev) => { ev.stopPropagation(); confirmBar.remove(); };
            const onConfirm = async (ev) => {
              ev.stopPropagation();
              try {
                if (!win.supabaseService || typeof win.supabaseService.deleteConsultationDossier !== 'function') return;
                // Optional: loading state
                confirmBar.classList.add('is-loading');
                const ok = await win.supabaseService.deleteConsultationDossier(d.id);
                if (ok) {
                  card.remove();
                } else {
                  confirmBar.classList.remove('is-loading');
                  confirmBar.querySelector('.inline-confirm__text').textContent = 'Échec de la suppression.';
                }
              } catch (_) {
                confirmBar.classList.remove('is-loading');
                confirmBar.querySelector('.inline-confirm__text').textContent = 'Erreur lors de la suppression.';
              }
            };

            confirmBar.querySelector('.cancel-delete')?.addEventListener('click', onCancel);
            confirmBar.querySelector('.confirm-delete')?.addEventListener('click', onConfirm);
          });

          grid.appendChild(card);
        });
      } catch (e) {
        console.warn('[contrib] renderExistingDossiers error:', e);
        try {
          // Afficher un état d'erreur discret
          if (existingDocsEl) {
            const err = document.createElement('div');
            err.className = 'card-error-state';
            err.textContent = 'Impossible de charger les dossiers liés pour le moment.';
            existingDocsEl.appendChild(err);
          }
        } catch(_) {}
      }
    }

    // Helper: ensure docs fieldset hosts a grid and an Add CTA card
    function ensureDocsGrid() {
      if (!docsFieldset) return null;
      let grid = docsFieldset.querySelector('.cards-grid.docs-grid');
      if (!grid) {
        grid = document.createElement('div');
        grid.className = 'cards-grid docs-grid';
        // Move any existing .doc-card children into the grid
        const existing = Array.from(docsFieldset.querySelectorAll(':scope > .doc-card'));
        existing.forEach(el => grid.appendChild(el));
        // Place grid AFTER existing docs block if present, else append at end
        const existingBlock = docsFieldset.querySelector('#contrib-existing-docs');
        if (existingBlock && existingBlock.parentNode === docsFieldset) {
          existingBlock.insertAdjacentElement('afterend', grid);
        } else {
          docsFieldset.appendChild(grid);
        }
      }
      return grid;
    }

    function createAddDocCtaCard() {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'cta-card add-doc-cta';
      cta.innerHTML = '<span class="cta-icon"><i class="fa-solid fa-plus" aria-hidden="true"></i></span><span class="cta-label">Ajouter un document</span>';
      cta.addEventListener('click', () => {
        const grid = ensureDocsGrid();
        if (!grid) return;
        const row = createDocRow();
        // Insert before CTA itself
        grid.insertBefore(row, cta);
        // Focus the newly added title field
        row.querySelector('.doc-title')?.focus();
      });
      return cta;
    }

    // Initialize Add Document CTA behavior
    if (docsFieldset) {
      const grid = ensureDocsGrid();
      if (grid) {
        // Ensure CTA is present at the end of the grid
        const existingCta = grid.querySelector('.add-doc-cta');
        if (!existingCta) grid.appendChild(createAddDocCtaCard());
      }
    }

    if (addDocBtn && docsFieldset) {
      // Keep backward-compat: clicking legacy button adds a card before it
      addDocBtn.addEventListener('click', () => {
        const grid = ensureDocsGrid();
        const row = createDocRow();
        if (grid) {
          const cta = grid.querySelector('.add-doc-cta');
          if (cta) grid.insertBefore(row, cta); else grid.appendChild(row);
        } else {
          docsFieldset.insertBefore(row, addDocBtn);
        }
      });
    }

    // handleSubmit moved to contrib-form.js
    async function handleSubmit(e) {
      const elements = {
        geomModeRadios,
        fileRowEl,
        drawPanelEl,
        geomCardFile,
        geomCardDraw
      };
      const config = {
        form,
        elements,
        onSetStatus: setStatus,
        onShowToast: showToast,
        onExitEditMode: exitEditMode,
        onRefreshList: () => { if (panelList && !panelList.hidden) listResetAndLoad(); },
        onCloseContrib: closeContrib,
        __userRole
      };
      await ContribForm.handleSubmit?.(e, config);
    }

    if (form) {
      form.addEventListener('submit', handleSubmit);
    }

    // Old handleSubmit implementation removed (~185 lines moved to contrib-form.js)

    // populateCities and loadCategoriesForCity moved to contrib-cities.js
    async function populateCities() {
      await ContribCities.populateCities?.(cityEl);
    }

    async function loadCategoriesForCity(ville) {
      await ContribCities.loadCategoriesForCity?.(ville, categoryEl, categoryHelpEl);
    }
    
    // Lien pour créer une catégorie
    if (createCategoryLink) {
      createCategoryLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          // Sauvegarder la ville sélectionnée
          const selectedVille = cityEl?.value || '';
          
          // Réinitialiser complètement le formulaire de contribution
          if (form) form.reset();
          const currentEditId = ContribForm.getCurrentEditId?.();
          if (currentEditId) exitEditMode();
          
          // Masquer tous les panels
          if (panelCreate) panelCreate.hidden = true;
          if (panelList) panelList.hidden = true;
          if (panelCategories) panelCategories.hidden = true;
          
          // Afficher le landing
          showLanding();
          
          // Attendre un peu pour que l'UI se stabilise
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Activer le panel catégories
          chooseLanding('categories');
          
          // Pré-sélectionner la ville si elle était définie
          if (selectedVille && categoryVilleSelector) {
            await new Promise(resolve => setTimeout(resolve, 200));
            categoryVilleSelector.value = selectedVille;
            categoryVilleSelector.dispatchEvent(new Event('change'));
          }
        } catch(err) {
          console.error('[contrib] createCategoryLink error:', err);
        }
      });
    }

    // Recenter draw map on city change + charger les catégories
    if (cityEl) {
      cityEl.addEventListener('change', async () => {
        try {
          const v = (cityEl.value || '').trim();
          if (v) {
            await ContribCities.applyCityBrandingToDrawMap?.(v);
            await loadCategoriesForCity(v);
          } else {
            // Réinitialiser les catégories si pas de ville
            if (categoryEl) {
              categoryEl.disabled = true;
              categoryEl.innerHTML = '<option value="">Sélectionnez d\'abord une collectivité</option>';
            }
            if (categoryHelpEl) categoryHelpEl.style.display = 'none';
          }
        } catch (_) {}
      });
    }

    // Ne pas charger les villes ici: cela sera fait uniquement à l'étape 1 via setStep()

    // ==================== Gestion des catégories ====================
    
    const categoryFormContainer = document.getElementById('category-form-container');
    const categoryForm = document.getElementById('category-form');
    const categoryAddBtn = document.getElementById('category-add-btn');
    const categoriesList = document.getElementById('categories-list');
    const categoriesContent = document.getElementById('categories-content');
    const categoryFormTitle = document.getElementById('category-form-title');
    const categoryFormBack = document.getElementById('category-form-back');
    const categoryFormCancel = document.getElementById('category-form-cancel');
    
    const categoryVilleSelector = document.getElementById('category-ville-selector');
    const categoryVilleSelectorContainer = document.getElementById('category-ville-selector-container');
    const categoryNameInput = document.getElementById('category-name');
    const categoryIconInput = document.getElementById('category-icon');
    const categoryIconPreview = document.getElementById('category-icon-preview');
    const categoryIconPickerBtn = document.getElementById('category-icon-picker-btn');
    const categoryIconPicker = document.getElementById('category-icon-picker');
    const categoryIconGrid = document.getElementById('category-icon-grid');
    const categoryOrderInput = document.getElementById('category-order');
    const categoryVilleSelect = document.getElementById('category-ville');
    const categoryLayersCheckboxes = document.getElementById('category-layers-checkboxes');
    const categoryStyleColor = document.getElementById('category-style-color');
    const categoryStyleWeight = document.getElementById('category-style-weight');
    const categoryStyleDashArray = document.getElementById('category-style-dasharray');
    const categoryStyleOpacity = document.getElementById('category-style-opacity');
    const categoryStyleFill = document.getElementById('category-style-fill');
    const categoryStyleFillOptions = document.getElementById('category-style-fill-options');
    const categoryStyleFillColor = document.getElementById('category-style-fillcolor');
    const categoryStyleFillOpacity = document.getElementById('category-style-fillopacity');
    const categoryEditModeInput = document.getElementById('category-edit-mode');
    const categoryOriginalNameInput = document.getElementById('category-original-name');

    // ICON_PRESETS moved to contrib-categories.js

    // loadCategoriesPanel, populateIconPicker, populateCategoryVilleSelector, etc. moved to contrib-categories.js
    async function loadCategoriesPanel() {
      const elements = {
        categoryFormContainer,
        categoryIconPicker,
        categoryVilleSelectorContainer,
        categoryVilleSelector,
        categoriesContent,
        categoryIconGrid,
        categoryIconInput,
        categoryVilleSelect,
        categoryLayersCheckboxes
      };
      await ContribCategories.loadCategoriesPanel?.(elements, refreshCategoriesList);
    }

    // Old category panel functions removed (~330 lines moved to contrib-categories.js)

    // Listener sur le changement de ville dans le formulaire de catégorie
    if (categoryVilleSelect) {
      categoryVilleSelect.addEventListener('change', async () => {
        const ville = categoryVilleSelect.value;
        
        // Sauvegarder les sélections actuelles
        const currentSelections = Array.from(document.querySelectorAll('input[name="category-layer-checkbox"]:checked'))
          .map(cb => cb.value);
        
        // Recharger les checkboxes
        await ContribCategories.populateCategoryLayersCheckboxes?.(ville, categoryLayersCheckboxes);
        
        // Restaurer les sélections
        currentSelections.forEach(layerName => {
          const checkbox = document.querySelector(`input[name="category-layer-checkbox"][value="${layerName}"]`);
          if (checkbox) checkbox.checked = true;
        });
      });
    }

    // Removed ~290 lines of old category panel code (moved to contrib-categories.js)
    
    // Listener pour afficher/masquer les options de remplissage
    if (categoryStyleFill && categoryStyleFillOptions) {
      categoryStyleFill.addEventListener('change', () => {
        categoryStyleFillOptions.style.display = categoryStyleFill.checked ? 'block' : 'none';
        updateStylePreview();
      });
    }
    
    // Prévisualisation en temps réel des styles
    function updateStylePreview() {
      const line = document.getElementById('style-preview-line');
      const polygon = document.getElementById('style-preview-polygon');
      
      if (!line || !polygon) return;
      
      const color = categoryStyleColor?.value || '#000000';
      const weight = categoryStyleWeight?.value || 3;
      const dashArray = categoryStyleDashArray?.value || '';
      const opacity = categoryStyleOpacity?.value || 1;
      const fill = categoryStyleFill?.checked || false;
      const fillColor = categoryStyleFillColor?.value || '#999999';
      const fillOpacity = categoryStyleFillOpacity?.value || 0.3;
      
      // Appliquer à la ligne
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', weight);
      line.setAttribute('stroke-opacity', opacity);
      line.setAttribute('stroke-dasharray', dashArray);
      
      // Appliquer au polygone
      polygon.setAttribute('stroke', color);
      polygon.setAttribute('stroke-width', weight);
      polygon.setAttribute('stroke-opacity', opacity);
      polygon.setAttribute('stroke-dasharray', dashArray);
      polygon.setAttribute('fill', fill ? fillColor : 'none');
      polygon.setAttribute('fill-opacity', fill ? fillOpacity : 0);
    }
    
    // Écouter les changements sur tous les champs de style
    [categoryStyleColor, categoryStyleWeight, categoryStyleDashArray, categoryStyleOpacity, 
     categoryStyleFillColor, categoryStyleFillOpacity].forEach(input => {
      if (input) {
        input.addEventListener('input', updateStylePreview);
        input.addEventListener('change', updateStylePreview);
      }
    });
    
    // Initialiser la prévisualisation après un court délai pour s'assurer que le DOM est prêt
    setTimeout(() => {
      updateStylePreview();
    }, 100);

    // refreshCategoriesList moved to contrib-categories-crud.js
    async function refreshCategoriesList() {
      const elements = { categoriesList, categoriesContent, categoryVilleSelector };
      await ContribCategoriesCrud.refreshCategoriesList?.(elements, showCategoryForm, deleteCategory);
    }

    // showCategoryForm moved to contrib-categories-crud.js
    function showCategoryForm(mode, data = {}) {
      const elements = {
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
        categoryVilleSelector
      };
      ContribCategoriesCrud.showCategoryForm?.(mode, data, elements, updateStylePreview);
    }

    // hideCategoryForm moved to contrib-categories-crud.js
    async function hideCategoryForm() {
      const elements = {
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
      };
      await ContribCategoriesCrud.hideCategoryForm?.(elements, refreshCategoriesList);
    }

    // deleteCategory moved to contrib-categories-crud.js
    async function deleteCategory(ville, category) {
      await ContribCategoriesCrud.deleteCategory?.(ville, category, showToast, refreshCategoriesList);
    }

    // Bind category add button
    if (categoryAddBtn) {
      categoryAddBtn.addEventListener('click', () => showCategoryForm('create'));
    }

    // Bind category form back button
    if (categoryFormBack) {
      categoryFormBack.addEventListener('click', async () => {
        await hideCategoryForm();
      });
    }

    // Bind category form cancel
    if (categoryFormCancel) {
      categoryFormCancel.addEventListener('click', async () => {
        await hideCategoryForm();
      });
    }

    // Bind category form submit - moved to contrib-categories-crud.js
    if (categoryForm) {
      categoryForm.addEventListener('submit', async (e) => {
        const elements = {
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
        };
        await ContribCategoriesCrud.handleCategoryFormSubmit?.(e, elements, showToast, hideCategoryForm, refreshCategoriesList);
      });
    }

    // Listen to main ville selector change to refresh list
    if (categoryVilleSelector) {
      categoryVilleSelector.addEventListener('change', async () => {
        await refreshCategoriesList();
        // Hide form when changing city
        hideCategoryForm();
      });
    }

    // Toggle icon picker
    if (categoryIconPickerBtn && categoryIconPicker) {
      categoryIconPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = categoryIconPicker.style.display !== 'none';
        categoryIconPicker.style.display = isVisible ? 'none' : 'block';
      });
      
      // Close picker when clicking outside
      document.addEventListener('click', (e) => {
        if (categoryIconPicker && categoryIconPicker.style.display !== 'none') {
          if (!categoryIconPicker.contains(e.target) && e.target !== categoryIconPickerBtn && !categoryIconPickerBtn.contains(e.target)) {
            categoryIconPicker.style.display = 'none';
          }
        }
      });
    }

    // Live preview of icon in form
    if (categoryIconInput && categoryIconPreview) {
      const updateIconPreview = () => {
        try {
          let iconClass = categoryIconInput.value.trim();
          const iconEl = categoryIconPreview.querySelector('i');
          
          if (iconEl) {
            if (iconClass) {
              // Auto-fix: if user enters "fa-building" without style prefix, add "fa-solid"
              if (iconClass.startsWith('fa-') && !iconClass.startsWith('fa-solid') && !iconClass.startsWith('fa-regular') && !iconClass.startsWith('fa-brands') && !iconClass.startsWith('fa-light') && !iconClass.startsWith('fa-thin') && !iconClass.startsWith('fa-duotone')) {
                iconClass = 'fa-solid ' + iconClass;
              }
              iconEl.className = iconClass;
              
              // Visual feedback: check if icon loaded
              setTimeout(() => {
                const computed = window.getComputedStyle(iconEl, ':before');
                const content = computed.getPropertyValue('content');
                if (content && content !== 'none' && content !== '""') {
                  iconEl.parentElement.style.borderColor = '#4caf50';
                  iconEl.parentElement.style.background = '#e8f5e9';
                } else {
                  iconEl.parentElement.style.borderColor = '#f44336';
                  iconEl.parentElement.style.background = '#ffebee';
                }
              }, 50);
            } else {
              iconEl.className = 'fa-solid fa-question';
              iconEl.parentElement.style.borderColor = '#ddd';
              iconEl.parentElement.style.background = '#fff';
            }
          }
        } catch(_) {}
      };
      
      categoryIconInput.addEventListener('input', updateIconPreview);
      categoryIconInput.addEventListener('change', updateIconPreview);
      
      // Auto-correct on blur
      categoryIconInput.addEventListener('blur', () => {
        try {
          let iconClass = categoryIconInput.value.trim();
          if (iconClass && iconClass.startsWith('fa-') && !iconClass.startsWith('fa-solid') && !iconClass.startsWith('fa-regular') && !iconClass.startsWith('fa-brands') && !iconClass.startsWith('fa-light') && !iconClass.startsWith('fa-thin') && !iconClass.startsWith('fa-duotone')) {
            categoryIconInput.value = 'fa-solid ' + iconClass;
            updateIconPreview();
          }
        } catch(_) {}
      });
    }

    // Ensure tab default is Create only if landing is not visible
    // Ne pas écraser l'écran d'accueil (Créer / Modifier)
    try {
      const landingVisible = landingEl && landingEl.hidden === false;
      if (!landingVisible) {
        activateTab('create');
      }
    } catch(_) {}
    
    } // End of initializeContribForm()
  }

  // Fonction helper exportée pour vérifier si l'utilisateur peut éditer une ville
  win.canEditVille = function(villeCode) {
    try {
      const villes = win.__CONTRIB_VILLES;
      const role = win.__CONTRIB_ROLE;
      
      // Si pas de rôle ou rôle non autorisé, refuser
      if (!role || (role !== 'admin' && role !== 'invited')) {
        return false;
      }
      
      // Si l'utilisateur a l'accès global
      if (Array.isArray(villes) && villes.includes('global')) {
        return true;
      }
      
      // Vérifier si la ville est dans la liste des villes autorisées
      if (Array.isArray(villes) && villes.length > 0) {
        return villes.includes(villeCode);
      }
      
      // Si villes est null ou vide, aucune ville n'est autorisée
      return false;
    } catch (_) {
      return false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContrib);
  } else {
    setupContrib();
  }
})(window);
