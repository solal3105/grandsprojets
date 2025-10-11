// modules/filtermanager.js
// Gestion dynamique des filtres basés sur contribution_uploads

;(function(win) {
  'use strict';

  const FilterManager = {
    /**
     * Génère dynamiquement le DOM des filtres basé sur contribution_uploads
     */
    async populateFilters() {
      const container = document.getElementById('dynamic-filters');
      if (!container) return;
      container.innerHTML = '';

      // Récupérer les catégories dynamiquement depuis contribution_uploads
      let contributionCategories = [];
      try {
        if (window.supabaseService?.fetchAllProjects) {
          const allContributions = await window.supabaseService.fetchAllProjects();
          contributionCategories = [...new Set(allContributions.map(c => c.category).filter(Boolean))];
        }
      } catch (error) {
        contributionCategories = [];
      }

      // Config catégories: alimentée uniquement par la base (icônes)
      const categoryConfig = {};
      window.categoryConfig = categoryConfig;

      // Hydrater les icônes de catégories depuis la base
      try {
        if (typeof win.supabaseService?.fetchCategoryIcons === 'function') {
          const rows = await win.supabaseService.fetchCategoryIcons();
          if (Array.isArray(rows)) {
            rows.forEach(r => {
              if (!r || !r.category) return;
              const cat = String(r.category).trim();
              if (!cat) return;
              const iconClass = String(r.icon_class || '').trim();
              if (!window.categoryConfig[cat]) window.categoryConfig[cat] = {};
              window.categoryConfig[cat].icon = iconClass;
            });
          }
        }
      } catch (_) { /* no-op */ }

      // Récupérer les infos de filter_items pour les labels et icônes
      const filterItemsMap = {};
      try {
        // Essayer d'abord depuis window (déjà chargé au démarrage)
        let filterItems = win.filterItems;
        
        // Si pas disponible, charger depuis Supabase
        if (!filterItems && typeof win.supabaseService?.fetchFilterItems === 'function') {
          filterItems = await win.supabaseService.fetchFilterItems();
        }
        
        if (Array.isArray(filterItems)) {
          filterItems.forEach(item => {
            if (!item || !item.layer) return;
            filterItemsMap[item.layer] = {
              label: item.label,
              icon: item.icon
            };
          });
        }
      } catch (_) { /* no-op */ }

      // Ajouter les catégories dynamiques directement (sans groupe)
      if (contributionCategories.length > 0) {
        contributionCategories.forEach(category => {
          const cfg = (window.categoryConfig && window.categoryConfig[category]) || {};
          let iconClass = cfg.icon || '';
          
          // Ajouter fa-solid si manquant
          if (iconClass && !iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) {
            iconClass = `fa-solid ${iconClass}`;
          }
          
          const labelText = String(category || '');
          
          const filterItem = document.createElement('div');
          filterItem.className = 'filter-item';
          filterItem.dataset.layer = category;
          filterItem.innerHTML = `
            <span class="filter-icon"><i class="${iconClass}"></i></span>
            <span class="filter-label">${labelText}</span>
          `;
          container.appendChild(filterItem);
        });
      }

      // Ajouter les autres layers depuis layersConfig
      const city = String(win.activeCity || '').toLowerCase();
      const layers = Array.isArray(win.layersConfig) ? win.layersConfig : [];
      
      // Exclure les 3 anciens noms de projets et les catégories déjà ajoutées
      const excludedLayers = ['voielyonnaise', 'reseauProjeteSitePropre', 'urbanisme'];
      const alreadyAdded = new Set(contributionCategories);
      
      layers.forEach(layer => {
        if (!layer || !layer.name) return;
        if (excludedLayers.includes(layer.name)) return;
        if (alreadyAdded.has(layer.name)) return;
        
        // Filtrer par ville si applicable
        const layerCity = layer.ville ? String(layer.ville).toLowerCase() : null;
        if (layerCity && layerCity !== city) return;
        
        // Récupérer les infos depuis filter_items en priorité
        const filterItemInfo = filterItemsMap[layer.name];
        
        // Déterminer l'icône : priorité à filter_items, puis layer config
        let iconClass = '';
        if (filterItemInfo && filterItemInfo.icon) {
          iconClass = filterItemInfo.icon;
        } else {
          iconClass = layer.icon_class || layer.icon || '';
        }
        
        // Si pas d'icône trouvée, utiliser une icône par défaut
        if (!iconClass) {
          iconClass = 'fa-layer-group';
        }
        
        // Ajouter fa-solid si manquant
        if (iconClass && !iconClass.includes('fa-solid') && !iconClass.includes('fa-regular') && !iconClass.includes('fa-brands')) {
          iconClass = `fa-solid ${iconClass}`;
        }
        
        // Déterminer le label : priorité à filter_items
        const label = (filterItemInfo && filterItemInfo.label) || layer.label || layer.name;
        
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        filterItem.dataset.layer = layer.name;
        filterItem.innerHTML = `
          <span class="filter-icon"><i class="${iconClass}"></i></span>
          <span class="filter-label">${label}</span>
        `;
        container.appendChild(filterItem);
      });
    },

    /**
     * Met à jour l'UI des filtres selon l'état des layers
     */
    updateFilterUI() {
      document.querySelectorAll('.filter-item').forEach(item => {
        const layerName = item.dataset.layer;
        const active = !!(window.MapModule?.layers?.[layerName]);
        item.classList.toggle('active-filter', active);
      });
    },

    /**
     * Met à jour le comptage des filtres actifs
     */
    updateFilterCount() {
      const countEl = document.querySelector('.filter-count');
      if (countEl) {
        const activeCount = document.querySelectorAll('.filter-item.active-filter').length;
        countEl.textContent = activeCount;
      }
    },

    /**
     * Initialise le système de filtres
     */
    async init() {
      await this.populateFilters();
      this.updateFilterUI();
      this.updateFilterCount();

      // Exposer les fonctions globalement pour compatibilité
      window.updateFilterUI = () => this.updateFilterUI();
      window.updateFilterCount = () => this.updateFilterCount();

      // Observer les changements dans le container de filtres
      const filterContainer = document.getElementById('dynamic-filters');
      if (filterContainer) {
        new MutationObserver(() => {
          this.updateFilterUI();
          this.updateFilterCount();
        }).observe(filterContainer, {
          attributes: true,
          subtree: true,
          attributeFilter: ['class']
        });
      }
    }
  };

  // Exposer le module globalement
  win.FilterManager = FilterManager;

})(window);
