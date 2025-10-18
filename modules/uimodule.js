// modules/UIModule.js
// Module de gestion de l'interface utilisateur : filtres et popups
(function(window, document, DataModule, FilterModule, MapModule) {
  // État global des popups
  const popupState = {
    filter: { isOpen: false, element: null },
    basemap: { isOpen: false, element: null }
  };

  // Initialisation des éléments du DOM
  let filterToggle, basemapToggle, filtersCloseBtn;

  const initElements = () => {
    popupState.filter.element = document.getElementById('filters-container');
    popupState.basemap.element = document.getElementById('basemap-menu');
    filterToggle = document.getElementById('filters-toggle');
    basemapToggle = document.getElementById('basemap-toggle');

    if (!popupState.filter.element || !popupState.basemap.element || !filterToggle || !basemapToggle) {
      return false;
    }
    
    return true;
  };
  
  // Initialiser le bouton fermer
  const initFiltersCloseBtn = () => {
    // Utiliser le container parent qui est toujours dans le DOM
    const container = document.getElementById('filters-container');
    if (container) {
      container.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('#filters-close-btn');
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[UIModule] Close button clicked');
          // Simuler un clic sur le toggle pour fermer
          const filtersToggle = document.getElementById('filters-toggle');
          if (filtersToggle) {
            filtersToggle.click();
          }
        }
      });
    }
  };

  // Ferme tous les popups sauf celui spécifié
  const closeOtherPopups = (currentPopup) => {
    Object.entries(popupState).forEach(([key, popup]) => {
      if (key !== currentPopup && popup.element) {
        popup.isOpen = false;
        if (key === 'filter') {
          popup.element.style.display = 'none';
        } else {
          popup.element.classList.remove('open');
        }
      }
    });
  };

  // Gestionnaire de clic en dehors des popups
  const handleClickOutside = (event) => {
    const isClickInsideFilter = popupState.filter.element?.contains(event.target);
    const isClickOnFilterToggle = filterToggle?.contains(event.target);
    const isClickInsideBasemap = popupState.basemap.element?.contains(event.target);
    const isClickOnBasemapToggle = basemapToggle?.contains(event.target);

    if (!isClickInsideFilter && !isClickOnFilterToggle) {
      popupState.filter.isOpen = false;
      popupState.filter.element.style.display = 'none';
    }

    if (!isClickInsideBasemap && !isClickOnBasemapToggle) {
      popupState.basemap.isOpen = false;
      popupState.basemap.element.classList.remove('open');
    }
  };
  /**
   * Récupère les critères de filtre actuellement sélectionnés.
   * @param {string} layerName
   * @returns {Object} Critères de filtrage
   */
  const getCurrentCriteria = layerName => {
    const container = document.querySelector(`.filter-criteria[data-layer=\"${layerName}\"]`);
    const criteria = {};
    if (!container) return criteria;
    container.querySelectorAll('[data-field]').forEach(el => {
      const val = el.value;
      if (val !== '' && val != null) {
        criteria[el.dataset.field] = el.value;
      }
    });
    return criteria;
  };

  /**
   * Met à jour l'affichage des tags de filtres actifs pour une couche.
   * @param {string} layerName
   */
  const updateActiveFilterTagsForLayer = layerName => {
    const tagsContainer = document.querySelector(`.active-filter-tags[data-layer=\"${layerName}\"]`);
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';

    const criteria = FilterModule.get(layerName);
    Object.entries(criteria).forEach(([key, value]) => {
      const tag = document.createElement('span');
      tag.className = 'active-filter-tag';
      
      // Afficher 'Exclure les réseaux' pour le filtre _hideReseaux
      const displayText = key === '_hideReseaux' ? 'Exclure les réseaux' : value;
      tag.textContent = `${displayText} `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '&times;';
      btn.style.cssText = 'margin-left:4px;border:none;background:none;cursor:pointer;';
      btn.addEventListener('click', () => {
        delete criteria[key];
        FilterModule.set(layerName, criteria);
        DataModule.loadLayer(layerName).then(() => {
          updateActiveFilterTagsForLayer(layerName);
        });
      });

      tag.appendChild(btn);
      tagsContainer.appendChild(tag);
    });
  };

  /**
   * Applique les critères de filtre et recharge la couche.
   */
  const applyFilter = (layerName, criteria) => {
    FilterModule.set(layerName, criteria);
    MapModule.removeLayer(layerName);
    DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
    updateActiveFilterTagsForLayer(layerName);
  };

  /**
   * Réinitialise le filtre d'une couche et recharge la carte.
   */
  const resetLayerFilter = layerName => {
    FilterModule.reset(layerName);
    MapModule.removeLayer(layerName);
    updateActiveFilterTagsForLayer(layerName);
  };

  /**
   * Réinitialise le filtre sans retirer la couche de la carte.
   */
  const resetLayerFilterWithoutRemoving = layerName => {
    FilterModule.reset(layerName);
    updateActiveFilterTagsForLayer(layerName);
  };

  /**
   * Affiche ou masque les popups (filtres ou basemap).
   * @param {'filter'|'basemap'} popupType
   */
  const togglePopup = (popupType) => {
    if (!popupState[popupType] || !popupState[popupType].element) {
      return;
    }

    // Basculer l'état d'ouverture
    popupState[popupType].isOpen = !popupState[popupType].isOpen;
    const target = popupState[popupType];

    // Fermer les autres popups
    closeOtherPopups(popupType);

    // Mettre à jour l'affichage
    if (popupType === 'filter') {
      if (target.isOpen) {
        target.element.style.display = 'block';
        const rect = filterToggle.getBoundingClientRect();
        target.element.style.top = `${rect.bottom + 10}px`;
        target.element.style.right = `${window.innerWidth - rect.right}px`;
      } else {
        target.element.style.display = 'none';
      }
    } else { // basemap
      target.element.classList.toggle('open', target.isOpen);
    }
  };

  // Initialisation du module
  const init = (options = {}) => {
    // Toujours réinitialiser les éléments (au cas où le DOM a changé)
    if (!initElements()) {
      console.warn('[UIModule] Impossible d\'initialiser les éléments DOM');
      return false;
    }
    
    // Initialiser le bouton fermer
    initFiltersCloseBtn();
    
    // Initialisation du menu basemap si les fonds sont disponibles
    if (options.basemaps) {
      initBasemapMenu(options.basemaps);
    }
    
    // Ajout du gestionnaire de clic en dehors des popups (une seule fois)
    if (!init._clickHandlerBound) {
      document.addEventListener('click', handleClickOutside);
      init._clickHandlerBound = true;
    }
    
    // Empêcher la propagation des clics à l'intérieur des popups
    popupState.filter.element?.addEventListener('click', (e) => e.stopPropagation());
    popupState.basemap.element?.addEventListener('click', (e) => e.stopPropagation());
    
    return true;
  };
  
  // Fonction pour mettre à jour les fonds de carte après le chargement initial
  const updateBasemaps = (basemaps) => {
    if (!basemaps || !Array.isArray(basemaps) || basemaps.length === 0) {
      return false;
    }
    window.basemaps = basemaps;
    initBasemapMenu(basemaps);
    return true;
  };
  
  // Initialisation du menu des fonds de carte
  const initBasemapMenu = (basemaps = null) => {
    const menu = popupState.basemap.element;
    if (!menu) return false;
    
    menu.innerHTML = '';
    
    // Utiliser les basemaps fournis en paramètre ou ceux de window
    const availableBasemaps = basemaps || window.basemaps;
    
    // Vérification de l'existence des basemaps
    if (!availableBasemaps || !Array.isArray(availableBasemaps) || availableBasemaps.length === 0) {
      return false;
    }
    
    // Ajouter le bouton fermer
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-secondary basemap-close-btn';
    closeBtn.setAttribute('aria-label', 'Fermer le menu des fonds de carte');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopup('basemap');
    });
    menu.appendChild(closeBtn);
    
    const defaultBm = availableBasemaps.find(b => b.default) || availableBasemaps[0];
    
    let previewLayer = null;
    let currentActiveBasemap = defaultBm;
    
    // Fonction pour obtenir le basemap actuellement actif
    const getActiveBasemap = () => {
      const activeTile = menu.querySelector('.basemap-tile.active-basemap');
      if (!activeTile) return currentActiveBasemap;
      
      const activeLabel = activeTile.textContent.trim();
      const activeMap = availableBasemaps.find(b => b.label === activeLabel);
      return activeMap || currentActiveBasemap;
    };
    
    availableBasemaps.forEach(bm => {
      const tile = document.createElement('div');
      tile.className = 'basemap-tile';
      tile.textContent = bm.label;
      if (bm.label === defaultBm.label) tile.classList.add('active-basemap');

      // Créer la barre de progression
      const progressBar = document.createElement('div');
      progressBar.className = 'basemap-progress';
      tile.appendChild(progressBar);

      let hoverTimer = null;
      let isPreviewActive = false;

      // Survol : démarre le timer de 2s pour preview
      tile.addEventListener('mouseenter', () => {
        // Ne rien faire si déjà actif
        if (tile.classList.contains('active-basemap')) return;
        
        // Retirer d'abord la classe
        tile.classList.remove('is-hovering');
        
        // Reset complet de la progress bar avec !important dans le style inline
        progressBar.style.cssText = 'width: 0 !important; transition: none !important;';
        
        // Force reflow (IMPORTANT pour redémarrer l'animation)
        void tile.offsetHeight;
        void progressBar.offsetHeight;
        
        // Ajouter la classe dans le prochain frame
        requestAnimationFrame(() => {
          tile.classList.add('is-hovering');
          // Forcer le démarrage de la transition
          progressBar.style.cssText = '';
        });
        
        // Timer de 1 seconde pour PREVIEW
        hoverTimer = setTimeout(() => {
          // PREVIEW du fond de carte (pas définitif)
          previewLayer = L.tileLayer(bm.url, { attribution: bm.attribution });
          window.MapModule?.setBaseLayer(previewLayer);
          isPreviewActive = true;
          
          console.log(`Preview: ${bm.label}`);
        }, 1000);
      });

      // Quitter le survol : annule et restaure
      tile.addEventListener('mouseleave', () => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        
        tile.classList.remove('is-hovering');
        
        // Reset la progress bar avec cssText
        progressBar.style.cssText = '';
        
        // Si preview active, restaurer le basemap ACTUELLEMENT ACTIF
        if (isPreviewActive) {
          const activeBasemap = getActiveBasemap();
          const activeLayer = L.tileLayer(activeBasemap.url, { 
            attribution: activeBasemap.attribution 
          });
          window.MapModule?.setBaseLayer(activeLayer);
          isPreviewActive = false;
          console.log(`Restored: ${activeBasemap.label}`);
        }
      });

      // Clic : applique définitivement le fond
      tile.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Annuler le timer si en cours
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        
        // Appliquer le fond de carte définitivement
        const layer = L.tileLayer(bm.url, { attribution: bm.attribution });
        window.MapModule?.setBaseLayer(layer);
        currentActiveBasemap = bm;
        
        // Mise à jour de l'état visuel
        document.querySelectorAll('.basemap-tile')
          .forEach(t => {
            t.classList.remove('active-basemap', 'is-hovering');
            const pb = t.querySelector('.basemap-progress');
            if (pb) {
              pb.style.cssText = '';
            }
          });
        tile.classList.add('active-basemap');
        tile.classList.remove('is-hovering');
        isPreviewActive = false;
        
        console.log(`Applied: ${bm.label}`);
        
        // Fermer le menu après application
        setTimeout(() => togglePopup('basemap'), 300);
      });

      menu.appendChild(tile);
    });
  };

  /**
   * Affiche le panneau de détail pour une feature
   * @param {string} layerName - Nom de la couche
   * @param {Object} feature - Feature sélectionnée
   * @param {{ updateHistory?: boolean }} [options]
   */
  const showDetailPanel = (layerName, feature, options = {}) => {
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
      
      if (projectName) {
        // Passer directement les données enrichies à showProjectDetail
        window.NavigationModule.showProjectDetail(projectName, category, null, props);

        // Mettre à jour l'URL pour refléter l'état courant (sauf si désactivé)
        try {
          if (updateHistory && typeof history?.pushState === 'function') {
            const catForUrl = category || (layerName.includes('velo') ? 'velo'
              : (layerName.includes('urbanisme') ? 'urbanisme'
              : ((layerName.includes('mobilite') || layerName.includes('metro') || layerName.includes('tramway')) ? 'mobilite' : 'autre')));
            const projSlug = slugify(projectName);
            const params = new URLSearchParams();
            params.set('cat', catForUrl);
            params.set('project', projSlug);
            const newUrl = `${location.pathname}?${params.toString()}`;
            history.pushState({ cat: catForUrl, project: projSlug }, '', newUrl);
          }
        } catch(_) { /* noop */ }
      } else {
      }
    } else {
    }
  };

  // Met à jour le style du bouton de basemap actif
  const setActiveBasemap = (basemapLabel) => {
    const tiles = document.querySelectorAll('.basemap-tile');
    tiles.forEach(tile => {
      if (tile.textContent === basemapLabel) {
        tile.classList.add('active-basemap');
      } else {
        tile.classList.remove('active-basemap');
      }
    });
  };

  // Exposition de l'API
  const UIModule = {
    updateActiveFilterTagsForLayer,
    setActiveBasemap,
    showDetailPanel,
    applyFilter,
    resetLayerFilter,
    resetLayerFilterWithoutRemoving,
    togglePopup,
    init,
    initBasemapMenu, // Exposer la fonction initBasemapMenu
    updateBasemaps   // Exposer la fonction updateBasemaps
  };

  // L'initialisation est maintenant gérée par main.js après le chargement du DOM
  // init() sera appelé explicitement quand tous les éléments sont prêts

  // Publication globale
  window.UIModule = UIModule;
})(window, document, DataModule, FilterModule, MapModule);