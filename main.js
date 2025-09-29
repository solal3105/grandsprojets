// main.js
// Version globale sans modules ES, utilisant window.supabaseService
;(function(win) {
  // Vérifie que supabaseService est bien chargé
  if (!win.supabaseService) {
    console.error('supabaseService manquant : assurez-vous de charger supabaseService.js avant main.js');
    return;
  }

  // Récupérer supabaseService sans perdre le contexte `this`
  const supabaseService = win.supabaseService;

  async function initApp() {
    try {
      // Initialiser les modules
      win.AnalyticsModule?.init();
      win.AppConfig?.init();
      win.ThemeManager?.init();
      
      // Charger dynamiquement la liste des villes valides avant de résoudre la ville active
      await win.CityManager?.loadValidCities();

      // Rediriger /<city> -> base index avec ?city=<city>
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

      // Déterminer la ville active
      const rawQueryCity = win.CityManager?.getRawCityFromQueryParam();
      const rawPathCity  = win.CityManager?.getRawCityFromPathRaw();
      const spForDetect = new URLSearchParams(location.search);
      const cityParamPresent = spForDetect.has('city');
      const rawCityExact = String(spForDetect.get('city') || '').toLowerCase().trim();
      const explicitNoCity = cityParamPresent && (rawCityExact === '' || rawCityExact === 'default');
      
      if ((rawQueryCity && !win.CityManager?.isValidCity(rawQueryCity)) || 
          (rawPathCity && !win.CityManager?.isValidCity(rawPathCity))) {
        win.CityManager?.clearPersistedCity();
      }

      let city = win.CityManager?.resolveActiveCity();
      if (explicitNoCity) {
        city = '';
        win.activeCity = '';
        try { win.CityManager?.clearPersistedCity(); } catch (_) {}
      } else {
        win.activeCity = city;
      }
      
      try {
        if (!explicitNoCity) {
          if (city && win.CityManager?.isValidCity(city)) {
            if (win.CityManager?.restoreCity() !== city) win.CityManager?.persistCity(city);
          } else {
            win.CityManager?.clearPersistedCity();
          }
        }
      } catch (_) {}
      
      // Update logos et UI
      await win.CityManager?.updateLogoForCity(city);
      await win.CityManager?.initCityToggleUI(city);

      // 1️⃣ Charger toutes les données en une seule fois (contexte préservé)
      const {
        layersConfig,
        metroColors,
        filtersConfig,
        basemaps: remoteBasemaps
      } = await supabaseService.initAllData(city);

      // Rendre les couleurs de lignes métro disponibles
      window.dataConfig = window.dataConfig || {};
      window.dataConfig.metroColors = metroColors;
      // Mettre à jour les fonds de carte via UIModule (filtrés par ville si applicable)
      const basemapsToUse = (remoteBasemaps && remoteBasemaps.length > 0) ? remoteBasemaps : window.basemaps;
      const basemapsForCity = (basemapsToUse || []).filter(b => !b || !('ville' in b) || !b.ville || b.ville === city);

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
      const {
        DataModule,
        MapModule,
        EventBindings,
        NavigationModule
      } = win;

      // Construire les maps de couches
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

      // ========================================
      // LOGIQUE DATA-DRIVEN : Les contributions dictent les menus
      // ========================================
      
      // 1️⃣ Charger TOUTES les contributions de la ville
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

      // 2️⃣ Extraire les catégories UNIQUES présentes dans les contributions
      const categoriesWithData = [...new Set(allContributions.map(c => c.category).filter(Boolean))];
      
      // Ajouter "travaux" si elle existe dans layers_config (couche legacy)
      const travauxLayer = layersConfig.find(layer => layer.name === 'travaux');
      if (travauxLayer && !categoriesWithData.includes('travaux')) {
        categoriesWithData.push('travaux');
      }
      
      console.log('[Main] 📊 Catégories avec données:', categoriesWithData);

      // 3️⃣ Récupérer TOUTES les métadonnées des catégories (toutes les villes)
      let allCategoryIconsFromDB = [];
      try {
        if (window.supabaseService?.fetchCategoryIcons) {
          // Récupérer pour la ville active
          const cityIcons = await window.supabaseService.fetchCategoryIcons();
          allCategoryIconsFromDB.push(...cityIcons);
          
          // Si on est en mode "default" (pas de ville), récupérer aussi les icônes globales
          // En faisant une requête sans filtre de ville pour avoir toutes les icônes disponibles
          if (!city || city === 'default' || city === '') {
            try {
              const { data } = await window.supabase.createClient(
                'https://wqqsuybmyqemhojsamgq.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxcXN1eWJteXFlbWhvanNhbWdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxNDYzMDQsImV4cCI6MjA0NTcyMjMwNH0.OpsuMB9GfVip2BjlrERFA_CpCOLsjNGn-ifhqwiqLl0'
              )
                .from('category_icons')
                .select('category, icon_class, display_order, ville')
                .order('display_order', { ascending: true });
              
              if (data) {
                // Ajouter toutes les icônes, en évitant les doublons
                data.forEach(icon => {
                  if (!allCategoryIconsFromDB.find(existing => 
                    existing.category === icon.category && existing.ville === icon.ville
                  )) {
                    allCategoryIconsFromDB.push(icon);
                  }
                });
              }
            } catch (e) {
              console.warn('[Main] ⚠️ Erreur fetch all category icons:', e);
            }
          }
        }
      } catch (e) {
        console.warn('[Main] ⚠️ Erreur fetch category icons:', e);
      }

      // 4️⃣ Créer les métadonnées pour TOUTES les catégories avec données
      // Chercher l'icône appropriée : ville spécifique > EMPTY > défaut
      const activeCategoryIcons = categoriesWithData.map((category, index) => {
        // Chercher d'abord pour la ville active
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
          // Créer des métadonnées par défaut pour cette catégorie
          console.warn(`[Main] ⚠️ Pas d'icône définie pour "${category}", utilisation de l'icône par défaut`);
          
          // Icônes par défaut selon la catégorie
          let defaultIcon = 'fa-solid fa-layer-group';
          let defaultOrder = 100 + index;
          
          if (category === 'travaux') {
            defaultIcon = 'fa-solid fa-helmet-safety';
            defaultOrder = 99; // Après urbanisme(1), velo(3), mobilite(2)
          }
          
          return {
            category: category,
            icon_class: defaultIcon,
            display_order: defaultOrder
          };
        }
      });
      
      // Trier par display_order
      activeCategoryIcons.sort((a, b) => a.display_order - b.display_order);
      
      console.log('[Main] ✅ Catégories actives (avec contributions):', activeCategoryIcons.map(c => c.category));
      
      win.categoryIcons = activeCategoryIcons;

      // 5️⃣ Construire le mapping catégorie -> couches
      win.categoryLayersMap = {};
      activeCategoryIcons.forEach(({ category }) => {
        const matchingLayers = layersConfig
          .filter(layer => layer.name === category || layer.name.includes(category))
          .map(layer => layer.name);
        
        win.categoryLayersMap[category] = matchingLayers.length > 0 ? matchingLayers : [category];
      });

      // 6️⃣ Exposer les fonctions helper
      win.getAllCategories = () => {
        return (win.categoryIcons || []).map(c => c.category);
      };
      
      win.getCategoryLayers = (category) => {
        return (win.categoryLayersMap && win.categoryLayersMap[category]) || [category];
      };
      
      win.isCategoryLayer = (layerName) => {
        const allCategories = win.getAllCategories();
        return allCategories.includes(layerName);
      };

      // 7️⃣ Créer les menus UNIQUEMENT pour les catégories actives
      const categoriesContainer = document.getElementById('dynamic-categories');
      const submenusContainer = document.getElementById('dynamic-submenus');
      
      if (categoriesContainer && submenusContainer && activeCategoryIcons.length > 0) {
        activeCategoryIcons.forEach(({ category, icon_class }) => {
          // Créer le bouton de navigation
          const navButton = document.createElement('button');
          navButton.className = 'nav-category';
          navButton.id = `nav-${category}`;
          
          // S'assurer que l'icône a le bon format (ajouter fa-solid si manquant)
          let fullIconClass = icon_class;
          if (icon_class && !icon_class.includes('fa-solid') && !icon_class.includes('fa-regular') && !icon_class.includes('fa-brands')) {
            fullIconClass = `fa-solid ${icon_class}`;
          }
          
          navButton.innerHTML = `
            <i class="${fullIconClass}" aria-hidden="true"></i>
            <span class="label">${category}</span>
          `;
          categoriesContainer.appendChild(navButton);
          
          // Créer le sous-menu correspondant
          const submenu = document.createElement('div');
          submenu.className = 'submenu';
          submenu.dataset.category = category; // Utiliser data-category au lieu d'un ID
          submenu.style.display = 'none';
          submenu.innerHTML = `<ul class="project-list"></ul>`;
          submenusContainer.appendChild(submenu);
        });
        console.log('[Main] 🎨 Menus créés pour:', activeCategoryIcons.map(c => c.category).join(', '));
        
        // Attacher les event listeners aux boutons de navigation
        activeCategoryIcons.forEach(({ category }) => {
          const navButton = document.getElementById(`nav-${category}`);
          if (!navButton) return;
          
          navButton.addEventListener('click', () => {
            // Récupérer les couches associées à cette catégorie
            const categoryLayers = win.categoryLayersMap[category] || [category];
            
            if (window.EventBindings?.handleNavigation) {
              window.EventBindings.handleNavigation(category, categoryLayers);
            }
            
            // Afficher le sous-menu de cette catégorie et masquer les autres
            document.querySelectorAll('.submenu').forEach(submenu => {
              submenu.style.display = 'none';
              submenu.classList.remove('active');
            });
            
            const targetSubmenu = document.querySelector(`.submenu[data-category="${category}"]`);
            if (targetSubmenu) {
              targetSubmenu.style.display = 'block';
              targetSubmenu.classList.add('active');
            }
          });
        });
        console.log('[Main] 🔗 Event listeners attachés aux menus');
      }

      // 8️⃣ Grouper les contributions par catégorie et charger les couches
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
      
      // 9️⃣ Charger une couche par catégorie (préserve les styles de la table layers)
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

      // Initialiser les filtres
      await win.FilterManager?.init();

      if (DataModule.preloadLayer) {
        Object.keys(urlMap).forEach(layer => DataModule.preloadLayer(layer));
      }
      EventBindings.bindFilterControls();
      
      if (window.UIModule?.init) {
        window.UIModule.init({
          basemaps: basemapsForCity
        });
      }
      
      if (window.SearchModule?.init) {
        window.SearchModule.init(window.MapModule.map);
      }
      
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

      const infoToggle    = document.getElementById('info-toggle');
      const aboutOverlay  = document.getElementById('about-overlay');
      const aboutClose    = document.getElementById('about-close');
      const aboutModal    = aboutOverlay ? aboutOverlay.querySelector('.gp-modal') : null;
      let aboutLastFocus  = null;
      let aboutCloseTimer = null;

      const closeAbout = () => {
        if (!aboutOverlay) return;
        if (aboutCloseTimer) { clearTimeout(aboutCloseTimer); aboutCloseTimer = null; }
        if (aboutModal) aboutModal.classList.remove('is-open');
        aboutOverlay.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', escHandler);
        document.body.style.overflow = '';
        aboutCloseTimer = setTimeout(() => {
          aboutOverlay.style.display = 'none';
          if (aboutLastFocus && typeof aboutLastFocus.focus === 'function') {
            try { aboutLastFocus.focus(); } catch (_) {}
          }
        }, 180);
      };

      const openAbout = () => {
        if (!aboutOverlay) return;
        if (aboutCloseTimer) { clearTimeout(aboutCloseTimer); aboutCloseTimer = null; }
        aboutLastFocus = document.activeElement;
        aboutOverlay.style.display = 'flex';
        aboutOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          if (aboutModal) aboutModal.classList.add('is-open');
        });
        if (aboutClose && typeof aboutClose.focus === 'function') {
          try { aboutClose.focus(); } catch (_) {}
        }
        document.addEventListener('keydown', escHandler);
      };

      const escHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAbout();
        }
      };

      if (infoToggle) {
        infoToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          openAbout();
        });
      }
      if (aboutClose) {
        aboutClose.addEventListener('click', (e) => {
          e.stopPropagation();
          closeAbout();
        });
      }
      if (aboutOverlay) {
        aboutOverlay.addEventListener('click', (e) => {
          if (e.target === aboutOverlay) {
            closeAbout();
          }
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

      win.ThemeManager?.startOSThemeSync();
      
      function handleLogoClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        let activeCategory = null;
        const activeTab = document.querySelector('.nav-category.active');
        if (activeTab) {
          activeCategory = activeTab.id.replace('nav-', '');
        }
        
        if (window.NavigationModule?.resetToDefaultView) {
          window.NavigationModule.resetToDefaultView(activeCategory);
        } else {
        }
        
        return false;
      }
      
      const logoContainer = document.querySelector('#left-nav .logo');
      
      if (logoContainer) {
        logoContainer.addEventListener('click', handleLogoClick, false);
        
        const logoImg = logoContainer.querySelector('img');
        
        if (logoImg) {
          logoImg.style.pointerEvents = 'none';
        }
      }

      const handleFeatureClick = (feature, layerName) => {
        try {
          const p = (feature && feature.properties) || {};
          const projectName = p.project_name || p.name || p.Name || p.LIBELLE;
          
          if (!projectName) {
            return;
          }

          const category = p.category || layerName;
          
          if (window.NavigationModule?.showSpecificContribution) {
            window.NavigationModule.showSpecificContribution(projectName, category, p);
          }
          else if (window.UIModule?.showDetailPanel) {
            window.UIModule.showDetailPanel(layerName, feature);
          } 
          else if (window.NavigationModule?.showProjectDetail) {
            window.NavigationModule.showProjectDetail(projectName, category);
          }
          else {
            const detailPanel = document.getElementById('project-detail');
            const detailContent = document.getElementById('detail-content');
            
            if (detailPanel && detailContent) {
              detailPanel.style.display = 'block';
              detailPanel.dataset.category = category;
              
              detailContent.innerHTML = `# ${projectName}\n\nAucun détail disponible pour ce projet.`;
            } else {
            }
          }
        } catch (e) {
        }
      };
      
      window.getActiveCity = () => {
        return win.CityManager?.parseCityFromPath(location.pathname) || 
               win.CityManager?.getCityFromQuery('') || 
               win.CityManager?.restoreCity() || 
               win.activeCity || 
               win.CityManager?.getDefaultCity();
      };

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
        }
        
        return false;
      }
      try {
        const initial = parseUrlState();
        if (initial) {
          await showFromUrlState(initial);
        }
      } catch (_) { /* noop */ }

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
    } catch (err) {}
  }

  // Fallback de sécurité: déléguer le clic sur #city-toggle
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    // Le DOM est déjà chargé
    initApp();
  }
})(window);
