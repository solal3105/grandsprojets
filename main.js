;(function(win) {
  'use strict';

  if (!win.supabaseService) {
    console.error('[Main] supabaseService manquant');
    return;
  }

  const supabaseService = win.supabaseService;

  // Helpers - main-thread yielding et lazy-loading de scripts post-rendu
  const yieldToMain = globalThis.scheduler?.yield
    ? () => scheduler.yield()
    : () => new Promise(r => setTimeout(r, 0));

  function loadScript(src) {
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { console.debug('[Main] Lazy script non chargé:', src); resolve(); };
      document.head.appendChild(s);
    });
  }



  /**
   * Health check du localStorage au démarrage
   * Détecte et corrige AUTOMATIQUEMENT les états corrompus
   * @returns {Object} { healthy, issues, fixed, needsReload }
   */
  function performStorageHealthCheck() {
    try {
      const issues = [];
      let fixed = 0;
      let needsReload = false;
      
      // 1. Vérifier que localStorage est accessible
      try {
        localStorage.setItem('__healthcheck__', '1');
        localStorage.removeItem('__healthcheck__');
      } catch (e) {
        console.error('[HealthCheck] localStorage inaccessible:', e);
        return { healthy: false, issues: ['localStorage inaccessible'], fixed: 0, needsReload: false };
      }
      
      // 2. Vérifier et nettoyer les tokens Supabase corrompus/expirés
      const supabaseKeys = Object.keys(localStorage).filter(k => 
        k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      
      for (const key of supabaseKeys) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            
            // Token corrompu (champs manquants)
            if (parsed && !parsed.access_token && !parsed.refresh_token) {
              localStorage.removeItem(key);
              issues.push('Token Supabase corrompu → supprimé');
              fixed++;
              needsReload = true;
            }
            // Token expiré ET pas de refresh_token valide
            else if (parsed?.expires_at) {
              const expiresAt = parsed.expires_at * 1000;
              const now = Date.now();
              // Expiré depuis plus de 7 jours = refresh token probablement expiré aussi
              if (expiresAt < now - (7 * 24 * 60 * 60 * 1000)) {
                localStorage.removeItem(key);
                issues.push('Token Supabase expiré (>7j) → supprimé');
                fixed++;
                needsReload = true;
              }
            }
          }
        } catch {
          // JSON invalide = token corrompu
          localStorage.removeItem(key);
          issues.push('Token Supabase JSON invalide → supprimé');
          fixed++;
          needsReload = true;
        }
      }
      
      // 3. Vérifier activeCity (validateur partagé - voir SecurityUtils.isValidCityCode)
      const activeCity = localStorage.getItem('activeCity');
      if (activeCity && !win.SecurityUtils.isValidCityCode(activeCity)) {
        localStorage.removeItem('activeCity');
        issues.push(`activeCity invalide "${activeCity}" → supprimée`);
        fixed++;
      }
      
      // 4. Vérifier le thème
      const theme = localStorage.getItem('theme');
      if (theme && theme !== 'dark' && theme !== 'light') {
        localStorage.removeItem('theme');
        issues.push(`theme invalide → supprimé`);
        fixed++;
      }
      
      // 5. localStorage trop plein = nettoyage automatique des clés non essentielles
      let totalSize = 0;
      for (const key of Object.keys(localStorage)) {
        totalSize += (localStorage.getItem(key) || '').length;
      }
      
      if (totalSize > 4 * 1024 * 1024) { // > 4MB
        // Nettoyer les clés non essentielles (garder: theme, activeCity, sb-*)
        const essentialPrefixes = ['theme', 'activeCity', 'sb-'];
        for (const key of Object.keys(localStorage)) {
          if (!essentialPrefixes.some(p => key.startsWith(p))) {
            localStorage.removeItem(key);
            fixed++;
          }
        }
        issues.push('localStorage trop plein → nettoyé');
      }
      
      // 6. Détection de blocage précédent (app n'a pas fini de charger)
      const lastLoadStart = localStorage.getItem('__gp_load_start__');
      const lastLoadEnd = localStorage.getItem('__gp_load_end__');
      
      if (lastLoadStart && !lastLoadEnd) {
        // L'app a démarré mais n'a jamais fini de charger = crash probable
        const startTime = parseInt(lastLoadStart, 10);
        const now = Date.now();
        // Si ça fait plus de 30 secondes, considérer comme bloqué
        if (now - startTime > 30000) {
          // Nettoyage agressif : supprimer tous les tokens Supabase
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb-')) {
              localStorage.removeItem(key);
              fixed++;
            }
          });
          localStorage.removeItem('activeCity');
          issues.push('Blocage détecté → nettoyage automatique effectué');
          needsReload = true;
          fixed++;
        }
      }
      
      // Marquer le début du chargement
      localStorage.setItem('__gp_load_start__', Date.now().toString());
      localStorage.removeItem('__gp_load_end__');
      
      if (issues.length > 0) {
        console.debug('[HealthCheck] Corrections automatiques:', issues);
      }
      
      return { healthy: issues.length === 0, issues, fixed, needsReload };
    } catch (e) {
      console.error('[HealthCheck] Erreur:', e);
      return { healthy: false, issues: ['Erreur health check'], fixed: 0, needsReload: false };
    }
  }
  
  /**
   * Marque la fin du chargement (appelé quand l'app est prête)
   */
  function markLoadComplete() {
    try {
      localStorage.setItem('__gp_load_end__', Date.now().toString());
      localStorage.removeItem('__gp_load_start__');
    } catch (e) { console.debug('[main] Failed to persist load-complete marker:', e); }
  }

  /**
   * Exécute une étape d'init en isolant ses erreurs.
   * Par défaut, une erreur est loggée mais n'interrompt pas le reste de l'init.
   * Seules les étapes marquées `critical: true` propagent l'erreur.
   * @param {string} name - nom de phase (pour diagnostic)
   * @param {Function} fn - fonction async ou sync
   * @param {{critical?: boolean}} opts
   */
  async function safePhase(name, fn, opts = {}) {
    try {
      return await fn();
    } catch (err) {
      // On trace toujours côté diagnostic sans faire apparaître le banner rouge
      console.error(`[Main] Phase "${name}" en erreur:`, err);
      win._initPhaseErrors = win._initPhaseErrors || [];
      win._initPhaseErrors.push({ phase: name, message: String(err?.message || err) });
      if (opts.critical) throw err;
      return undefined;
    }
  }

  /**
   * Ouverture directe d'un module par l'adresse : le chemin
   * /ville/{ville}/travaux d'abord, l'ancien ?module=travaux ensuite. Sert aux
   * liens partagés et à l'intégration en iframe : sans ça, l'iframe atterrit
   * sur le module par défaut et le visiteur doit chercher. La clé doit
   * correspondre à un module réellement actif sur la ville, sinon elle est
   * ignorée. `carte` est le module par défaut : rien à ouvrir.
   */
  function openModuleFromUrl() {
    const fromPath = win.CityManager?.parseModuleFromPath?.() || '';
    const asked = (fromPath && fromPath !== 'carte') ? fromPath : new URLSearchParams(location.search).get('module');
    // Même grammaire que les codes ville : un seul validateur partagé
    if (!asked || !win.SecurityUtils?.isValidCityCode?.(asked)) return;
    const known = (win._cityModules || []).find((m) => m.module_key === asked.toLowerCase() && m.enabled);
    if (!known) return;
    // Passer par la barre latérale : elle allume le bouton du module puis
    // délègue au panneau. Appeler NavPanel directement ouvrirait le panneau
    // en laissant le bouton éteint.
    if (win.SidebarModule?.openModule) win.SidebarModule.openModule(known.module_key);
    else win.NavPanel?.openModule(known.module_key);
  }

  /** Panneau d'actions (mobile) : reprend les actions de la barre latérale. */
  function populateActionsPanel() {
    const actionsPanel = document.getElementById('actions-panel-body');
    const sidebarActions = document.querySelector('.gp-sidebar__actions');
    if (!actionsPanel || !sidebarActions) return;
    sidebarActions.querySelectorAll('.gp-sidebar__btn').forEach(btn => {
      const action = btn.dataset.action;
      const label = btn.dataset.tooltip || btn.getAttribute('aria-label');
      const icon = btn.querySelector('i')?.className || 'fas fa-circle';
      const auth = btn.dataset.auth;

      const item = document.createElement('button');
      item.className = 'action-item';
      item.dataset.action = action;
      if (auth) item.dataset.auth = auth;
      if (action === 'logout') item.classList.add('action-item--logout');
      item.innerHTML = `
        <div class="action-item__icon">
          <i class="${icon}" aria-hidden="true"></i>
        </div>
        <span class="action-item__label">${label}</span>
      `;
      item.addEventListener('click', () => {
        win.toggleManager?.setState('actions', false);
        btn.click();
      });
      actionsPanel.appendChild(item);
    });

    const isConnected = win.AuthModule?.isAuthenticated?.() || false;
    document.body.setAttribute('data-auth-state', isConnected ? 'connected' : 'disconnected');
  }

  /** Phase 2.5 : branding déjà chargé (couleur, favicon, toggles), sans nouvelle requête. */
  function applyCityBranding() {
    if (!win.CityBrandingModule) return;
    try {
      const branding = win.CityManager?.getBranding();
      if (branding) {
        win.CityBrandingModule.applyBranding(branding, false);
      } else {
        // Repli si le branding manque (ne devrait pas arriver)
        win.CityBrandingModule.applyPrimaryColor('#14AE5C');
        win.CityBrandingModule.applyFavicon(null);
      }
      // Écoute de l'authentification (une seule fois)
      win.CityBrandingModule.init();
    } catch (err) {
      console.debug('[Main] Failed to apply city branding:', err);
    }
  }

  /** Phase 7 : relief / bâtiments 3D, bascule de thème et synchronisation avec le système. */
  function bindMapToggles(MapModule) {
    // Mode 3D - apply saved state now that map is ready, listen for changes
    // Active à la fois le relief et les bâtiments 3D
    const mode3DState = win.toggleManager?.getState('mode3d');
    if (MapModule?.map) {
      MapModule.map.setTerrain(mode3DState);
      MapModule.map.setBuildings3D(mode3DState);
  }
  win.toggleManager?.on('mode3d', (active) => {
    if (MapModule?.map) {
      MapModule.map.setTerrain(active);
      MapModule.map.setBuildings3D(active);
    }
  });
  win.toggleManager?.markReady('mode3d');

  // Theme - delegate to ThemeManager (applyTheme → onThemeChanged handles all MapLibre updates)
  win.toggleManager?.on('theme', () => {
    win.ThemeManager?.toggle();
    const dock = document.getElementById('toggle-dock');
    if (dock) {
      dock.classList.remove('toggle-dock--shimmer');
      void dock.offsetWidth;
      dock.classList.add('toggle-dock--shimmer');
      dock.addEventListener('animationend', () => dock.classList.remove('toggle-dock--shimmer'), { once: true });
    }
    const sb = document.getElementById('gp-sidebar');
    if (sb) {
      sb.classList.remove('gp-sidebar--shimmer');
      void sb.offsetWidth;
      sb.classList.add('gp-sidebar--shimmer');
      sb.addEventListener('animationend', () => sb.classList.remove('gp-sidebar--shimmer'), { once: true });
    }
  });

  // Synchronisation automatique du thème avec l'OS
  // (désactivé si la ville a un basemap configuré pour éviter les conflits)
  if (!win._cityPreferredBasemap) {
    win.ThemeManager?.startOSThemeSync();
  }
  }

  /**
   * Parse l'état de l'URL (?cat=...&project=...)
   */
  function parseUrlState() {
    try {
      const sp = new URLSearchParams(location.search);
      const cat = String(sp.get('cat') || '').toLowerCase().trim();
      const project = String(sp.get('project') || '').trim();
      return (cat && project) ? { cat, project } : null;
    } catch (e) {
      console.debug('[main] Failed to parse URL state:', e);
      return null;
    }
  }

  /**
   * Affiche un projet depuis l'état de l'URL
   */
  async function showFromUrlState({ cat, project }) {
    if (!cat || !project) return false;
    
    // Utiliser directement le système contribution_uploads
    try {
      if (window.supabaseService?.fetchProjectByCategoryAndName) {
        const contributionProject = await window.supabaseService.fetchProjectByCategoryAndName(cat, project);
        if (contributionProject && window.NavigationModule?.showProjectDetailById) {
          window.NavigationModule.showProjectDetailById(contributionProject.id, null, {
            projectName: contributionProject.project_name,
            category: contributionProject.category,
          });
          return true;
        }
      }
    } catch (e) {
      console.debug('[Main] Erreur showFromUrlState:', e);
    }
    
    return false;
  }

  /** Boutons précédent / suivant du navigateur (pas les pushState de l'application). */
  function bindHistoryNavigation() {
    /**
     * Gestion de la navigation (boutons précédent/suivant du navigateur)
     * IMPORTANT: Ne pas réagir aux pushState programmatiques, seulement aux vrais back/forward
     */
    let _isManualNavigation = false;
  
    window.addEventListener('popstate', async (e) => {
      // GUARD: Ignorer les popstate déclenchés par nos propres pushState
      if (_isManualNavigation) {
        return;
      }
    
      try {
        const nextCity = win.CityManager?.resolveActiveCity();
        const currentCity = win.CityManager?.getActiveCity();
        if (nextCity && nextCity !== currentCity) {
          if (win.CityManager) win.CityManager._activeCity = nextCity;
          win.CityManager?.persistCity(nextCity);
          // La super-propriété `city` est persistante : sans cette mise à
          // jour, les événements suivants resteraient sur l'ancienne ville.
          win.OPAnalytics?.setCity(nextCity);
          try { win.__syncInvite?.(nextCity); } catch { /* no-op */ }
          await win.CityManager?.updateLogoForCity(nextCity);
          try {
            await win.FilterManager?.init();
          } catch (e) { console.debug('[main] Failed to reinit FilterManager on city change:', e); }
        }
        let state = e && e.state ? e.state : null;
        if (!state) {
          try {
            const sp = new URLSearchParams(location.search);
            const cat = String(sp.get('cat') || '').toLowerCase().trim();
            const project = String(sp.get('project') || '').trim();
            if (cat) {
              state = { cat, project: project || null };
            }
          } catch (e) { console.debug('[main] Failed to parse URL params on popstate:', e); }
        }

        if (state && state.cat && state.project) {
          await showFromUrlState({ cat: state.cat, project: state.project });
        } else if (state && state.cat && !state.project) {
          if (window.NavigationModule?.resetToDefaultView) {
            window.NavigationModule.resetToDefaultView(state.cat, { preserveMapView: true, updateHistory: false });
          }
        } else if (window.NavigationModule?.resetToDefaultView) {
          window.NavigationModule.resetToDefaultView(undefined, { preserveMapView: true, updateHistory: false });
        }
      } catch (e) { console.debug('[main] Failed to handle popstate navigation:', e); }
    });
  
    // Exposer le flag pour que uimodule.js puisse le contrôler
    win._setManualNavigation = (value) => {
      _isManualNavigation = value;
    };
  }

  /** Phase 9 : un bouton « fiche complète » ouvre la fiche dans un nouvel onglet. */
  function openFicheLink(e) {
    const btn = e.target.closest('[data-fiche-url]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(btn.dataset.ficheUrl, '_blank', 'noopener');
  }

  /**
   * Erreur non rattrapée pendant le démarrage. Le bandeau n'apparaît que si la
   * carte est VRAIMENT inutilisable (pas de module carte ou pas de canvas) :
   * une phase secondaire en panne (filtres, sidebar, géoloc…) laisse la carte
   * utilisable.
   */
  function handleInitError(err) {
    console.error('[Main] Erreur lors de l\'initialisation:', err);
  
    // N'afficher le banner que si l'app est VRAIMENT inutilisable :
    // - Le module carte n'a pas pu être créé, OU
    // - Le conteneur #map n'a jamais reçu de canvas MapLibre
    // Sinon, l'utilisateur peut continuer à utiliser la carte même si
    // une phase secondaire (filtres, sidebar, géoloc…) a échoué.
    const mapReady = !!(win.MapModule?.map && document.querySelector('#map canvas'));
    if (mapReady) {
      // App utilisable → pas de banner, juste un log + marquer la fin
      console.warn('[Main] Init terminée avec une erreur partielle - app utilisable.');
      try { markLoadComplete(); } catch { /* noop */ }
      return;
  }

  // Afficher un message d'erreur visible pour l'utilisateur
  try {
    // Éviter les doublons si déjà affiché
    if (document.getElementById('init-error-message')) return;
    const errorDiv = document.createElement('div');
    errorDiv.id = 'init-error-message';
    errorDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #ff4444;
      color: white;
      padding: 20px 30px;
      border-radius: 10px;
      z-index: 9999;
      font-family: sans-serif;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    errorDiv.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Erreur de chargement</h3>
      <p style="margin: 0 0 15px 0;">L'application n'a pas pu se charger correctement.</p>
      <button onclick="location.reload()" style="
        background: white;
        color: #ff4444;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-weight: bold;
      ">Réessayer</button>
    `;
    document.body.appendChild(errorDiv);
  } catch (e) { console.debug('[main] Failed to display init error message:', e); }
  }

  /**
   * Phase 5.5 : chaque couche est dessinée dès que SES données arrivent, sans
   * barrière commune : la carte se peuple progressivement au lieu d'attendre la
   * plus lente. Rien n'est dessiné si l'utilisateur a ouvert un module
   * entre-temps : c'est alors le module qui pilote ses couches.
   * Les catégories de contributions sortent toutes du même agrégat : elles
   * attendent son préchargement (sinon `fetchLayerData` retombe sur le repli
   * N+1). Les couches URL/WFS ne dépendent de rien et partent tout de suite.
   */
  async function loadInitialLayers(DataModule, { urlLayers, contribCategories }, contribPreloadPromise) {
    const drawIfIdle = (layer) => (data) => {
      if (!data || win.NavPanel?.isOpen()) return;
      try { DataModule.createGeoJsonLayer(layer, data); }
      catch (e) { console.debug(`[main] Failed to create GeoJSON layer "${layer}":`, e); }
    };
    const loadAndDraw = (layer) => DataModule.preloadLayer(layer)
      .then(drawIfIdle(layer))
      .catch(err => { console.error(`[Main] Erreur chargement layer "${layer}":`, err); });
    try {
      await Promise.all([
        ...urlLayers.map(loadAndDraw),
        contribPreloadPromise.then(() => Promise.all(contribCategories.map(loadAndDraw))),
      ]);
    } catch (err) {
      console.error('[Main] Erreur lors du chargement des layers:', err);
    }
  }

  /** Phase 6 : modules d'interface, une fois la carte et ses couches en place. */
  function initUiModules({ activeCity, basemaps, layersToLoad, DataModule }) {
    // Config participer préchargée : le lien de suivi et l'ouverture du module
    // n'attendent alors plus le réseau
    if ((win._cityModules || []).some(m => m.module_key === 'participer' && m.enabled)) {
      win.ParticiperViews?.loadConfig?.(activeCity)?.catch?.(() => {});
    }
    if (window.UIModule?.init) {
      safePhase('UIModule.init', () => {
        window.UIModule.init({ basemaps });
        win.toggleManager?.markReady('basemap');
        win.toggleManager?.markReady('theme');
      });
    }
    // markReady('location') est appelé dans GeolocationModule.init()
    if (window.GeolocationModule) {
      safePhase('GeolocationModule.init', () => window.GeolocationModule.init(window.MapModule?.map));
    }
    // Système unifié d'interactions (clic contributions + travaux + sélection)
    if (window.FeatureInteractions && window.MapModule?.map?._mlMap) {
      safePhase('FeatureInteractions.init', () => {
        window.FeatureInteractions.init(window.MapModule.map._mlMap);
        // Images de couverture préchargées en arrière-plan
        const allFeatures = layersToLoad.flatMap(l => DataModule.layerData[l]?.features || []);
        window.FeatureInteractions.preloadCovers(allFeatures);
      });
    }
  }

  // Diagnostic : le contrôle de santé du stockage, appelable à la main
  // (les tests vérifient qu'il ne supprime pas une ville valide)
  win._storageHealthCheck = performStorageHealthCheck;

  async function initApp() {
    try {
      // PHASE 0a : SSO Phaos iframe - démarrer la session en arrière-plan (non-bloquant)
      // La carte charge immédiatement en mode anonyme (contributions approuvées visibles).
      // phaos-auth.js appelle supabase.auth.setSession() dès réception du token Phaos ;
      // toute interaction ultérieure (ouverture de panel, re-fetch) sera alors authentifiée.
      // En navigation directe (hors iframe), waitForSession() résout immédiatement de toute façon.
      win.PhaosAuth?.waitForSession();

      // PHASE 0b : Health check automatique du localStorage
      const healthCheck = performStorageHealthCheck();
      if (healthCheck.needsReload) {
        console.debug('[Main] Nettoyage effectué, rechargement automatique...');
        location.reload();
        return;
      }
      if (healthCheck.fixed > 0) {
        console.debug('[Main] Health check:', healthCheck.fixed, 'problème(s) corrigé(s) automatiquement');
      }
      
      // PHASE 1 : Modules de base
      // Chacun protégé individuellement : une panne réseau sur une ville
      // ou un échec analytics ne doit jamais bloquer le boot.
      safePhase('ThemeManager.init', () => win.ThemeManager?.init());
      await safePhase('CityManager.loadValidCities', () => win.CityManager?.loadValidCities());

      // PHASE 2 : Ville active (le chemin /ville/{ville}/{module} fait foi ;
      // les anciennes adresses sont redirigées par Netlify avant d'arriver ici)
      let city = null;
      try {
        city = win.CityManager?.initializeActiveCity();
      } catch (err) { console.error('[Main] Phase "CityManager.initializeActiveCity" en erreur:', err); }
      
      // Ville vide ou nulle : ville par défaut
      if (!city) {
        console.debug('[Main] Ville vide ou null, ville par défaut');
        city = supabaseService.DEFAULT_CITY;
        if (win.CityManager) win.CityManager._activeCity = city;
      }

      // La ville résolue fait autorité : elle corrige la lecture au plus tôt
      // faite par le module de mesure (chemin /ville/{ville}/… ou localStorage).
      safePhase('OPAnalytics.setCity', () => win.OPAnalytics?.setCity(city));

      // Encart d'invitation (démo ou essai) : masquer si la ville résolue est
      // un espace client. Barrière défensive - le script inline de index.html
      // ne voit que le chemin et localStorage, jamais la résolution réelle.
      try { win.__syncInvite?.(city); } catch { /* no-op */ }

      // Phase 2 : un seul fetch branding (stocké dans CityManager._branding)
      await safePhase('CityManager.updateLogoForCity', () => win.CityManager?.updateLogoForCity(city));
      // Le menu des espaces est fermé au chargement et personne n'attend son
      // contenu : le construire hors du chemin critique évite d'y ajouter les
      // requêtes de branding des autres villes (280 ms mesurés). Le toggle n'est
      // marqué prêt qu'une fois le menu peuplé, pour ne pas ouvrir un menu vide.
      safePhase('CityManager.initCityMenu', () => win.CityManager?.initCityMenu(city))
        .then(() => win.toggleManager?.markReady('city'));

      // PHASE 2.5 : Appliquer le branding (couleur, favicon, toggles) sans re-fetcher
      applyCityBranding();

      await yieldToMain();

      // PHASE 3 : Données Supabase (consomme les early-fetches)
      // `initAllData` utilise déjà `Promise.allSettled` → ne throw jamais.
      // On ajoute une relance en cas de résultat anormalement vide (panne
      // réseau ponctuelle au démarrage → basemaps/layers absents = map vide).
      const { CarteConfig } = win;
      let phase3 = await supabaseService.initAllData(city);
      if (CarteConfig.isEmptyInitData(phase3)) {
        console.warn('[Main] initAllData retourne vide, nouvelle tentative dans 600ms…');
        await new Promise(r => setTimeout(r, 600));
        try { phase3 = await supabaseService.initAllData(city); }
        catch (err) { console.error('[Main] initAllData retry failed:', err); }
      }
      const { layersConfig, basemaps: basemapsForCity, categoryIcons: initCategoryIcons, cityModules } =
        CarteConfig.normalizeInitData(phase3);

      // PHASE 4 : Carte et couches
      window.dataConfig = window.dataConfig || {};

      // Basemap préféré de la ville (source unique de vérité pour MapModule,
      // UIModule et ThemeManager). Les basemaps ne sont pas filtrées par ville.
      win._cityPreferredBasemap = win.CityManager?.getBranding()?.default_basemap || null;

      if (window.UIModule?.updateBasemaps) {
        try { window.UIModule.updateBasemaps(basemapsForCity); }
        catch (err) { console.error('[Main] UIModule.updateBasemaps failed:', err); }
      }
      
      // Initialiser le basemap - MapModule sélectionne par priorité :
      // ville préférée → thème courant → is_default → premier
      await safePhase('MapModule.initBaseLayer', () => window.MapModule?.initBaseLayer?.());
      
      await safePhase('CityManager.applyCityInitialView', () => win.CityManager?.applyCityInitialView(city));
      
      const { DataModule, MapModule } = win;
      const { urlMap, styleMap, iconMap, iconColorMap, defaultLayers } = CarteConfig.buildLayerMaps(layersConfig, city);
      // Styles des catégories (category_icons) : ils écrasent ceux des couches
      if (window.supabaseService?.buildCategoryStylesMap) {
        CarteConfig.mergeCategoryStyles(styleMap, window.supabaseService.buildCategoryStylesMap(initCategoryIcons), initCategoryIcons);
      }

      win.defaultLayers = defaultLayers;
      win.iconMap = iconMap;
      win.iconColorMap = iconColorMap;
      
      DataModule.initConfig({ city, urlMap, styleMap, iconMap, iconColorMap, defaultLayers });

      await yieldToMain();

      // PHASE 5 : Menus dynamiques (AVANT les layers)
      // Lancer le préchargement des GeoJSON dès maintenant (parallèle avec le reste de Phase 5)
      const activeCity = supabaseService.getActiveCity();
      const contribPreloadPromise = DataModule.preloadAllContributions(activeCity);

      // fetchAllProjects consomme le prefetch (pas de re-fetch réseau)
      // categoryIcons et cityModules sont déjà dans initAllData - réutiliser
      let allContributions = [];
      try {
        if (window.supabaseService?.fetchAllProjects) {
          allContributions = await window.supabaseService.fetchAllProjects();
          win.allContributions = allContributions;
        }
      } catch (err) {
        console.error('[Main] Erreur fetchAllProjects:', err);
      }

      // Modules de la ville
      win._cityModules = cityModules;

      const { categories: categoriesFiltered, activeIcons } = CarteConfig.buildActiveCategories(allContributions, initCategoryIcons);
      win.categoryIcons = activeIcons;
      // Mapping catégorie → couches depuis la base, complété par les modules
      win.categoryLayersMap = CarteConfig.addModuleLayers(window.supabaseService.buildCategoryLayersMap(activeIcons), cityModules);

      win.getAllCategories = () => (win.categoryIcons || []).map(c => c.category);
      win.getCategoryLayers = (category) => win.categoryLayersMap?.[category] || [];
      win.isCategoryLayer = (layerName) => win.getAllCategories().includes(layerName);
      
      
      if (win.SidebarModule) {
        safePhase('SidebarModule.init', () => win.SidebarModule.init());
      }
      if (win.NavPanel) {
        safePhase('NavPanel.init', () => {
          win.NavPanel.init();
          win.CarteNav?.register();
          win.TravauxNav?.register();
          win.ParticiperNav?.register();
        });
      }

      if (win.SidebarModule || win.NavPanel) safePhase('openModuleFromUrl', openModuleFromUrl);

      // Contributions par catégorie, stockées avant le chargement des couches
      const { byCategory, layersToLoad, contribCategories, urlLayers } =
        CarteConfig.planLayerLoading(allContributions, categoriesFiltered, defaultLayers);
      Object.entries(byCategory).forEach(([category, contribs]) => { win[`contributions_${category}`] = contribs; });

      // PHASE 5.5 : Charger les layers par défaut + toutes les contributions
      await loadInitialLayers(DataModule, { urlLayers, contribCategories }, contribPreloadPromise);

      await yieldToMain();

      // Charger les modules post-rendu en parallèle (évaluation différée du critical path)
      await Promise.all([
        // Chemins absolus : la page est servie sous /ville/{ville}/{module}
        loadScript('/modules/searchmodule.js'),
        loadScript('/modules/geolocation.js'),
        loadScript('/modules/feature-interactions.js'),
        loadScript('/modules/navigationmodule.js')
      ]);

      // Initialiser SearchModule maintenant qu'il est chargé
      if (window.SearchModule?.init) {
        safePhase('SearchModule.init', () => window.SearchModule.init(window.MapModule?.map));
      }

      // PHASE 6 : Modules UI
      await safePhase('FilterManager.init', () => win.FilterManager?.init());
      win.toggleManager?.markReady('filters');

      // Aucun préchargement des couches non affichées.
      //
      // Cette phase préchargeait TOUTES les couches URL de la ville plus travaux,
      // pour rendre leur premier affichage instantané. Sur metropole-lyon cela
      // représentait 42 Mo de GeoJSON WFS (dont 21,6 Mo pour la seule couche bus)
      // téléchargés par chaque visiteur, alors que seules `tramway` et
      // `metroFuniculaire` sont `is_default` et donc réellement affichées.
      // data.grandlyon.com ne sert aucune compression : ces octets sont bruts.
      //
      // Tous les chemins d'affichage chargent déjà à la demande et gèrent le cas
      // non caché : carte-nav (ouverture d'une catégorie), travaux-nav (ouverture
      // du module), FilterManager (clic sur un filtre), NavigationModule. Le seul
      // effet du retrait est que le premier affichage d'une couche lourde attend
      // son téléchargement, ce qui était déjà le cas sur un cache froid.

      initUiModules({ activeCity, basemaps: basemapsForCity, layersToLoad, DataModule });

      await yieldToMain();

      // PHASE 7 : Unified toggle actions (all through ToggleManager)
      // ToggleManager handles: click → state → ARIA → visual feedback
      // Business logic is registered via .on() listeners

      // Filters - ToggleManager shows/hides #filters-container via targetElement
      // (no extra logic needed, UIModule.init already rendered filter items)

      // Basemap - ToggleManager toggles .active on #basemap-menu via menuSelector
      // (no extra logic needed, UIModule.init already rendered basemap tiles)

      document.getElementById('about-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        win.toggleManager?.setState('info', false);
      });

      populateActionsPanel();
      win.toggleManager?.markReady('actions');

      bindMapToggles(MapModule);

      // PHASE 8 : Gestion du routing et de l'historique

      // Afficher le projet initial si présent dans l'URL
      try {
        const initial = parseUrlState();
        if (initial) {
          await showFromUrlState(initial);
        }
      } catch (e) {
        console.debug('[Main] Erreur affichage projet initial:', e);
      }

      // Lien de suivi d'un signalement (?participer_suivi=) et retours du
      // parcours de confirmation - le jeton a déjà été retiré de l'URL par
      // participer-views.js au chargement
      win.ParticiperViews?.handleUrlParams?.();

      bindHistoryNavigation();

      // PHASE 9 : Fiche → ouvrir dans un nouvel onglet
      document.addEventListener('click', openFicheLink);

      // Marquer le chargement comme terminé (pour la détection de blocage)
      markLoadComplete();
      
    } catch (err) {
      handleInitError(err);
    }
  }

  // FALLBACKS ET BOOTSTRAP

  // UTILITAIRES DE DIAGNOSTIC ET RÉCUPÉRATION
  
  /**
   * Fonction de diagnostic accessible depuis la console
   * Usage: window.gpDiagnostic()
   */
  win.gpDiagnostic = function() {
    console.group('🔍 GrandsProjets - Diagnostic');
    
    // 1. État localStorage
    console.group('📦 localStorage');
    const keys = Object.keys(localStorage);
    let totalSize = 0;
    keys.forEach(key => {
      const val = localStorage.getItem(key);
      const size = (val || '').length;
      totalSize += size;
      if (key.startsWith('sb-') || key === 'activeCity' || key === 'theme') {
        console.log(`  ${key}: ${size} bytes`);
      }
    });
    console.log(`  Total: ${(totalSize / 1024).toFixed(2)} KB (${keys.length} clés)`);
    console.groupEnd();
    
    // 2. État Supabase
    console.group('🔐 Supabase');
    const supabaseKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (supabaseKey) {
      try {
        const data = JSON.parse(localStorage.getItem(supabaseKey));
        console.log('  Token présent:', !!data?.access_token);
        console.log('  User:', data?.user?.email || 'Non connecté');
        if (data?.expires_at) {
          const expiresAt = new Date(data.expires_at * 1000);
          const now = new Date();
          console.log('  Expire:', expiresAt.toLocaleString());
          console.log('  Expiré:', expiresAt < now ? '⚠️ OUI' : '✅ Non');
        }
      } catch {
        console.log('  ⚠️ Token corrompu (JSON invalide)');
      }
    } else {
      console.log('  Pas de token Supabase');
    }
    console.groupEnd();
    
    // 3. État application
    console.group('🏙️ Application');
    console.log('  activeCity:', win.CityManager?.getActiveCity() || 'Non définie');
    console.log('  theme:', localStorage.getItem('theme') || 'Auto');
    console.log('  MapModule:', win.MapModule?.map ? '✅ OK' : '❌ Non initialisé');
    console.log('  DataModule:', win.DataModule ? '✅ OK' : '❌ Non initialisé');
    console.log('  supabaseService:', win.supabaseService ? '✅ OK' : '❌ Non initialisé');
    console.groupEnd();
    
    console.groupEnd();
    
    console.log('');
    console.log('💡 Pour nettoyer le localStorage: window.gpReset()');
    console.log('💡 Pour nettoyer seulement la session: window.gpResetSession()');
    
    return { localStorage: { keys: keys.length, sizeKB: (totalSize / 1024).toFixed(2) } };
  };
  
  /**
   * Reset complet du localStorage (nécessite refresh)
   * Usage: window.gpReset()
   */
  win.gpReset = function() {
    if (!confirm('Cela va effacer toutes les données locales et recharger la page. Continuer ?')) {
      return 'Annulé';
    }
    
    try {
      // Sauvegarder le thème (préférence utilisateur à conserver)
      const theme = localStorage.getItem('theme');
      
      // Tout effacer
      localStorage.clear();
      
      // Restaurer le thème
      if (theme === 'dark' || theme === 'light') {
        localStorage.setItem('theme', theme);
      }
      
      console.log('✅ localStorage nettoyé');
      location.reload();
      return 'Rechargement...';
    } catch (e) {
      console.error('Erreur reset:', e);
      return 'Erreur: ' + e.message;
    }
  };
  
  /**
   * Reset seulement la session Supabase (déconnexion forcée)
   * Usage: window.gpResetSession()
   */
  win.gpResetSession = function() {
    try {
      const keys = Object.keys(localStorage);
      let removed = 0;
      keys.forEach(key => {
        if (key.startsWith('sb-')) {
          localStorage.removeItem(key);
          removed++;
        }
      });
      
      console.log(`✅ ${removed} clé(s) Supabase supprimée(s)`);
      console.log('💡 Rechargez la page pour vous reconnecter');
      return `${removed} clé(s) supprimée(s)`;
    } catch (e) {
      console.error('Erreur reset session:', e);
      return 'Erreur: ' + e.message;
    }
  };

  // Bootstrap de l'application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})(window);
