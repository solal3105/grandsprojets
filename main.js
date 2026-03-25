// ============================================================================
// main.js - Point d'entrée de l'application
// ============================================================================

;(function(win) {
  'use strict';

  if (!win.supabaseService) {
    console.error('[Main] supabaseService manquant');
    return;
  }

  const supabaseService = win.supabaseService;



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
        } catch (parseErr) {
          // JSON invalide = token corrompu
          localStorage.removeItem(key);
          issues.push('Token Supabase JSON invalide → supprimé');
          fixed++;
          needsReload = true;
        }
      }
      
      // 3. Vérifier activeCity
      const activeCity = localStorage.getItem('activeCity');
      if (activeCity && !/^[a-z-]+$/i.test(activeCity)) {
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
        console.warn('[HealthCheck] Corrections automatiques:', issues);
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
    } catch (_) {}
  }

  async function initApp() {
    try {
      // PHASE 0 : Health check automatique du localStorage
      const healthCheck = performStorageHealthCheck();
      if (healthCheck.needsReload) {
        console.warn('[Main] Nettoyage effectué, rechargement automatique...');
        location.reload();
        return;
      }
      if (healthCheck.fixed > 0) {
        console.warn('[Main] Health check:', healthCheck.fixed, 'problème(s) corrigé(s) automatiquement');
      }
      
      // PHASE 0.5 : Vérifier le mode Article (?article=oui)
      if (win.ArticleView?.isArticleMode?.()) {
        console.log('[Main] Mode Article détecté - initialisation vue magazine');
        win.ThemeManager?.init();
        await win.CityManager?.loadValidCities();
        win.CityManager?.initializeActiveCity();
        
        // Initialiser la vue article
        const articleInitialized = await win.ArticleView.init();
        if (articleInitialized) {
          win.ArticleView.updateSEOMeta();
          markLoadComplete();
          console.log('[Main] ✅ Vue Article initialisée avec succès');
          return;
        }
      }
      
      // PHASE 1 : Modules de base
      win.AnalyticsModule?.init();
      win.ThemeManager?.init();
      await win.CityManager?.loadValidCities();

      // PHASE 2 : Ville active et redirections
      // Appliquer les redirections de routes (route-config.js)
      if (win.RouteConfig && typeof win.RouteConfig.applyRedirect === 'function') {
        win.RouteConfig.applyRedirect();
      }

      let city = win.CityManager?.initializeActiveCity();
      
      // Forcer metropole-lyon si city est vide ou null (plus de mode Global)
      if (!city) {
        console.warn('[Main] ⚠️ Ville vide ou null, forçage à metropole-lyon');
        city = 'metropole-lyon';
        win.activeCity = city;
      }
      
      await win.CityManager?.updateLogoForCity(city);
      await win.CityManager?.initCityMenu(city);
      win.toggleManager?.markReady('city');

      // PHASE 2.5 : Charger le branding de la ville (ou couleur par défaut si pas de ville)
      if (win.CityBrandingModule) {
        try {
          // Attendre que toggleManager soit initialisé (c'est un module ES6, chargé en deferred)
          await new Promise((resolve) => {
            if (win.toggleManager && win.toggleManager.initialized) {
              resolve();
            } else {
              const checkInterval = setInterval(() => {
                if (win.toggleManager && win.toggleManager.initialized) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 20);
              setTimeout(() => { clearInterval(checkInterval); resolve(); }, 3000);
            }
          });
          
          // skipToggles = false pour appliquer immédiatement la config des toggles
          await win.CityBrandingModule.loadAndApplyBranding(city, false);
        } catch (err) {
          console.warn('[Main] Failed to load city branding:', err);
        }
      }

      // PHASE 3 : Données Supabase
      const {
        layersConfig,
        metroColors,
        filtersConfig,
        basemaps: remoteBasemaps
      } = await supabaseService.initAllData(city);

      // PHASE 4 : Carte et couches
      window.dataConfig = window.dataConfig || {};
      window.dataConfig.metroColors = metroColors;
      
      // Les basemaps ne sont PAS filtrées par ville (disponibles partout)
      const basemapsForCity = remoteBasemaps || [];
      
      // Définir le basemap préféré de la ville (source unique de vérité)
      // Cette variable est utilisée par MapModule, UIModule et ThemeManager
      const cityBranding = win._cityBranding;
      win._cityPreferredBasemap = cityBranding?.default_basemap || null;

      if (window.UIModule?.updateBasemaps) {
        window.UIModule.updateBasemaps(basemapsForCity);
      }
      
      // Initialiser le basemap - MapModule utilise _cityPreferredBasemap
      window.MapModule.initBaseLayer();
      
      // Synchroniser avec le thème SEULEMENT si la ville n'a pas de basemap configuré
      // (Si la ville a un basemap configuré, on le respecte et on ne le change pas)
      if (!win._cityPreferredBasemap) {
        const currentTheme = document.documentElement.getAttribute('data-theme') || win.ThemeManager?.getInitialTheme() || 'light';
        win.ThemeManager?.syncBasemapToTheme(currentTheme);
      }
      
      win.CityManager?.applyCityInitialView(city);
      
      // Initialiser SearchModule tôt (pas de dépendances avec les données)
      if (window.SearchModule?.init) {
        window.SearchModule.init(window.MapModule.map);
      }
      
      const { DataModule, MapModule, EventBindings } = win;
      const urlMap        = {};
      const styleMap      = {};
      const iconMap       = {};
      const iconColorMap  = {};
      const defaultLayers = [];
      
      layersConfig.forEach(({ name, url, style, is_default, ville, icon, icon_color }) => {
        // Ignorer les layers sans ville (legacy avec ville = NULL ou vide)
        if (!ville) {
          return;
        }
        
        // Uniquement les couches de la ville active (city est toujours défini maintenant)
        if (ville !== city) return;
        
        if (url) urlMap[name] = url;
        if (style) styleMap[name] = style;
        if (icon) iconMap[name] = icon;
        if (icon_color) iconColorMap[name] = icon_color;
        
        if (is_default) defaultLayers.push(name);
      });
      
      // Fusionner les styles des catégories depuis category_icons
      // Les category_styles ont la priorité sur les styles de layers_config
      if (window.supabaseService?.buildCategoryStylesMap && window.supabaseService?.fetchCategoryIcons) {
        const categoryIconsData = await window.supabaseService.fetchCategoryIcons();
        const categoryStylesFromDB = window.supabaseService.buildCategoryStylesMap(categoryIconsData);
        
        // Appliquer les styles de catégorie (ils écrasent les styles de couche si présents)
        Object.keys(categoryStylesFromDB).forEach(category => {
          const categoryStyle = categoryStylesFromDB[category];
          if (categoryStyle && Object.keys(categoryStyle).length > 0) {
            // Fusionner avec le style existant (si présent) ou créer un nouveau
            styleMap[category] = {
              ...(styleMap[category] || {}),
              ...categoryStyle
            };
            
            // Appliquer aussi le style aux couches associées (layers_to_display)
            const categoryIcon = categoryIconsData.find(icon => icon.category === category);
            if (categoryIcon && Array.isArray(categoryIcon.layers_to_display)) {
              categoryIcon.layers_to_display.forEach(layerName => {
                // Ne pas écraser si la couche a déjà un style spécifique
                // Mais fusionner avec le style de catégorie comme base
                if (layerName !== category) {
                  styleMap[layerName] = {
                    ...categoryStyle,
                    ...(styleMap[layerName] || {})
                  };
                }
              });
            }
          }
        });
      }
      
      
      win.defaultLayers = defaultLayers;
      win.iconMap = iconMap;
      win.iconColorMap = iconColorMap;
      
      DataModule.initConfig({ city, urlMap, styleMap, iconMap, iconColorMap, defaultLayers });

      // PHASE 5 : Menus dynamiques (AVANT les layers)
      // Chargement en parallèle des données nécessaires
      const [allContributions, allCategoryIconsFromDB, travauxConfig] = await Promise.all([
        // Fetch contributions
        (async () => {
          try {
            if (window.supabaseService?.fetchAllProjects) {
              const data = await window.supabaseService.fetchAllProjects();
              win.allContributions = data;
              return data;
            }
            return [];
          } catch (err) {
            console.error('[Main] ❌ Erreur fetchAllProjects:', err);
            return [];
          }
        })(),
        // Fetch category icons
        (async () => {
          try {
            if (window.supabaseService?.fetchCategoryIcons) {
              return await window.supabaseService.fetchCategoryIcons();
            }
            return [];
          } catch (e) {
            console.warn('[Main] ⚠️ Erreur fetch category icons:', e);
            return [];
          }
        })(),
        // Fetch travaux config
        (async () => {
          try {
            return await supabaseService.getTravauxConfig(city);
          } catch (err) {
            console.warn('[Main] Erreur chargement config travaux:', err);
            return null;
          }
        })()
      ]);

      const categoriesWithData = [...new Set(allContributions.map(c => c.category).filter(Boolean))];
      
      // Note: "travaux" est géré séparément via initTravauxSubmenu() (submenu en dur)
      const categoriesFiltered = categoriesWithData.filter(cat => cat !== 'travaux');

      const activeCategoryIcons = categoriesFiltered.map((category, index) => {
        const existingIcon = allCategoryIconsFromDB.find(icon => icon.category === category);
        return existingIcon || {
          category: category,
          icon_class: 'fa-solid fa-layer-group',
          display_order: 100 + index
        };
      });
      
      activeCategoryIcons.sort((a, b) => a.display_order - b.display_order);
      win.categoryIcons = activeCategoryIcons;
      
      // Construire le mapping catégorie → layers depuis la DB
      win.categoryLayersMap = window.supabaseService.buildCategoryLayersMap(activeCategoryIcons);
      
      // Ajouter le mapping pour "travaux" (submenu en dur)
      if (travauxConfig?.enabled) {
        win.categoryLayersMap['travaux'] = travauxConfig.layers_to_display || ['travaux'];
      } else {
        win.categoryLayersMap['travaux'] = ['travaux']; // Fallback
      }

      win.getAllCategories = () => (win.categoryIcons || []).map(c => c.category);
      win.getCategoryLayers = (category) => win.categoryLayersMap?.[category] || [];
      win.isCategoryLayer = (layerName) => win.getAllCategories().includes(layerName);
      
      // Store travaux config globally for NavPanel (BEFORE sidebar init)
      win._travauxConfig = travauxConfig || {};
      
      // Initialize sidebar + nav panel
      if (win.SidebarModule) {
        win.SidebarModule.init();
      }
      if (win.NavPanel) {
        win.NavPanel.init();
      }
      // Préparer les contributions par catégorie
      const contributionsByCategory = {};
      allContributions.forEach(contrib => {
        const cat = contrib.category;
        if (cat && categoriesFiltered.includes(cat)) {
          if (!contributionsByCategory[cat]) {
            contributionsByCategory[cat] = [];
          }
          contributionsByCategory[cat].push(contrib);
        }
      });
      
      // Stocker les contributions par catégorie (nécessaire avant le chargement)
      Object.entries(contributionsByCategory).forEach(([category, contribs]) => {
        if (contribs.length > 0) {
          win[`contributions_${category}`] = contribs;
        }
      });

      // PHASE 5.5 : Charger les layers par défaut + toutes les contributions
      const categoryLayers = Object.keys(contributionsByCategory).filter(cat => contributionsByCategory[cat].length > 0);
      
      // Charger defaultLayers (layers système) + categoryLayers (contributions)
      const layersToLoad = [...new Set([...defaultLayers, ...categoryLayers])];
      
      try {
        await Promise.all(layersToLoad.map(layer => 
          DataModule.loadLayer(layer).catch(err => {
            console.error(`[Main] ❌ Erreur chargement layer "${layer}":`, err);
            return null;
          })
        ));
        
        console.log(`[Main] ✅ ${layersToLoad.length} layers chargés (${defaultLayers.length} système + ${categoryLayers.length} contributions)`);
      } catch (err) {
        console.error('[Main] ❌ Erreur lors du chargement des layers:', err);
      }

      // PHASE 6 : Modules UI
      await win.FilterManager?.init();
      win.toggleManager?.markReady('filters');

      if (DataModule.preloadLayer) {
        Object.keys(urlMap).forEach(layer => DataModule.preloadLayer(layer));
        // Preload travaux en arrière-plan pour que le clic soit instantané
        if (win._travauxConfig?.enabled) {
          setTimeout(() => DataModule.preloadLayer('travaux'), 2000);
        }
      }
      
      
      if (window.UIModule?.init) {
        window.UIModule.init({ basemaps: basemapsForCity });
        win.toggleManager?.markReady('basemap');
        win.toggleManager?.markReady('theme');
      }
      
      if (window.GeolocationModule) {
        window.GeolocationModule.init(window.MapModule.map);
        // markReady('location') is called inside GeolocationModule.init()
      }
      
      // Système unifié d'interactions (click contributions + travaux + sélection)
      if (window.FeatureInteractions && window.MapModule?.map?._mlMap) {
        window.FeatureInteractions.init(window.MapModule.map._mlMap);
      }
      
// Note: SearchModule.init() est appelé tôt (ligne ~161) car il n'a pas de dépendances avec les données
      
      // PHASE 7 : Unified toggle actions (all through ToggleManager)
      // ToggleManager handles: click → state → ARIA → visual feedback
      // Business logic is registered via .on() listeners

      // Filters — ToggleManager shows/hides #filters-container via targetElement
      // (no extra logic needed, UIModule.init already rendered filter items)

      // Basemap — ToggleManager toggles .active on #basemap-menu via menuSelector
      // (no extra logic needed, UIModule.init already rendered basemap tiles)

      // Info — ToggleManager handles modal via modalSelector
      win.toggleManager?.markReady('info');

      // About close button → close through ToggleManager
      const aboutClose = document.getElementById('about-close');
      if (aboutClose) {
        aboutClose.addEventListener('click', (e) => {
          e.stopPropagation();
          win.toggleManager?.setState('info', false);
        });
      }

      // Login — ToggleManager redirects via redirectUrl config
      win.toggleManager?.markReady('login');

      // Contribute
      win.toggleManager?.markReady('contribute');

      // Actions panel (mobile only) — populate with sidebar actions
      const actionsPanel = document.getElementById('actions-panel-body');
      const sidebarActions = document.querySelector('.gp-sidebar__actions');
      if (actionsPanel && sidebarActions) {
        const actions = sidebarActions.querySelectorAll('.gp-sidebar__btn');
        actions.forEach(btn => {
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
        
        // Update auth state
        const isConnected = win.AuthModule?.isAuthenticated?.() || false;
        document.body.setAttribute('data-auth-state', isConnected ? 'connected' : 'disconnected');
      }
      win.toggleManager?.markReady('actions');

      // Mode 3D — apply saved state now that map is ready, listen for changes
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

      // Theme — delegate to ThemeManager + dock shimmer + update buildings colors
      win.toggleManager?.on('theme', () => {
        win.ThemeManager?.toggle();
        // Update 3D buildings colors + sky for new theme
        if (MapModule?.map?.updateBuildings3DTheme) {
          MapModule.map.updateBuildings3DTheme();
        }
        if (MapModule?.map?.updateSkyTheme) {
          MapModule.map.updateSkyTheme();
        }
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
      
      
      // Exposer l'API globale
      window.getActiveCity = () => win.CityManager?.getActiveCity() || '';

      // Listener pour recharger les styles quand les catégories sont modifiées
      window.addEventListener('categories:updated', async (e) => {
        try {
          console.log('[Main] 🔄 Rechargement des styles suite à modification de catégorie');
          
          // Recharger les category_icons depuis la DB
          if (window.supabaseService?.fetchCategoryIcons && window.supabaseService?.buildCategoryStylesMap) {
            const categoryIconsData = await window.supabaseService.fetchCategoryIcons();
            const categoryStylesFromDB = window.supabaseService.buildCategoryStylesMap(categoryIconsData);
            
            // Mettre à jour le styleMap
            Object.keys(categoryStylesFromDB).forEach(category => {
              const categoryStyle = categoryStylesFromDB[category];
              if (categoryStyle && Object.keys(categoryStyle).length > 0) {
                styleMap[category] = {
                  ...(styleMap[category] || {}),
                  ...categoryStyle
                };
                
                // Appliquer aussi aux couches associées
                const categoryIcon = categoryIconsData.find(icon => icon.category === category);
                if (categoryIcon && Array.isArray(categoryIcon.layers_to_display)) {
                  categoryIcon.layers_to_display.forEach(layerName => {
                    if (layerName !== category) {
                      styleMap[layerName] = {
                        ...categoryStyle,
                        ...(styleMap[layerName] || {})
                      };
                    }
                  });
                }
              }
            });
            
            // Réinitialiser la config du DataModule avec les nouveaux styles
            DataModule.initConfig({ city, urlMap, styleMap, defaultLayers });
            
            // Recharger les couches visibles pour appliquer les nouveaux styles
            if (MapModule?.layers) {
              const layersToReload = Object.keys(MapModule.layers);
              
              // Recharger chaque couche pour appliquer les nouveaux styles
              for (const layerName of layersToReload) {
                try {
                  await DataModule.loadLayer(layerName);
                } catch (err) {
                  console.warn(`[Main] ⚠️ Erreur rechargement ${layerName}:`, err);
                }
              }
            }
          }
        } catch (err) {
          console.error('[Main] ❌ Erreur rechargement styles:', err);
        }
      });

      // --------------------------------------------------------------------------
      // PHASE 8 : Gestion du routing et de l'historique
      // --------------------------------------------------------------------------

      /**
       * Parse l'état de l'URL (?cat=...&project=...)
       */
      function parseUrlState() {
        try {
          const sp = new URLSearchParams(location.search);
          const cat = String(sp.get('cat') || '').toLowerCase().trim();
          const project = String(sp.get('project') || '').trim();
          return (cat && project) ? { cat, project } : null;
        } catch (_) {
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
            if (contributionProject && window.NavigationModule?.showProjectDetail) {
              window.NavigationModule.showProjectDetail(
                contributionProject.project_name, 
                contributionProject.category, 
                null, 
                contributionProject
              );
              return true;
            }
          }
        } catch (e) {
          console.warn('[Main] Erreur showFromUrlState:', e);
        }
        
        return false;
      }
      
      // Afficher le projet initial si présent dans l'URL
      try {
        const initial = parseUrlState();
        if (initial) {
          await showFromUrlState(initial);
        }
      } catch (e) {
        console.warn('[Main] Erreur affichage projet initial:', e);
      }

      /**
       * Gestion de la navigation (boutons précédent/suivant du navigateur)
       * IMPORTANT: Ne pas réagir aux pushState programmatiques, seulement aux vrais back/forward
       */
      let _isManualNavigation = false;
      
      window.addEventListener('popstate', async (e) => {
        console.log('[Main] 🔙 POPSTATE event:', { 
          isManualNavigation: _isManualNavigation,
          state: e.state,
          url: location.href 
        });
        
        // GUARD: Ignorer les popstate déclenchés par nos propres pushState
        if (_isManualNavigation) {
          console.log('[Main] ⏭️ SKIP popstate - manual navigation in progress');
          return;
        }
        
        try {
          const nextCity = win.CityManager?.resolveActiveCity();
          if (nextCity && nextCity !== win.activeCity) {
            win.activeCity = nextCity;
            win.CityManager?.persistCity(nextCity);
            await win.CityManager?.updateLogoForCity(nextCity);
            try {
              await win.FilterManager?.init();
            } catch (_) { /* noop */ }
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
            } catch (_) { /* noop */ }
          }

          console.log('[Main] 📍 Popstate state:', state);

          if (state && state.cat && state.project) {
            console.log('[Main] 📞 Calling showFromUrlState');
            await showFromUrlState({ cat: state.cat, project: state.project });
          } else if (state && state.cat && !state.project) {
            if (window.NavigationModule?.resetToDefaultView) {
              window.NavigationModule.resetToDefaultView(state.cat, { preserveMapView: true, updateHistory: false });
            }
          } else if (window.NavigationModule?.resetToDefaultView) {
            window.NavigationModule.resetToDefaultView(undefined, { preserveMapView: true, updateHistory: false });
          }
        } catch (_) { /* noop */ }
      });
      
      // Exposer le flag pour que uimodule.js puisse le contrôler
      win._setManualNavigation = (value) => {
        _isManualNavigation = value;
      };
      
      // --------------------------------------------------------------------------
      // PHASE 9 : Fiche Modal (iframe-based fullscreen, via ModalHelper)
      // --------------------------------------------------------------------------
      (function initFicheModal() {
        const iframe   = document.getElementById('fiche-modal-iframe');
        const loader   = document.getElementById('fiche-modal-loader');
        const titleEl  = document.getElementById('fiche-modal-title');
        const newtabEl = document.getElementById('fiche-modal-newtab');
        if (!iframe) return;

        function openFicheModal(ficheUrl, projectName) {
          const embedUrl = ficheUrl + (ficheUrl.includes('?') ? '&' : '?') + 'embed=1';
          if (titleEl) titleEl.textContent = projectName || '';
          if (newtabEl) newtabEl.href = ficheUrl;
          if (loader) loader.classList.remove('hidden');
          iframe.src = embedUrl;
          iframe.onload = () => { if (loader) loader.classList.add('hidden'); };

          win.ModalHelper.open('fiche-modal-overlay', {
            dismissible: true,
            lockScroll: true,
            focusTrap: true,
            onClose: () => { iframe.src = 'about:blank'; }
          });
        }

        function closeFicheModal() {
          win.ModalHelper.close('fiche-modal-overlay');
        }

        // Delegated click: any button with data-fiche-url
        document.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-fiche-url]');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          openFicheModal(btn.dataset.ficheUrl, btn.dataset.ficheName || '');
        });

        // Expose globally for potential programmatic use
        win.FicheModal = { open: openFicheModal, close: closeFicheModal };
      })();

      // Marquer le chargement comme terminé (pour la détection de blocage)
      markLoadComplete();
      
    } catch (err) {
      console.error('[Main] Erreur lors de l\'initialisation:', err);
      
      // Afficher un message d'erreur visible pour l'utilisateur
      try {
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
      } catch (_) {}
    }
  }

  // ============================================================================
  // FALLBACKS ET BOOTSTRAP
  // ============================================================================
  
  // City toggle removed - functionality handled by CityManager if needed

  // ============================================================================
  // UTILITAIRES DE DIAGNOSTIC ET RÉCUPÉRATION
  // ============================================================================
  
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
      } catch (e) {
        console.log('  ⚠️ Token corrompu (JSON invalide)');
      }
    } else {
      console.log('  Pas de token Supabase');
    }
    console.groupEnd();
    
    // 3. État application
    console.group('🏙️ Application');
    console.log('  activeCity:', win.activeCity || localStorage.getItem('activeCity') || 'Non définie');
    console.log('  theme:', localStorage.getItem('theme') || 'Auto');
    console.log('  MapModule:', !!win.MapModule?.map ? '✅ OK' : '❌ Non initialisé');
    console.log('  DataModule:', !!win.DataModule ? '✅ OK' : '❌ Non initialisé');
    console.log('  supabaseService:', !!win.supabaseService ? '✅ OK' : '❌ Non initialisé');
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

  // Initialiser le système de redirection automatique vers la ville
  try {
    if (win.CityRedirect && typeof win.CityRedirect.init === 'function') {
      win.CityRedirect.init();
    }
  } catch (_) {}

  // Bootstrap de l'application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})(window);
