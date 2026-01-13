// modules/EventBindings.js
const EventBindings = (() => {

  const handleNavigation = async (menu, layersToDisplay) => {
    console.log(`[EventBindings] ========== handleNavigation START ==========`);
    console.log(`[EventBindings] Menu: "${menu}"`);
    console.log(`[EventBindings] Layers demandés:`, layersToDisplay);
    console.log(`[EventBindings] MapModule.layers actuels:`, Object.keys(window.MapModule?.layers || {}));
    console.log(`[EventBindings] DataModule.layerData disponibles:`, Object.keys(window.DataModule?.layerData || {}));
    
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
      console.log('[EventBindings] handleNavigation - Layers à afficher:', layersToDisplay);
      
      // IMPORTANT: Sauvegarder les layers à conserver AVANT de les retirer
      // (pour les contributions chargées progressivement)
      const layersToKeep = {};
      layersToDisplay.forEach(name => {
        const existing = MapModule.layers[name];
        if (existing && typeof existing.getLayers === 'function') {
          const featuresCount = existing.getLayers().length;
          if (featuresCount > 0) {
            console.log(`[EventBindings] 💾 Sauvegarde layer "${name}" avec ${featuresCount} features`);
            layersToKeep[name] = existing;
          }
        }
      });
      
      // Retirer les couches non désirées (sauf celles à conserver)
      const currentLayers = Object.keys(MapModule.layers);
      console.log('[EventBindings] Layers actuels:', currentLayers);
      
      currentLayers.forEach(layerName => {
        if (!layersToDisplay.includes(layerName)) {
          console.log('[EventBindings] Retrait du layer:', layerName);
          MapModule.removeLayer(layerName);
        }
      });
      
      // Afficher les couches désirées
      for (const layerName of layersToDisplay) {
        try {
          // Si on a sauvegardé le layer avec ses données, le garder tel quel
          if (layersToKeep[layerName]) {
            console.log(`[EventBindings] ✅ Layer "${layerName}" conservé avec ses données`);
            const layer = layersToKeep[layerName];
            // S'assurer qu'il est visible sur la carte
            if (MapModule.map && !MapModule.map.hasLayer(layer)) {
              MapModule.map.addLayer(layer);
            }
            continue;
          }
          
          // Vérifier si le layer est sur la carte
          const layerOnMap = MapModule.layers[layerName];
          
          if (layerOnMap) {
            console.log(`[EventBindings] Layer "${layerName}" déjà sur la carte`);
            if (MapModule.map && !MapModule.map.hasLayer(layerOnMap)) {
              MapModule.map.addLayer(layerOnMap);
            }
          } else {
            // Layer pas sur la carte, le charger
            console.log(`[EventBindings] Chargement du layer "${layerName}"...`);
            if (DataModule.loadLayer) {
              await DataModule.loadLayer(layerName);
            }
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
        console.log(`[EventBindings] 📊 categoryLayersMap:`, currentCategoryLayersMap);
        console.log(`[EventBindings] 📋 Layers pour cette catégorie:`, categoryLayers);
        
        if (!categoryLayers || categoryLayers.length === 0) {
          console.error(`[EventBindings] ❌ Aucun layer défini pour: ${category}`);
          // Fallback: utiliser le nom de la catégorie comme layer
          console.log(`[EventBindings] 🔄 Fallback: utilisation de ["${category}"] comme layer`);
          EventBindings.handleNavigation(category, [category]);
        } else {
          EventBindings.handleNavigation(category, categoryLayers);
        }
        
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
