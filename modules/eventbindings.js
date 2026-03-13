// modules/EventBindings.js
const EventBindings = (() => {

  // Navigation generation counter — guards against stale async loads
  let _navGeneration = 0;

  const handleNavigation = async (menu, layersToDisplay) => {
    const thisGen = ++_navGeneration;
    console.log(`[EventBindings] handleNavigation: "${menu}" gen=${thisGen}`);
    
    // Validation du menu
    if (!menu) {
      console.error('[EventBindings] ❌ handleNavigation appelé avec menu invalide:', menu);
      return;
    }
  
  // 0. Toggle "active" on the clicked nav button
  document.querySelectorAll('.nav-category').forEach(tab => tab.classList.remove('active'));
  const navButton = document.getElementById(`nav-${menu}`);
  if (navButton) {
    navButton.classList.add('active');
  }
    // Masquer complètement le panneau de détail du projet
    const projectDetailPanel = document.getElementById('project-detail');
    if (projectDetailPanel) {
      projectDetailPanel.classList.remove('visible');
      projectDetailPanel.style.display = 'none';
    }
    
    // Réinitialiser le guard de showProjectDetail pour permettre réouverture
    if (window.NavigationModule?._resetProjectGuard) {
      window.NavigationModule._resetProjectGuard();
    }
    
    // Réinitialiser les filtres
    document.querySelectorAll('.filter-item').forEach(item => {
      item.classList.remove('active-filter');
      const layer = item.dataset.layer;
      UIModule.resetLayerFilter(layer);
    });
    FilterModule.resetAll();

    // Ajouter la classe pour indiquer qu'un panneau est ouvert (gestion border-radius)
    const leftNav = document.getElementById('left-nav');
    if (leftNav) {
      leftNav.classList.add('has-panel-open');
    }

    // Gestion des couches à afficher
    if (Array.isArray(layersToDisplay)) {
      // 1. Remove ALL layers unconditionally — guarantees clean state
      const currentLayers = Object.keys(MapModule.layers);
      currentLayers.forEach(layerName => {
        MapModule.removeLayer(layerName);
      });
      
      // 2. Load desired layers (from cache when possible, otherwise fetch)
      for (const layerName of layersToDisplay) {
        // Guard: abort if a newer navigation happened while we were loading
        if (_navGeneration !== thisGen) {
          console.log(`[EventBindings] ⏭️ Stale navigation gen=${thisGen}, current=${_navGeneration}`);
          return;
        }
        try {
          if (DataModule.layerData?.[layerName]) {
            // Data already cached — recreate the layer from cache (fast, no fetch)
            DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
          } else {
            await DataModule.loadLayer?.(layerName);
          }
          // Guard again after async load
          if (_navGeneration !== thisGen) {
            console.log(`[EventBindings] ⏭️ Stale navigation after load gen=${thisGen}`);
            return;
          }
        } catch (e) {
          console.error(`[EventBindings] Erreur chargement layer ${layerName}:`, e);
        }
      }
    }

    // Rendu unifié via SubmenuManager (gère automatiquement Travaux vs Projets)
    if (window.SubmenuManager?.renderSubmenu) {
      await window.SubmenuManager.renderSubmenu(menu);
    } else {
      console.error(`[EventBindings] SubmenuManager non disponible pour ${menu}`);
    }
    
    console.log(`[EventBindings] ✅ handleNavigation TERMINÉ`);
    console.log(`[EventBindings] MapModule.layers après:`, Object.keys(window.MapModule?.layers || {}));
    console.log(`[EventBindings] ========== handleNavigation END ==========`);
  };

  // Gestion des contrôles de filtres
const bindFilterControls = () => {
  // Clic sur un filtre : active/désactive la couche
  document.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', e => {
      // Sanitiser le nom du layer pour éviter les erreurs de sélecteur CSS
      const layer = (item.dataset.layer || '').trim().replace(/[\n\r]/g, '');
      if (!layer) return;

      if (!item.classList.contains('active-filter')) {
        // Activation
        if (DataModule.layerData?.[layer]) {
          DataModule.createGeoJsonLayer(layer, DataModule.layerData[layer]);
        } else {
          DataModule.loadLayer(layer);
        }
        item.classList.add('active-filter');
      } else {
        // Désactivation
        item.classList.remove('active-filter');
        MapModule.removeLayer(layer);
        UIModule.resetLayerFilter(layer);
      }
    });
  });
};

  // Gestion dynamique des boutons de navigation basée sur categoryIcons
  function bindCategoryNavigation() {
    const categoryIcons = window.categoryIcons || [];
    
    if (categoryIcons.length === 0) {
      console.warn('[EventBindings] bindCategoryNavigation: aucune catégorie disponible');
      return;
    }
    
    console.log('[EventBindings] bindCategoryNavigation - Catégories:', categoryIcons.map(c => c.category));
    
    categoryIcons.forEach(({ category }) => {
      // Ignorer le bouton "Contribuer" qui a son propre gestionnaire dans contrib.js
      if (category === 'contribute') {
        return;
      }
      
      const navButton = document.getElementById(`nav-${category}`);
      if (!navButton) {
        console.warn(`[EventBindings] Bouton de navigation introuvable pour: ${category}`);
        return;
      }
      
      navButton.addEventListener('click', () => {
        // IMPORTANT: Toujours accéder à window.categoryLayersMap au moment du clic
        // car il peut être mis à jour après le bind initial
        const currentCategoryLayersMap = window.categoryLayersMap || {};
        const categoryLayers = currentCategoryLayersMap[category];
        
        console.log(`[EventBindings] 🔍 Clic sur catégorie "${category}"`);
        console.log(`[EventBindings]  Layers pour cette catégorie:`, categoryLayers);
        
        if (!categoryLayers || categoryLayers.length === 0) {
          console.log(`[EventBindings] 🔄 Fallback: utilisation de ["${category}"] comme layer`);
          EventBindings.handleNavigation(category, [category]);
        } else {
          EventBindings.handleNavigation(category, categoryLayers);
        }
        // Le show/hide des submenus est géré par SubmenuManager.renderSubmenu() dans handleNavigation
      });
    });
  }
  
  // Exposer la fonction pour permettre un appel explicite depuis main.js
  const initCategoryNavigation = () => {
    bindCategoryNavigation();
  };

  /**
   * Gère le clic sur le logo pour refresh la page
   */
  const handleLogoClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Simple refresh de la page
    window.location.reload();
    
    return false;
  };

  /**
   * Gère le clic sur une feature de la carte
   */
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
          
          const safeProjectName = win.SecurityUtils ? win.SecurityUtils.escapeHtml(projectName) : projectName;
          detailContent.innerHTML = `# ${safeProjectName}\n\nAucun détail disponible pour ce projet.`;
        }
      }
    } catch (e) {
      console.warn('[EventBindings] handleFeatureClick error:', e);
    }
  };

  /**
   * Initialise les event listeners du logo
   */
  const bindLogoClick = () => {
    const logoContainer = document.querySelector('#left-nav .logo');
    
    if (logoContainer) {
      logoContainer.addEventListener('click', handleLogoClick, false);
    }
  };

  return {
    bindFilterControls,
    handleNavigation,
    handleLogoClick,
    handleFeatureClick,
    bindLogoClick,
    initCategoryNavigation
  };
})();

// Exposer le module au scope global pour être accessible dans main.js
window.EventBindings = EventBindings;
