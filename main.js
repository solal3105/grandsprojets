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
   * Initialise le submenu Travaux en dur (indépendant de category_icons)
   * Affiche uniquement si :
   * - Mode Global (activeCity = null)
   * - Ville avec city_branding.travaux = true
   */
  async function initTravauxSubmenu(categoriesContainer, submenusContainer) {
    console.log('[Main] 🚀 Début initTravauxSubmenu');
    console.log('[Main] categoriesContainer:', categoriesContainer);
    console.log('[Main] submenusContainer:', submenusContainer);
    
    try {
      const activeCity = (typeof win.getActiveCity === 'function') ? win.getActiveCity() : (win.activeCity || null);
      console.log('[Main] activeCity détectée:', activeCity);
      
      // Vérifier si une config travaux existe pour cette ville
      console.log(`[Main] 🔍 Vérification config travaux pour ville: ${activeCity}`);
      const travauxConfig = await supabaseService.getTravauxConfig(activeCity);
      console.log('[Main] travaux_config reçu:', travauxConfig);
      
      if (!travauxConfig) {
        console.log('[Main] ⚠️ Pas de config travaux pour cette ville');
        return;
      }
      
      console.log('[Main] ✅ Config travaux trouvée, affichage du submenu');
      
      console.log('[Main] ✅ Submenu Travaux doit être affiché, création en cours...');
      
      // Créer le bouton de navigation
      const navButton = document.createElement('button');
      navButton.className = 'nav-category';
      navButton.id = 'nav-travaux';
      navButton.dataset.category = 'travaux';
      navButton.innerHTML = `
        <i class="fa-solid fa-helmet-safety" aria-hidden="true"></i>
        <span class="label">Travaux</span>
      `;
      categoriesContainer.appendChild(navButton);
      console.log('[Main] ✅ Bouton Travaux ajouté au DOM');
      
      // Créer le submenu
      const submenu = document.createElement('div');
      submenu.className = 'submenu';
      submenu.dataset.category = 'travaux';
      submenu.style.display = 'none';
      submenu.innerHTML = `<ul class="project-list"></ul>`;
      submenusContainer.appendChild(submenu);
      console.log('[Main] ✅ Submenu Travaux ajouté au DOM');
      
      // Bind navigation (géré manuellement car indépendant de categoryIcons)
      navButton.addEventListener('click', () => {
        console.log('[Main] 🖱️ Clic sur bouton Travaux');
        
        // Un seul layer "travaux", la source est déterminée par travaux_config
        const layersToDisplay = ['travaux'];
        
        console.log('[Main] Layers à afficher:', layersToDisplay);
        
        if (win.EventBindings?.handleNavigation) {
          win.EventBindings.handleNavigation('travaux', layersToDisplay);
        }
        
        // Afficher le submenu Travaux et masquer les autres
        document.querySelectorAll('.submenu').forEach(s => {
          s.style.display = 'none';
        });
        
        const targetSubmenu = document.querySelector('.submenu[data-category="travaux"]');
        if (targetSubmenu) {
          targetSubmenu.style.display = 'block';
          console.log('[Main] ✅ Submenu Travaux affiché');
        } else {
          console.warn('[Main] ⚠️ Submenu Travaux introuvable');
        }
      });
      
      console.log('[Main] ✅ Submenu Travaux créé en dur');
    } catch (error) {
      console.error('[Main] ❌ Erreur initialisation submenu Travaux:', error);
    }
  }

  async function initApp() {
    try {
      // PHASE 1 : Modules de base
      win.AnalyticsModule?.init();
      win.ThemeManager?.init();
      await win.CityManager?.loadValidCities();

      // PHASE 2 : Ville active
      (function maybeRedirectCityPathToQuery() {
        try {
          const path = String(location.pathname || '/');
          const segments = path.split('/');
          let lastIdx = -1;
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i]) { lastIdx = i; break; }
          }
          if (lastIdx < 0) return;
          const lastSeg = segments[lastIdx].toLowerCase();
          if (!win.CityManager?.isValidCity(lastSeg)) return;
          const sp = new URLSearchParams(location.search);
          sp.set('city', lastSeg);
          const baseDir = segments.slice(0, lastIdx).join('/') + '/';
          const target = baseDir + (sp.toString() ? `?${sp.toString()}` : '');
          const absolute = location.origin + target;
          if (absolute !== location.href) {
            location.replace(absolute);
          }
        } catch (_) { /* noop */ }
      })();

      let city = win.CityManager?.initializeActiveCity();
      console.log('[Main] 🏙️ Ville après initializeActiveCity:', city);
      
      // Forcer metropole-lyon si city est vide ou null (plus de mode Global)
      if (!city) {
        console.warn('[Main] ⚠️ Ville vide ou null, forçage à metropole-lyon');
        city = 'metropole-lyon';
        win.activeCity = city;
      }
      
      console.log('[Main] ✅ Ville finale utilisée:', city);
      await win.CityManager?.updateLogoForCity(city);
      await win.CityManager?.initCityToggleUI(city);

      // PHASE 2.5 : Charger le branding de la ville (ou couleur par défaut si pas de ville)
      if (win.CityBrandingModule) {
        try {
          // skipToggles = true pour éviter la race condition avec l'authentification
          // Les toggles seront configurés par onAuthStateChange une fois la session établie
          await win.CityBrandingModule.loadAndApplyBranding(city, true);
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

      if (window.UIModule?.updateBasemaps) {
        window.UIModule.updateBasemaps(basemapsForCity);
      }
      
      window.MapModule.initBaseLayer();
      const currentTheme = document.documentElement.getAttribute('data-theme') || win.ThemeManager?.getInitialTheme() || 'light';
      win.ThemeManager?.syncBasemapToTheme(currentTheme);
      win.CityManager?.applyCityInitialView(city);
      
      if (window.GeolocationModule) {
        window.GeolocationModule.init(window.MapModule.map);
      }
      
      const { DataModule, MapModule, EventBindings } = win;
      const urlMap        = {};
      const styleMap      = {};
      const defaultLayers = [];
      
      console.log('[Main] 🗺️ Filtrage des layers pour ville:', city);
      console.log('[Main] 📦 Nombre total de layers reçus:', layersConfig.length);
      
      layersConfig.forEach(({ name, url, style, is_default, ville }) => {
        // Ignorer les layers sans ville (legacy avec ville = NULL ou vide)
        if (!ville) {
          console.log('[Main] ❌ Layer ignoré (ville NULL):', name);
          return;
        }
        
        // Uniquement les couches de la ville active (city est toujours défini maintenant)
        if (ville !== city) return;
        
        console.log('[Main] ✅ Layer accepté:', name, '| URL:', url ? 'OUI' : 'NON', '| is_default:', is_default);
        
        if (url) urlMap[name] = url;
        if (style) styleMap[name] = style;
        
        if (is_default) defaultLayers.push(name);
      });
      
      console.log('[Main] 📋 defaultLayers après filtrage:', defaultLayers);
      
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
      
      DataModule.initConfig({ city, urlMap, styleMap, defaultLayers });
      defaultLayers.forEach(layer => DataModule.loadLayer(layer));

      // PHASE 5 : Menus dynamiques
      let allContributions = [];
      try {
        if (window.supabaseService?.fetchAllProjects) {
          allContributions = await window.supabaseService.fetchAllProjects();
          console.log('[Main] 📦 Contributions chargées:', allContributions.length, 'projets');
          win.allContributions = allContributions;
        }
      } catch (err) {
        console.error('[Main] ❌ Erreur fetchAllProjects:', err);
      }

      const categoriesWithData = [...new Set(allContributions.map(c => c.category).filter(Boolean))];
      
      // Note: "travaux" est géré séparément via initTravauxSubmenu() (submenu en dur)
      // On le retire de categoriesWithData pour éviter un doublon
      const categoriesFiltered = categoriesWithData.filter(cat => cat !== 'travaux');
      
      console.log('[Main] 📊 Catégories:', categoriesFiltered);

      let allCategoryIconsFromDB = [];
      try {
        if (window.supabaseService?.fetchCategoryIcons) {
          const cityIcons = await window.supabaseService.fetchCategoryIcons();
          allCategoryIconsFromDB.push(...cityIcons);
        }
      } catch (e) {
        console.warn('[Main] ⚠️ Erreur fetch category icons:', e);
      }

      const activeCategoryIcons = categoriesFiltered.map((category, index) => {
        // Chercher l'icône pour cette catégorie
        // fetchCategoryIcons() a déjà filtré par ville (strict)
        let existingIcon = allCategoryIconsFromDB.find(icon => icon.category === category);
        
        if (existingIcon) {
          return existingIcon;
        } else {
          // Icône par défaut pour les catégories sans config DB
          return {
            category: category,
            icon_class: 'fa-solid fa-layer-group',
            display_order: 100 + index
          };
        }
      });
      
      activeCategoryIcons.sort((a, b) => a.display_order - b.display_order);
      console.log('[Main] ✅ Catégories actives:', activeCategoryIcons.map(c => c.category));
      win.categoryIcons = activeCategoryIcons;
      
      // Construire le mapping catégorie → layers depuis la DB
      win.categoryLayersMap = window.supabaseService.buildCategoryLayersMap(activeCategoryIcons);
      
      // Ajouter manuellement le mapping pour "travaux" (submenu en dur, pas dans category_icons)
      // Un seul layer, la source est déterminée par travaux_config
      win.categoryLayersMap['travaux'] = ['travaux'];
      
      console.log('[Main] ✅ categoryLayersMap construit depuis DB:', win.categoryLayersMap);

      win.getAllCategories = () => (win.categoryIcons || []).map(c => c.category);
      win.getCategoryLayers = (category) => win.categoryLayersMap?.[category] || [];
      win.isCategoryLayer = (layerName) => win.getAllCategories().includes(layerName);
      const categoriesContainer = document.getElementById('dynamic-categories');
      const submenusContainer = document.getElementById('dynamic-submenus');
      
      console.log('[Main] 📍 Containers DOM:', { categoriesContainer, submenusContainer });
      console.log('[Main] 📊 activeCategoryIcons.length:', activeCategoryIcons.length);
      
      // Créer les menus dynamiques (catégories depuis contributions)
      if (categoriesContainer && submenusContainer && activeCategoryIcons.length > 0) {
        activeCategoryIcons.forEach(({ category, icon_class }) => {
          const navButton = document.createElement('button');
          navButton.className = 'nav-category';
          navButton.id = `nav-${category}`;
          let fullIconClass = icon_class;
          if (icon_class && !icon_class.includes('fa-solid') && !icon_class.includes('fa-regular') && !icon_class.includes('fa-brands')) {
            fullIconClass = `fa-solid ${icon_class}`;
          }
          
          navButton.innerHTML = `
            <i class="${fullIconClass}" aria-hidden="true"></i>
            <span class="label">${category}</span>
          `;
          categoriesContainer.appendChild(navButton);
          
          const submenu = document.createElement('div');
          submenu.className = 'submenu';
          submenu.dataset.category = category;
          submenu.style.display = 'none';
          submenu.innerHTML = `<ul class="project-list"></ul>`;
          submenusContainer.appendChild(submenu);
        });
        console.log('[Main] 🎨 Menus créés:', activeCategoryIcons.map(c => c.category).join(', '));
      }
      
      // ===== SUBMENU TRAVAUX EN DUR (indépendant de category_icons) =====
      // IMPORTANT : Toujours appeler, même si activeCategoryIcons est vide
      if (categoriesContainer && submenusContainer) {
        console.log('[Main] 🔧 Appel initTravauxSubmenu...');
        await initTravauxSubmenu(categoriesContainer, submenusContainer);
        console.log('[Main] 🔧 initTravauxSubmenu terminé');
      }
      
      // Initialiser les event listeners de navigation via EventBindings
      if (window.EventBindings?.initCategoryNavigation) {
        window.EventBindings.initCategoryNavigation();
        console.log('[Main] 🔗 Navigation initialisée via EventBindings');
      } else {
        console.warn('[Main] EventBindings.initCategoryNavigation non disponible');
      }
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
      
      for (const [category, contribs] of Object.entries(contributionsByCategory)) {
        if (contribs.length > 0) {
          try {
            win[`contributions_${category}`] = contribs;
            await DataModule.loadLayer(category);
            console.log(`[Main] 🗺️ Couche "${category}" chargée: ${contribs.length} contributions`);
          } catch (err) {
            console.error(`[Main] ❌ Erreur chargement ${category}:`, err);
          }
        }
      }

      // PHASE 6 : Modules UI
      await win.FilterManager?.init();

      if (DataModule.preloadLayer) {
        console.log('[Main] 🔄 Préchargement des layers depuis urlMap:', Object.keys(urlMap));
        Object.keys(urlMap).forEach(layer => DataModule.preloadLayer(layer));
      }
      
      EventBindings.bindFilterControls();
      
      if (window.UIModule?.init) {
        window.UIModule.init({ basemaps: basemapsForCity });
      }
      
      if (window.SearchModule?.init) {
        window.SearchModule.init(window.MapModule.map);
      }
      
      // PHASE 7 : Event listeners
      const filtersToggle = document.getElementById('filters-toggle');
      const basemapToggle = document.getElementById('basemap-toggle');
      const themeToggle   = document.getElementById('theme-toggle');
      
      if (filtersToggle) {
        filtersToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          window.UIModule?.togglePopup('filter');
        });
      }
      
      if (basemapToggle) {
        basemapToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          window.UIModule?.togglePopup('basemap');
        });
      }

      // Note: Le bouton search-toggle est géré par SearchModule.init()
      
      // Modale "À propos" (utilise ModalManager)
      const infoToggle = document.getElementById('info-toggle');
      const aboutClose = document.getElementById('about-close');
      
      if (infoToggle) {
        infoToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          win.ModalManager?.open('about-overlay');
        });
      }
      
      if (aboutClose) {
        aboutClose.addEventListener('click', (e) => {
          e.stopPropagation();
          win.ModalManager?.close('about-overlay');
        });
      }
      
      // Bouton de connexion (redirection vers /login)
      const loginToggle = document.getElementById('login-toggle');
      
      if (loginToggle) {
        loginToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = '/login';
        });
      }
      
      if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          win.ThemeManager?.toggle();
        });

        themeToggle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            themeToggle.click();
          }
        });
      }

      // Synchronisation automatique du thème avec l'OS
      win.ThemeManager?.startOSThemeSync();
      
      // Event listener du logo (retour à la vue par défaut)
      EventBindings.bindLogoClick();
      
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
              console.log('[Main] 🔄 Rechargement des couches:', layersToReload);
              
              // Recharger chaque couche pour appliquer les nouveaux styles
              for (const layerName of layersToReload) {
                try {
                  await DataModule.loadLayer(layerName);
                } catch (err) {
                  console.warn(`[Main] ⚠️ Erreur rechargement ${layerName}:`, err);
                }
              }
            }
            
            console.log('[Main] ✅ Styles rechargés et appliqués');
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
       */
      window.addEventListener('popstate', async (e) => {
        try {
          const nextCity = win.CityManager?.resolveActiveCity();
          if (nextCity && nextCity !== win.activeCity) {
            win.activeCity = nextCity;
            win.CityManager?.persistCity(nextCity);
            await win.CityManager?.updateLogoForCity(nextCity);
            try { await win.CityManager?.renderCityMenu(nextCity); } catch (_) {}
            try {
              await win.FilterManager?.init();
              if (window.EventBindings?.bindFilterControls) {
                window.EventBindings.bindFilterControls();
              }
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

          if (state && state.cat && state.project) {
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
    } catch (err) {
      console.error('[Main] Erreur lors de l\'initialisation:', err);
    }
  }

  // ============================================================================
  // FALLBACKS ET BOOTSTRAP
  // ============================================================================
  
  // City toggle removed - functionality handled by CityManager if needed

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
