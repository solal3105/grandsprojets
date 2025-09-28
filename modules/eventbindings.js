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

  // Récupération des boutons de navigation
  const navMobilite = document.getElementById('nav-mobilite');
  const navVelo = document.getElementById('nav-velo');
  const navUrbanisme = document.getElementById('nav-urbanisme');
  const navTravaux = document.getElementById('nav-travaux');

  navMobilite.addEventListener('click', () => {
    // Appeler la navigation pour Mobilité
    const mobiliteLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.mobilite)
      || ['metroFuniculaire', 'tramway', 'reseauProjeteSitePropre'];
    EventBindings.handleNavigation('mobilite', mobiliteLayers);
    // Afficher le sous-menu mobilite et masquer les autres
    document.getElementById('mobilite-submenu').style.display = 'block';
    document.getElementById('velo-submenu').style.display = 'none';
    document.getElementById('urbanisme-submenu').style.display = 'none';
    document.getElementById('travaux-submenu').style.display = 'none';
  });

  navVelo.addEventListener('click', () => {
    const veloLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.velo)
      || ['planVelo', 'voielyonnaise'];
    EventBindings.handleNavigation('velo', veloLayers);
    document.getElementById('velo-submenu').style.display = 'block';
    document.getElementById('mobilite-submenu').style.display = 'none';
    document.getElementById('urbanisme-submenu').style.display = 'none';
    document.getElementById('travaux-submenu').style.display = 'none';
  });

  navUrbanisme.addEventListener('click', () => {
    const urbLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.urbanisme)
      || ['urbanisme'];
    EventBindings.handleNavigation('urbanisme', urbLayers);
    document.getElementById('urbanisme-submenu').style.display = 'block';
    document.getElementById('mobilite-submenu').style.display = 'none';
    document.getElementById('velo-submenu').style.display = 'none';
    document.getElementById('travaux-submenu').style.display = 'none';
  });

  navTravaux.addEventListener('click', () => {
    const trvxLayers = (window.CATEGORY_DEFAULT_LAYERS && window.CATEGORY_DEFAULT_LAYERS.travaux)
      || ['travaux'];
    EventBindings.handleNavigation('travaux', trvxLayers);
    document.getElementById('travaux-submenu').style.display = 'block';
    document.getElementById('mobilite-submenu').style.display = 'none';
    document.getElementById('velo-submenu').style.display = 'none';
    document.getElementById('urbanisme-submenu').style.display = 'none';
  });

  return {
    bindFilterControls,
    handleNavigation
  };
})();

// Exposer le module au scope global pour être accessible dans main.js
window.EventBindings = EventBindings;
