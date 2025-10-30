// modules/EventBindings.js
const EventBindings = (() => {

  const handleNavigation = async (menu, layersToDisplay) => {
  // Validation du menu
  if (!menu) {
    console.error('[EventBindings] handleNavigation appelé avec menu invalide:', menu);
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
    
    // Réinitialiser les filtres
    document.querySelectorAll('.filter-item').forEach(item => {
      item.classList.remove('active-filter');
      const layer = item.dataset.layer;
      UIModule.resetLayerFilter(layer);
    });
    FilterModule.resetAll();

    // Réinitialiser le style de la navigation gauche
    const leftNav = document.getElementById('left-nav');
    if (leftNav) {
      if (window.innerWidth < 1024) {
    leftNav.style.borderRadius = '0 0 20px 20px';
  } else {
    leftNav.style.borderRadius = '20px 0 0 20px';
  }
    }

    // Gestion des couches à afficher
    if (Array.isArray(layersToDisplay)) {
      console.log('[EventBindings] handleNavigation - Layers à afficher:', layersToDisplay);
      
      // Retirer les couches non désirées
      Object.keys(MapModule.layers).forEach(layerName => {
        if (!layersToDisplay.includes(layerName)) {
          console.log('[EventBindings] Retrait du layer:', layerName);
          MapModule.removeLayer(layerName);
        }
      });
      
      // Charger/Afficher les couches désirées
      layersToDisplay.forEach(layerName => {
        if (!MapModule.layers[layerName]) {
          console.log('[EventBindings] Layer non présent sur la carte:', layerName);
          
          // Si les données sont déjà chargées, créer le layer
          if (DataModule.layerData && DataModule.layerData[layerName]) {
            console.log('[EventBindings] Création du layer depuis layerData:', layerName);
            DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
          } 
          // Sinon, charger les données depuis la DB
          else if (DataModule.loadLayer) {
            console.log('[EventBindings] Chargement du layer depuis DB:', layerName);
            DataModule.loadLayer(layerName);
          }
        } else {
          console.log('[EventBindings] Layer déjà présent sur la carte:', layerName);
          // Le layer est déjà sur la carte, rien à faire ✅
        }
      });
    }

    // Rendu unifié via SubmenuManager (gère automatiquement Travaux vs Projets)
    if (window.SubmenuManager?.renderSubmenu) {
      await window.SubmenuManager.renderSubmenu(menu);
    } else {
      console.error(`[EventBindings] SubmenuManager non disponible pour ${menu}`);
    }
  };

  // Gestion des contrôles de filtres
const bindFilterControls = () => {
  // Clic sur un filtre : active/désactive la couche
  document.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', e => {
      const layer = item.dataset.layer;

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
    const categoryLayersMap = window.categoryLayersMap || {};
    
    if (categoryIcons.length === 0) {
      console.warn('[EventBindings] bindCategoryNavigation: aucune catégorie disponible');
      return;
    }
    
    categoryIcons.forEach(({ category }) => {
      // Ignorer le bouton "Contribuer" qui a son propre gestionnaire dans contrib.js
      if (category === 'contribute') {
        console.log('[EventBindings] Ignore le bouton contribute (géré par contrib.js)');
        return;
      }
      
      const navButton = document.getElementById(`nav-${category}`);
      if (!navButton) {
        console.warn(`[EventBindings] Bouton de navigation introuvable pour: ${category}`);
        return;
      }
      
      navButton.addEventListener('click', () => {
        // Récupérer les couches associées à cette catégorie depuis la DB
        const categoryLayers = categoryLayersMap[category];
        
        if (!categoryLayers) {
          console.error(`[EventBindings] Aucun layer défini pour la catégorie: ${category}`);
          return;
        }
        
        console.log(`[EventBindings] Navigation vers ${category}, layers:`, categoryLayers);
        
        EventBindings.handleNavigation(category, categoryLayers);
        
        // Afficher le sous-menu de cette catégorie et masquer les autres
        document.querySelectorAll('.submenu').forEach(submenu => {
          submenu.style.display = 'none';
        });
        
        const targetSubmenu = document.querySelector(`.submenu[data-category="${category}"]`);
        if (targetSubmenu) {
          targetSubmenu.style.display = 'block';
        }
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
