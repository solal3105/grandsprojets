// main.js
// Version globale sans modules ES, utilisant window.supabaseService
;(function(win) {
  // Hotjar (analytics)
  (function(){
    try {
      function ensureHotjar(hjid){
        try {
          if (win._hjSettings && win._hjSettings.hjid === hjid) return;
          if (document.querySelector('script[src*="static.hotjar.com/c/hotjar-"]')) return;
          (function(h,o,t,j,a,r){
              h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
              h._hjSettings={hjid:hjid,hjsv:6};
              a=o.getElementsByTagName('head')[0];
              r=o.createElement('script');r.async=1;
              r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
              a.appendChild(r);
          })(win,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
        } catch(e) {}
      }
      ensureHotjar(6496613);
    } catch(e) { console.warn('Hotjar injection failed', e); }
  })();
  // Vérifie que supabaseService est bien chargé
  if (!win.supabaseService) {
    console.error('supabaseService manquant : assurez-vous de charger supabaseService.js avant main.js');
    return;
  }

  // Récupérer supabaseService sans perdre le contexte `this`
  const supabaseService = win.supabaseService;
  // Ces modules seront récupérés dynamiquement dans initApp après que tous les scripts soient bien chargés

  // ---- Thème (clair/sombre) : gestion simple avec persistance ----
  function getInitialTheme() {
    const prefersDark = win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    const root = document.documentElement; // <html>
    root.setAttribute('data-theme', theme);
    // Mettre à jour l'icône/label du bouton si présent
    const iconEl = document.querySelector('#theme-toggle i');
    if (iconEl) {
      iconEl.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    const toggleEl = document.getElementById('theme-toggle');
    if (toggleEl) {
      toggleEl.title = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
      toggleEl.setAttribute('aria-label', toggleEl.title);
      toggleEl.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
  }

  // Trouve un fond de carte adapté au thème courant
  function findBasemapForTheme(theme) {
    const list = window.basemaps || [];
    if (!Array.isArray(list) || list.length === 0) return null;
    const lc = (s) => String(s || '').toLowerCase();

    // 1) Propriété explicite `theme` si fournie par la base ("dark" | "light")
    let bm = list.find(b => lc(b.theme) === theme);
    if (bm) return bm;

    // 2) Heuristiques sur les labels/noms
    const darkKeys = ['dark', 'noir', 'sombre', 'night', 'nuit'];
    const lightKeys = ['light', 'clair', 'day', 'jour', 'positron', 'osm', 'streets', 'standard'];
    const keys = theme === 'dark' ? darkKeys : lightKeys;
    bm = list.find(b => keys.some(k => lc(b.label).includes(k) || lc(b.name).includes(k)));
    if (bm) return bm;

    return null;
  }

  // Applique le fond de carte correspondant au thème s'il est disponible
  function syncBasemapToTheme(theme) {
    try {
      const bm = findBasemapForTheme(theme);
      if (!bm) return;
      const layer = L.tileLayer(bm.url, { attribution: bm.attribution });
      if (window.MapModule?.setBaseLayer) {
        window.MapModule.setBaseLayer(layer);
      }
      if (window.UIModule?.setActiveBasemap) {
        window.UIModule.setActiveBasemap(bm.label);
      }
    } catch (e) {
      console.warn('syncBasemapToTheme: erreur lors du changement de fond de carte', e);
    }
  }

  function initTheme() {
    const initial = getInitialTheme();
    applyTheme(initial);
  }

  // Synchronisation avec la préférence système lorsque l'utilisateur
  // n'a pas enregistré de préférence explicite (localStorage)
  let osThemeMediaQuery = null;
  let osThemeHandler = null;
  function hasSavedPreference() {
    try {
      const v = localStorage.getItem('theme');
      return v === 'dark' || v === 'light';
    } catch (_) { return false; }
  }

  function startOSThemeSync() {
    try {
      if (!win.matchMedia) return;
      if (!osThemeMediaQuery) {
        osThemeMediaQuery = win.matchMedia('(prefers-color-scheme: dark)');
      }
      const applyFromOS = () => {
        const next = osThemeMediaQuery.matches ? 'dark' : 'light';
        applyTheme(next);
        // Tenter d'aligner le fond de carte si disponible
        try { syncBasemapToTheme(next); } catch (_) {}
      };
      // Appliquer immédiatement l'état courant
      applyFromOS();
      // Écouter les changements
      osThemeHandler = applyFromOS;
      if (typeof osThemeMediaQuery.addEventListener === 'function') {
        osThemeMediaQuery.addEventListener('change', osThemeHandler);
      } else if (typeof osThemeMediaQuery.addListener === 'function') {
        osThemeMediaQuery.addListener(osThemeHandler);
      }
    } catch (_) {}
  }

  function stopOSThemeSync() {
    try {
      if (!osThemeMediaQuery) return;
      if (osThemeHandler) {
        if (typeof osThemeMediaQuery.removeEventListener === 'function') {
          osThemeMediaQuery.removeEventListener('change', osThemeHandler);
        } else if (typeof osThemeMediaQuery.removeListener === 'function') {
          osThemeMediaQuery.removeListener(osThemeHandler);
        }
      }
      osThemeMediaQuery = null;
      osThemeHandler = null;
    } catch (_) {}
  }

  async function initApp() {
    try {
      // Initialiser le thème le plus tôt possible (n'affecte pas le basemap)
      initTheme();
      // 1️⃣ Charger toutes les données en une seule fois (contexte préservé)
      const {
        layersConfig,
        metroColors,
        mobilityData,
        filtersConfig,
        basemaps: remoteBasemaps
      } = await supabaseService.initAllData();


      // Mettre à jour les fonds de carte via UIModule
      const basemapsToUse = remoteBasemaps && remoteBasemaps.length > 0 ? remoteBasemaps : window.basemaps;
      
      if (window.UIModule?.updateBasemaps) {
        window.UIModule.updateBasemaps(basemapsToUse);
      } else {
        console.warn('UIModule.updateBasemaps non disponible');
      }
      
      // Initialiser la couche de base
      window.MapModule.initBaseLayer();

      // Synchroniser le fond de carte avec le thème courant (si un fond correspondant existe)
      syncBasemapToTheme(document.documentElement.getAttribute('data-theme') || getInitialTheme());

      // Initialiser le module de géolocalisation
      
      if (window.GeolocationModule) {
        window.GeolocationModule.init(window.MapModule.map);
      } else {
        console.warn('❌ ERREUR: GeolocationModule non chargé');
      }

      // Récupération dynamique des modules après chargement complet
      const {
        DataModule,
        MapModule,
        EventBindings,
        NavigationModule
      } = win;


      // 2️⃣ Construire les maps de couches
      const urlMap        = {};
      const styleMap      = {};
      const defaultLayers = [];
      layersConfig.forEach(({ name, url, style, is_default }) => {
        urlMap[name]   = url;
        styleMap[name] = style;
        if (is_default) defaultLayers.push(name);
      });
      
      // Exposer defaultLayers globalement pour qu'il soit accessible depuis d'autres modules
      win.defaultLayers = defaultLayers;

      // Centraliser les couches par défaut par catégorie pour éviter la duplication
      win.CATEGORY_DEFAULT_LAYERS = {
        transport: ['metroFuniculaire', 'tramway', 'reseauProjeteSitePropre'],
        velo: ['planVelo', 'voielyonnaise'],
        urbanisme: ['urbanisme'],
        travaux: ['travaux']
      };

      // 3️⃣ Initialiser DataModule et charger les couches par défaut
      DataModule.initConfig({ urlMap, styleMap, defaultLayers });
      defaultLayers.forEach(layer => DataModule.loadLayer(layer));

      // 4️⃣ Construction et mise à jour des filtres
      populateFilters();
      updateFilterUI();
      updateFilterCount();

      window.updateFilterUI    = updateFilterUI;
      window.updateFilterCount = updateFilterCount;


      const filterContainer = document.getElementById('dynamic-filters');
      if (filterContainer) {
        new MutationObserver(() => {
          updateFilterUI();
          updateFilterCount();
        }).observe(filterContainer, {
          attributes: true,
          subtree: true,
          attributeFilter: ['class']
        });
      }

      // 5️⃣ Préchargement des couches, bindings et menus
      if (DataModule.preloadLayer) {
        Object.keys(urlMap).forEach(layer => DataModule.preloadLayer(layer));
      }
      EventBindings.bindFilterControls();
      
      // Initialisation des modules UI avec les fonds de carte si disponibles
      if (window.UIModule?.init) {
        window.UIModule.init({
          basemaps: basemapsToUse
        });
      } else {
        console.warn('UIModule.init non disponible');
      }
      
      // Initialiser le module de recherche d'adresse
      if (window.SearchModule?.init) {
        window.SearchModule.init(window.MapModule.map);
      } else {
        console.warn('SearchModule non disponible');
      }
      
      // Configuration des gestionnaires d'événements
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

      // À propos: ouverture/fermeture du modal
      const infoToggle    = document.getElementById('info-toggle');
      const aboutOverlay  = document.getElementById('about-overlay');
      const aboutClose    = document.getElementById('about-close');
      const aboutModal    = aboutOverlay ? aboutOverlay.querySelector('.gp-modal') : null;
      let aboutLastFocus  = null;
      let aboutCloseTimer = null;

      const closeAbout = () => {
        if (!aboutOverlay) return;
        if (aboutCloseTimer) { clearTimeout(aboutCloseTimer); aboutCloseTimer = null; }
        // play closing transition
        if (aboutModal) aboutModal.classList.remove('is-open');
        aboutOverlay.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', escHandler);
        document.body.style.overflow = '';
        // hide after transition
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
        // animate in on next frame
        requestAnimationFrame(() => {
          if (aboutModal) aboutModal.classList.add('is-open');
        });
        // focus sur le bouton fermer
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
          // Fermer si clic en dehors de la boîte de dialogue
          if (e.target === aboutOverlay) {
            closeAbout();
          }
        });
      }
      
      // Gestion du basculement du thème (sans modifier automatiquement le fond de carte)
      if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const current = document.documentElement.getAttribute('data-theme') || 'light';
          const next = current === 'dark' ? 'light' : 'dark';
          applyTheme(next);
          // Aligner automatiquement le fond de carte sur le thème choisi
          syncBasemapToTheme(next);
          // Rester en mode automatique: ne pas persister ni arrêter la synchro OS
        });

        // Accessibilité clavier: Enter/Space pour activer le bouton
        themeToggle.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            themeToggle.click();
          }
        });
      }

      // Démarrer la synchro avec l'OS en permanence
      startOSThemeSync();
      
      // Gestion du clic sur le logo
      function handleLogoClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Trouver la catégorie active
        let activeCategory = null;
        const activeTab = document.querySelector('.nav-category.active');
        if (activeTab) {
          activeCategory = activeTab.id.replace('nav-', '');
        }
        
        // Vérifier si NavigationModule est disponible
        if (window.NavigationModule?.resetToDefaultView) {
          window.NavigationModule.resetToDefaultView(activeCategory);
        } else {
          console.warn('NavigationModule.resetToDefaultView non disponible');
        }
        
        return false;
      }
      
      // Gestion du clic sur le conteneur du logo
      const logoContainer = document.querySelector('#left-nav .logo');
      
      if (logoContainer) {
        logoContainer.addEventListener('click', handleLogoClick, false); // Changé à false pour la phase de bouillonnement
        
        // Gestion spécifique du clic sur l'image du logo
        const logoImg = logoContainer.querySelector('img');
        
        if (logoImg) {
          logoImg.style.pointerEvents = 'none';
          logoImg.setAttribute('draggable', 'false');
        }
      }
      // Ancien gestionnaire d'onglets supprimé (plus d'onglets Urbanisme)

      // 6️⃣ Injection finale des configs
      window.dataConfig = window.dataConfig || {};
      window.dataConfig.metroColors = metroColors;
      // mobilityData est déjà sur window

      // Fonction pour obtenir la catégorie à partir du nom de la couche
      function getCategoryFromLayer(layerName) {
        const ln = String(layerName || '');
        if (ln.includes('voielyonnaise')) return 'velo';
        if (ln.includes('reseauProjete') || ln.includes('metro') || ln.includes('tramway')) return 'transport';
        if (ln.includes('urbanisme')) return 'urbanisme';
        return 'autre';
      }

      // Exposition de NavigationModule et ajout du gestionnaire de clic (robuste aux features incomplètes)
      window.handleFeatureClick = function(feature, layerName) {
        try {
          console.log('Feature cliquée:', feature, 'Layer:', layerName);
          const p = (feature && feature.properties) || {};
          const projectName = p.name || p.Name || p.LIBELLE;
          
          if (!projectName) {
            console.warn('handleFeatureClick: nom de projet introuvable', { feature });
            return;
          }

          const category = getCategoryFromLayer(layerName);
          console.log('Ouverture du projet:', { projectName, category });
          
          // Préférer UIModule pour gérer l'historique et l'UI
          if (window.UIModule?.showDetailPanel) {
            window.UIModule.showDetailPanel(layerName, feature);
          } 
          // Sinon, fallback sur NavigationModule
          else if (typeof NavigationModule !== 'undefined' && NavigationModule.showProjectDetail) {
            NavigationModule.showProjectDetail(projectName, category);
          } else if (window.NavigationModule?.showProjectDetail) {
            window.NavigationModule.showProjectDetail(projectName, category);
          }
          // Sinon, essayer de trouver le panneau de détail et de le remplir manuellement
          else {
            console.warn('NavigationModule non disponible, tentative de chargement manuel');
            const detailPanel = document.getElementById('project-detail');
            const detailContent = document.getElementById('detail-content');
            
            if (detailPanel && detailContent) {
              // Afficher le panneau
              detailPanel.style.display = 'block';
              detailPanel.dataset.category = category;
              
              // Récupérer les détails du projet
              detailContent.innerHTML = `# ${projectName}\n\nAucun détail disponible pour ce projet.`;
            } else {
              console.error('Impossible de trouver le panneau de détail');
            }
          }
        } catch (e) {
          console.error('handleFeatureClick: erreur inattendue', e);
        }
      };
      
      // Exposer la fonction pour qu'elle soit disponible globalement
      window.getCategoryFromLayer = getCategoryFromLayer;

      // --- Navigation via paramètres d'URL (cat, project) ---
      function parseUrlState() {
        try {
          const sp = new URLSearchParams(location.search);
          const rawCat = String(sp.get('cat') || '').toLowerCase().trim();
          const project = String(sp.get('project') || '').trim();
          if (!rawCat || !project) return null;
          const cat = rawCat === 'mobilite' ? 'transport' : rawCat;
          return { cat, project };
        } catch (_) { return null; }
      }

      function resolveSearchLayersByCategory(cat) {
        switch (cat) {
          case 'velo': return ['voielyonnaise'];
          case 'urbanisme': return ['urbanisme'];
          case 'transport': return ['reseauProjeteSitePropre', 'tramway', 'metroFuniculaire'];
          case 'travaux': return ['travaux'];
          default: return [];
        }
      }

      async function showFromUrlState({ cat, project }) {
        if (!cat || !project) return false;
        const layers = resolveSearchLayersByCategory(cat);
        if (!layers.length) return false;
        for (const ln of layers) {
          try {
            const feat = await DataModule.findFeatureByProjectName(ln, project);
            if (feat) {
              if (window.UIModule?.showDetailPanel) {
                window.UIModule.showDetailPanel(ln, feat, { updateHistory: false });
              } else if (window.NavigationModule?.showProjectDetail) {
                const props = feat.properties || {};
                const name = props.project_name || props.name || props.Name || props.line || props.LIBELLE;
                window.NavigationModule.showProjectDetail(name, cat, null, props);
              }
              return true;
            }
          } catch (_) {}
        }
        console.warn('Aucune feature trouvée pour', { cat, project });
        return false;
      }

      // Traiter l'état initial de l'URL si présent
      try {
        const initial = parseUrlState();
        if (initial) {
          await showFromUrlState(initial);
        }
      } catch (_) { /* noop */ }

      // Gérer la navigation arrière/avant du navigateur
      window.addEventListener('popstate', async (e) => {
        try {
          // Accepter cat+project ainsi que cat seul
          let state = e && e.state ? e.state : null;
          if (!state) {
            try {
              const sp = new URLSearchParams(location.search);
              const rawCat = String(sp.get('cat') || '').toLowerCase().trim();
              const project = String(sp.get('project') || '').trim();
              if (rawCat) {
                const cat = rawCat === 'mobilite' ? 'transport' : rawCat;
                state = { cat, project: project || null };
              }
            } catch (_) { /* noop */ }
          }

          if (state && state.cat && state.project) {
            await showFromUrlState({ cat: state.cat, project: state.project });
          } else if (state && state.cat && !state.project) {
            // Catégorie seule: réinitialiser la vue sur la catégorie sans pousser d'historique
            if (window.NavigationModule?.resetToDefaultView) {
              window.NavigationModule.resetToDefaultView(state.cat, { preserveMapView: true, updateHistory: false });
            }
          } else if (window.NavigationModule?.resetToDefaultView) {
            // Vue par défaut (sans cat ni project), sans pousser d'historique
            window.NavigationModule.resetToDefaultView(undefined, { preserveMapView: true, updateHistory: false });
          }
        } catch (_) { /* noop */ }
      });
    }
    catch (err) {
      console.error('Erreur initApp :', err);
    }
  }

  /**
   * Met à jour l'UI des filtres selon l'état des layers
   */
  function updateFilterUI() {
    document.querySelectorAll('.filter-item').forEach(item => {
      const layerName = item.dataset.layer;
      const active    = !!(window.MapModule?.layers?.[layerName]);
      item.classList.toggle('active-filter', active);
    });
  }

  /**
   * Génère dynamiquement le DOM des filtres
   */
  function populateFilters() {
    const container = document.getElementById('dynamic-filters');
    if (!container || !win.filtersConfig) return;
    container.innerHTML = '';

    win.filtersConfig.forEach(group => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'filter-group';

      const title = document.createElement('h4');
      title.textContent = group.category;
      groupDiv.appendChild(title);

      group.items.forEach(item => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        filterItem.dataset.layer = item.layer;
        filterItem.innerHTML = `
          <span class="filter-icon"><i class="${item.icon}"></i></span>
          <span class="filter-label">${item.label}</span>
          <button class="settings-btn" data-layer="${item.layer}"><i class="fas fa-gear"></i></button>
        `;
        groupDiv.appendChild(filterItem);

        const tags = document.createElement('div');
        tags.className = 'active-filter-tags';
        tags.dataset.layer = item.layer;
        groupDiv.appendChild(tags);

        const sub = document.createElement('div');
        sub.className = 'subfilters-container';
        sub.dataset.layer = item.layer;
        groupDiv.appendChild(sub);
      });

      container.appendChild(groupDiv);
    });
  }

  /**
   * Met à jour le compteur de filtres actifs
   */
  function updateFilterCount() {
    const countEl = document.querySelector('.filter-count');
    if (countEl) {
      const activeCount = document.querySelectorAll('.filter-item.active-filter').length;
      countEl.textContent = activeCount;
    }
  }

  // Configuration des fonds de carte par défaut
  if (!win.basemaps || win.basemaps.length === 0) {
    win.basemaps = [
      {
        label: 'OSM',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        default: true,
        theme: 'light'
      },
      {
        label: 'Positron',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB',
        theme: 'light'
      },
      {
        label: 'Dark Matter',
        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
        attribution: '© CartoDB',
        theme: 'dark'
      }
    ];
  }

  // Attendre que le DOM soit chargé avant d'initialiser l'application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    // Le DOM est déjà chargé
    initApp();
  }
})(window);