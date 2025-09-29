// modules/EventBindings.js
const EventBindings = (() => {

  const handleNavigation = async (menu, layersToDisplay) => {
  // 0. Toggle “active” on the clicked nav button
  document.querySelectorAll('.nav-category').forEach(tab => tab.classList.remove('active'));
  document.getElementById(`nav-${menu}`).classList.add('active');
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
      // Retirer les couches non désirées
      Object.keys(MapModule.layers).forEach(layerName => {
        if (!layersToDisplay.includes(layerName)) {
          MapModule.removeLayer(layerName);
        }
      });
      // Charger les couches désirées
      layersToDisplay.forEach(layerName => {
        if (!MapModule.layers[layerName]) {
          if (DataModule.layerData && DataModule.layerData[layerName]) {
            DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
          }
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
  // 5. Clic en-dehors → fermer tous les sous-panneaux
  document.addEventListener('click', e => {
    if (!e.target.closest('.filter-item') && !e.target.closest('.subfilters-container')) {
      document.querySelectorAll('.subfilters-container').forEach(sub => sub.style.display = 'none');
    }
  });

  // 1. Réinitialisation globale
  const resetBtn = document.getElementById('reset-all-filters');
  resetBtn.addEventListener('click', () => {
    document.querySelectorAll('.filter-item').forEach(item => {
      const layer = item.dataset.layer;
      item.classList.remove('active-filter');
      UIModule.resetLayerFilter(layer);
      const sub = document.querySelector(`.subfilters-container[data-layer="${layer}"]`);
      if (sub) sub.style.display = 'none';
    });
    FilterModule.resetAll();
  });

  // 2. Clic sur un filtre (pas le ⚙️) : active/désactive sans ouvrir le panneau
  document.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.settings-btn')) return;
      const layer = item.dataset.layer;
      const sub = document.querySelector(`.subfilters-container[data-layer="${layer}"]`);

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
        if (sub) sub.style.display = 'none';
      }
    });
  });

  // 3. Clic sur ⚙️ : active si besoin, puis bascule le panneau
  /* document.querySelectorAll('.settings-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const layer = btn.dataset.layer;
      const item  = document.querySelector(`.filter-item[data-layer="${layer}"]`);
      const sub   = document.querySelector(`.subfilters-container[data-layer="${layer}"]`);

      // Si déjà ouvert, fermer simplement
      if (sub && !(sub.style.display === 'none' || getComputedStyle(sub).display === 'none')) {
        sub.style.display = 'none';
        return;
      }

      // Assurer l'activation de la couche si nécessaire
      if (!item.classList.contains('active-filter')) {
        if (DataModule.layerData?.[layer]) {
          DataModule.createGeoJsonLayer(layer, DataModule.layerData[layer]);
        } else {
          DataModule.loadLayer(layer);
        }
        item.classList.add('active-filter');
      }

      // Construire et afficher les sous-filtres
      if (window.UIModule?.buildSubFilters) {
        window.UIModule.buildSubFilters(layer);
      } else if (sub) {
        sub.style.display = 'block';
      }
    });
  }); */
};

  // Gestion dynamique des boutons de navigation basée sur categoryIcons
  function bindCategoryNavigation() {
    const categoryIcons = window.categoryIcons || [];
    const categoryLayersMap = window.categoryLayersMap || {};
    
    categoryIcons.forEach(({ category }) => {
      const navButton = document.getElementById(`nav-${category}`);
      if (!navButton) return;
      
      navButton.addEventListener('click', () => {
        // Récupérer les couches associées à cette catégorie
        const categoryLayers = categoryLayersMap[category] || [category];
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
  
  // Appeler la fonction de binding après un court délai pour s'assurer que les éléments sont créés
  setTimeout(bindCategoryNavigation, 100);

  /**
   * Gère le clic sur le logo pour réinitialiser la vue
   */
  const handleLogoClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    let activeCategory = null;
    const activeTab = document.querySelector('.nav-category.active');
    if (activeTab) {
      activeCategory = activeTab.id.replace('nav-', '');
    }
    
    if (window.NavigationModule?.resetToDefaultView) {
      window.NavigationModule.resetToDefaultView(activeCategory);
    }
    
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
          
          detailContent.innerHTML = `# ${projectName}\n\nAucun détail disponible pour ce projet.`;
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
      
      const logoImg = logoContainer.querySelector('img');
      if (logoImg) {
        logoImg.style.pointerEvents = 'none';
      }
    }
  };

  return {
    bindFilterControls,
    handleNavigation,
    handleLogoClick,
    handleFeatureClick,
    bindLogoClick
  };
})();

// Exposer le module au scope global pour être accessible dans main.js
window.EventBindings = EventBindings;
