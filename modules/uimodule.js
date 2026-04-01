// modules/UIModule.js
// Module de gestion de l'interface utilisateur : filtres et basemap rendering
// Note: Popup open/close is handled by ToggleManager (unified toggle dock system)
(function(window, document) {

  // DOM element references (set during init)
  let basemapMenuEl = null;

  const initElements = () => {
    basemapMenuEl = document.getElementById('basemap-menu');
    return !!basemapMenuEl;
  };

  // Wire the filters close button to close through ToggleManager
  const initFiltersCloseBtn = () => {
    const container = document.getElementById('filters-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('#filters-close-btn');
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          window.toggleManager?.setState('filters', false);
        }
      });
    }
  };

  // Initialisation du module
  const init = (options = {}) => {
    if (!initElements()) {
      console.warn('[UIModule] Impossible d\'initialiser les éléments DOM');
      return false;
    }

    initFiltersCloseBtn();

    if (options.basemaps) {
      initBasemapMenu(options.basemaps);
    }

    // Stop propagation inside panels (so ToggleManager's outside-click doesn't close them)
    document.getElementById('filters-container')?.addEventListener('click', (e) => e.stopPropagation());
    basemapMenuEl?.addEventListener('click', (e) => e.stopPropagation());

    return true;
  };
  
  // Fonction pour mettre à jour les fonds de carte après le chargement initial
  const updateBasemaps = (basemaps) => {
    if (!basemaps || !Array.isArray(basemaps) || basemaps.length === 0) {
      return false;
    }
    window.basemaps = basemaps;
    return true;
  };
  
  // Initialisation du menu des fonds de carte
  const initBasemapMenu = (basemaps = null) => {
    const menu = basemapMenuEl;
    if (!menu) return false;
    
    menu.innerHTML = '';
    
    // Utiliser les basemaps fournis en paramètre ou ceux de window
    const availableBasemaps = basemaps || window.basemaps;
    
    // Vérification de l'existence des basemaps
    if (!availableBasemaps || !Array.isArray(availableBasemaps) || availableBasemaps.length === 0) {
      return false;
    }
    
    // Header
    const header = document.createElement('div');
    header.className = 'dock-panel__header';
    header.innerHTML = `
      <span class="dock-panel__title">Fond de carte</span>
      <button class="dock-panel__close" aria-label="Fermer le menu des fonds de carte"><i class="fas fa-times"></i></button>
    `;
    header.querySelector('.dock-panel__close').addEventListener('click', (e) => {
      e.stopPropagation();
      window.toggleManager?.setState('basemap', false);
    });
    menu.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'dock-panel__body';
    menu.appendChild(body);
    
    // Sélectionner le basemap par défaut:
    // 1. window._cityPreferredBasemap (depuis city_branding.default_basemap)
    // 2. Basemap avec default: true
    // 3. Premier basemap de la liste
    let defaultBm = null;
    const cityPreferred = window._cityPreferredBasemap;
    if (cityPreferred) {
      defaultBm = availableBasemaps.find(b => b.name === cityPreferred);
    }
    if (!defaultBm) {
      defaultBm = availableBasemaps.find(b => b.is_default) || availableBasemaps[0];
    }
    
    let previewLayer = null;
    let currentActiveBasemap = defaultBm;
    
    // Fonction pour obtenir le basemap actuellement actif
    const getActiveBasemap = () => {
      const activeTile = body.querySelector('.dock-panel__item.is-active');
      if (!activeTile) return currentActiveBasemap;
      
      const activeLabel = activeTile.querySelector('.dock-panel__item-label')?.textContent.trim();
      const activeMap = availableBasemaps.find(b => b.label === activeLabel);
      return activeMap || currentActiveBasemap;
    };
    
    availableBasemaps.forEach(bm => {
      const tile = document.createElement('div');
      tile.className = 'dock-panel__item';
      tile.innerHTML = `
        <span class="dock-panel__item-icon"><i class="fas fa-layer-group"></i></span>
        <span class="dock-panel__item-label">${bm.label}</span>
      `;
      if (bm.label === defaultBm.label) tile.classList.add('is-active');

      let hoverTimer = null;
      let isPreviewActive = false;

      // Survol : démarre le timer pour preview
      tile.addEventListener('mouseenter', () => {
        if (tile.classList.contains('is-active')) return;
        
        hoverTimer = setTimeout(() => {
          previewLayer = L.createBasemapLayer(bm);
          window.MapModule?.setBaseLayer(previewLayer);
          isPreviewActive = true;
        }, 1000);
      });

      // Quitter le survol : annule et restaure
      tile.addEventListener('mouseleave', () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        
        if (isPreviewActive) {
          const activeBasemap = getActiveBasemap();
          const activeLayer = L.createBasemapLayer(activeBasemap);
          window.MapModule?.setBaseLayer(activeLayer);
          isPreviewActive = false;
        }
      });

      // Clic : applique définitivement le fond
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        
        const layer = L.createBasemapLayer(bm);
        window.MapModule?.setBaseLayer(layer);
        currentActiveBasemap = bm;
        
        body.querySelectorAll('.dock-panel__item')
          .forEach(t => t.classList.remove('is-active'));
        tile.classList.add('is-active');
        isPreviewActive = false;
        
        setTimeout(() => window.toggleManager?.setState('basemap', false), 300);
      });

      body.appendChild(tile);
    });
  };

  /**
   * Affiche le panneau de détail pour une feature
   * @param {string} layerName - Nom de la couche
   * @param {Object} feature - Feature sélectionnée
   * @param {{ updateHistory?: boolean }} [options]
   */
  const showDetailPanel = (layerName, feature, options = {}) => {
    console.log('[UIModule] 📋 showDetailPanel called:', { layerName, featureName: feature?.properties?.project_name, options });
    
    const { updateHistory = true } = options;
    // Utilitaire local de slugification (harmonisé avec les autres modules)
    const slugify = (str) => String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    
    // Vérifier si NavigationModule est disponible
    if (window.NavigationModule?.showProjectDetail) {
      const props = feature.properties || {};
      
      // Utiliser project_name en priorité (injecté par fetchLayerData depuis contribution_uploads)
      let projectName = props.project_name || props.name || props.Name || props.line || props.LIBELLE;
      let category = props.category; // Catégorie directement depuis contribution_uploads
      
      // Fallback sur la détection par layerName si pas de catégorie
      if (!category) {
        if (layerName.includes('velo')) category = 'velo';
        else if (layerName.includes('mobilite') || layerName.includes('metro') || layerName.includes('tramway')) category = 'mobilite';
        else if (layerName.includes('urbanisme')) category = 'urbanisme';
        else category = 'autre';
      }
      
      console.log('[UIModule] 📝 Extracted:', { projectName, category });
      
      if (projectName) {
        // GUARD: Éviter la boucle infinie history.pushState → popstate → showDetailPanel
        const currentParams = new URLSearchParams(location.search);
        const currentProject = currentParams.get('project');
        const projSlug = slugify(projectName);
        
        // Ne mettre à jour l'URL QUE si elle a changé
        const shouldUpdateUrl = updateHistory && currentProject !== projSlug;
        
        console.log('[UIModule] 🔗 URL update check:', { 
          currentProject, 
          projSlug, 
          shouldUpdateUrl,
          updateHistory 
        });
        
        if (shouldUpdateUrl) {
          try {
            // CRITICAL: Activer le flag pour bloquer popstate pendant la navigation manuelle
            if (window._setManualNavigation) {
              window._setManualNavigation(true);
            }
            
            const catForUrl = category || (layerName.includes('velo') ? 'velo'
              : (layerName.includes('urbanisme') ? 'urbanisme'
              : ((layerName.includes('mobilite') || layerName.includes('metro') || layerName.includes('tramway')) ? 'mobilite' : 'autre')));
            const params = new URLSearchParams();
            params.set('cat', catForUrl);
            params.set('project', projSlug);
            const newUrl = `${location.pathname}?${params.toString()}`;
            console.log('[UIModule] 🔗 Pushing URL:', newUrl);
            history.pushState({ cat: catForUrl, project: projSlug }, '', newUrl);
            
            // Désactiver le flag après un court délai (pour laisser popstate se déclencher si besoin)
            setTimeout(() => {
              if (window._setManualNavigation) {
                window._setManualNavigation(false);
              }
            }, 100);
          } catch(err) {
            console.error('[UIModule] ❌ Error pushing URL:', err);
            // Toujours désactiver le flag en cas d'erreur
            if (window._setManualNavigation) {
              window._setManualNavigation(false);
            }
          }
        } else {
          console.log('[UIModule] ⏭️ Skip URL update - already current');
        }
        
        // Appeler showProjectDetail APRÈS la mise à jour de l'URL pour éviter la boucle
        console.log('[UIModule] 📞 Calling NavigationModule.showProjectDetail');
        window.NavigationModule.showProjectDetail(projectName, category, null, props);
      } else {
        console.warn('[UIModule] ⚠️ No project name found');
      }
    } else {
      console.warn('[UIModule] ⚠️ NavigationModule.showProjectDetail not available');
    }
  };

  // Met à jour le style du bouton de basemap actif
  const setActiveBasemap = (basemapLabel) => {
    const menu = document.getElementById('basemap-menu');
    if (!menu) return;
    menu.querySelectorAll('.dock-panel__item').forEach(tile => {
      const label = tile.querySelector('.dock-panel__item-label')?.textContent.trim();
      tile.classList.toggle('is-active', label === basemapLabel);
    });
  };

  // Exposition de l'API
  const UIModule = {
    setActiveBasemap,
    showDetailPanel,
    init,
    initBasemapMenu,
    updateBasemaps
  };

  // L'initialisation est maintenant gérée par main.js après le chargement du DOM
  // init() sera appelé explicitement quand tous les éléments sont prêts

  // Publication globale
  window.UIModule = UIModule;
})(window, document);