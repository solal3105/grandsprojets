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

      const city = win.CityManager?.initializeActiveCity() || '';
      await win.CityManager?.updateLogoForCity(city);
      await win.CityManager?.initCityToggleUI(city);

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
      
      const basemapsForCity = (remoteBasemaps || []).filter(b => !b || !('ville' in b) || !b.ville || b.ville === city);

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
      
      layersConfig.forEach(({ name, url, style, is_default, ville }) => {
        if (ville && ville !== city) return;
        
        if (url) urlMap[name] = url;
        if (style) styleMap[name] = style;
        
        if (is_default) defaultLayers.push(name);
      });
      
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
      const travauxLayer = layersConfig.find(layer => layer.name === 'travaux');
      if (travauxLayer && !categoriesWithData.includes('travaux')) {
        categoriesWithData.push('travaux');
      }
      
      console.log('[Main] 📊 Catégories:', categoriesWithData);

      let allCategoryIconsFromDB = [];
      try {
        if (window.supabaseService?.fetchCategoryIcons) {
          const cityIcons = await window.supabaseService.fetchCategoryIcons();
          allCategoryIconsFromDB.push(...cityIcons);
          if (!city || city === 'default' || city === '') {
            try {
              const client = window.supabaseService?.getClient();
              if (client) {
                const { data } = await client
                  .from('category_icons')
                  .select('category, icon_class, display_order, ville')
                  .order('display_order', { ascending: true });
                
                if (data) {
                  data.forEach(icon => {
                    if (!allCategoryIconsFromDB.find(existing => 
                      existing.category === icon.category && existing.ville === icon.ville
                    )) {
                      allCategoryIconsFromDB.push(icon);
                    }
                  });
                }
              }
            } catch (e) {
              console.warn('[Main] ⚠️ Erreur fetch all category icons:', e);
            }
          }
        }
      } catch (e) {
        console.warn('[Main] ⚠️ Erreur fetch category icons:', e);
      }

      const activeCategoryIcons = categoriesWithData.map((category, index) => {
        let existingIcon = allCategoryIconsFromDB.find(icon => 
          icon.category === category && icon.ville === city
        );
        
        // Sinon, chercher pour ville EMPTY (global)
        if (!existingIcon) {
          existingIcon = allCategoryIconsFromDB.find(icon => 
            icon.category === category && (!icon.ville || icon.ville === null)
          );
        }
        
        if (existingIcon) {
          return existingIcon;
        } else {
          let defaultIcon = 'fa-solid fa-layer-group';
          let defaultOrder = 100 + index;
          
          if (category === 'travaux') {
            defaultIcon = 'fa-solid fa-helmet-safety';
            defaultOrder = 99;
          }
          
          return {
            category: category,
            icon_class: defaultIcon,
            display_order: defaultOrder
          };
        }
      });
      
      activeCategoryIcons.sort((a, b) => a.display_order - b.display_order);
      console.log('[Main] ✅ Catégories actives:', activeCategoryIcons.map(c => c.category));
      win.categoryIcons = activeCategoryIcons;
      
      // Construire le mapping catégorie → layers depuis la DB
      win.categoryLayersMap = window.supabaseService.buildCategoryLayersMap(activeCategoryIcons);
      console.log('[Main] ✅ categoryLayersMap construit depuis DB:', win.categoryLayersMap);

      win.getAllCategories = () => (win.categoryIcons || []).map(c => c.category);
      win.getCategoryLayers = (category) => win.categoryLayersMap?.[category] || [];
      win.isCategoryLayer = (layerName) => win.getAllCategories().includes(layerName);
      const categoriesContainer = document.getElementById('dynamic-categories');
      const submenusContainer = document.getElementById('dynamic-submenus');
      
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
        
        // Initialiser les event listeners de navigation via EventBindings
        if (window.EventBindings?.initCategoryNavigation) {
          window.EventBindings.initCategoryNavigation();
          console.log('[Main] 🔗 Navigation initialisée via EventBindings');
        } else {
          console.warn('[Main] EventBindings.initCategoryNavigation non disponible');
        }
      }
      const contributionsByCategory = {};
      allContributions.forEach(contrib => {
        const cat = contrib.category;
        if (cat && categoriesWithData.includes(cat)) {
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
  
  // Fallback de sécurité pour le sélecteur de ville
  try {
    document.addEventListener('click', function(e) {
      const btn = e.target && (e.target.id === 'city-toggle' ? e.target : e.target.closest && e.target.closest('#city-toggle'));
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        console.debug('[city] delegated click -> openCityMenu');
        win.CityManager?.openCityMenu();
      }
    }, true);
  } catch (_) {}

  // Bootstrap de l'application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})(window);
