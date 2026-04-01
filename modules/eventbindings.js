// modules/EventBindings.js
const EventBindings = (() => {

  // Navigation generation counter — guards against stale async loads
  let _navGeneration = 0;

  const handleNavigation = async (menu, layersToDisplay) => {
    const thisGen = ++_navGeneration;
    
    // Validation du menu
    if (!menu) {
      console.error('[EventBindings] ❌ handleNavigation appelé avec menu invalide:', menu);
      return;
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
    FilterModule.resetAll();

    // Gestion des couches à afficher
    if (Array.isArray(layersToDisplay)) {
      // 1. Remove ALL layers unconditionally — guarantees clean state
      const currentLayers = Object.keys(MapModule.layers);
      currentLayers.forEach(layerName => {
        MapModule.removeLayer(layerName);
      });
      
      // 2. Preload all uncached data in parallel (network IO)
      const uncached = layersToDisplay.filter(n => !DataModule.layerData?.[n]);
      if (uncached.length > 0) {
        await Promise.all(uncached.map(async name => {
          try { await DataModule.preloadLayer?.(name); } catch (e) { console.debug('[events] preload layer failed:', e); }
        }));
      }

      // Guard: abort if a newer navigation happened during fetch
      if (_navGeneration !== thisGen) {
        return;
      }

      // 3. Create layers synchronously from cache (fast, no network)
      for (const layerName of layersToDisplay) {
        try {
          if (DataModule.layerData?.[layerName]) {
            DataModule.createGeoJsonLayer(layerName, DataModule.layerData[layerName]);
          }
        } catch (e) {
          console.error(`[EventBindings] Erreur chargement layer ${layerName}:`, e);
        }
      }
    }

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
          
          const safeProjectName = window.SecurityUtils ? window.SecurityUtils.escapeHtml(projectName) : projectName;
          detailContent.innerHTML = `# ${safeProjectName}\n\nAucun détail disponible pour ce projet.`;
        }
      }
    } catch (e) {
      console.warn('[EventBindings] handleFeatureClick error:', e);
    }
  };

  return {
    handleNavigation,
    handleLogoClick,
    handleFeatureClick
  };
})();

// Exposer le module au scope global pour être accessible dans main.js
window.EventBindings = EventBindings;
