// modules/contrib.js
;(function (win) {
  let modalLoaded = false;
  let categoryModalLoaded = false;
  let createModalLoaded = false;
  
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
                      padding:24px; background:var(--surface); border-radius:12px; box-shadow:0 4px 24px var(--black-alpha-15);
                      max-width:400px; text-align:center; z-index:10000;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:48px; color:var(--warning); margin-bottom:16px;"></i>
            <h3 style="margin:0 0 8px 0; color:var(--gray-900);">Erreur de chargement</h3>
            <p style="margin:0 0 16px 0; color:var(--gray-500);">Impossible de charger le formulaire de contribution.</p>
            <button onclick="location.reload()" class="gp-btn gp-btn--primary">
              <i class="fa-solid fa-rotate-right"></i> Recharger la page
            </button>
          </div>
        `;
      }
      return false;
    }
  }
  
  // Lazy load category modal template
  async function loadCategoryModalTemplate() {
    if (categoryModalLoaded) return true;
    
    try {
      const response = await fetch('modules/contrib/contrib-category-modal.html');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      const container = document.getElementById('contrib-modal-container');
      
      if (!container) {
        console.error('[contrib] Modal container not found in DOM');
        return false;
      }
      
      // Ajouter la modale catégorie après la modale contrib
      container.insertAdjacentHTML('beforeend', html);
      categoryModalLoaded = true;
      console.log('[contrib] Category modal template loaded successfully');
      
      return true;
      
    } catch (error) {
      console.error('[contrib] Error loading category modal template:', error);
      return false;
    }
  }
  
  let inviteModalLoaded = false;
  
  // Lazy load invite modal template
  async function loadInviteModalTemplate() {
    if (inviteModalLoaded) return true;
    
    try {
      const response = await fetch('modules/contrib/contrib-invite-modal.html');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      const container = document.getElementById('contrib-modal-container');
      
      if (!container) {
        console.error('[contrib] Modal container not found in DOM');
        return false;
      }
      
      // Ajouter la modale invitation après les autres modales
      container.insertAdjacentHTML('beforeend', html);
      inviteModalLoaded = true;
      console.log('[contrib] Invite modal template loaded successfully');
      return true;
      
    } catch (error) {
      console.error('[contrib] Error loading invite modal template:', error);
      return false;
    }
  }
  
  // Lazy load create modal template
  async function loadCreateModalTemplate() {
    if (createModalLoaded) return true;
    
    try {
      const response = await fetch('modules/contrib/contrib-create-modal.html');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      const container = document.getElementById('contrib-modal-container');
      
      if (!container) {
        console.error('[contrib] Modal container not found in DOM');
        return false;
      }
      
      // Ajouter la modale création après les autres modales
      container.insertAdjacentHTML('beforeend', html);
      createModalLoaded = true;
      console.log('[contrib] Create modal template loaded successfully');
      return true;
      
    } catch (error) {
      console.error('[contrib] Error loading create modal template:', error);
      return false;
    }
  }

  function setupContrib() {
    const contribToggle   = document.getElementById('nav-contribute');
    let contribOverlay  = document.getElementById('contrib-overlay');
    let contribCloseBtn = document.getElementById('contrib-close');
    let contribModal    = contribOverlay ? contribOverlay.querySelector('.gp-modal') : null;

    // Drawing state moved to contrib-map.js
    const ContribMap = win.ContribMap || {};

    const closeContrib = () => {
      if (!contribOverlay) return;
      
      // Utiliser ModalHelper pour une gestion unifiée
      win.ModalHelper.close('contrib-overlay');
    };

    const openContrib = async () => {
      if (!contribOverlay) return;
      
      // Utiliser ModalHelper pour une gestion unifiée
      win.ModalHelper.open('contrib-overlay', {
        dismissible: true,
        lockScroll: true,
        focusTrap: true,
        onOpen: async () => {
          // Assurer le bon rendu de la carte de dessin si visible
          setTimeout(() => {
            try { if (drawMap) drawMap.invalidateSize(); } catch (_) {}
          }, 200);
          
          // Afficher le landing pour sélectionner une ville
          showLanding();
          
          // Attendre que l'utilisateur sélectionne une ville et clique sur une action
          // OU ouvrir directement la création si une ville est déjà sélectionnée via l'URL
          const urlParams = new URLSearchParams(window.location.search);
          const autoCreateCity = urlParams.get('city');
          
          if (autoCreateCity) {
            // Si ville dans l'URL, passer directement à la création
            const CityContext = win.ContribCityContext || {};
            CityContext.setSelectedCity?.(autoCreateCity);
            await openCreateModal('create');
          }
        }
      });
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
      
      const updateUserInfoCard = async (session, profile) => {
        try {
          const card = document.getElementById('user-info-card');
          const emailEl = document.getElementById('user-info-email');
          const roleBadge = document.getElementById('user-role-badge');
          const citiesBadge = document.getElementById('user-cities-badge');
          
          if (!card || !emailEl || !roleBadge || !citiesBadge) return;
          
          if (!session || !session.user) {
            card.style.display = 'none';
            return;
          }
          
          const email = session.user.email || 'Utilisateur';
          const role = profile.role || '';
          const villes = profile.ville;
          
          emailEl.textContent = email;
          
          // Badge de rôle avec icône
          const roleLabel = role === 'admin' ? 'Admin' : role === 'invited' ? 'Invited' : 'User';
          const roleIcon = role === 'admin' ? 'fa-shield-halved' : 'fa-user-check';
          roleBadge.innerHTML = `<i class="fa-solid ${roleIcon}"></i> ${roleLabel}`;
          
          // Badge des villes
          let citiesText = '';
          if (Array.isArray(villes)) {
            const filtered = villes.filter(v => v !== 'global');
            if (villes.includes('global')) {
              // Si global, récupérer toutes les villes de city_branding
              try {
                const client = (win.AuthModule && typeof win.AuthModule.getClient === 'function') ? win.AuthModule.getClient() : null;
                if (client) {
                  const { data: cities, error } = await client
                    .from('city_branding')
                    .select('ville, brand_name')
                    .order('ville', { ascending: true });
                  
                  if (!error && cities && cities.length > 0) {
                    const cityNames = cities.map(c => c.brand_name || c.ville).join(', ');
                    citiesText = `<i class="fa-solid fa-globe"></i> ${cityNames}`;
                  } else {
                    console.error('[contrib] city_branding query error:', error);
                    citiesText = '<i class="fa-solid fa-globe"></i> Toutes les structures';
                  }
                } else {
                  citiesText = '<i class="fa-solid fa-globe"></i> Toutes les structures';
                }
              } catch (e) {
                console.error('[contrib] Failed to fetch cities:', e);
                citiesText = '<i class="fa-solid fa-globe"></i> Toutes les structures';
              }
            } else if (filtered.length > 0) {
              citiesText = `<i class="fa-solid fa-location-dot"></i> ${filtered.join(', ')}`;
            } else {
              citiesText = '<i class="fa-solid fa-triangle-exclamation"></i> Aucune structure';
            }
          } else if (villes) {
            citiesText = `<i class="fa-solid fa-location-dot"></i> ${villes}`;
          } else {
            citiesText = '<i class="fa-solid fa-triangle-exclamation"></i> Aucune structure';
          }
          citiesBadge.innerHTML = citiesText;
          
          card.style.display = 'flex';
          
          // Bind logout button
          const logoutBtn = document.getElementById('user-logout-btn');
          if (logoutBtn) {
            // Remove previous listeners
            const newLogoutBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
            
            // Add new listener
            newLogoutBtn.addEventListener('click', () => {
              window.location.href = '/logout';
            });
          }
        } catch (e) {
          console.error('[contrib] updateUserInfoCard error:', e);
        }
      };
      const updateRoleState = async (session) => {
        __currentSession = session || null;
        const profile = await getUserProfileFromProfiles(__currentSession);
        __userRole = profile.role;
        __userVilles = profile.ville;
        __isAdmin = (__userRole === 'admin');
        try { win.__CONTRIB_IS_ADMIN = __isAdmin; } catch(_) {}
        try { win.__CONTRIB_ROLE = __userRole; } catch(_) {}
        try { win.__CONTRIB_VILLES = __userVilles; } catch(_) {}
        
        // Mettre à jour la user-info-card (async)
        updateUserInfoCard(session, profile).catch(e => console.error('[contrib] updateUserInfoCard error:', e));
        
        // applyRoleConstraints will be called after form initialization
        try {
          if (typeof applyRoleConstraints === 'function') {
            applyRoleConstraints();
          }
        } catch(_) {}
        // La user-info-card est déjà mise à jour par updateUserInfoCard() ci-dessus
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
          
          // Initialize Modal Navigation System
          initializeModalNavigation();
          
          // Initialize form elements and bindings
          initializeContribForm();
          
          // Mettre à jour le rôle avant d'ouvrir la modale
          await updateRoleState(session);
          
          // Open the modal
          openContrib();
          
          // Appliquer les contraintes de rôle après l'ouverture (pour garantir que les éléments existent)
          setTimeout(async () => {
            try { 
              applyRoleConstraints();
            } catch(e) { 
              console.error('[DEBUG] Erreur applyRoleConstraints ou branding:', e);
            }
          }, 100);
          
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

    // —— Modal Navigation System ——
    function initializeModalNavigation() {
      if (!window.ModalNavigation) {
        console.warn('[contrib] ModalNavigation.js not loaded');
        return;
      }
      
      try {
        window.ModalNavigation.init('contrib-overlay', {
          panels: {
            landing: {
              label: '<i class="fa fa-home"></i> Accueil',
              title: 'Proposer une contribution',
              hasFooter: false,
              headerActions: []
            },
            list: {
              label: 'Mes contributions',
              title: 'Modifier mes contributions',
              hasFooter: false,
              headerActions: [
                {
                  id: 'contrib-list-create-btn',
                  icon: 'fa-solid fa-plus',
                  label: 'Créer',
                  variant: 'primary'
                }
              ]
            },
            categories: {
              label: 'Catégories',
              title: 'Gérer les catégories',
              hasFooter: false,
              headerActions: [
                {
                  id: 'category-add-btn',
                  icon: 'fa-solid fa-plus',
                  label: 'Nouvelle catégorie',
                  variant: 'primary'
                }
              ]
            },
            users: {
              label: 'Utilisateurs',
              title: 'Gérer les utilisateurs',
              hasFooter: false,
              headerActions: [
                {
                  id: 'invite-user-btn',
                  icon: 'fa-solid fa-user-plus',
                  label: 'Inviter un utilisateur',
                  variant: 'primary'
                }
              ]
            }
          }
        });
        
        console.log('[contrib] ModalNavigation initialized');
      } catch (error) {
        console.error('[contrib] Error initializing ModalNavigation:', error);
      }
    }

    // —— Helper functions (defined early for use in initializeContribForm) ——


    // Helper function to show landing page
    function showLanding() {
      window.ModalNavigation?.navigateTo('landing');
      
      // Initialiser le sélecteur de ville
      CityContext.initLandingCitySelector?.();
      
      // Réappliquer les contraintes de rôle
      try {
        applyRoleConstraints?.();
      } catch(e) {
        console.warn('[contrib] showLanding error:', e);
      }
    }

    // Function to apply role-based constraints (defined early to be available everywhere)
    function applyRoleConstraints() {
      try {
        const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : __userRole;
        const isInvited = role === 'invited';
        const isAdmin = role === 'admin';

        // La ville est maintenant sélectionnée sur le landing - pas de gestion ici

        // Afficher/masquer les boutons de gestion selon le rôle (admin uniquement)
        try {
          const landingCategoriesBtn = document.getElementById('landing-categories');
          if (landingCategoriesBtn) {
            landingCategoriesBtn.style.display = isAdmin ? '' : 'none';
          }
        } catch(_) {}

        try {
          const landingUsersBtn = document.getElementById('landing-users');
          if (landingUsersBtn) {
            landingUsersBtn.style.display = isAdmin ? '' : 'none';
          }
        } catch(_) {}
        
        try {
          const landingBrandingBtn = document.getElementById('landing-branding');
          if (landingBrandingBtn) {
            landingBrandingBtn.style.display = isAdmin ? '' : 'none';
          }
        } catch(_) {}
        
        try {
          const landingEditCityBtn = document.getElementById('landing-edit-city');
          if (landingEditCityBtn) {
            landingEditCityBtn.style.display = isAdmin ? '' : 'none';
          }
        } catch(_) {}
        
        try {
          const inviteUserBtn = document.getElementById('invite-user-btn');
          if (inviteUserBtn) {
            inviteUserBtn.style.display = isAdmin ? '' : 'none';
          }
        } catch(_) {}

        // Afficher/masquer le bouton "Gérer les villes" selon le rôle (admin global uniquement)
        const userVilles = (typeof win.__CONTRIB_VILLES !== 'undefined') ? win.__CONTRIB_VILLES : __userVilles;
        const hasGlobalAccess = Array.isArray(userVilles) && userVilles.includes('global');
        const isGlobalAdmin = isAdmin && hasGlobalAccess;
        
        try {
          const landingCitiesBtn = document.getElementById('landing-cities');
          if (landingCitiesBtn) {
            landingCitiesBtn.style.display = isGlobalAdmin ? '' : 'none';
          }
        } catch(_) {}
        
        try {
          const addCityBtn = document.getElementById('add-city-btn');
          if (addCityBtn) {
            addCityBtn.style.display = isGlobalAdmin ? '' : 'none';
          }
        } catch(_) {}

        // Pour tous : afficher la checkbox et le message informatif selon le rôle
        try {
          const toggleEl = document.getElementById('contrib-mine-only-toggle');
          const noticeEl = document.getElementById('contrib-invited-notice');
          
          if (!isAdmin) {
            // Invited : checkbox visible, message informatif visible
            if (toggleEl) toggleEl.style.display = '';
            if (noticeEl) noticeEl.style.display = 'block';
            
            // Par défaut : voir ses contributions + celles approuvées (mineOnly = false)
            if (listMineOnlyEl) {
              try {
                listMineOnlyEl.checked = false;
                listMineOnlyEl.disabled = false;
              } catch(_) {}
            }
            try { ContribList.updateListState?.({ mineOnly: false }); } catch(_) {}
          } else {
            // Admin : checkbox visible, message masqué
            if (toggleEl) toggleEl.style.display = '';
            if (noticeEl) noticeEl.style.display = 'none';
            
            // Par défaut : voir toutes les contributions de la ville (mineOnly = false)
            if (listMineOnlyEl) {
              try {
                listMineOnlyEl.checked = false;
                listMineOnlyEl.disabled = false;
              } catch(_) {}
            }
            try { ContribList.updateListState?.({ mineOnly: false }); } catch(_) {}
          }
          
          try { if (panelList && !panelList.hidden) { listResetAndLoad(); } } catch(_) {}
        } catch(_) {}
      } catch(_) {}
    }

    // Gestion du contexte de ville via module dédié
    const CityContext = win.ContribCityContext || {};

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
      
      // Landing city selector
      const landingCitySelect = document.getElementById('landing-city-select');

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
    const prevBtn  = document.getElementById('contrib-prev-footer');
    const nextBtn  = document.getElementById('contrib-next-footer');
    const submitBtn = document.getElementById('contrib-submit-footer');

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

    // ============================================================================
    // VALIDATION UNIFIÉE DU STEPPER
    // ============================================================================
    
    /**
     * Vérifie si on peut aller à l'étape cible
     * Utilise la validation HTML5 native + validations custom
     * @param {number} target - Numéro de l'étape cible
     * @returns {boolean} True si la navigation est autorisée
     */
    function canGoToStep(target) {
      // Retour en arrière toujours autorisé
      if (target <= currentStep) {
        console.log(`[contrib] Going back from step ${currentStep} to ${target} - allowed`);
        return true;
      }
      
      console.log(`[contrib] Attempting to go from step ${currentStep} to ${target}`);
      
      // Validation HTML5 des champs required visibles de l'étape actuelle
      const form = document.getElementById('contrib-form');
      if (!form) {
        console.error('[contrib] Form #contrib-form not found');
        return false;
      }
      
      // Récupérer TOUS les éléments de l'étape actuelle (peut y en avoir plusieurs)
      const currentStepElements = queryStepEls(currentStep);
      if (!currentStepElements || currentStepElements.length === 0) {
        console.warn(`[contrib] No step elements found for step ${currentStep}`);
        return false;
      }
      
      console.log(`[contrib] Found ${currentStepElements.length} elements for step ${currentStep}`);
      
      // Récupérer tous les champs required de l'étape actuelle (dans TOUS les éléments)
      const requiredFields = [];
      currentStepElements.forEach(el => {
        const fields = Array.from(el.querySelectorAll('[required]'));
        requiredFields.push(...fields);
      });
      
      console.log(`[contrib] Found ${requiredFields.length} required fields for step ${currentStep}`);
      
      // Valider chaque champ required visible
      for (const field of requiredFields) {
        // Ignorer les champs cachés ou désactivés
        if (field.offsetParent === null || field.disabled) {
          console.log(`[contrib] Skipping hidden/disabled field:`, field.id || field.name);
          continue;
        }
        
        console.log(`[contrib] Validating field:`, field.id || field.name, 'value:', field.value);
        
        // Utiliser la validation HTML5 native
        if (!field.checkValidity()) {
          console.error(`[contrib] ❌ Field validation FAILED:`, field.id || field.name, field.validationMessage);
          
          // Afficher le message d'erreur natif
          field.reportValidity();
          
          // Toast personnalisé
          const fieldLabel = field.labels?.[0]?.textContent || field.name || field.id || 'Ce champ';
          showToast(`${fieldLabel} est obligatoire.`, 'error');
          
          // Focus sur le champ invalide
          try { field.focus(); } catch(_) {}
          
          return false;
        }
      }
      
      // Validations custom supplémentaires par étape
      if (target >= 3) {
        console.log('[contrib] Validating step 2 geometry...');
        // Validation étape 2 : géométrie (file OU draw)
        const mode = Array.from(geomModeRadios || []).find(r => r.checked)?.value || 'file';
        const fileInput = document.getElementById('contrib-geojson');
        const hasGeom = ContribGeometry?.hasGeometry?.(mode, fileInput) || false;
        
        if (!hasGeom) {
          console.error('[contrib] ❌ Geometry validation FAILED');
          const message = mode === 'file' 
            ? 'Veuillez sélectionner un fichier GeoJSON.'
            : 'Veuillez dessiner une géométrie puis terminer.';
          showToast(message, 'error');
          return false;
        }
        
        console.log('[contrib] ✅ Geometry validation passed');
      }
      
      console.log(`[contrib] ✅ Step ${currentStep} validation passed, proceeding to step ${target}`);
      return true;
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

    /**
     * Gestionnaire de clic sur un onglet du stepper
     * La validation est gérée par canGoToStep() appelé dans setStep()
     */
    function onClickStepTab(targetStep) {
      setStep(targetStep);
    }

    // Event listeners pour les onglets du stepper
    if (stepTab1) stepTab1.addEventListener('click', () => onClickStepTab(1));
    if (stepTab2) stepTab2.addEventListener('click', () => onClickStepTab(2));
    if (stepTab3) stepTab3.addEventListener('click', () => onClickStepTab(3));
    if (stepTab4) stepTab4.addEventListener('click', () => onClickStepTab(4));

    // Event listeners pour les boutons Précédent/Suivant
    if (prevBtn)  prevBtn.addEventListener('click', () => setStep(currentStep - 1));
    if (nextBtn)  nextBtn.addEventListener('click', () => setStep(currentStep + 1));

    // Panels & list state (tabs supprimés)
    const panelList    = document.getElementById('contrib-panel-list');
    const panelCategories = document.getElementById('contrib-panel-categories');
    const panelUsers   = document.getElementById('contrib-panel-users');
    const backBtn      = document.getElementById('contrib-back');
    // Landing elements
    const landingEl = document.getElementById('contrib-landing');
    const landingEditBtn = document.getElementById('landing-edit');
    const landingCategoriesBtn = document.getElementById('landing-categories');
    const landingUsersBtn = document.getElementById('landing-users');
    const landingEditCityBtn = document.getElementById('landing-edit-city');
    const listEl       = document.getElementById('contrib-list');
    const listSearchEl = document.getElementById('contrib-search');
    const listCatEl    = document.getElementById('contrib-filter-category');
    const listSortEl   = document.getElementById('contrib-sort');
    const listSentinel = document.getElementById('contrib-list-sentinel');
    const listMineOnlyEl = document.getElementById('contrib-mine-only');
    // Users panel elements
    const usersListEl  = document.getElementById('users-list');
    const usersSearchEl = document.getElementById('users-search');
    const inviteUserBtn = document.getElementById('invite-user-btn');

    // currentEditId moved to contrib-form.js
    // editGeojsonUrl moved to contrib-geometry.js
    const ContribGeometry = win.ContribGeometry || {};
    const ContribUpload = win.ContribUpload || {};
    const ContribList = win.ContribList || {};
    const ContribForm = win.ContribForm || {};
    const ContribCities = win.ContribCities || {};
    const ContribCategories = win.ContribCategories || {};
    const ContribCategoriesCrud = win.ContribCategoriesCrud || {};
    const ContribUsers = win.ContribUsers || {};
    const ContribCitiesManagement = win.ContribCitiesManagement || {};
    const ContribBrandingSimple = win.ContribBrandingSimple || {};
    // listState moved to contrib-list.js

    // —— Official project link (single field, all categories) ——
    const officialInput = document.getElementById('contrib-official-url');

    // Utilities moved to contrib-utils.js
    const { slugify, setStatus, showToast: utilsShowToast } = window.ContribUtils || {};
    
    // Fallback si showToast n'est pas disponible
    const showToast = utilsShowToast || ((msg, kind) => {
      console.warn('[contrib] showToast not available from ContribUtils');
      console.log('[Toast]', kind, ':', msg);
    });

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

    // —— Tabs logic ——
    async function activateTab(which) {
      if (which === 'list') {
        try {
          // Valider qu'une ville est sélectionnée
          if (!CityContext.hasSelectedCity?.()) {
            console.warn('[activateTab] No city selected, cannot load list');
            return;
          }
          
          // Peupler le dropdown de catégories
          await populateCategoryFilter();
          
          // Appliquer les contraintes de rôle AVANT de configurer les filtres
          applyRoleConstraints();
          
          // Configurer les filtres APRÈS applyRoleConstraints
          const role = (typeof win.__CONTRIB_ROLE === 'string') ? win.__CONTRIB_ROLE : '';
          const isAdmin = role === 'admin';
          const filterCity = CityContext.getSelectedCity?.();
          
          console.log('[activateTab list] filterCity:', filterCity, 'role:', role);
          
          // Pour invited : mineOnly est déjà configuré à false par applyRoleConstraints
          // Pour admin : on prend la valeur de la checkbox
          const mineOnly = listMineOnlyEl?.checked || false;
          
          console.log('[activateTab list] Applying filters:', { mineOnly, filterCity });
          
          // Appliquer les filtres et charger
          ContribList.updateListState?.({ mineOnly, filterCity });
          await listResetAndLoad();
          
          // Focus
          listSearchEl?.focus();
        } catch(e) {
          console.error('[activateTab list] Error:', e);
        }
      } else if (which === 'categories') {
        // Load categories panel
        try { 
          await refreshCategoriesList(); 
        } catch(e) { 
          console.error('[contrib] refreshCategoriesList error:', e); 
        }
      } else if (which === 'users') {
        // Load users panel
        try { 
          const elements = { usersListEl, selectedCity: CityContext.getSelectedCity?.() };
          ContribUsers.loadUsersList?.(elements);
        } catch(e) { console.error('[contrib] loadUsersList error:', e); }
      }
    }

    // —— Landing helpers ——
    
    async function chooseLanding(target) {
      try { sessionStorage.setItem('contribLandingSeen', '1'); } catch(_) {}
      
      // Valider qu'une ville est sélectionnée
      const landingCitySelect = document.getElementById('landing-city-select');
      const selectedCity = landingCitySelect?.value?.trim();
      
      if (!selectedCity) {
        showToast('Veuillez d\'abord sélectionner une structure', 'error');
        landingCitySelect?.focus();
        return;
      }
      
      // Définir la ville sélectionnée
      CityContext.setSelectedCity?.(selectedCity);
      console.log('[chooseLanding] Selected city set to:', selectedCity);
      
      // Récupérer le nom d'affichage
      const selectedOption = landingCitySelect.options[landingCitySelect.selectedIndex];
      const cityDisplayName = selectedOption?.text || selectedCity;
      
      // Navigation
      window.ModalNavigation?.navigateTo(target || 'create');
      
      // Activer le panel approprié
      if (target === 'create') {
        // IMPORTANT : Passer explicitement la ville à openCreateModal
        await openCreateModal('create', { ville: selectedCity });
      } else if (target === 'list') {
        // Pour la liste, on doit charger les catégories et le branding
        await handleContributionPanels(target, selectedCity, cityDisplayName);
        await activateTab(target);
      } else if (['categories', 'users'].includes(target)) {
        await activateTab(target);
      }
    }
    
    // Gère les panels de contribution (create/list) - charge catégories et branding
    async function handleContributionPanels(target, city, cityDisplayName) {
      // Charger les catégories et le branding pour le panel liste
      await Promise.all([
        loadCategoriesForCity(city),
        ContribCities.applyCityBrandingToDrawMap?.(city)
      ]);
    }
    
    // Affiche les badges pour les panels de gestion (fonction legacy vide)
    function showManagementPanelBadges(target, cityDisplayName) {
      // Badges retirés - fonction conservée pour compatibilité
    }

    // Bind landing buttons
    if (landingEditBtn) landingEditBtn.addEventListener('click', () => chooseLanding('list'));
    if (landingCategoriesBtn) landingCategoriesBtn.addEventListener('click', () => chooseLanding('categories'));
    if (landingUsersBtn) landingUsersBtn.addEventListener('click', () => chooseLanding('users'));
    
    // Bouton "Gérer le branding" : ouvre la modale de branding pour la ville sélectionnée
    const landingBrandingBtn = document.getElementById('landing-branding');
    if (landingBrandingBtn) {
      landingBrandingBtn.addEventListener('click', async () => {
        const landingCitySelect = document.getElementById('landing-city-select');
        const selectedCity = landingCitySelect?.value?.trim();
        
        if (!selectedCity) {
          showToast('Veuillez d\'abord sélectionner une structure', 'error');
          landingCitySelect?.focus();
          return;
        }
        
        // Ouvrir la modale de branding
        if (ContribBrandingSimple?.openBrandingModal) {
          await ContribBrandingSimple.openBrandingModal(selectedCity);
        } else {
          console.error('[contrib] ContribBrandingSimple.openBrandingModal not available');
          showToast('Module de branding non disponible', 'error');
        }
      });
    }
    
    // Bouton "Gérer ma collectivité" : ouvre directement la modale d'édition de la ville sélectionnée
    if (landingEditCityBtn) {
      landingEditCityBtn.addEventListener('click', async () => {
        const landingCitySelect = document.getElementById('landing-city-select');
        const selectedCityCode = landingCitySelect?.value?.trim();
        
        if (!selectedCityCode) {
          showToast('Veuillez d\'abord sélectionner une structure', 'error');
          landingCitySelect?.focus();
          return;
        }
        
        // Récupérer les données de la ville
        try {
          const cityData = await win.supabaseService?.getCityBranding?.(selectedCityCode);
          
          if (!cityData) {
            showToast('Impossible de récupérer les données de la ville', 'error');
            return;
          }
          
          // Ouvrir la modale d'édition
          if (ContribCitiesManagement?.showCityModal) {
            ContribCitiesManagement.showCityModal(cityData, { citiesListEl: null, citiesStatusEl: null });
          } else {
            console.error('[contrib] ContribCitiesManagement.showCityModal not available');
          }
        } catch (error) {
          console.error('[contrib] Error opening city edit modal:', error);
          showToast('Erreur lors de l\'ouverture de la modale', 'error');
        }
      });
    }
    
    // —— Header Actions Handler (système unifié) ——
    // Tous les boutons du header sont gérés ici via délégation d'événements
    document.addEventListener('click', async (e) => {
      const target = e.target.closest('[id$="-btn"]');
      if (!target) return;
      
      // Vérifier si c'est un bouton d'action du header
      const headerActions = document.querySelector('.gp-modal-header-actions');
      if (!headerActions || !headerActions.contains(target)) return;
      
      const buttonId = target.id;
      console.log('[contrib] Header action clicked:', buttonId);
      
      // Router les actions selon le bouton
      switch (buttonId) {
        case 'contrib-list-create-btn':
          // Récupérer la ville depuis le contexte
          const CityContext = win.ContribCityContext || {};
          const currentCity = CityContext.getSelectedCity?.();
          if (!currentCity) {
            showToast('Erreur: ville non sélectionnée', 'error');
            return;
          }
          await openCreateModal('create', { ville: currentCity });
          break;
          
        case 'category-add-btn':
          await openCategoryModal('create');
          break;
          
        case 'invite-user-btn':
          const usersElements = { usersListEl };
          ContribUsers.showInviteModal?.(usersElements);
          break;
          
        default:
          console.warn('[contrib] Unknown header action:', buttonId);
      }
    });
    
    if (backBtn) backBtn.addEventListener('click', () => showLanding());

    // —— Category filter population ——
    /**
     * Peuple le dropdown de catégories en fonction de la ville sélectionnée
     */
    async function populateCategoryFilter() {
      if (!listCatEl) return;
      
      try {
        // Récupérer la ville sélectionnée
        const selectedCity = CityContext.getSelectedCity?.();
        
        if (!selectedCity) {
          console.warn('[contrib] No city selected');
          listCatEl.innerHTML = '<option value="">Sélectionnez d\'abord une structure</option>';
          return;
        }
        
        // Récupérer les catégories de la ville sélectionnée uniquement
        const categories = await win.supabaseService.getCategoryIconsByCity(selectedCity);
        
        if (!categories || categories.length === 0) {
          console.warn('[contrib] No categories found for selected city:', selectedCity);
          listCatEl.innerHTML = '<option value="">Aucune catégorie disponible</option>';
          return;
        }
        
        // Sauvegarder la valeur actuelle
        const currentValue = listCatEl.value;
        
        // Vider et repeupler
        listCatEl.innerHTML = '<option value="">Toutes les catégories</option>';
        
        // Trier les catégories par ordre alphabétique
        const sortedCategories = categories.sort((a, b) => 
          a.category.localeCompare(b.category)
        );
        
        sortedCategories.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.category;
          option.textContent = cat.category.charAt(0).toUpperCase() + cat.category.slice(1);
          listCatEl.appendChild(option);
        });
        
        // Restaurer la valeur si elle existe toujours
        if (currentValue && Array.from(listCatEl.options).some(opt => opt.value === currentValue)) {
          listCatEl.value = currentValue;
        }
        
      } catch (error) {
        console.error('[contrib] Error populating category filter:', error);
        listCatEl.innerHTML = '<option value="">Erreur de chargement</option>';
      }
    }

    // —— List helpers ——
    // applyRoleConstraints() is now defined earlier (after showLanding)
    // List helpers moved to contrib-list.js
    const clearEmptyState = () => ContribList.clearEmptyState?.(listEl);
    const renderEmptyState = () => {
      ContribList.renderEmptyState?.(listEl, listSentinel, sharedOnCreateClick);
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
      const elements = { listEl, onExitEditMode, onRefreshList };
      await ContribList.doDeleteContribution?.(id, projectName, elements);
    }

    // Shared callbacks for list operations (defined once, reused everywhere)
    const sharedOnEdit = async (item) => {
      try {
        console.log('[sharedOnEdit] Ouverture édition pour:', item);
        const row = await (win.supabaseService && win.supabaseService.getContributionById(item.id));
        console.log('[sharedOnEdit] Données chargées:', row);
        console.log('[sharedOnEdit] row.ville:', row?.ville);
        if (row) {
          console.log('[sharedOnEdit] Appel de openCreateModal...');
          await openCreateModal('edit', row);
          console.log('[sharedOnEdit] Modale ouverte avec succès');
        } else {
          console.warn('[sharedOnEdit] Aucune donnée trouvée pour ID:', item.id);
          showToast('Contribution introuvable.', 'error');
        }
      } catch (e) {
        console.error('[sharedOnEdit] Erreur:', e);
        console.error('[sharedOnEdit] Stack:', e.stack);
        showToast('Erreur lors du chargement de la contribution.', 'error');
      }
    };

    const sharedOnDelete = (id, name) => doDeleteContribution(id, name);

    const sharedOnCreateClick = async () => { 
      try {
        await openCreateModal('create');
      } catch(e) {
        console.error('[sharedOnCreateClick] Error:', e);
      } 
    };

    // renderItem moved to contrib-list.js
    function renderItem(item) {
      return ContribList.renderItem?.(item, sharedOnEdit, sharedOnDelete) || document.createElement('div');
    }

    // listResetAndLoad moved to contrib-list.js
    async function listResetAndLoad() {
      const elements = { listEl, listSentinel, onEdit: sharedOnEdit, onDelete: sharedOnDelete, onCreateClick: sharedOnCreateClick };
      await ContribList.listResetAndLoad?.(elements);
    }

    // listLoadMore and initInfiniteScroll moved to contrib-list.js
    async function listLoadMore() {
      const elements = { listEl, listSentinel, onEdit: sharedOnEdit, onDelete: sharedOnDelete, onCreateClick: sharedOnCreateClick };
      await ContribList.listLoadMore?.(elements);
    }

    function initInfiniteScroll() {
      const elements = { listEl, listSentinel, onEdit: sharedOnEdit, onDelete: sharedOnDelete, onCreateClick: sharedOnCreateClick };
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
      // Mettre à jour l'état (pour admin seulement, car checkbox masquée pour invited)
      ContribList.updateListState?.({ mineOnly: !!listMineOnlyEl.checked });
      debouncedReset();
    });

    // Initialize infinite scroll once
    initInfiniteScroll();

    // —— Users panel helpers ——
    // Recherche en temps réel dans la liste des utilisateurs
    if (usersSearchEl) {
      usersSearchEl.addEventListener('input', () => {
        const query = usersSearchEl.value.toLowerCase();
        const cards = usersListEl?.querySelectorAll('.user-card') || [];
        cards.forEach(card => {
          const email = card.querySelector('.user-card__email')?.textContent.toLowerCase() || '';
          card.style.display = email.includes(query) ? '' : 'none';
        });
      });
    }

    // Boutons d'invitation et d'ajout de ville gérés par le Header Actions Handler unifié ci-dessus

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
        progOuter.style.background = 'var(--black-alpha-08)';
        progOuter.style.position = 'relative';

        const progInner = document.createElement('div');
        progInner.id = 'geojson-upload-progress-inner';
        progInner.style.height = '100%';
        progInner.style.width = '0%';
        progInner.style.borderRadius = '999px';
        progInner.style.background = 'var(--info-alpha-6)';
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

    // handleSubmit is now handled by contrib-create-form-v2.js
    // via openCreateModal() → initCreateForm()
    // Legacy code removed - form submission handled by the new module

    // loadCategoriesForCity moved to contrib-cities.js
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
          
          // Naviguer vers catégories
          await new Promise(resolve => setTimeout(resolve, 100));
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

    // La ville est maintenant fixée depuis le landing - pas besoin de listener

    // ==================== Gestion des catégories ====================
    
    const categoriesList = document.getElementById('categories-list');
    const categoriesContent = document.getElementById('categories-content');
    
    console.log('[contrib] Categories elements:', { categoriesList: !!categoriesList, categoriesContent: !!categoriesContent });

    // refreshCategoriesList moved to contrib-categories-crud.js
    async function refreshCategoriesList() {
      const selectedCity = CityContext.getSelectedCity?.();
      console.log('[refreshCategoriesList] Called with city:', selectedCity);
      
      if (!selectedCity) {
        console.warn('[refreshCategoriesList] No city selected');
        return;
      }
      
      const elements = { 
        categoriesList, 
        categoriesContent, 
        categoryVilleSelector: null,
        selectedCity: selectedCity
      };
      
      await ContribCategoriesCrud.refreshCategoriesList?.(elements, openCategoryModal, deleteCategory);
    }

    // Ouvre la modale de catégorie
    async function openCategoryModal(mode, data = {}) {
      console.log('[openCategoryModal] Called with mode:', mode, 'data:', data);
      
      // Charger la modale catégorie si nécessaire
      const loaded = await loadCategoryModalTemplate();
      console.log('[openCategoryModal] Template loaded:', loaded);
      
      if (!loaded) {
        showToast('Erreur lors du chargement du formulaire', 'error');
        return;
      }
      
      // Récupérer les éléments de la modale (après chargement)
      const categoryModalOverlay = document.getElementById('category-modal-overlay');
      const categoryModalClose = document.getElementById('category-modal-close');
      const categoryModalTitle = document.getElementById('category-modal-title');
      const categoryFormModal = document.getElementById('category-form');
      
      console.log('[openCategoryModal] Modal elements:', {
        overlay: !!categoryModalOverlay,
        close: !!categoryModalClose,
        title: !!categoryModalTitle,
        form: !!categoryFormModal
      });
      
      if (!categoryModalOverlay || !categoryFormModal) {
        console.error('[contrib] Category modal elements not found');
        return;
      }
      
      // Définir le titre selon le mode
      if (categoryModalTitle) {
        categoryModalTitle.textContent = mode === 'edit' ? 'Modifier la catégorie' : 'Nouvelle catégorie';
      }
      
      // Récupérer la ville sélectionnée
      const selectedCity = CityContext.getSelectedCity?.();
      console.log('[openCategoryModal] Selected city:', selectedCity);
      
      // Remplir le champ ville caché
      const categoryVilleInput = document.getElementById('category-ville');
      if (categoryVilleInput && selectedCity) {
        categoryVilleInput.value = selectedCity;
        console.log('[openCategoryModal] Set category-ville to:', selectedCity);
      }
      
      // Récupérer tous les éléments du formulaire depuis la nouvelle modale
      const elements = {
        categoryFormContainer: categoryModalOverlay,
        categoryForm: categoryFormModal,
        categoryEditModeInput: document.getElementById('category-edit-mode'),
        categoryFormTitle: categoryModalTitle,
        categoryOriginalNameInput: document.getElementById('category-original-name'),
        categoryNameInput: document.getElementById('category-name'),
        categoryIconInput: document.getElementById('category-icon'),
        categoryOrderInput: document.getElementById('category-order'),
        categoryVilleSelect: categoryVilleInput,
        categoryLayersCheckboxes: null, // Plus utilisé
        categoryStyleColor: document.getElementById('category-style-color'),
        categoryStyleWeight: document.getElementById('category-style-weight'),
        categoryStyleDashArray: document.getElementById('category-style-dasharray'),
        categoryStyleOpacity: document.getElementById('category-style-opacity'),
        categoryStyleFill: document.getElementById('category-style-fill'),
        categoryStyleFillOptions: document.getElementById('category-style-fill-options'),
        categoryStyleFillColor: document.getElementById('category-style-fillcolor'),
        categoryStyleFillOpacity: document.getElementById('category-style-fillopacity'),
        categoryFormBack: null, // Pas de bouton retour dans la nouvelle modale
        categoryVilleSelectorContainer: null, // Plus utilisé
        categoriesContent: categoriesContent,
        categoryIconPreview: document.getElementById('category-icon-preview'),
        categoryVilleSelector: null, // Plus utilisé
        selectedCity: selectedCity
      };
      
      // Pré-remplir le formulaire
      ContribCategoriesCrud.showCategoryForm?.(mode, data, elements, null);
      
      // Configurer la soumission du formulaire
      categoryFormModal.onsubmit = async (e) => {
        e.preventDefault();
        await ContribCategoriesCrud.handleCategoryFormSubmit?.(e, elements, showToast, async () => {
          // Callback de fermeture après succès
          console.log('[openCategoryModal] Form submitted successfully, closing modal');
          const modalInner = categoryModalOverlay.querySelector('.gp-modal');
          if (modalInner) {
            modalInner.classList.remove('is-open');
          }
          setTimeout(() => {
            categoryModalOverlay.setAttribute('aria-hidden', 'true');
            // ✅ Bloquer les interactions
            categoryModalOverlay.inert = true;
          }, 220);
          
          // Rafraîchir la liste et s'assurer qu'elle est visible
          console.log('[openCategoryModal] Refreshing categories list');
          await refreshCategoriesList();
          if (categoriesContent) {
            categoriesContent.style.display = '';
            console.log('[openCategoryModal] Categories content displayed');
          }
        }, refreshCategoriesList);
      };
      
      // Configurer le bouton de sélection d'icône
      const categoryIconPickerBtn = document.getElementById('category-icon-picker-btn');
      const categoryIconPicker = document.getElementById('category-icon-picker');
      const categoryIconInput = document.getElementById('category-icon');
      const categoryIconPreview = document.getElementById('category-icon-preview');
      
      if (categoryIconPickerBtn && categoryIconPicker) {
        categoryIconPickerBtn.onclick = (e) => {
          e.stopPropagation();
          const isVisible = categoryIconPicker.style.display !== 'none';
          categoryIconPicker.style.display = isVisible ? 'none' : 'block';
        };
      }
      
      // Prévisualisation en direct de l'icône
      if (categoryIconInput && categoryIconPreview) {
        const updateIconPreview = () => {
          try {
            let iconClass = categoryIconInput.value.trim();
            const iconEl = categoryIconPreview.querySelector('i');
            
            if (iconEl && iconClass) {
              // Auto-fix: ajouter fa-solid si nécessaire
              if (iconClass.startsWith('fa-') && !iconClass.startsWith('fa-solid') && !iconClass.startsWith('fa-regular') && !iconClass.startsWith('fa-brands')) {
                iconClass = 'fa-solid ' + iconClass;
              }
              iconEl.className = iconClass;
            }
          } catch (e) {
            console.warn('[contrib] Error updating icon preview:', e);
          }
        };
        
        categoryIconInput.addEventListener('input', updateIconPreview);
        // Mise à jour initiale
        updateIconPreview();
      }
      
      // Configurer la prévisualisation des styles
      const stylePreviewLine = document.getElementById('style-preview-line');
      const stylePreviewPolygon = document.getElementById('style-preview-polygon');
      const styleColor = document.getElementById('category-style-color');
      const styleWeight = document.getElementById('category-style-weight');
      const styleDashArray = document.getElementById('category-style-dasharray');
      const styleOpacity = document.getElementById('category-style-opacity');
      const styleFill = document.getElementById('category-style-fill');
      const styleFillColor = document.getElementById('category-style-fillcolor');
      const styleFillOpacity = document.getElementById('category-style-fillopacity');
      const styleFillOptions = document.getElementById('category-style-fill-options');
      
      const updateModalStylePreview = () => {
        if (!stylePreviewLine || !stylePreviewPolygon) return;
        
        const color = styleColor?.value || '#000000';
        const weight = styleWeight?.value || 3;
        const dashArray = styleDashArray?.value || '';
        const opacity = styleOpacity?.value || 1;
        const fill = styleFill?.checked || false;
        const fillColor = styleFillColor?.value || '#9CA3AF';
        const fillOpacity = styleFillOpacity?.value || 0.3;
        
        // Appliquer à la ligne
        stylePreviewLine.setAttribute('stroke', color);
        stylePreviewLine.setAttribute('stroke-width', weight);
        stylePreviewLine.setAttribute('stroke-opacity', opacity);
        stylePreviewLine.setAttribute('stroke-dasharray', dashArray);
        
        // Appliquer au polygone
        stylePreviewPolygon.setAttribute('stroke', color);
        stylePreviewPolygon.setAttribute('stroke-width', weight);
        stylePreviewPolygon.setAttribute('stroke-opacity', opacity);
        stylePreviewPolygon.setAttribute('stroke-dasharray', dashArray);
        stylePreviewPolygon.setAttribute('fill', fill ? fillColor : 'none');
        stylePreviewPolygon.setAttribute('fill-opacity', fill ? fillOpacity : 0);
      };
      
      // Event listeners pour la prévisualisation
      [styleColor, styleWeight, styleDashArray, styleOpacity, styleFillColor, styleFillOpacity].forEach(input => {
        if (input) {
          input.addEventListener('input', updateModalStylePreview);
          input.addEventListener('change', updateModalStylePreview);
        }
      });
      
      // Toggle fill options
      if (styleFill && styleFillOptions) {
        styleFill.addEventListener('change', () => {
          styleFillOptions.style.display = styleFill.checked ? 'block' : 'none';
          updateModalStylePreview();
        });
      }
      
      // Initialiser la prévisualisation
      setTimeout(updateModalStylePreview, 50);
      
      // Ouvrir la modale
      categoryModalOverlay.setAttribute('aria-hidden', 'false');
      // ✅ Réactiver les interactions
      categoryModalOverlay.inert = false;
      const categoryModalInner = categoryModalOverlay.querySelector('.gp-modal');
      if (categoryModalInner) {
        requestAnimationFrame(() => {
          categoryModalInner.classList.add('is-open');
        });
      }
      
      // Gérer la fermeture
      const closeModal = () => {
        const categoryModalInner = categoryModalOverlay.querySelector('.gp-modal');
        if (categoryModalInner) {
          categoryModalInner.classList.remove('is-open');
        }
        setTimeout(() => {
          categoryModalOverlay.setAttribute('aria-hidden', 'true');
          // ✅ Bloquer les interactions
          categoryModalOverlay.inert = true;
        }, 220);
      };
      
      // Bouton fermer
      if (categoryModalClose) {
        categoryModalClose.onclick = closeModal;
      }
      
      // Clic sur overlay
      categoryModalOverlay.onclick = (e) => {
        if (e.target === categoryModalOverlay) closeModal();
      };
      
      // Fermer le picker d'icône si clic en dehors
      if (categoryIconPicker) {
        document.addEventListener('click', (e) => {
          if (categoryIconPicker.style.display !== 'none') {
            if (!categoryIconPicker.contains(e.target) && e.target !== categoryIconPickerBtn && !categoryIconPickerBtn?.contains(e.target)) {
              categoryIconPicker.style.display = 'none';
            }
          }
        });
      }
      
      // Bouton annuler
      const cancelBtn = document.getElementById('category-form-cancel');
      if (cancelBtn) {
        cancelBtn.onclick = closeModal;
      }
      
      // Stocker la fonction de fermeture pour l'appeler après succès
      win.__closeCategoryModal = closeModal;
    }

    // Ouvre la modale de création de contribution
    async function openCreateModal(mode = 'create', data = {}) {
      console.log('[openCreateModal] ========== START ==========');
      console.log('[openCreateModal] Mode:', mode);
      console.log('[openCreateModal] Data:', JSON.stringify(data, null, 2));
      
      // Charger la modale si nécessaire
      const loaded = await loadCreateModalTemplate();
      console.log('[openCreateModal] Template loaded:', loaded);
      if (!loaded) {
        console.error('[openCreateModal] ❌ FAILED: Template not loaded');
        showToast('Erreur de chargement du formulaire', 'error');
        return;
      }
      
      // Récupérer les éléments
      const overlay = document.getElementById('create-modal-overlay');
      const closeBtn = document.getElementById('create-modal-close');
      const modalTitle = document.getElementById('create-modal-title');
      const form = document.getElementById('contrib-form');
      const prevBtn = document.getElementById('contrib-prev');
      const nextBtn = document.getElementById('contrib-next');
      const submitBtn = document.getElementById('contrib-submit');
      
      console.log('[openCreateModal] Elements found:', { overlay: !!overlay, form: !!form });
      
      if (!overlay || !form) {
        console.error('[openCreateModal] ❌ FAILED: Elements not found');
        return;
      }
      
      // Adapter le titre selon le mode
      if (modalTitle) {
        if (mode === 'edit') {
          modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Modifier la contribution';
        } else {
          modalTitle.innerHTML = '<i class="fa-solid fa-plus-circle"></i> Créer une contribution';
        }
      }
      
      // ✅ Récupérer la ville depuis data.ville
      // Note: ville peut être null (= "Global"), c'est normal
      const selectedCity = data.ville;
      console.log('[openCreateModal] City:', selectedCity === null ? 'Global' : selectedCity);
      
      // Charger les catégories pour la ville dans le select de la modale
      try {
        const categories = await win.supabaseService.getCategoryIconsByCity(selectedCity);
        const categorySelect = document.querySelector('#create-modal-overlay #contrib-category');
        const categoryHelp = document.querySelector('#create-modal-overlay #contrib-category-help');
        
        if (categorySelect) {
          if (!categories || categories.length === 0) {
            categorySelect.innerHTML = '<option value="">Aucune catégorie disponible</option>';
            categorySelect.disabled = true;
            if (categoryHelp) categoryHelp.style.display = 'block';
          } else {
            categorySelect.innerHTML = '<option value="">Sélectionnez une catégorie</option>';
            const sortedCategories = categories.sort((a, b) => a.category.localeCompare(b.category));
            sortedCategories.forEach(cat => {
              const option = document.createElement('option');
              option.value = cat.category;
              option.textContent = cat.category.charAt(0).toUpperCase() + cat.category.slice(1);
              categorySelect.appendChild(option);
            });
            categorySelect.disabled = false;
            if (categoryHelp) categoryHelp.style.display = 'none';
          }
        }
      } catch (error) {
        console.error('[openCreateModal] Error loading categories:', error);
      }
      
      // Bind le lien "Créer une catégorie"
      const createCategoryLink = document.querySelector('#create-modal-overlay #contrib-create-category-link');
      if (createCategoryLink) {
        createCategoryLink.onclick = async (e) => {
          e.preventDefault();
          await openCategoryModal('create');
        };
      }
      
      // Fonction de fermeture
      const closeModal = () => {
        const modalInner = overlay.querySelector('.gp-modal');
        if (modalInner) {
          modalInner.classList.remove('is-open');
        }
        setTimeout(() => {
          overlay.setAttribute('aria-hidden', 'true');
          
          // ✅ Bloquer toutes les interactions avec la modale masquée
          overlay.inert = true;
          
          // Détruire proprement l'instance du formulaire (v2)
          if (formInstance && typeof formInstance.destroy === 'function') {
            formInstance.destroy();
            formInstance = null;
          } else {
            // Fallback pour l'ancien système
            form.reset();
            if (ContribGeometry && ContribGeometry.clearEditGeojsonUrl) {
              ContribGeometry.clearEditGeojsonUrl();
            }
          }
        }, 220);
      };
      
      // Fonction de succès
      const onSuccess = async () => {
        closeModal();
        
        // Rafraîchir la liste si on est dans contrib
        if (ContribList && typeof ContribList.reloadList === 'function') {
          ContribList.reloadList();
        }
        
        const successMsg = mode === 'edit' ? 'Contribution modifiée avec succès' : 'Contribution créée avec succès';
        showToast(successMsg, 'success');
      };
      
      // Initialiser le formulaire avec ContribCreateForm
      const ContribCreateForm = win.ContribCreateForm || {};
      let formInstance = null;
      
      if (ContribCreateForm.initCreateForm) {
        formInstance = ContribCreateForm.initCreateForm({
          form,
          overlay,
          mode,
          data,
          onClose: closeModal,
          onSuccess,
          onRefreshList: async () => {
            if (panelList && !panelList.hidden) {
              await listResetAndLoad();
            }
          }
        });
        
        console.log('[openCreateModal] Form initialized', formInstance);
      } else {
        console.error('[openCreateModal] ContribCreateForm module not found');
      }
      
      // ✅ IMPORTANT : Remplir le champ ville APRÈS initCreateForm
      // car initCreateForm peut faire un form.reset() qui efface tout
      const cityInput = document.querySelector('#create-modal-overlay #contrib-city');
      if (!cityInput) {
        console.error('[openCreateModal] ❌ CRITIQUE: #contrib-city NOT FOUND in DOM!');
        showToast('Erreur: formulaire non chargé correctement', 'error');
        return;
      }
      
      console.log('[openCreateModal] ✅ Setting #contrib-city value to:', selectedCity);
      cityInput.value = selectedCity;
      
      // Vérification immédiate
      console.log('[openCreateModal] ✅ Confirmation: #contrib-city.value =', cityInput.value);
      
      if (cityInput.value !== selectedCity) {
        console.error('[openCreateModal] ❌ ERREUR: La ville ne s\'est pas enregistrée correctement!');
        console.error('[openCreateModal] Expected:', selectedCity, 'Got:', cityInput.value);
      }
      
      // Bind close button
      if (closeBtn) closeBtn.onclick = closeModal;
      
      // Clic sur overlay
      overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
      };
      
      // Ouvrir la modale
      console.log('[openCreateModal] Opening modal...');
      overlay.setAttribute('aria-hidden', 'false');
      // ✅ Réactiver les interactions
      overlay.inert = false;
      console.log('[openCreateModal] Modal state - aria-hidden:', overlay.getAttribute('aria-hidden'), 'inert:', overlay.inert);
      
      const modalInner = overlay.querySelector('.gp-modal');
      if (modalInner) {
        requestAnimationFrame(() => {
          modalInner.classList.add('is-open');
          console.log('[openCreateModal] Modal inner class added: is-open');
        });
      }
      
      // Focus sur le premier champ
      setTimeout(() => {
        const firstInput = form.querySelector('input[type="text"]');
        if (firstInput) firstInput.focus();
      }, 250);
      
      console.log('[openCreateModal] ========== END ==========');
    }

    // deleteCategory moved to contrib-categories-crud.js
    async function deleteCategory(ville, category) {
      await ContribCategoriesCrud.deleteCategory?.(ville, category, showToast, refreshCategoriesList);
    }

    // Bouton d'ajout de catégorie géré par le Header Actions Handler unifié ci-dessus
    
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

  // Exposer les fonctions de chargement des modales
  win.loadInviteModalTemplate = loadInviteModalTemplate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupContrib);
  } else {
    setupContrib();
  }
})(window);
